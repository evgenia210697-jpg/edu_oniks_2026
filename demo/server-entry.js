// Сервер платформы, запущенный в браузере: те же маршруты, что в server/index.js
const express = require('./shims/express');
const auth = require('../server/auth');
const { seedIfEmpty } = require('../server/seed');

seedIfEmpty();

const app = express.Router();
app.use('/api', auth.loadUser);
app.use('/api', require('../server/routes/core'));
app.use('/api/admin', require('../server/routes/admin-courses'));
app.use('/api/admin', require('../server/routes/admin-users'));
app.use('/api/admin', require('../server/routes/reviews').router);
app.use('/api/learn', require('../server/routes/learn'));
app.use('/api', (_req, res) => res.status(404).json({ error: 'Не найдено' }));

function errorHandler(err, res) {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Внутренняя ошибка сервера' : err.message });
}

module.exports = { app, errorHandler };
