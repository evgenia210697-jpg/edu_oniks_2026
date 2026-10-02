const { db, json } = require('./db');

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new HttpError(status, message); };

const fileUrl = (id) => (id ? `/api/files/${id}` : null);

function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const s = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    platformName: s.platform_name || 'Учебный центр',
    accentColor: s.accent_color || '#2F5BEA',
    logo: fileUrl(s.logo_file_id),
    logoFileId: s.logo_file_id ? Number(s.logo_file_id) : null,
    loginText: s.login_text ?? 'Корпоративная платформа обучения сотрудников',
    libraryTitle: s.library_title || 'Моё обучение',
    librarySubtitle: s.library_subtitle ?? 'Все ваши курсы в одном месте',
    cover: fileUrl(s.cover_file_id),
    coverFileId: s.cover_file_id ? Number(s.cover_file_id) : null,
    learning: learningDefaults(s),
  };
}

/** Правила обучения по умолчанию: применяются к новым тестам и курсам */
function learningDefaults(s) {
  if (!s) s = Object.fromEntries(db.prepare("SELECT key, value FROM settings WHERE key LIKE 'learn_%'").all().map((r) => [r.key, r.value]));
  const num = (v, def) => (v == null || v === '' || isNaN(Number(v)) ? def : Number(v));
  return {
    passPercent: Math.min(100, Math.max(0, num(s.learn_pass_percent, 85))),
    attemptsLimit: Math.max(0, num(s.learn_attempts_limit, 3)),
    sequential: s.learn_sequential == null ? true : s.learn_sequential === '1',
  };
}

/* ---------- Логины ---------- */
const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || ''));
// Логин: e-mail или латиница, цифры, точка, дефис, подчёркивание (3–64 символа)
const loginValid = (l) => emailOk(l) || /^[a-z0-9][a-z0-9._-]{2,63}$/.test(String(l || ''));
/** Куда отправлять письма: резервный e-mail, а если его нет — логин, когда он сам e-mail */
const mailOf = (u) => (u && emailOk(u.contact_email) ? u.contact_email : (u && emailOk(u.email) ? u.email : ''));

const TR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
const translit = (t) => String(t || '').toLowerCase().split('').map((ch) => (ch in TR ? TR[ch] : ch)).join('').replace(/[^a-z0-9]+/g, '');

/** Свободный логин из ФИО: «Иванов Иван» → ivanov.ivan (ivanov.ivan2, если занят) */
function suggestLogin(name) {
  const parts = String(name || '').trim().split(/\s+/).map(translit).filter(Boolean).slice(0, 2);
  let base = parts.join('.').slice(0, 40);
  if (base.length < 3) base = `student${String(Math.floor(1000 + Math.random() * 9000))}`;
  const taken = (l) => !!db.prepare('SELECT 1 FROM users WHERE email = ?').get(l);
  if (!taken(base)) return base;
  for (let i = 2; i < 1000; i++) if (!taken(`${base}${i}`)) return `${base}${i}`;
  return `${base}${Date.now() % 100000}`;
}

function courseCard(c) {
  return {
    id: c.id, title: c.title, description: c.description || '', status: c.status,
    sequential: !!c.sequential, cover: fileUrl(c.cover_file_id), coverFileId: c.cover_file_id || null,
    createdAt: c.created_at, updatedAt: c.updated_at,
  };
}

function csv(rows) {
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + rows.map((r) => r.map(esc).join(';')).join('\r\n');
}

function sendCsv(res, filename, rows) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="export.csv"; filename*=UTF-8''${encodeURIComponent(filename)}`);
  res.send(csv(rows));
}

const int = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };
const str = (v, max = 500) => String(v ?? '').trim().slice(0, max);

module.exports = { HttpError, fail, fileUrl, getSettings, learningDefaults, courseCard, sendCsv, int, str, json, emailOk, loginValid, mailOf, suggestLogin };
