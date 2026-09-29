// Точка входа сервера платформы обучения
const [maj, min] = process.versions.node.split('.').map(Number);
if (maj < 22 || (maj === 22 && min < 13)) {
  console.error(`\n  Нужен Node.js версии 22.13 или новее (сейчас ${process.versions.node}). Скачайте LTS-версию: https://nodejs.org\n`);
  process.exit(1);
}
const path = require('path');
const fs = require('fs');
const express = require('express');
const cookieParser = require('cookie-parser');
const config = require('./config');
const { db } = require('./db');
const auth = require('./auth');
const { seedIfEmpty } = require('./seed');

seedIfEmpty();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback');
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});
app.use('/api', auth.loadUser);

app.use('/api', require('./routes/core'));
app.use('/api/admin', require('./routes/admin-courses'));
app.use('/api/admin', require('./routes/admin-users'));
app.use('/api/admin', require('./routes/reviews').router);
app.use('/api/learn', require('./routes/learn'));

app.use('/api', (_req, res) => res.status(404).json({ error: 'Не найдено' }));

// Собранный интерфейс
const dist = path.join(config.ROOT, 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: '7d', setHeaders: (res, p) => { if (p.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache'); } }));
  app.get('/{*splat}', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(dist, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => res.send('Интерфейс не собран. Выполните: npm run build'));
}

// Обработка ошибок
app.use((err, _req, res, _next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: `Файл слишком большой (максимум ${config.MAX_UPLOAD_MB} МБ)` });
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Внутренняя ошибка сервера' : err.message });
});

// Чистка просроченных сессий раз в сутки
setInterval(() => db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(new Date().toISOString()), 86400000).unref();

const server = app.listen(config.PORT, config.HOST, () => {
  console.log(`\n  Платформа обучения запущена: http://localhost:${config.PORT}`);
  console.log(`  Данные хранятся в: ${config.DATA_DIR}\n`);
});
server.requestTimeout = 0; // большие видео грузятся долго
server.headersTimeout = 120000;

process.on('SIGINT', () => { db.close(); process.exit(0); });
process.on('SIGTERM', () => { db.close(); process.exit(0); });
