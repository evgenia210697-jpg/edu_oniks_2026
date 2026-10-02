// Админка: курсы, модули, уроки (конструктор), ученики курса
const express = require('express');
const crypto = require('crypto');
const { db, json, tx } = require('../db');
const auth = require('../auth');
const { fail, courseCard, int, str, sendCsv, learningDefaults } = require('../util');
const logic = require('../logic');
const { notify } = require('../notify');

const router = express.Router();
const admin = auth.requireRole('admin');
const staff = auth.requireRole('admin', 'curator');

const touchCourse = (id) => db.prepare("UPDATE courses SET updated_at = datetime('now') WHERE id = ?").run(id);
const getCourse = (id) => db.prepare('SELECT * FROM courses WHERE id = ?').get(int(id)) || fail(404, 'Курс не найден');
const getLesson = (id) => db.prepare('SELECT * FROM lessons WHERE id = ?').get(int(id)) || fail(404, 'Занятие не найдено');
const getModule = (id) => db.prepare('SELECT * FROM modules WHERE id = ?').get(int(id)) || fail(404, 'Модуль не найден');

const uid = () => crypto.randomUUID().slice(0, 8);

function defaultContent(type) {
  if (type === 'test') return { intro: [], questions: [] };
  return { pages: [{ id: uid(), blocks: [] }] };
}

function defaultSettings(type, s = {}) {
  if (type === 'test') {
    // для нового теста проходной балл и попытки берутся из «Настройки → Обучение»
    const def = learningDefaults();
    return {
      points: int(s.points) || 0, passPercent: s.passPercent != null ? Math.min(100, Math.max(0, int(s.passPercent) ?? def.passPercent)) : def.passPercent,
      showAnswers: ['all', 'correct', 'none'].includes(s.showAnswers) ? s.showAnswers : 'all',
      attemptsLimit: s.attemptsLimit != null ? Math.max(0, int(s.attemptsLimit) || 0) : def.attemptsLimit, timeLimitMin: int(s.timeLimitMin) || 0,
      shuffleQuestions: !!s.shuffleQuestions, shuffleOptions: !!s.shuffleOptions, bankCount: int(s.bankCount) || 0,
    };
  }
  if (type === 'assignment') {
    return {
      maxPoints: int(s.maxPoints) || 0, deadlineDays: int(s.deadlineDays) || 0, closeAfterDeadline: !!s.closeAfterDeadline,
      reviewerId: int(s.reviewerId) || null, autoAccept: !!s.autoAccept,
    };
  }
  return { points: int(s.points) || 0 };
}

function lessonFull(l) {
  return {
    id: l.id, courseId: l.course_id, moduleId: l.module_id, type: l.type, title: l.title, status: l.status,
    settings: json(l.settings, {}), draft: json(l.draft, defaultContent(l.type)), hasChanges: !!l.has_changes,
    wasPublished: l.published != null, updatedAt: l.updated_at, publishedAt: l.published_at,
  };
}

/* ---------- Курсы ---------- */
router.get('/courses', staff, (_req, res) => {
  const rows = db.prepare(`SELECT c.*,
      (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id) AS lessons_count,
      (SELECT COUNT(*) FROM enrollments e JOIN users u ON u.id = e.user_id WHERE e.course_id = c.id AND u.role = 'student') AS students_count,
      (SELECT COUNT(*) FROM enrollments e JOIN users u ON u.id = e.user_id WHERE e.course_id = c.id AND u.role = 'student' AND e.completed_at IS NOT NULL) AS completed_count
    FROM courses c ORDER BY c.sort, c.id`).all();
  res.json(rows.map((c) => ({ ...courseCard(c), lessonsCount: c.lessons_count, studentsCount: c.students_count, completedCount: c.completed_count })));
});

router.post('/courses', admin, (req, res) => {
  const title = str(req.body?.title, 200);
  if (!title) fail(400, 'Введите название курса');
  const id = tx(() => {
    const sort = (db.prepare('SELECT MAX(sort) AS m FROM courses').get().m || 0) + 1;
    const cid = db.prepare('INSERT INTO courses (title, sort, sequential) VALUES (?, ?, ?)').run(title, sort, learningDefaults().sequential ? 1 : 0).lastInsertRowid;
    db.prepare('INSERT INTO modules (course_id, title, sort) VALUES (?, ?, 1)').run(cid, 'Первый модуль');
    return cid;
  });
  res.json(courseCard(getCourse(id)));
});

router.post('/courses/order', admin, (req, res) => {
  const ids = (req.body?.ids || []).map(int).filter(Boolean);
  tx(() => ids.forEach((id, i) => db.prepare('UPDATE courses SET sort = ? WHERE id = ?').run(i + 1, id)));
  res.json({ ok: true });
});

router.get('/courses/:id', staff, (req, res) => {
  const c = getCourse(req.params.id);
  res.json({ ...courseCard(c), modules: logic.courseOutline(c.id) });
});

router.put('/courses/:id', admin, (req, res) => {
  const c = getCourse(req.params.id);
  const b = req.body || {};
  const title = 'title' in b ? str(b.title, 200) : c.title;
  if (!title) fail(400, 'Название не может быть пустым');
  db.prepare(`UPDATE courses SET title = ?, description = ?, cover_file_id = ?, status = ?, sequential = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(title, 'description' in b ? str(b.description, 1000) : c.description,
      'coverFileId' in b ? int(b.coverFileId) : c.cover_file_id,
      'status' in b ? (b.status === 'published' ? 'published' : 'draft') : c.status,
      'sequential' in b ? (b.sequential ? 1 : 0) : c.sequential, c.id);
  res.json(courseCard(getCourse(c.id)));
});

router.delete('/courses/:id', admin, (req, res) => {
  const c = getCourse(req.params.id);
  db.prepare('DELETE FROM courses WHERE id = ?').run(c.id);
  res.json({ ok: true });
});

router.post('/courses/:id/duplicate', admin, (req, res) => {
  const c = getCourse(req.params.id);
  const newId = tx(() => {
    const sort = (db.prepare('SELECT MAX(sort) AS m FROM courses').get().m || 0) + 1;
    const cid = db.prepare('INSERT INTO courses (title, description, cover_file_id, status, sequential, sort) VALUES (?, ?, ?, ?, ?, ?)')
      .run(`${c.title} (копия)`, c.description, c.cover_file_id, 'draft', c.sequential, sort).lastInsertRowid;
    for (const m of db.prepare('SELECT * FROM modules WHERE course_id = ? ORDER BY sort, id').all(c.id)) {
      const mid = db.prepare('INSERT INTO modules (course_id, title, description, sort) VALUES (?, ?, ?, ?)').run(cid, m.title, m.description, m.sort).lastInsertRowid;
      for (const l of db.prepare('SELECT * FROM lessons WHERE module_id = ? ORDER BY sort, id').all(m.id)) {
        db.prepare(`INSERT INTO lessons (course_id, module_id, type, title, status, sort, settings, draft, published, has_changes, published_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(cid, mid, l.type, l.title, l.status, l.sort, l.settings, l.draft, l.published, l.has_changes, l.published_at);
      }
    }
    return cid;
  });
  res.json(courseCard(getCourse(newId)));
});

/* ---------- Модули ---------- */
router.post('/courses/:id/modules', admin, (req, res) => {
  const c = getCourse(req.params.id);
  const title = str(req.body?.title, 200) || 'Новый модуль';
  const sort = (db.prepare('SELECT MAX(sort) AS m FROM modules WHERE course_id = ?').get(c.id).m || 0) + 1;
  const id = db.prepare('INSERT INTO modules (course_id, title, sort) VALUES (?, ?, ?)').run(c.id, title, sort).lastInsertRowid;
  touchCourse(c.id);
  res.json({ id, title, lessons: [] });
});

router.put('/modules/:id', admin, (req, res) => {
  const m = getModule(req.params.id);
  const title = str(req.body?.title, 200);
  if (!title) fail(400, 'Название не может быть пустым');
  db.prepare('UPDATE modules SET title = ?, description = ? WHERE id = ?').run(title, str(req.body?.description ?? m.description, 1000), m.id);
  res.json({ ok: true });
});

router.delete('/modules/:id', admin, (req, res) => {
  const m = getModule(req.params.id);
  db.prepare('DELETE FROM modules WHERE id = ?').run(m.id);
  touchCourse(m.course_id);
  res.json({ ok: true });
});

// Полный порядок модулей и уроков (позволяет переносить уроки между модулями)
router.post('/courses/:id/reorder', admin, (req, res) => {
  const c = getCourse(req.params.id);
  const modules = Array.isArray(req.body?.modules) ? req.body.modules : [];
  tx(() => {
    modules.forEach((m, mi) => {
      const mid = int(m.id);
      db.prepare('UPDATE modules SET sort = ? WHERE id = ? AND course_id = ?').run(mi + 1, mid, c.id);
      (m.lessons || []).forEach((lid, li) => {
        db.prepare('UPDATE lessons SET sort = ?, module_id = ? WHERE id = ? AND course_id = ?').run(li + 1, mid, int(lid), c.id);
      });
    });
  });
  touchCourse(c.id);
  res.json({ modules: logic.courseOutline(c.id) });
});

/* ---------- Уроки ---------- */
router.post('/modules/:id/lessons', admin, (req, res) => {
  const m = getModule(req.params.id);
  const type = ['lecture', 'assignment', 'test'].includes(req.body?.type) ? req.body.type : 'lecture';
  const title = str(req.body?.title, 200) || logic.TYPE_LABEL[type];
  const sort = (db.prepare('SELECT MAX(sort) AS m FROM lessons WHERE module_id = ?').get(m.id).m || 0) + 1;
  const id = db.prepare('INSERT INTO lessons (course_id, module_id, type, title, sort, settings, draft) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(m.course_id, m.id, type, title, sort, JSON.stringify(defaultSettings(type, req.body?.settings || {})), JSON.stringify(defaultContent(type))).lastInsertRowid;
  touchCourse(m.course_id);
  res.json(lessonFull(getLesson(id)));
});

router.get('/lessons/:id', staff, (req, res) => {
  res.json(lessonFull(getLesson(req.params.id)));
});

router.put('/lessons/:id', admin, (req, res) => {
  const l = getLesson(req.params.id);
  const b = req.body || {};
  const title = 'title' in b ? str(b.title, 200) : l.title;
  if (!title) fail(400, 'Название не может быть пустым');
  const settings = 'settings' in b ? JSON.stringify(defaultSettings(l.type, b.settings || {})) : l.settings;
  let draft = l.draft;
  let hasChanges = l.has_changes;
  if ('draft' in b) {
    const d = JSON.stringify(b.draft || defaultContent(l.type));
    if (d.length > 5_000_000) fail(400, 'Слишком большой объём содержимого');
    if (d !== l.draft) { draft = d; hasChanges = 1; }
  }
  db.prepare("UPDATE lessons SET title = ?, settings = ?, draft = ?, has_changes = ?, updated_at = datetime('now') WHERE id = ?")
    .run(title, settings, draft, hasChanges, l.id);
  touchCourse(l.course_id);
  res.json(lessonFull(getLesson(l.id)));
});

router.post('/lessons/:id/publish', admin, (req, res) => {
  const l = getLesson(req.params.id);
  db.prepare("UPDATE lessons SET published = draft, status = 'published', has_changes = 0, published_at = datetime('now') WHERE id = ?").run(l.id);
  touchCourse(l.course_id);
  res.json(lessonFull(getLesson(l.id)));
});

router.post('/lessons/:id/unpublish', admin, (req, res) => {
  const l = getLesson(req.params.id);
  db.prepare("UPDATE lessons SET status = 'draft' WHERE id = ?").run(l.id);
  res.json(lessonFull(getLesson(l.id)));
});

router.post('/lessons/:id/discard', admin, (req, res) => {
  const l = getLesson(req.params.id);
  if (l.published == null) fail(400, 'Занятие ещё не публиковалось');
  db.prepare('UPDATE lessons SET draft = published, has_changes = 0 WHERE id = ?').run(l.id);
  res.json(lessonFull(getLesson(l.id)));
});

router.post('/lessons/:id/duplicate', admin, (req, res) => {
  const l = getLesson(req.params.id);
  const id = tx(() => {
    db.prepare('UPDATE lessons SET sort = sort + 1 WHERE module_id = ? AND sort > ?').run(l.module_id, l.sort);
    return db.prepare('INSERT INTO lessons (course_id, module_id, type, title, status, sort, settings, draft) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(l.course_id, l.module_id, l.type, `${l.title} (копия)`, 'draft', l.sort + 1, l.settings, l.draft).lastInsertRowid;
  });
  res.json(lessonFull(getLesson(id)));
});

router.delete('/lessons/:id', admin, (req, res) => {
  const l = getLesson(req.params.id);
  db.prepare('DELETE FROM lessons WHERE id = ?').run(l.id);
  touchCourse(l.course_id);
  res.json({ ok: true });
});

/* ---------- Ученики курса ---------- */
function courseStudents(courseId) {
  const rows = db.prepare(`SELECT u.*, e.enrolled_at, e.started_at, e.completed_at FROM enrollments e JOIN users u ON u.id = e.user_id
    WHERE e.course_id = ? ORDER BY u.name COLLATE NOCASE`).all(courseId);
  return rows.map((u) => {
    const st = logic.courseState(u.id, courseId);
    return {
      ...auth.publicUser(u), enrolledAt: u.enrolled_at, startedAt: u.started_at, completedAt: u.completed_at,
      progress: st.progress, completed: st.completed, total: st.total, points: st.points,
      pending: st.flat.filter((x) => x.status === 'pending').length,
    };
  });
}

router.get('/courses/:id/students', staff, (req, res) => {
  const c = getCourse(req.params.id);
  res.json(courseStudents(c.id));
});

router.post('/courses/:id/students', admin, (req, res) => {
  const c = getCourse(req.params.id);
  const ids = (req.body?.userIds || []).map(int).filter(Boolean);
  let added = 0;
  tx(() => {
    for (const id of ids) {
      const r = db.prepare('INSERT OR IGNORE INTO enrollments (user_id, course_id) VALUES (?, ?)').run(id, c.id);
      if (r.changes) added++;
      if (r.changes && c.status === 'published') notify(id, { type: 'enrolled', title: `Вам открыт курс «${c.title}»`, body: 'Можно приступать к обучению.', link: `/course/${c.id}` });
    }
  });
  res.json({ added });
});

router.delete('/courses/:id/students/:userId', admin, (req, res) => {
  const c = getCourse(req.params.id);
  db.prepare('DELETE FROM enrollments WHERE course_id = ? AND user_id = ?').run(c.id, int(req.params.userId));
  res.json({ ok: true });
});

router.get('/courses/:id/export', staff, (req, res) => {
  const c = getCourse(req.params.id);
  const rows = [['ФИО', 'Email', 'Отдел', 'Должность', 'Прогресс, %', 'Пройдено занятий', 'Всего занятий', 'Баллы', 'Ждут проверки', 'Добавлен', 'Завершил курс', 'Был(а) онлайн']];
  for (const s of courseStudents(c.id)) {
    rows.push([s.name, s.email, s.department, s.position, s.progress, s.completed, s.total, s.points, s.pending, s.enrolledAt, s.completedAt || '', s.lastSeenAt || '']);
  }
  sendCsv(res, `Курс — ${c.title}.csv`, rows);
});

module.exports = router;
