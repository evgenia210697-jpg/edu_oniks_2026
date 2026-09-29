// Проверка домашних заданий (админ и кураторы)
const express = require('express');
const { db, json, tx } = require('../db');
const auth = require('../auth');
const { fail, int, str } = require('../util');
const logic = require('../logic');
const { notify } = require('../notify');

const router = express.Router();
const staff = auth.requireRole('admin', 'curator');

function cleanFiles(files) {
  return (Array.isArray(files) ? files : []).slice(0, 20).map((f) => ({ id: int(f.id), name: str(f.name, 255), size: int(f.size) || 0, mime: str(f.mime, 100) }))
    .filter((f) => f.id);
}

function messagesOf(submissionId) {
  return db.prepare(`SELECT m.*, u.name AS author_name, u.role AS author_role, u.avatar_file_id FROM submission_messages m
    LEFT JOIN users u ON u.id = m.author_id WHERE m.submission_id = ? ORDER BY m.id`).all(submissionId).map((m) => ({
    id: m.id, kind: m.kind, body: m.body, files: json(m.files, []), createdAt: m.created_at,
    author: m.author_id ? { id: m.author_id, name: m.author_name, role: m.author_role, avatar: m.avatar_file_id ? `/api/files/${m.avatar_file_id}` : null } : null,
  }));
}

function canSee(user, lessonSettings) {
  if (user.role === 'admin') return true;
  return !lessonSettings.reviewerId || lessonSettings.reviewerId === user.id;
}

function subRow(s) {
  const settings = json(s.settings, {});
  return {
    id: s.id, status: s.status, points: s.points, maxPoints: settings.maxPoints || 0, createdAt: s.created_at, updatedAt: s.updated_at, reviewedAt: s.reviewed_at,
    user: { id: s.user_id, name: s.user_name, email: s.user_email, department: s.user_department, avatar: s.user_avatar ? `/api/files/${s.user_avatar}` : null },
    lesson: { id: s.lesson_id, title: s.lesson_title }, course: { id: s.course_id, title: s.course_title },
    reviewer: s.reviewer_name ? { id: s.reviewer_id, name: s.reviewer_name } : null,
  };
}

const BASE_SQL = `SELECT s.*, u.name AS user_name, u.email AS user_email, u.department AS user_department, u.avatar_file_id AS user_avatar,
  l.title AS lesson_title, l.settings, l.course_id, c.title AS course_title, r.name AS reviewer_name
  FROM submissions s JOIN users u ON u.id = s.user_id JOIN lessons l ON l.id = s.lesson_id JOIN courses c ON c.id = l.course_id
  LEFT JOIN users r ON r.id = s.reviewer_id`;

router.get('/submissions/count', staff, (req, res) => {
  const rows = db.prepare(`SELECT s.id, l.settings FROM submissions s JOIN lessons l ON l.id = s.lesson_id WHERE s.status = 'pending'`).all();
  res.json({ pending: rows.filter((r) => canSee(req.user, json(r.settings, {}))).length });
});

router.get('/submissions', staff, (req, res) => {
  const status = ['pending', 'accepted', 'returned'].includes(req.query.status) ? req.query.status : null;
  const courseId = int(req.query.courseId);
  const q = str(req.query.q, 100).toLowerCase();
  const where = []; const params = [];
  if (status) { where.push('s.status = ?'); params.push(status); }
  if (courseId) { where.push('l.course_id = ?'); params.push(courseId); }
  let rows = db.prepare(`${BASE_SQL} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY CASE s.status WHEN 'pending' THEN 0 ELSE 1 END, s.updated_at DESC LIMIT 500`).all(...params);
  rows = rows.filter((r) => canSee(req.user, json(r.settings, {})));
  if (q) rows = rows.filter((r) => `${r.user_name} ${r.user_email} ${r.lesson_title} ${r.course_title}`.toLowerCase().includes(q));
  res.json(rows.map(subRow));
});

function loadSub(req) {
  const s = db.prepare(`${BASE_SQL} WHERE s.id = ?`).get(int(req.params.id)) || fail(404, 'Работа не найдена');
  if (!canSee(req.user, json(s.settings, {}))) fail(403, 'Эта работа закреплена за другим проверяющим');
  return s;
}

router.get('/submissions/:id', staff, (req, res) => {
  const s = loadSub(req);
  const lesson = db.prepare('SELECT * FROM lessons WHERE id = ?').get(s.lesson_id);
  res.json({ ...subRow(s), task: json(lesson.published, json(lesson.draft, {})), messages: messagesOf(s.id) });
});

router.post('/submissions/:id/review', staff, (req, res) => {
  const s = loadSub(req);
  const decision = req.body?.decision;
  if (!['accept', 'return'].includes(decision)) fail(400, 'Неизвестное решение');
  const settings = json(s.settings, {});
  const max = settings.maxPoints || 0;
  let points = int(req.body?.points);
  points = max ? Math.min(max, Math.max(0, points ?? max)) : 0;
  const comment = str(req.body?.comment, 20000);
  const files = cleanFiles(req.body?.files);
  const lesson = db.prepare('SELECT * FROM lessons WHERE id = ?').get(s.lesson_id);
  tx(() => {
    if (decision === 'accept') {
      db.prepare("UPDATE submissions SET status = 'accepted', points = ?, reviewer_id = ?, reviewed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?")
        .run(points, req.user.id, s.id);
    } else {
      db.prepare("UPDATE submissions SET status = 'returned', reviewer_id = ?, reviewed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?")
        .run(req.user.id, s.id);
    }
    db.prepare('INSERT INTO submission_messages (submission_id, author_id, kind, body, files) VALUES (?, ?, ?, ?, ?)')
      .run(s.id, req.user.id, decision === 'accept' ? 'accepted' : 'returned', comment, JSON.stringify(files));
    if (decision === 'accept') logic.completeLesson(s.user_id, lesson, points);
    else db.prepare('UPDATE lesson_progress SET completed_at = NULL, points = 0 WHERE user_id = ? AND lesson_id = ?').run(s.user_id, lesson.id);
  });
  notify(s.user_id, decision === 'accept'
    ? { type: 'review', title: `Задание «${s.lesson_title}» принято`, body: max ? `Оценка: ${points} из ${max}` : 'Работа зачтена', link: `/course/${s.course_id}/lesson/${s.lesson_id}` }
    : { type: 'review', title: `Задание «${s.lesson_title}» отправлено на доработку`, body: comment ? comment.replace(/<[^>]+>/g, ' ').slice(0, 200) : 'Посмотрите комментарий проверяющего', link: `/course/${s.course_id}/lesson/${s.lesson_id}` });
  res.json({ ok: true });
});

router.post('/submissions/:id/messages', staff, (req, res) => {
  const s = loadSub(req);
  const body = str(req.body?.body, 20000);
  const files = cleanFiles(req.body?.files);
  if (!body.replace(/<[^>]+>/g, '').trim() && !files.length) fail(400, 'Пустое сообщение');
  db.prepare('INSERT INTO submission_messages (submission_id, author_id, kind, body, files) VALUES (?, ?, ?, ?, ?)')
    .run(s.id, req.user.id, 'message', body, JSON.stringify(files));
  notify(s.user_id, { type: 'message', title: `Новый комментарий к заданию «${s.lesson_title}»`, body: body.replace(/<[^>]+>/g, ' ').slice(0, 200), link: `/course/${s.course_id}/lesson/${s.lesson_id}` });
  res.json({ messages: messagesOf(s.id) });
});

module.exports = { router, messagesOf, cleanFiles };
