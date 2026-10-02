// Кабинет ученика: курсы, занятия, тесты, задания
const express = require('express');
const { db, json, tx } = require('../db');
const auth = require('../auth');
const { fail, int, str, courseCard } = require('../util');
const logic = require('../logic');
const { notify, notifyStaff } = require('../notify');
const { messagesOf, cleanFiles } = require('./reviews');

const router = express.Router();
router.use(auth.requireAuth);

function access(user, courseId) {
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(courseId) || fail(404, 'Курс не найден');
  const enrolled = db.prepare('SELECT * FROM enrollments WHERE user_id = ? AND course_id = ?').get(user.id, courseId);
  if (enrolled && course.status === 'published') return { course, enrollment: enrolled, preview: false };
  if (auth.isStaff(user)) return { course, enrollment: enrolled || null, preview: true };
  fail(403, 'Курс вам не доступен');
}

router.get('/courses', (req, res) => {
  const rows = db.prepare(`SELECT c.*, e.enrolled_at, e.started_at, e.completed_at, e.last_lesson_id FROM enrollments e
    JOIN courses c ON c.id = e.course_id WHERE e.user_id = ? AND c.status = 'published' ORDER BY c.sort, c.id`).all(req.user.id);
  res.json(rows.map((c) => {
    const st = logic.courseState(req.user.id, c.id);
    const next = st.flat.find((l) => !l.locked && l.status !== 'completed' && l.status !== 'pending') || null;
    const counts = { lecture: 0, assignment: 0, test: 0 };
    st.flat.forEach((l) => { counts[l.type]++; });
    return {
      ...courseCard(c), enrolledAt: c.enrolled_at, startedAt: c.started_at, completedAt: c.completed_at,
      progress: st.progress, completed: st.completed, total: st.total, points: st.points, counts,
      nextLessonId: next ? next.id : (c.last_lesson_id || st.flat[0]?.id || null),
    };
  }));
});

router.get('/courses/:id', (req, res) => {
  const { course, enrollment, preview } = access(req.user, int(req.params.id));
  const st = logic.courseState(req.user.id, course.id);
  const counts = { lecture: 0, assignment: 0, test: 0 };
  st.flat.forEach((l) => { counts[l.type]++; });
  const next = st.flat.find((l) => !l.locked && l.status !== 'completed' && l.status !== 'pending') || null;
  res.json({
    ...courseCard(course), preview, enrolledAt: enrollment?.enrolled_at, completedAt: enrollment?.completed_at,
    modules: st.modules, progress: st.progress, completed: st.completed, total: st.total, points: st.points, counts,
    nextLessonId: next ? next.id : null,
  });
});

function loadLesson(req) {
  const l = db.prepare('SELECT * FROM lessons WHERE id = ?').get(int(req.params.id)) || fail(404, 'Занятие не найдено');
  const acc = access(req.user, l.course_id);
  const isPublished = l.status === 'published' && l.published != null;
  if (!isPublished && !acc.preview) fail(404, 'Занятие недоступно');
  const st = logic.courseState(req.user.id, l.course_id);
  const info = st.flat.find((x) => x.id === l.id) || { status: 'available', locked: false };
  if (info.locked && !acc.preview) fail(403, 'Сначала пройдите предыдущие занятия курса');
  // в режиме предпросмотра показываем текущий черновик (то, что сейчас в редакторе)
  const content = acc.preview ? json(l.draft, {}) : json(l.published, {});
  return { l, ...acc, st, info, content, settings: json(l.settings, {}) };
}

function publicTestInfo(l, settings, content, userId) {
  const total = (content.questions || []).length;
  const count = settings.bankCount ? Math.min(settings.bankCount, total) : total;
  const attempts = db.prepare('SELECT * FROM test_attempts WHERE user_id = ? AND lesson_id = ? ORDER BY id').all(userId, l.id);
  const finished = attempts.filter((a) => a.finished_at);
  const active = attempts.find((a) => !a.finished_at);
  const limit = logic.attemptsLimitFor(userId, l.id, settings);
  let activeData = null;
  if (active) {
    if (active.deadline_at && new Date(active.deadline_at).getTime() + 30000 < Date.now()) {
      finishAttempt(active, {}, l, settings, content, userId);
    } else {
      activeData = { id: active.id, questions: json(active.plan, []), deadlineAt: active.deadline_at, startedAt: active.started_at };
    }
  }
  const fin = db.prepare('SELECT * FROM test_attempts WHERE user_id = ? AND lesson_id = ? AND finished_at IS NOT NULL ORDER BY id').all(userId, l.id);
  return {
    questionsCount: count, passPercent: settings.passPercent ?? 60, timeLimitMin: settings.timeLimitMin || 0, attemptsLimit: limit,
    showAnswers: settings.showAnswers || 'all', points: settings.points || 0,
    attempts: fin.map((a) => ({ id: a.id, score: Math.round((a.score || 0) * 100), passed: !!a.passed, finishedAt: a.finished_at })),
    attemptsLeft: limit ? Math.max(0, limit - fin.length) : null,
    passed: fin.some((a) => a.passed),
    active: activeData,
  };
}

router.get('/lessons/:id', (req, res) => {
  const { l, course, preview, st, info, content, settings } = loadLesson(req);
  if (!preview) logic.touchLesson(req.user.id, l);
  const idx = st.flat.findIndex((x) => x.id === l.id);
  const prev = idx > 0 ? st.flat[idx - 1] : null;
  const next = idx >= 0 && idx < st.flat.length - 1 ? st.flat[idx + 1] : null;
  const out = {
    lesson: { id: l.id, type: l.type, title: l.title, courseId: l.course_id },
    course: { id: course.id, title: course.title, sequential: !!course.sequential },
    preview, state: info, modules: st.modules, progress: st.progress,
    prev: prev ? { id: prev.id, title: prev.title } : null,
    next: next ? { id: next.id, title: next.title, locked: next.locked } : null,
  };
  if (l.type === 'test') {
    out.content = { intro: content.intro || [] };
    out.test = publicTestInfo(l, settings, content, req.user.id);
  } else {
    out.content = { pages: content.pages || [] };
  }
  if (l.type === 'lecture') out.lecture = { points: settings.points || 0 };
  if (l.type === 'assignment') {
    const s = db.prepare('SELECT * FROM submissions WHERE user_id = ? AND lesson_id = ?').get(req.user.id, l.id);
    out.assignment = {
      maxPoints: settings.maxPoints || 0, deadline: info.deadline || null, closeAfterDeadline: !!settings.closeAfterDeadline,
      submission: s ? { id: s.id, status: s.status, points: s.points, createdAt: s.created_at, updatedAt: s.updated_at, messages: messagesOf(s.id) } : null,
    };
  }
  res.json(out);
});

router.post('/lessons/:id/complete', (req, res) => {
  const { l, preview, settings } = loadLesson(req);
  if (preview) return res.json({ preview: true });
  if (l.type !== 'lecture') fail(400, 'Это занятие завершается иначе');
  logic.completeLesson(req.user.id, l, settings.points || 0);
  res.json({ ok: true });
});

/* ---------- Тесты ---------- */
function finishAttempt(a, answers, l, settings, content, userId) {
  const plan = json(a.plan, []);
  const byId = new Map((content.questions || []).map((q) => [q.id, q]));
  let sum = 0; let n = 0;
  const details = [];
  for (const pq of plan) {
    const q = byId.get(pq.id);
    if (!q) continue;
    n++;
    const sc = logic.gradeQuestion(q, answers[pq.id]);
    sum += sc;
    details.push({ id: q.id, score: sc, correct: sc >= 0.999, correctAnswer: logic.correctAnswerView(q), explanation: q.explanation || '' });
  }
  const score = n ? sum / n : 0;
  const passed = Math.round(score * 100) >= (settings.passPercent ?? 60);
  db.prepare("UPDATE test_attempts SET finished_at = datetime('now'), answers = ?, result = ?, score = ?, passed = ? WHERE id = ?")
    .run(JSON.stringify(answers), JSON.stringify(details), score, passed ? 1 : 0, a.id);
  if (passed) logic.completeLesson(userId, l, settings.points || 0);
  else {
    // последняя попытка не удалась — сообщаем кураторам, чтобы ученик не «застрял» на тесте
    const limit = logic.attemptsLimitFor(userId, l.id, settings);
    const done = db.prepare('SELECT COUNT(*) AS n FROM test_attempts WHERE user_id = ? AND lesson_id = ? AND finished_at IS NOT NULL').get(userId, l.id).n;
    const everPassed = db.prepare('SELECT 1 FROM test_attempts WHERE user_id = ? AND lesson_id = ? AND passed = 1').get(userId, l.id);
    if (limit && done >= limit && !everPassed) {
      const u = db.prepare('SELECT name FROM users WHERE id = ?').get(userId);
      notifyStaff({ type: 'attempts_over', title: `${u.name}: закончились попытки теста`, body: `«${l.title}» — лучший результат ниже проходного. Можно открыть дополнительную попытку в карточке сотрудника.`, link: `/admin/users/${userId}` });
    }
  }
  return db.prepare('SELECT * FROM test_attempts WHERE id = ?').get(a.id);
}

function attemptView(a, settings) {
  const mode = settings.showAnswers || 'all';
  const out = { id: a.id, score: Math.round((a.score || 0) * 100), passed: !!a.passed, passPercent: settings.passPercent ?? 60, finishedAt: a.finished_at, mode };
  if (mode === 'none') return out;
  const details = json(a.result, []);
  out.questions = json(a.plan, []);
  out.answers = json(a.answers, {});
  out.details = details.map((d) => (mode === 'all'
    ? d
    : { id: d.id, score: d.score, correct: d.correct, explanation: d.correct ? d.explanation : '' }));
  return out;
}

router.post('/lessons/:id/attempts', (req, res) => {
  const { l, preview, content, settings } = loadLesson(req);
  if (l.type !== 'test') fail(400, 'Это не тест');
  const questions = content.questions || [];
  if (!questions.length) fail(400, 'В тесте пока нет вопросов');
  const makePlan = () => {
    let qs = questions.slice();
    if (settings.shuffleQuestions || settings.bankCount) qs = logic.shuffle(qs);
    if (settings.bankCount) qs = qs.slice(0, settings.bankCount);
    return qs.map((q) => logic.presentQuestion(q, settings.shuffleOptions));
  };
  if (preview) {
    return res.json({ id: 0, preview: true, questions: makePlan(), deadlineAt: null });
  }
  const active = db.prepare('SELECT * FROM test_attempts WHERE user_id = ? AND lesson_id = ? AND finished_at IS NULL').get(req.user.id, l.id);
  if (active) return res.json({ id: active.id, questions: json(active.plan, []), deadlineAt: active.deadline_at });
  const done = db.prepare('SELECT COUNT(*) AS n FROM test_attempts WHERE user_id = ? AND lesson_id = ? AND finished_at IS NOT NULL').get(req.user.id, l.id).n;
  const limit = logic.attemptsLimitFor(req.user.id, l.id, settings);
  if (limit && done >= limit) fail(400, 'Попытки закончились. Обратитесь к куратору — он может открыть дополнительную попытку.');
  const plan = makePlan();
  const deadline = settings.timeLimitMin ? new Date(Date.now() + settings.timeLimitMin * 60000).toISOString() : null;
  const id = db.prepare('INSERT INTO test_attempts (user_id, lesson_id, plan, deadline_at) VALUES (?, ?, ?, ?)')
    .run(req.user.id, l.id, JSON.stringify(plan), deadline).lastInsertRowid;
  logic.touchLesson(req.user.id, l);
  res.json({ id, questions: plan, deadlineAt: deadline });
});

router.post('/attempts/:id/submit', (req, res) => {
  const answers = req.body?.answers && typeof req.body.answers === 'object' ? req.body.answers : {};
  if (int(req.params.id) === 0) {
    // предпросмотр для администратора: оцениваем без сохранения
    const l = db.prepare('SELECT * FROM lessons WHERE id = ?').get(int(req.body?.lessonId)) || fail(404, 'Занятие не найдено');
    if (!auth.isStaff(req.user)) fail(403, 'Нет доступа');
    const content = json(l.draft, {});
    const settings = json(l.settings, {});
    const plan = Array.isArray(req.body?.questions) ? req.body.questions : [];
    const byId = new Map((content.questions || []).map((q) => [q.id, q]));
    let sum = 0; let n = 0; const details = [];
    for (const pq of plan) {
      const q = byId.get(pq.id); if (!q) continue; n++;
      const sc = logic.gradeQuestion(q, answers[pq.id]); sum += sc;
      details.push({ id: q.id, score: sc, correct: sc >= 0.999, correctAnswer: logic.correctAnswerView(q), explanation: q.explanation || '' });
    }
    const score = n ? sum / n : 0;
    return res.json({ id: 0, preview: true, score: Math.round(score * 100), passed: Math.round(score * 100) >= (settings.passPercent ?? 60), passPercent: settings.passPercent ?? 60, mode: 'all', questions: plan, answers, details });
  }
  const a = db.prepare('SELECT * FROM test_attempts WHERE id = ?').get(int(req.params.id)) || fail(404, 'Попытка не найдена');
  if (a.user_id !== req.user.id) fail(403, 'Нет доступа');
  const l = db.prepare('SELECT * FROM lessons WHERE id = ?').get(a.lesson_id);
  const settings = json(l.settings, {});
  if (a.finished_at) return res.json(attemptView(a, settings));
  const content = json(l.published, {});
  const fin = tx(() => finishAttempt(a, answers, l, settings, content, req.user.id));
  res.json(attemptView(fin, settings));
});

router.get('/attempts/:id', (req, res) => {
  const a = db.prepare('SELECT * FROM test_attempts WHERE id = ?').get(int(req.params.id)) || fail(404, 'Попытка не найдена');
  if (a.user_id !== req.user.id && !auth.isStaff(req.user)) fail(403, 'Нет доступа');
  if (!a.finished_at) fail(400, 'Попытка ещё не завершена');
  const l = db.prepare('SELECT * FROM lessons WHERE id = ?').get(a.lesson_id);
  res.json(attemptView(a, auth.isStaff(req.user) ? { ...json(l.settings, {}), showAnswers: 'all' } : json(l.settings, {})));
});

/* ---------- Задания ---------- */
function reviewersNotify(l, settings, payload, exclude) {
  if (settings.reviewerId) notify(settings.reviewerId, payload);
  else notifyStaff(payload, { exclude });
}

router.post('/lessons/:id/submission', (req, res) => {
  const { l, preview, info, settings } = loadLesson(req);
  if (l.type !== 'assignment') fail(400, 'Это не задание');
  if (preview) fail(400, 'В режиме предпросмотра отправка недоступна');
  const body = str(req.body?.body, 50000);
  const files = cleanFiles(req.body?.files);
  if (!body.replace(/<[^>]+>/g, '').trim() && !files.length) fail(400, 'Добавьте текст ответа или прикрепите файл');
  if (settings.closeAfterDeadline && info.deadline && new Date(info.deadline) < new Date()) fail(400, 'Срок сдачи задания истёк');
  let s = db.prepare('SELECT * FROM submissions WHERE user_id = ? AND lesson_id = ?').get(req.user.id, l.id);
  if (s && s.status === 'accepted') fail(400, 'Задание уже принято');
  if (s && s.status === 'pending' && !req.body?.append) fail(400, 'Ответ уже на проверке. Можно написать комментарий ниже.');
  const status = settings.autoAccept ? 'accepted' : 'pending';
  tx(() => {
    if (!s) {
      const id = db.prepare('INSERT INTO submissions (user_id, lesson_id, status) VALUES (?, ?, ?)').run(req.user.id, l.id, status).lastInsertRowid;
      s = db.prepare('SELECT * FROM submissions WHERE id = ?').get(id);
    } else {
      db.prepare("UPDATE submissions SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, s.id);
    }
    db.prepare('INSERT INTO submission_messages (submission_id, author_id, kind, body, files) VALUES (?, ?, ?, ?, ?)')
      .run(s.id, req.user.id, 'answer', body, JSON.stringify(files));
    logic.touchLesson(req.user.id, l);
    if (settings.autoAccept) {
      db.prepare("UPDATE submissions SET points = ?, reviewed_at = datetime('now') WHERE id = ?").run(settings.maxPoints || 0, s.id);
      logic.completeLesson(req.user.id, l, settings.maxPoints || 0);
    }
  });
  if (!settings.autoAccept) {
    reviewersNotify(l, settings, { type: 'submission', title: `${req.user.name} прислал(а) ответ на задание`, body: `«${l.title}»`, link: `/admin/reviews/${s.id}` }, req.user.id);
  }
  res.json({ ok: true, status });
});

router.post('/submissions/:id/messages', (req, res) => {
  const s = db.prepare('SELECT * FROM submissions WHERE id = ?').get(int(req.params.id)) || fail(404, 'Работа не найдена');
  if (s.user_id !== req.user.id) fail(403, 'Нет доступа');
  const l = db.prepare('SELECT * FROM lessons WHERE id = ?').get(s.lesson_id);
  const body = str(req.body?.body, 20000);
  const files = cleanFiles(req.body?.files);
  if (!body.replace(/<[^>]+>/g, '').trim() && !files.length) fail(400, 'Пустое сообщение');
  db.prepare('INSERT INTO submission_messages (submission_id, author_id, kind, body, files) VALUES (?, ?, ?, ?, ?)')
    .run(s.id, req.user.id, 'message', body, JSON.stringify(files));
  db.prepare("UPDATE submissions SET updated_at = datetime('now') WHERE id = ?").run(s.id);
  reviewersNotify(l, json(l.settings, {}), { type: 'message', title: `${req.user.name}: комментарий к заданию`, body: `«${l.title}»`, link: `/admin/reviews/${s.id}` }, req.user.id);
  res.json({ messages: messagesOf(s.id) });
});

module.exports = router;
