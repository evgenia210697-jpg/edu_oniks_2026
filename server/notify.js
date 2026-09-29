// Уведомления: внутри платформы + email (если настроен SMTP в .env)
const { db } = require('./db');
const config = require('./config');

let transporter = null;
if (config.SMTP.host) {
  try {
    const nodemailer = require('nodemailer');
    transporter = nodemailer.createTransport({
      host: config.SMTP.host,
      port: config.SMTP.port,
      secure: config.SMTP.secure,
      auth: config.SMTP.user ? { user: config.SMTP.user, pass: config.SMTP.pass } : undefined,
    });
    console.log(`[mail] SMTP включён: ${config.SMTP.host}:${config.SMTP.port}`);
  } catch (e) {
    console.warn('[mail] Не удалось настроить SMTP:', e.message);
  }
}

function platformName() {
  const r = db.prepare("SELECT value FROM settings WHERE key = 'platform_name'").get();
  return (r && r.value) || 'Учебный центр';
}

function accentColor() {
  const r = db.prepare("SELECT value FROM settings WHERE key = 'accent_color'").get();
  return (r && /^#[0-9a-fA-F]{6}$/.test(r.value) && r.value) || '#2F5BEA';
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

async function sendMail(to, subject, text, link) {
  if (!transporter || !to) return;
  const url = link && config.APP_URL ? config.APP_URL + link : '';
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#1b2430;line-height:1.5">
    <p style="font-size:13px;color:#6b7686;margin:0 0 12px">${escapeHtml(platformName())}</p>
    <h2 style="font-size:18px;margin:0 0 12px">${escapeHtml(subject)}</h2>
    <p style="margin:0 0 16px">${escapeHtml(text)}</p>
    ${url ? `<p><a href="${url}" style="display:inline-block;background:${accentColor()};color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Открыть</a></p>` : ''}
  </div>`;
  try {
    await transporter.sendMail({ from: config.SMTP.from, to, subject, text: text + (url ? `\n\n${url}` : ''), html });
  } catch (e) {
    console.warn('[mail] Ошибка отправки:', e.message);
  }
}

/** Создать уведомление пользователю (и отправить письмо, если включено) */
function notify(userId, { type, title, body = '', link = '' }) {
  if (!userId) return;
  db.prepare('INSERT INTO notifications (user_id, type, title, body, link) VALUES (?, ?, ?, ?, ?)')
    .run(userId, type, title, body, link);
  const u = db.prepare('SELECT email, email_notify, is_active FROM users WHERE id = ?').get(userId);
  if (u && u.is_active && u.email_notify) sendMail(u.email, title, body, link);
}

/** Всем администраторам (и кураторам, если staff=true) */
function notifyStaff(payload, { includeCurators = true, exclude } = {}) {
  const roles = includeCurators ? ['admin', 'curator'] : ['admin'];
  const rows = db.prepare(`SELECT id FROM users WHERE is_active = 1 AND role IN (${roles.map(() => '?').join(',')})`).all(...roles);
  for (const r of rows) if (r.id !== exclude) notify(r.id, payload);
}

module.exports = { notify, notifyStaff, mailEnabled: () => !!transporter, platformName };
