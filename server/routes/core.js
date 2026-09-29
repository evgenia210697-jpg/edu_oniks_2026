// Вход, профиль, файлы, уведомления, настройки платформы
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const { db } = require('../db');
const config = require('../config');
const auth = require('../auth');
const { fail, getSettings, int, str } = require('../util');
const { mailEnabled } = require('../notify');

const router = express.Router();

/* ---------- Вход / выход ---------- */
router.get('/public/settings', (_req, res) => res.json(getSettings()));

router.post('/auth/login', (req, res) => {
  const email = str(req.body?.email, 200).toLowerCase();
  const password = String(req.body?.password || '');
  const key = `${req.ip}|${email}`;
  const wait = auth.loginThrottle(key);
  if (wait) fail(429, `Слишком много попыток. Попробуйте через ${Math.ceil(wait / 60)} мин.`);
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !auth.checkPassword(password, user.password_hash)) {
    auth.loginFailed(key);
    fail(401, 'Неверный email или пароль');
  }
  if (!user.is_active) fail(403, 'Доступ отключён. Обратитесь к администратору.');
  auth.loginOk(key);
  auth.createSession(res, user.id);
  db.prepare("UPDATE users SET last_seen_at = datetime('now') WHERE id = ?").run(user.id);
  res.json({ user: auth.publicUser(user) });
});

router.post('/auth/logout', (req, res) => {
  auth.destroySession(req, res);
  res.json({ ok: true });
});

router.get('/auth/me', (req, res) => {
  res.json({ user: auth.publicUser(req.user), settings: getSettings() });
});

router.put('/auth/profile', auth.requireAuth, (req, res) => {
  const b = req.body || {};
  const name = str(b.name, 120);
  if (!name) fail(400, 'Укажите имя');
  db.prepare(`UPDATE users SET name = ?, phone = ?, city = ?, about = ?, avatar_file_id = ?, email_notify = ? WHERE id = ?`)
    .run(name, str(b.phone, 40), str(b.city, 80), str(b.about, 2000), int(b.avatarFileId), b.emailNotify === false ? 0 : 1, req.user.id);
  res.json({ user: auth.publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)) });
});

router.put('/auth/password', auth.requireAuth, (req, res) => {
  const { current, next } = req.body || {};
  if (!auth.checkPassword(current || '', req.user.password_hash)) fail(400, 'Текущий пароль указан неверно');
  if (!next || String(next).length < 6) fail(400, 'Новый пароль — минимум 6 символов');
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(auth.hashPassword(next), req.user.id);
  res.json({ ok: true });
});

/* ---------- Файлы ---------- */
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const d = new Date();
    const dir = path.join(config.UPLOAD_DIR, `${d.getFullYear()}`, String(d.getMonth() + 1).padStart(2, '0'));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 10);
    cb(null, crypto.randomUUID() + ext);
  },
});
const upload = multer({ storage, limits: { fileSize: config.MAX_UPLOAD_MB * 1024 * 1024 } });

const MIME_BY_EXT = {
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.m4v': 'video/mp4',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.oga': 'audio/ogg', '.opus': 'audio/ogg',
  '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.zip': 'application/zip',
};

// Тип файла определяем по расширению; браузерному заголовку доверяем только для медиа.
// Всё остальное (в т.ч. .html) отдаётся как бинарный файл — иначе загруженная страница
// могла бы выполниться в браузере администратора от его имени.
function detectMime(ext, clientMime) {
  if (MIME_BY_EXT[ext]) return MIME_BY_EXT[ext];
  if (/^(video|audio)\/[\w.+-]+$/.test(clientMime || '')) return clientMime;
  if (/^image\/(png|jpeg|gif|webp|bmp|avif)$/.test(clientMime || '')) return clientMime;
  return 'application/octet-stream';
}

// Эти типы безопасно открывать прямо в браузере; остальные только скачиваются
const INLINE_MIME = /^(video\/|audio\/|image\/|application\/pdf$|text\/plain)/;

router.post('/files', auth.requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) fail(400, 'Файл не получен');
  let name = req.file.originalname || 'file';
  // multer отдаёт имя в latin1 — переводим в UTF-8
  try { const dec = Buffer.from(name, 'latin1').toString('utf8'); if (!dec.includes('\uFFFD')) name = dec; } catch { /* ignore */ }
  const ext = path.extname(name).toLowerCase();
  const mime = detectMime(ext, req.file.mimetype);
  let scope = str(req.query.scope || req.body?.scope || 'content', 20);
  if (!auth.isStaff(req.user) && scope === 'content') scope = 'submission';
  if (!['content', 'submission', 'avatar'].includes(scope)) scope = 'content';
  const rel = path.relative(config.UPLOAD_DIR, req.file.path);
  const info = db.prepare('INSERT INTO files (owner_id, scope, original_name, stored_path, mime, size) VALUES (?, ?, ?, ?, ?, ?)')
    .run(req.user.id, scope, name.slice(0, 255), rel, mime, req.file.size);
  res.json({ id: info.lastInsertRowid, name, size: req.file.size, mime, url: `/api/files/${info.lastInsertRowid}` });
});

router.get('/files/:id', auth.requireAuth, (req, res) => {
  const f = db.prepare('SELECT * FROM files WHERE id = ?').get(int(req.params.id));
  if (!f) fail(404, 'Файл не найден');
  if (f.scope === 'submission' && !auth.isStaff(req.user) && f.owner_id !== req.user.id) {
    // файлы от куратора в переписке доступны ученику этой работы
    const allowed = db.prepare(`SELECT 1 FROM submission_messages m JOIN submissions s ON s.id = m.submission_id
      WHERE s.user_id = ? AND m.files LIKE ?`).get(req.user.id, `%"id":${f.id},%`);
    if (!allowed) fail(403, 'Нет доступа к файлу');
  }
  const abs = path.join(config.UPLOAD_DIR, f.stored_path);
  if (!abs.startsWith(config.UPLOAD_DIR) || !fs.existsSync(abs)) fail(404, 'Файл отсутствует на диске');
  // старые записи могли сохранить тип, присланный браузером (например text/html) — перепроверяем
  const mime = detectMime(path.extname(f.original_name).toLowerCase(), f.mime);
  const disp = req.query.download || !INLINE_MIME.test(mime) ? 'attachment' : 'inline';
  const safeExt = path.extname(f.original_name).replace(/[^.a-zA-Z0-9]/g, '');
  res.setHeader('Content-Disposition', `${disp}; filename="file${safeExt}"; filename*=UTF-8''${encodeURIComponent(f.original_name)}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (mime === 'image/svg+xml') res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
  res.sendFile(abs, { headers: { 'Content-Type': mime, 'Cache-Control': 'private, max-age=86400' }, acceptRanges: true });
});

/* ---------- Уведомления ---------- */
router.get('/notifications', auth.requireAuth, (req, res) => {
  const items = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 60').all(req.user.id);
  const unread = db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND is_read = 0').get(req.user.id).n;
  res.json({
    unread,
    items: items.map((n) => ({ id: n.id, type: n.type, title: n.title, body: n.body, link: n.link, read: !!n.is_read, createdAt: n.created_at })),
  });
});

router.post('/notifications/read', auth.requireAuth, (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(int).filter(Boolean) : null;
  if (ids && ids.length) db.prepare(`UPDATE notifications SET is_read = 1 WHERE user_id = ? AND id IN (${ids.map(() => '?').join(',')})`).run(req.user.id, ...ids);
  else db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.user.id);
  res.json({ ok: true });
});

/* ---------- Быстрый поиск (Ctrl+K) ---------- */
// Ищем по названиям курсов и занятий, а для кураторов и админов — ещё и по сотрудникам.
// Сравнение в JS: встроенный LOWER() в SQLite не понимает кириллицу.
router.get('/search', auth.requireAuth, (req, res) => {
  const q = str(req.query.q, 100).toLowerCase().replace(/ё/g, 'е');
  const has = (...parts) => parts.join(' ').toLowerCase().replace(/ё/g, 'е').includes(q);
  const user = req.user;
  const isAdmin = user.role === 'admin';
  const staff = auth.isStaff(user);
  const out = { courses: [], lessons: [], users: [] };
  if (!q) return res.json(out);

  const courses = isAdmin
    ? db.prepare('SELECT id, title, description, status FROM courses ORDER BY sort, id').all()
    : db.prepare(`SELECT c.id, c.title, c.description, c.status FROM courses c JOIN enrollments e ON e.course_id = c.id
        WHERE e.user_id = ? AND c.status = 'published' ORDER BY c.sort, c.id`).all(user.id);
  const courseById = new Map(courses.map((c) => [c.id, c]));
  out.courses = courses.filter((c) => has(c.title, c.description)).slice(0, 6)
    .map((c) => ({ id: c.id, title: c.title, sub: c.status === 'published' ? 'Курс' : 'Курс · черновик', link: isAdmin ? `/admin/courses/${c.id}` : `/course/${c.id}` }));

  if (courses.length) {
    const ids = courses.map((c) => c.id);
    const lessons = db.prepare(`SELECT id, course_id, type, title, status, published IS NOT NULL AS pub FROM lessons
      WHERE course_id IN (${ids.map(() => '?').join(',')}) ORDER BY sort, id`).all(...ids)
      .filter((l) => isAdmin || (l.status === 'published' && l.pub));
    const typeName = { lecture: 'Урок', assignment: 'Задание', test: 'Тест' };
    out.lessons = lessons.filter((l) => has(l.title, typeName[l.type])).slice(0, 8).map((l) => ({
      id: l.id, type: l.type, title: l.title, sub: `${typeName[l.type] || 'Занятие'} · ${courseById.get(l.course_id)?.title || ''}`,
      link: isAdmin ? `/admin/courses/${l.course_id}/lesson/${l.id}` : `/course/${l.course_id}/lesson/${l.id}`,
    }));
  }
  if (staff) {
    out.users = db.prepare('SELECT id, name, email, department, position, avatar_file_id FROM users ORDER BY name').all()
      .filter((u) => has(u.name, u.email, u.department, u.position)).slice(0, 6)
      .map((u) => ({ id: u.id, title: u.name, sub: [u.department, u.email].filter(Boolean).join(' · '), avatar: u.avatar_file_id ? `/api/files/${u.avatar_file_id}` : null, link: `/admin/users/${u.id}` }));
  }
  res.json(out);
});

/* ---------- Настройки платформы ---------- */
router.get('/admin/settings', auth.requireRole('admin'), (_req, res) => {
  res.json({ ...getSettings(), mailEnabled: mailEnabled(), maxUploadMb: config.MAX_UPLOAD_MB });
});

router.put('/admin/settings', auth.requireRole('admin'), (req, res) => {
  const b = req.body || {};
  const set = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  const map = {
    platformName: ['platform_name', (v) => str(v, 80)],
    accentColor: ['accent_color', (v) => (/^#[0-9a-fA-F]{6}$/.test(v) ? v : '#E4570F')],
    logoFileId: ['logo_file_id', (v) => (int(v) ? String(int(v)) : '')],
    coverFileId: ['cover_file_id', (v) => (int(v) ? String(int(v)) : '')],
    loginText: ['login_text', (v) => str(v, 300)],
    libraryTitle: ['library_title', (v) => str(v, 100)],
    librarySubtitle: ['library_subtitle', (v) => str(v, 200)],
  };
  for (const [k, [key, fn]] of Object.entries(map)) if (k in b) set.run(key, fn(b[k]));
  res.json(getSettings());
});

module.exports = router;
