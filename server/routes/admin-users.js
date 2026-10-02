// Админка: сотрудники (ученики, кураторы, админы), статистика
const express = require('express');
const { db, tx, json } = require('../db');
const auth = require('../auth');
const { fail, int, str, sendCsv, courseCard, emailOk, loginValid, suggestLogin } = require('../util');
const logic = require('../logic');
const { notify } = require('../notify');
const invites = require('../invites');

const router = express.Router();
const admin = auth.requireRole('admin');
const staff = auth.requireRole('admin', 'curator');

const ROLES = ['student', 'curator', 'admin'];
const getUser = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(int(id)) || fail(404, 'Сотрудник не найден');

function userStats(u) {
  const enr = db.prepare('SELECT course_id, completed_at FROM enrollments WHERE user_id = ?').all(u.id);
  let progressSum = 0; let points = 0; let completed = 0;
  for (const e of enr) {
    const st = logic.courseState(u.id, e.course_id);
    if (!st) continue;
    progressSum += st.progress; points += st.points;
    if (e.completed_at) completed++;
  }
  return {
    coursesCount: enr.length, coursesCompleted: completed, points,
    avgProgress: enr.length ? Math.round(progressSum / enr.length) : 0,
  };
}

router.get('/users', staff, (req, res) => {
  const role = ROLES.includes(req.query.role) ? req.query.role : null;
  const q = str(req.query.q, 100).toLowerCase();
  let rows = db.prepare(`SELECT * FROM users ${role ? 'WHERE role = ?' : ''} ORDER BY is_active DESC, name COLLATE NOCASE`).all(...(role ? [role] : []));
  if (q) rows = rows.filter((u) => `${u.name} ${u.email} ${u.contact_email || ''} ${u.department} ${u.position}`.toLowerCase().includes(q));
  const withStats = req.query.stats !== '0';
  res.json(rows.map((u) => ({ ...auth.publicUser(u), ...(withStats ? userStats(u) : {}) })));
});

router.get('/stats', staff, (_req, res) => {
  const students = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'student' AND is_active = 1").get().n;
  const active7 = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'student' AND is_active = 1 AND last_seen_at > datetime('now', '-7 days')").get().n;
  const newStudents30 = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'student' AND created_at > datetime('now', '-30 days')").get().n;
  const pending = db.prepare("SELECT COUNT(*) AS n FROM submissions WHERE status = 'pending'").get().n;
  const enr = db.prepare("SELECT e.user_id, e.course_id, e.completed_at FROM enrollments e JOIN users u ON u.id = e.user_id WHERE u.role = 'student' AND u.is_active = 1").all();
  let sum = 0;
  for (const e of enr) sum += logic.courseState(e.user_id, e.course_id)?.progress || 0;
  const completedCourses = enr.filter((e) => e.completed_at).length;
  const tests = db.prepare(`SELECT AVG(score) AS avg FROM test_attempts t JOIN users u ON u.id = t.user_id WHERE u.role = 'student' AND t.finished_at IS NOT NULL`).get().avg;
  // Активность по дням (открытые/завершённые занятия) за 14 дней
  const activity = db.prepare(`SELECT date(opened_at) AS d, COUNT(*) AS n FROM lesson_progress WHERE opened_at > datetime('now', '-14 days') GROUP BY d`).all();
  res.json({
    students, active7, newStudents30, pending, enrollments: enr.length, completedCourses,
    avgProgress: enr.length ? Math.round(sum / enr.length) : 0,
    avgTestScore: tests != null ? Math.round(tests * 100) : null,
    activity,
  });
});

router.get('/users/export', staff, (_req, res) => {
  const rows = [['ФИО', 'Email', 'Роль', 'Отдел', 'Должность', 'Курсов', 'Завершено курсов', 'Средний прогресс, %', 'Баллы', 'Добавлен', 'Был(а) онлайн', 'Активен']];
  const roleName = { student: 'Ученик', curator: 'Куратор', admin: 'Администратор' };
  for (const u of db.prepare('SELECT * FROM users ORDER BY name COLLATE NOCASE').all()) {
    const s = userStats(u);
    rows.push([u.name, u.email, roleName[u.role], u.department, u.position, s.coursesCount, s.coursesCompleted, s.avgProgress, s.points, u.created_at, u.last_seen_at || '', u.is_active ? 'да' : 'нет']);
  }
  sendCsv(res, 'Сотрудники.csv', rows);
});

function createUser(b, byAdmin) {
  let email;
  if (b.invite) {
    // по приглашению логином становится e-mail: на него уходит письмо
    email = str(b.email, 200).toLowerCase();
    if (!emailOk(email)) fail(400, `Некорректный email: ${email || '(пусто)'}`);
  } else {
    // при выдаче пароля логин может быть любым (не обязательно почтой)
    email = b.autoLogin ? suggestLogin(b.name) : str(b.login ?? b.email, 200).toLowerCase();
    if (!email) fail(400, 'Укажите логин');
    if (!loginValid(email)) fail(400, `Логин «${email}» не подходит: используйте e-mail или латиницу, цифры, точку, дефис (от 3 символов)`);
  }
  // резервный e-mail для писем — необязательный, может повторяться у разных сотрудников
  const contactEmail = b.invite ? '' : str(b.contactEmail, 200).toLowerCase();
  if (contactEmail && !emailOk(contactEmail)) fail(400, `Некорректный резервный e-mail: ${contactEmail}`);
  // при приглашении имя можно не указывать — сотрудник впишет его сам
  const name = str(b.name, 120) || (b.invite ? email.split('@')[0] : '');
  if (!name) fail(400, 'Укажите ФИО');
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) fail(409, `Логин ${email} уже занят`);
  const role = ROLES.includes(b.role) ? b.role : 'student';
  // по приглашению пароль задаёт сам сотрудник — до этого войти по паролю нельзя
  const password = !b.invite && b.password && String(b.password).length >= 6 ? String(b.password) : auth.generatePassword(b.invite ? 24 : 10);
  const id = db.prepare(`INSERT INTO users (email, contact_email, name, password_hash, role, position, department, phone, comment) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(email, contactEmail, name, auth.hashPassword(password), role, str(b.position, 120), str(b.department, 120), str(b.phone, 40), str(b.comment, 500)).lastInsertRowid;
  const courseIds = (b.courseIds || []).map(int).filter(Boolean);
  for (const cid of courseIds) {
    const c = db.prepare('SELECT * FROM courses WHERE id = ?').get(cid);
    if (!c) continue;
    db.prepare('INSERT OR IGNORE INTO enrollments (user_id, course_id) VALUES (?, ?)').run(id, cid);
    if (c.status === 'published') notify(id, { type: 'enrolled', title: `Вам открыт курс «${c.title}»`, body: 'Можно приступать к обучению.', link: `/course/${c.id}` }, { email: !b.invite });
  }
  return b.invite ? { id, email, name } : { id, email, name, password };
}

// Свободный логин по ФИО (кнопка «Сгенерировать» в окне добавления)
router.get('/users/suggest-login', admin, (req, res) => {
  res.json({ login: suggestLogin(req.query.name) });
});

router.post('/users', admin, (req, res) => {
  const b = req.body || {};
  const r = tx(() => createUser(b, req.user));
  const invite = b.invite ? invites.inviteUser(req, r.id) : null;
  res.json({ ...auth.publicUser(getUser(r.id)), password: r.password, invite });
});

// Отправить приглашение ещё раз (новая ссылка, старая перестаёт действовать).
// Для уже работающего сотрудника это ссылка, по которой он задаст новый пароль.
router.post('/users/:id/invite', admin, (req, res) => {
  const u = getUser(req.params.id);
  if (!u.is_active) fail(400, 'Доступ сотрудника отключён — сначала включите его');
  res.json(invites.inviteUser(req, u.id));
});

// Массовое добавление (из таблицы)
router.post('/users/import', admin, (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows.slice(0, 1000) : [];
  const courseIds = req.body?.courseIds || [];
  const created = []; const errors = [];
  rows.forEach((r, i) => {
    try {
      const invite = !!req.body?.invite;
      // без приглашений: логин генерируется по ФИО, e-mail из таблицы становится резервным
      const data = invite ? { ...r } : { name: r.name, contactEmail: r.email, department: r.department, position: r.position, autoLogin: true };
      const u = tx(() => createUser({ ...data, role: 'student', courseIds, invite }, req.user));
      created.push(invite ? { ...u, invite: invites.inviteUser(req, u.id) } : u);
    } catch (e) { errors.push({ row: i + 1, email: r.email, error: e.message }); }
  });
  res.json({ created, errors });
});

router.post('/users/enroll', admin, (req, res) => {
  const userIds = (req.body?.userIds || []).map(int).filter(Boolean);
  const courseIds = (req.body?.courseIds || []).map(int).filter(Boolean);
  let added = 0;
  tx(() => {
    for (const cid of courseIds) {
      const c = db.prepare('SELECT * FROM courses WHERE id = ?').get(cid);
      if (!c) continue;
      for (const uid of userIds) {
        const r = db.prepare('INSERT OR IGNORE INTO enrollments (user_id, course_id) VALUES (?, ?)').run(uid, cid);
        if (r.changes) {
          added++;
          if (c.status === 'published') notify(uid, { type: 'enrolled', title: `Вам открыт курс «${c.title}»`, body: 'Можно приступать к обучению.', link: `/course/${c.id}` });
        }
      }
    }
  });
  res.json({ added });
});

router.get('/users/:id', staff, (req, res) => {
  const u = getUser(req.params.id);
  const enr = db.prepare(`SELECT e.*, c.title FROM enrollments e JOIN courses c ON c.id = e.course_id WHERE e.user_id = ? ORDER BY e.enrolled_at`).all(u.id);
  const courses = enr.map((e) => {
    const st = logic.courseState(u.id, e.course_id);
    const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(e.course_id);
    return {
      ...courseCard(course), enrolledAt: e.enrolled_at, startedAt: e.started_at, completedAt: e.completed_at,
      progress: st.progress, completed: st.completed, total: st.total, points: st.points, modules: st.modules,
    };
  });
  const attempts = db.prepare(`SELECT t.id, t.lesson_id, t.started_at, t.finished_at, t.score, t.passed, l.title FROM test_attempts t
    JOIN lessons l ON l.id = t.lesson_id WHERE t.user_id = ? ORDER BY t.id DESC LIMIT 100`).all(u.id)
    .map((a) => ({ id: a.id, lessonId: a.lesson_id, title: a.title, startedAt: a.started_at, finishedAt: a.finished_at, score: a.score != null ? Math.round(a.score * 100) : null, passed: !!a.passed }));
  res.json({ user: auth.publicUser(u), stats: userStats(u), courses, attempts });
});

router.put('/users/:id', admin, (req, res) => {
  const u = getUser(req.params.id);
  const b = req.body || {};
  const raw = 'login' in b ? b.login : ('email' in b ? b.email : null);
  const email = raw != null ? str(raw, 200).toLowerCase() : u.email;
  // старые логины не проверяем строже, чем при создании: менять их не заставляем
  if (email !== u.email && !loginValid(email)) fail(400, 'Логин не подходит: используйте e-mail или латиницу, цифры, точку, дефис (от 3 символов)');
  if (email !== u.email && db.prepare('SELECT 1 FROM users WHERE email = ? AND id <> ?').get(email, u.id)) fail(409, 'Такой логин уже занят');
  const contactEmail = 'contactEmail' in b ? str(b.contactEmail, 200).toLowerCase() : (u.contact_email || '');
  if (contactEmail && !emailOk(contactEmail)) fail(400, 'Некорректный резервный e-mail');
  const role = ROLES.includes(b.role) ? b.role : u.role;
  if (u.id === req.user.id && role !== 'admin') fail(400, 'Нельзя снять с себя роль администратора');
  const isActive = 'isActive' in b ? (b.isActive ? 1 : 0) : u.is_active;
  if (u.id === req.user.id && !isActive) fail(400, 'Нельзя отключить собственный доступ');
  db.prepare(`UPDATE users SET email = ?, contact_email = ?, name = ?, role = ?, position = ?, department = ?, phone = ?, comment = ?, is_active = ? WHERE id = ?`)
    .run(email, contactEmail, str(b.name ?? u.name, 120) || u.name, role, str(b.position ?? u.position, 120), str(b.department ?? u.department, 120),
      str(b.phone ?? u.phone, 40), str(b.comment ?? u.comment, 500), isActive, u.id);
  if (!isActive) {
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
    db.prepare('UPDATE users SET invite_token_hash = NULL, invite_expires_at = NULL WHERE id = ?').run(u.id);
  }
  if (b.password) {
    if (String(b.password).length < 6) fail(400, 'Пароль — минимум 6 символов');
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(auth.hashPassword(b.password), u.id);
  }
  res.json(auth.publicUser(getUser(u.id)));
});

router.post('/users/:id/reset-password', admin, (req, res) => {
  const u = getUser(req.params.id);
  const password = auth.generatePassword();
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(auth.hashPassword(password), u.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
  res.json({ password });
});

router.delete('/users/:id', admin, (req, res) => {
  const u = getUser(req.params.id);
  if (u.id === req.user.id) fail(400, 'Нельзя удалить самого себя');
  db.prepare('DELETE FROM users WHERE id = ?').run(u.id);
  res.json({ ok: true });
});

// Сбросить прогресс ученика по курсу
router.post('/users/:id/reset-progress', admin, (req, res) => {
  const u = getUser(req.params.id);
  const cid = int(req.body?.courseId);
  tx(() => {
    const ids = db.prepare('SELECT id FROM lessons WHERE course_id = ?').all(cid).map((r) => r.id);
    for (const lid of ids) {
      db.prepare('DELETE FROM lesson_progress WHERE user_id = ? AND lesson_id = ?').run(u.id, lid);
      db.prepare('DELETE FROM test_attempts WHERE user_id = ? AND lesson_id = ?').run(u.id, lid);
      db.prepare('DELETE FROM submissions WHERE user_id = ? AND lesson_id = ?').run(u.id, lid);
    }
    db.prepare('UPDATE enrollments SET started_at = NULL, completed_at = NULL, last_lesson_id = NULL WHERE user_id = ? AND course_id = ?').run(u.id, cid);
  });
  res.json({ ok: true });
});

// Открыть ученику дополнительные попытки теста (когда лимит исчерпан)
router.post('/users/:id/grant-attempts', staff, (req, res) => {
  const u = getUser(req.params.id);
  const l = db.prepare("SELECT * FROM lessons WHERE id = ? AND type = 'test'").get(int(req.body?.lessonId)) || fail(404, 'Тест не найден');
  const count = Math.min(10, Math.max(1, int(req.body?.count) || 1));
  db.prepare(`INSERT INTO test_attempt_grants (user_id, lesson_id, extra) VALUES (?, ?, ?)
    ON CONFLICT(user_id, lesson_id) DO UPDATE SET extra = extra + excluded.extra, updated_at = datetime('now')`).run(u.id, l.id, count);
  notify(u.id, { type: 'attempts_granted', title: `Открыта дополнительная попытка теста «${l.title}»`, body: 'Можно пройти тест ещё раз.', link: `/course/${l.course_id}/lesson/${l.id}` });
  res.json({ ok: true, attemptsLimit: logic.attemptsLimitFor(u.id, l.id, json(l.settings, {})) });
});

// Просмотр конкретной попытки теста (для куратора)
router.get('/attempts/:id', staff, (req, res) => {
  const a = db.prepare('SELECT * FROM test_attempts WHERE id = ?').get(int(req.params.id)) || fail(404, 'Попытка не найдена');
  const l = db.prepare('SELECT * FROM lessons WHERE id = ?').get(a.lesson_id);
  res.json({ id: a.id, title: l.title, plan: json(a.plan, []), answers: json(a.answers, {}), result: json(a.result, null), score: a.score, passed: !!a.passed, startedAt: a.started_at, finishedAt: a.finished_at });
});

module.exports = router;
