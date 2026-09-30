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

/** Письмо-приглашение на платформу. Возвращает true, если письмо ушло */
async function sendInviteMail({ to, name, link, invitedBy, courses = [], days }) {
  if (!transporter || !to || !link) return false;
  const platform = platformName();
  const color = accentColor();
  const subject = `Приглашение на платформу «${platform}»`;
  const courseList = courses.length ? `Вам уже открыты курсы: ${courses.map((c) => `«${c}»`).join(', ')}.` : '';
  const text = [
    `Здравствуйте${name ? `, ${name}` : ''}!`,
    `${invitedBy ? `${invitedBy} приглашает` : 'Вас приглашают'} вас на корпоративную платформу обучения «${platform}».`,
    courseList,
    `Чтобы войти, откройте ссылку, укажите имя и придумайте пароль: ${link}`,
    `Ссылка действует ${days} дней. Если вы не ждали этого письма, просто не отвечайте на него.`,
  ].filter(Boolean).join('\n\n');
  const html = `<div style="background:#f3f5f8;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;color:#1b2430">
    <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;padding:32px 28px;border:1px solid #e3e7ed">
      <div style="font-size:13px;color:#6b7686;margin-bottom:18px">${escapeHtml(platform)}</div>
      <h1 style="font-size:22px;line-height:1.3;margin:0 0 14px">Вас пригласили на платформу обучения</h1>
      <p style="font-size:15px;line-height:1.6;margin:0 0 12px">Здравствуйте${name ? `, ${escapeHtml(name)}` : ''}!</p>
      <p style="font-size:15px;line-height:1.6;margin:0 0 12px">${invitedBy ? `${escapeHtml(invitedBy)} приглашает` : 'Вас приглашают'} вас на корпоративную платформу обучения «${escapeHtml(platform)}».</p>
      ${courseList ? `<p style="font-size:15px;line-height:1.6;margin:0 0 12px">${escapeHtml(courseList)}</p>` : ''}
      <p style="font-size:15px;line-height:1.6;margin:0 0 22px">Нажмите кнопку, укажите имя и придумайте пароль — и сразу попадёте в свой кабинет.</p>
      <p style="margin:0 0 22px"><a href="${link}" style="display:inline-block;background:${color};color:#fff;padding:13px 24px;border-radius:10px;text-decoration:none;font-weight:bold;font-size:15px">Принять приглашение</a></p>
      <p style="font-size:13px;line-height:1.5;color:#6b7686;margin:0 0 6px">Кнопка не открывается? Скопируйте ссылку в браузер:</p>
      <p style="font-size:13px;line-height:1.5;margin:0 0 18px;word-break:break-all"><a href="${link}" style="color:${color}">${escapeHtml(link)}</a></p>
      <p style="font-size:12px;line-height:1.5;color:#9aa4b2;margin:0">Ссылка действует ${days} дней. Если вы не ждали этого письма, просто не отвечайте на него.</p>
    </div>
  </div>`;
  try {
    await transporter.sendMail({ from: config.SMTP.from, to, subject, text, html });
    return true;
  } catch (e) {
    console.warn('[mail] Не удалось отправить приглашение:', e.message);
    return false;
  }
}

/** Создать уведомление пользователю (и отправить письмо, если включено) */
// email: false — только уведомление внутри платформы (например, курсы уже перечислены в письме-приглашении)
function notify(userId, { type, title, body = '', link = '' }, { email = true } = {}) {
  if (!userId) return;
  db.prepare('INSERT INTO notifications (user_id, type, title, body, link) VALUES (?, ?, ?, ?, ?)')
    .run(userId, type, title, body, link);
  const u = db.prepare('SELECT email, email_notify, is_active, invite_token_hash FROM users WHERE id = ?').get(userId);
  if (email && u && u.is_active && u.email_notify && !u.invite_token_hash) sendMail(u.email, title, body, link);
}

/** Всем администраторам (и кураторам, если staff=true) */
function notifyStaff(payload, { includeCurators = true, exclude } = {}) {
  const roles = includeCurators ? ['admin', 'curator'] : ['admin'];
  const rows = db.prepare(`SELECT id FROM users WHERE is_active = 1 AND role IN (${roles.map(() => '?').join(',')})`).all(...roles);
  for (const r of rows) if (r.id !== exclude) notify(r.id, payload);
}

module.exports = { notify, notifyStaff, sendInviteMail, mailEnabled: () => !!transporter, platformName };
