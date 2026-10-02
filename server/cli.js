// Служебные команды:
//   npm run backup                          — резервная копия базы и файлов в папку backups/
//   npm run set-password -- логин пароль    — задать пароль пользователю (например, если админ забыл свой)
//   npm run create-admin -- email пароль "Имя" — создать ещё одного администратора
const path = require('path');
const fs = require('fs');
const config = require('./config');
const { db, backupTo } = require('./db');
const auth = require('./auth');

const [cmd, ...args] = process.argv.slice(2);

async function backup() {
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
  const dir = path.resolve(config.ROOT, process.env.BACKUP_DIR || 'backups', `backup-${stamp}`);
  fs.mkdirSync(dir, { recursive: true });
  await backupTo(path.join(dir, 'lms.sqlite'));
  fs.cpSync(config.UPLOAD_DIR, path.join(dir, 'uploads'), { recursive: true });
  console.log(`Готово: ${dir}`);
}

function setPassword(email, password) {
  if (!email || !password || password.length < 6) throw new Error('Использование: npm run set-password -- логин_или_email НовыйПароль (минимум 6 символов)');
  const r = db.prepare('UPDATE users SET password_hash = ?, is_active = 1 WHERE email = ?').run(auth.hashPassword(password), email.toLowerCase());
  if (!r.changes) throw new Error(`Пользователь ${email} не найден`);
  db.prepare('DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE email = ?)').run(email.toLowerCase());
  console.log(`Пароль для ${email} изменён`);
}

function createAdmin(email, password, name = 'Администратор') {
  if (!email || !password || password.length < 6) throw new Error('Использование: npm run create-admin -- email@company.ru Пароль "Имя Фамилия"');
  db.prepare("INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, 'admin')").run(email.toLowerCase(), name, auth.hashPassword(password));
  console.log(`Администратор ${email} создан`);
}

(async () => {
  try {
    if (cmd === 'backup') await backup();
    else if (cmd === 'set-password') setPassword(...args);
    else if (cmd === 'create-admin') createAdmin(...args);
    else console.log('Команды: backup | set-password email пароль | create-admin email пароль "Имя"');
  } catch (e) {
    console.error('Ошибка:', e.message);
    process.exitCode = 1;
  } finally {
    db.close();
  }
})();
