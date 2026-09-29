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
};

router.post('/files', auth.requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) fail(400, 'Файл не получен');
  let name = req.file.originalname || 'file';
  // multer отдаёт имя в latin1 — переводим в UTF-8
  try { const dec = Buffer.from(name, 'latin1').toString('utf8'); if (!dec.includes('�')) name = dec; } catch { /* ignore */ }
  const ext = path.extname(name).toLowerCase();
  const mime = MIME_BY_EXT[ext] || req.file.mimetype || 'application/octet-stream';
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
  const disp = req.query.download ? 'attachment' : 'inline';
  res.setHeader('Content-Disposition', `${disp}; filename="file${path.extname(f.original_name)}"; filename*=UTF-8''${encodeURIComponent(f.original_name)}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (f.mime === 'image/svg+xml') res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
  res.sendFile(abs, { headers: { 'Content-Type': f.mime, 'Cache-Control': 'private, max-age=86400' }, acceptRanges: true });
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

/* ---------- Настройки платформы ---------- */
router.get('/admin/settings', auth.requireRole('admin'), (_req, res) => {
  res.json({ ...getSettings(), mailEnabled: mailEnabled(), maxUploadMb: config.MAX_UPLOAD_MB });
});

router.put('/admin/settings', auth.requireRole('admin'), (req, res) => {
  const b = req.body || {};
  const set = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  const map = {
    platformName: ['platform_name', (v) => str(v, 80)],
    accentColor: ['accent_color', (v) => (/^#[0-9a-fA-F]{6}$/.test(v) ? v : '#2F5BEA')],
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
