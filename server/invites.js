// Приглашения на платформу: администратор вводит e-mail — сотрудник получает письмо со ссылкой,
// сам задаёт имя и пароль и сразу попадает в свой кабинет.
const crypto = require('crypto');
const { db } = require('./db');
const config = require('./config');
const { sendInviteMail, mailEnabled } = require('./notify');

const INVITE_DAYS = 7;

// В базе хранится только отпечаток ссылки: даже с копией базы приглашением не воспользоваться
const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

/** Адрес платформы для ссылки: из настроек (APP_URL) или адрес, с которого работает администратор */
function baseUrl(req) {
  if (config.APP_URL) return config.APP_URL;
  const origin = String(req.body?.origin || '');
  if (/^https?:\/\/[^\s/?#]+$/i.test(origin)) return origin.replace(/\/$/, '');
  const host = typeof req.get === 'function' ? req.get('host') : '';
  return host ? `${req.protocol}://${host}` : '';
}

/** Выпустить новое приглашение (старая ссылка перестаёт работать) */
function issueInvite(userId, invitedById) {
  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + INVITE_DAYS * 86400000).toISOString();
  db.prepare("UPDATE users SET invite_token_hash = ?, invite_expires_at = ?, invited_at = datetime('now'), invited_by = ? WHERE id = ?")
    .run(hashToken(token), expiresAt, invitedById || null, userId);
  return { token, path: `/invite/${token}`, expiresAt };
}

/** Выпустить приглашение и отправить письмо. Возвращает данные для экрана администратора */
function inviteUser(req, userId) {
  const u = db.prepare('SELECT id, email, name FROM users WHERE id = ?').get(userId);
  const inv = issueInvite(userId, req.user?.id);
  const base = baseUrl(req);
  const link = base ? base + inv.path : inv.path;
  const courses = db.prepare(`SELECT c.title FROM enrollments e JOIN courses c ON c.id = e.course_id
    WHERE e.user_id = ? AND c.status = 'published' ORDER BY c.sort, c.id`).all(userId).map((c) => c.title);
  const emailSent = mailEnabled();
  if (emailSent) {
    sendInviteMail({ to: u.email, name: realName(u), link, invitedBy: req.user?.name, courses, days: INVITE_DAYS })
      .catch(() => {});
  }
  return { link, path: inv.path, expiresAt: inv.expiresAt, emailSent, email: u.email, name: u.name };
}

function findByToken(token) {
  if (!token || String(token).length < 20) return null;
  return db.prepare('SELECT * FROM users WHERE invite_token_hash = ?').get(hashToken(token)) || null;
}

// Имя-заглушка из e-mail (когда администратор не знал ФИО) — не обращаемся так к человеку
const realName = (u) => (u.name && u.name !== String(u.email).split('@')[0] ? u.name : '');

const isExpired = (u) => !u.invite_expires_at || new Date(u.invite_expires_at).getTime() < Date.now();

module.exports = { INVITE_DAYS, inviteUser, findByToken, isExpired, hashToken, realName };
