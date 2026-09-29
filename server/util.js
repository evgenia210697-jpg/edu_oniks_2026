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
  };
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

module.exports = { HttpError, fail, fileUrl, getSettings, courseCard, sendCsv, int, str, json };
