// Бизнес-логика: структура курса, прогресс, тесты
const crypto = require('crypto');
const { db, json } = require('./db');
const { notify, notifyStaff } = require('./notify');

const TYPE_LABEL = { lecture: 'Урок', assignment: 'Задание', test: 'Тест' };

function lessonSettings(l) { return json(l.settings, {}); }

/** Сколько попыток теста доступно ученику: лимит теста + выданные куратором сверх него (0 — без ограничений) */
function attemptsLimitFor(userId, lessonId, settings) {
  const base = Number(settings.attemptsLimit) || 0;
  if (!base) return 0;
  const g = db.prepare('SELECT extra FROM test_attempt_grants WHERE user_id = ? AND lesson_id = ?').get(userId, lessonId);
  return base + (g ? Number(g.extra) || 0 : 0);
}

/** Модули и уроки курса (для ученика — только опубликованные) */
function courseOutline(courseId, { publishedOnly = false } = {}) {
  const modules = db.prepare('SELECT * FROM modules WHERE course_id = ? ORDER BY sort, id').all(courseId);
  const lessons = db.prepare(`SELECT id, module_id, type, title, status, sort, settings, has_changes, published IS NOT NULL AS was_published
    FROM lessons WHERE course_id = ? ${publishedOnly ? "AND status = 'published' AND published IS NOT NULL" : ''} ORDER BY sort, id`).all(courseId);
  return modules.map((m) => ({
    id: m.id, title: m.title, description: m.description || '', sort: m.sort,
    lessons: lessons.filter((l) => l.module_id === m.id).map((l) => ({
      id: l.id, moduleId: l.module_id, type: l.type, title: l.title, status: l.status,
      hasChanges: !!l.has_changes, wasPublished: !!l.was_published, settings: lessonSettings(l),
    })),
  })).filter((m) => !publishedOnly || m.lessons.length > 0);
}

function flatLessons(outline) {
  const out = [];
  for (const m of outline) for (const l of m.lessons) out.push({ ...l, moduleTitle: m.title });
  return out;
}

/** Состояние прохождения курса учеником: статусы уроков, прогресс, блокировки */
function courseState(userId, courseId) {
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(courseId);
  if (!course) return null;
  const outline = courseOutline(courseId, { publishedOnly: true });
  const flat = flatLessons(outline);
  const ids = flat.map((l) => l.id);
  const prog = new Map();
  const subs = new Map();
  const tests = new Map();
  if (ids.length) {
    const ph = ids.map(() => '?').join(',');
    for (const p of db.prepare(`SELECT * FROM lesson_progress WHERE user_id = ? AND lesson_id IN (${ph})`).all(userId, ...ids)) prog.set(p.lesson_id, p);
    for (const s of db.prepare(`SELECT * FROM submissions WHERE user_id = ? AND lesson_id IN (${ph})`).all(userId, ...ids)) subs.set(s.lesson_id, s);
    for (const t of db.prepare(`SELECT lesson_id, COUNT(*) AS n, MAX(score) AS best, MAX(passed) AS passed FROM test_attempts
        WHERE user_id = ? AND finished_at IS NOT NULL AND lesson_id IN (${ph}) GROUP BY lesson_id`).all(userId, ...ids)) tests.set(t.lesson_id, t);
  }
  const enrollment = db.prepare('SELECT * FROM enrollments WHERE user_id = ? AND course_id = ?').get(userId, courseId);
  let blocked = false;
  // курс пройден целиком — дальше можно открывать любые занятия в любом порядке
  const freeOrder = !course.sequential || !!enrollment?.completed_at;
  let completedCount = 0;
  let points = 0;
  const statusMap = new Map();
  for (const l of flat) {
    const p = prog.get(l.id);
    const s = subs.get(l.id);
    const t = tests.get(l.id);
    let status = 'available';
    if (p && p.completed_at) status = 'completed';
    else if (l.type === 'assignment' && s) status = s.status === 'returned' ? 'returned' : 'pending';
    else if (l.type === 'test' && t) status = 'failed';
    else if (p) status = 'opened';
    const locked = !freeOrder && blocked;
    const done = status === 'completed' || status === 'pending' || status === 'returned';
    if (!done) blocked = true;
    if (status === 'completed') completedCount++;
    if (p) points += p.points || 0;
    const info = {
      status, locked, points: p ? p.points : 0,
      maxPoints: l.type === 'assignment' ? (l.settings.maxPoints || 0) : (l.settings.points || 0),
    };
    if (l.type === 'test') {
      info.attempts = t ? t.n : 0;
      info.bestScore = t ? Math.round((t.best || 0) * 100) : null;
      info.attemptsLimit = attemptsLimitFor(userId, l.id, l.settings);
      info.outOfAttempts = status !== 'completed' && info.attemptsLimit > 0 && info.attempts >= info.attemptsLimit;
    }
    if (l.type === 'assignment' && s) info.submissionId = s.id;
    if (l.type === 'assignment' && l.settings.deadlineDays && enrollment) {
      const d = new Date(enrollment.enrolled_at.replace(' ', 'T') + 'Z');
      d.setDate(d.getDate() + Number(l.settings.deadlineDays));
      info.deadline = d.toISOString();
    }
    statusMap.set(l.id, info);
  }
  const total = flat.length;
  const modules = outline.map((m) => {
    const lessons = m.lessons.map((l) => ({ id: l.id, type: l.type, title: l.title, ...statusMap.get(l.id) }));
    return { id: m.id, title: m.title, description: m.description, lessons, completed: lessons.filter((x) => x.status === 'completed').length };
  });
  return {
    course, enrollment, modules, flat: flat.map((l) => ({ id: l.id, type: l.type, title: l.title, moduleId: l.moduleId, ...statusMap.get(l.id) })),
    total, completed: completedCount, points,
    progress: total ? Math.round((completedCount / total) * 100) : 0,
  };
}

/** Проверка, завершён ли курс, и отметка в enrollments */
function checkCourseCompletion(userId, courseId) {
  const st = courseState(userId, courseId);
  if (!st || !st.enrollment || st.enrollment.completed_at) return;
  if (st.total > 0 && st.completed === st.total) {
    db.prepare("UPDATE enrollments SET completed_at = datetime('now') WHERE id = ?").run(st.enrollment.id);
    const u = db.prepare('SELECT name FROM users WHERE id = ?').get(userId);
    notify(userId, { type: 'course_completed', title: `Курс «${st.course.title}» пройден!`, body: 'Поздравляем с завершением обучения.', link: `/course/${courseId}` });
    notifyStaff({ type: 'course_completed', title: `${u.name} завершил(а) курс`, body: `Курс «${st.course.title}»`, link: `/admin/users/${userId}` }, { includeCurators: false });
  }
}

function touchLesson(userId, lesson) {
  db.prepare('INSERT OR IGNORE INTO lesson_progress (user_id, lesson_id) VALUES (?, ?)').run(userId, lesson.id);
  db.prepare("UPDATE enrollments SET started_at = COALESCE(started_at, datetime('now')), last_lesson_id = ? WHERE user_id = ? AND course_id = ?")
    .run(lesson.id, userId, lesson.course_id);
}

function completeLesson(userId, lesson, points) {
  touchLesson(userId, lesson);
  const p = db.prepare('SELECT * FROM lesson_progress WHERE user_id = ? AND lesson_id = ?').get(userId, lesson.id);
  if (p.completed_at) {
    if (points != null && points !== p.points) db.prepare('UPDATE lesson_progress SET points = ? WHERE user_id = ? AND lesson_id = ?').run(points, userId, lesson.id);
    return;
  }
  db.prepare("UPDATE lesson_progress SET completed_at = datetime('now'), points = ? WHERE user_id = ? AND lesson_id = ?")
    .run(points || 0, userId, lesson.id);
  checkCourseCompletion(userId, lesson.course_id);
}

/* ===================== ТЕСТЫ ===================== */

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function parseGaps(text) {
  // «Болт [М10] имеет [метрическую] резьбу» → сегменты и правильные слова
  const segments = [];
  const answers = [];
  const re = /\[([^\]]+)\]/g;
  let last = 0; let m;
  while ((m = re.exec(text || ''))) {
    if (m.index > last) segments.push({ t: 'text', v: text.slice(last, m.index) });
    segments.push({ t: 'gap', i: answers.length });
    answers.push(m[1].trim());
    last = m.index + m[0].length;
  }
  if (last < (text || '').length) segments.push({ t: 'text', v: text.slice(last) });
  return { segments, answers };
}

/** Вопрос для показа ученику — без правильных ответов */
function presentQuestion(q, shuffleOptions) {
  const base = { id: q.id, type: q.type, text: q.text || '', image: q.image || null };
  switch (q.type) {
    case 'choice': {
      const opts = (q.options || []).map((o) => ({ id: o.id, text: o.text || '', image: o.image || null }));
      return { ...base, imageOptions: !!q.imageOptions, multiple: (q.options || []).filter((o) => o.correct).length > 1,
        options: shuffleOptions ? shuffle(opts) : opts };
    }
    case 'gaps': {
      const { segments, answers } = parseGaps(q.gapText);
      const words = Array.from(new Set([...answers, ...(q.distractors || []).map((d) => String(d).trim()).filter(Boolean)]));
      return { ...base, segments, words: shuffle(words) };
    }
    case 'order': {
      let items = (q.items || []).map((i) => ({ id: i.id, text: i.text }));
      if (items.length > 1) {
        let s = shuffle(items);
        for (let k = 0; k < 5 && s.every((x, i) => x.id === items[i].id); k++) s = shuffle(items);
        items = s;
      }
      return { ...base, items };
    }
    case 'match': {
      const pairs = q.pairs || [];
      return { ...base, lefts: pairs.map((p) => ({ id: p.id, text: p.left })), rights: shuffle(pairs.map((p) => ({ id: p.id, text: p.right }))) };
    }
    case 'text':
      return base;
    case 'number':
      return { ...base, integerOnly: !!q.integerOnly };
    default:
      return base;
  }
}

const norm = (s, cs) => { const v = String(s ?? '').trim().replace(/\s+/g, ' '); return cs ? v : v.toLowerCase().replace(/ё/g, 'е'); };

/** Оценка ответа: 0..1 */
function gradeQuestion(q, ans) {
  switch (q.type) {
    case 'choice': {
      const correct = new Set((q.options || []).filter((o) => o.correct).map((o) => o.id));
      const given = new Set(Array.isArray(ans) ? ans : []);
      if (!correct.size) return 0;
      if (given.size !== correct.size) return 0;
      for (const id of given) if (!correct.has(id)) return 0;
      return 1;
    }
    case 'gaps': {
      const { answers } = parseGaps(q.gapText);
      if (!answers.length) return 0;
      const given = Array.isArray(ans) ? ans : [];
      let ok = 0;
      answers.forEach((a, i) => { if (norm(given[i]) === norm(a)) ok++; });
      return ok / answers.length;
    }
    case 'order': {
      const ids = (q.items || []).map((i) => i.id);
      const given = Array.isArray(ans) ? ans : [];
      return ids.length && ids.length === given.length && ids.every((id, i) => given[i] === id) ? 1 : 0;
    }
    case 'match': {
      const pairs = q.pairs || [];
      if (!pairs.length) return 0;
      const given = ans && typeof ans === 'object' ? ans : {};
      let ok = 0;
      for (const p of pairs) if (given[p.id] === p.id) ok++;
      return ok / pairs.length;
    }
    case 'text': {
      const v = norm(ans, q.caseSensitive);
      if (q.anyAnswer) return v ? 1 : 0;
      return (q.answers || []).some((a) => norm(a, q.caseSensitive) === v && v !== '') ? 1 : 0;
    }
    case 'number': {
      const raw = String(ans ?? '').replace(',', '.').replace(/\s/g, '');
      if (raw === '' || isNaN(Number(raw))) return 0;
      const n = Number(raw);
      if (q.integerOnly && !Number.isInteger(n)) return 0;
      const num = (v) => Number(String(v ?? '').replace(',', '.').replace(/\s/g, ''));
      if (q.range) return n >= num(q.min) && n <= num(q.max) ? 1 : 0;
      return (q.answers || []).filter((a) => String(a).trim() !== '').some((a) => Math.abs(num(a) - n) < 1e-9) ? 1 : 0;
    }
    default:
      return 0;
  }
}

/** Правильный ответ в человекочитаемом виде (для показа после теста) */
function correctAnswerView(q) {
  switch (q.type) {
    case 'choice': return (q.options || []).filter((o) => o.correct).map((o) => o.id);
    case 'gaps': return parseGaps(q.gapText).answers;
    case 'order': return (q.items || []).map((i) => i.id);
    case 'match': return Object.fromEntries((q.pairs || []).map((p) => [p.id, p.id]));
    case 'text': return q.anyAnswer ? null : (q.answers || []);
    case 'number': return q.range ? { min: q.min, max: q.max } : (q.answers || []);
    default: return null;
  }
}

module.exports = {
  TYPE_LABEL, courseOutline, flatLessons, courseState, checkCourseCompletion, touchLesson, completeLesson,
  shuffle, presentQuestion, gradeQuestion, correctAnswerView, parseGaps, lessonSettings, attemptsLimitFor,
};
