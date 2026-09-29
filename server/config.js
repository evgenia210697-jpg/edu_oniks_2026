// Настройки берутся из файла .env (в корне проекта) или переменных окружения
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}

const env = process.env;
const DATA_DIR = path.resolve(ROOT, env.DATA_DIR || 'data');

module.exports = {
  ROOT,
  PORT: Number(env.PORT || 8080),
  HOST: env.HOST || '0.0.0.0',
  DATA_DIR,
  UPLOAD_DIR: path.join(DATA_DIR, 'uploads'),
  MAX_UPLOAD_MB: Number(env.MAX_UPLOAD_MB || 4096),
  SESSION_DAYS: Number(env.SESSION_DAYS || 30),
  COOKIE_SECURE: env.COOKIE_SECURE === 'true',
  APP_URL: (env.APP_URL || '').replace(/\/$/, ''),
  ADMIN_EMAIL: env.ADMIN_EMAIL || 'admin@company.local',
  ADMIN_PASSWORD: env.ADMIN_PASSWORD || 'admin12345',
  SMTP: {
    host: env.SMTP_HOST || '',
    port: Number(env.SMTP_PORT || 465),
    secure: env.SMTP_SECURE ? env.SMTP_SECURE === 'true' : Number(env.SMTP_PORT || 465) === 465,
    user: env.SMTP_USER || '',
    pass: env.SMTP_PASS || '',
    from: env.SMTP_FROM || env.SMTP_USER || '',
  },
};
