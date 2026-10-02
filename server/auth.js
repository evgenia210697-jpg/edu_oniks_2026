// Авторизация: сессии в cookie, проверка ролей
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { db } = require('./db');
const config = require('./config');

const COOKIE = 'lms_sid';

function hashPassword(pw) {
  return bcrypt.hashSync(String(pw), 10);
}
function checkPassword(pw, hash) {
  try { return bcrypt.compareSync(String(pw), hash); } catch { return false; }
}

function generatePassword(len = 10) {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  const bytes = crypto.randomBytes(len);
  for (let i = 0; i < len; i++) s += alphabet[bytes[i] % alphabet.length];
  return s;
}

function createSession(res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + config.SESSION_DAYS * 86400000);
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expires.toISOString());
  res.cookie(COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: config.COOKIE_SECURE, expires, path: '/',
  });
}

function destroySession(req, res) {
  const token = req.cookies?.[COOKIE];
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.clearCookie(COOKIE, { path: '/' });
}

const seenCache = new Map();

// Подставляет req.user, если сессия действительна
function loadUser(req, _res, next) {
  const token = req.cookies?.[COOKIE];
  if (!token) return next();
  const row = db.prepare(`
    SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > ? AND u.is_active = 1`).get(token, new Date().toISOString());
  if (row) {
    req.user = row;
    // обновляем «был(а) онлайн» не чаще раза в минуту
    const last = seenCache.get(row.id) || 0;
    if (Date.now() - last > 60000) {
      seenCache.set(row.id, Date.now());
      db.prepare("UPDATE users SET last_seen_at = datetime('now') WHERE id = ?").run(row.id);
    }
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Требуется вход' });
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Требуется вход' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Недостаточно прав' });
    next();
  };
}

const isStaff = (u) => u && (u.role === 'admin' || u.role === 'curator');

function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id, email: u.email, login: u.email, contactEmail: u.contact_email || '', name: u.name, role: u.role,
    position: u.position || '', department: u.department || '', phone: u.phone || '',
    city: u.city || '', about: u.about || '', comment: u.comment || '',
    avatar: u.avatar_file_id ? `/api/files/${u.avatar_file_id}` : null,
    avatarFileId: u.avatar_file_id || null,
    isActive: !!u.is_active, emailNotify: !!u.email_notify,
    createdAt: u.created_at, lastSeenAt: u.last_seen_at,
    // приглашён, но ещё не перешёл по ссылке
    invitePending: !!u.invite_token_hash, invitedAt: u.invited_at || null, inviteExpiresAt: u.invite_expires_at || null,
  };
}

// Простая защита от перебора паролей
const attempts = new Map();
function loginThrottle(key) {
  const now = Date.now();
  const a = attempts.get(key) || { n: 0, until: 0, first: now };
  if (a.until > now) return Math.ceil((a.until - now) / 1000);
  return 0;
}
function loginFailed(key) {
  const now = Date.now();
  const a = attempts.get(key) || { n: 0, until: 0, first: now };
  if (now - a.first > 15 * 60000) { a.n = 0; a.first = now; }
  a.n += 1;
  if (a.n >= 8) { a.until = now + 5 * 60000; a.n = 0; a.first = now; }
  attempts.set(key, a);
}
function loginOk(key) { attempts.delete(key); }

module.exports = {
  COOKIE, hashPassword, checkPassword, generatePassword, createSession, destroySession,
  loadUser, requireAuth, requireRole, isStaff, publicUser, loginThrottle, loginFailed, loginOk,
};
