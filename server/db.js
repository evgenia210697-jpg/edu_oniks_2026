// База данных SQLite: схема и вспомогательные функции
const path = require('path');
const fs = require('fs');
const config = require('./config');

// Встроенный в Node.js 22+ модуль SQLite — не требует компиляции и доступа в интернет
const origEmit = process.emitWarning;
process.emitWarning = (w, ...rest) => { if (String(w && w.message ? w.message : w).includes('SQLite')) return; return origEmit.call(process, w, ...rest); };
const { DatabaseSync, backup: sqliteBackup } = require('node:sqlite');

fs.mkdirSync(config.DATA_DIR, { recursive: true });
fs.mkdirSync(config.UPLOAD_DIR, { recursive: true });

const DB_PATH = path.join(config.DATA_DIR, 'lms.sqlite');
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'student',
  position TEXT DEFAULT '',
  department TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  city TEXT DEFAULT '',
  about TEXT DEFAULT '',
  avatar_file_id INTEGER,
  comment TEXT DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1,
  email_notify INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  scope TEXT NOT NULL DEFAULT 'content',
  original_name TEXT NOT NULL,
  stored_path TEXT NOT NULL,
  mime TEXT NOT NULL DEFAULT 'application/octet-stream',
  size INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS courses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  cover_file_id INTEGER,
  status TEXT NOT NULL DEFAULT 'draft',
  sequential INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS modules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS lessons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  module_id INTEGER NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'lecture',
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  sort INTEGER NOT NULL DEFAULT 0,
  settings TEXT NOT NULL DEFAULT '{}',
  draft TEXT NOT NULL DEFAULT '{}',
  published TEXT,
  has_changes INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  published_at TEXT
);

CREATE TABLE IF NOT EXISTS enrollments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  enrolled_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  completed_at TEXT,
  last_lesson_id INTEGER,
  UNIQUE(user_id, course_id)
);

CREATE TABLE IF NOT EXISTS lesson_progress (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  opened_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  points INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, lesson_id)
);

CREATE TABLE IF NOT EXISTS test_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  deadline_at TEXT,
  finished_at TEXT,
  plan TEXT NOT NULL DEFAULT '[]',
  answers TEXT,
  result TEXT,
  score REAL,
  passed INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  points INTEGER,
  reviewer_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at TEXT,
  UNIQUE(user_id, lesson_id)
);

CREATE TABLE IF NOT EXISTS submission_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  kind TEXT NOT NULL DEFAULT 'message',
  body TEXT NOT NULL DEFAULT '',
  files TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT DEFAULT '',
  link TEXT DEFAULT '',
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE INDEX IF NOT EXISTS idx_lessons_course ON lessons(course_id);
CREATE INDEX IF NOT EXISTS idx_lessons_module ON lessons(module_id);
CREATE INDEX IF NOT EXISTS idx_progress_lesson ON lesson_progress(lesson_id);
CREATE INDEX IF NOT EXISTS idx_attempts_user ON test_attempts(user_id, lesson_id);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_sub_status ON submissions(status);
`);

// Миграции: только добавление новых колонок и таблиц — существующие данные не изменяются и не удаляются.
// Перед первым запуском новой версии на рабочей базе делается её полная копия (data/backups/…).
const SCHEMA_VERSION = 2;

/** Полная копия базы одним файлом (согласованная, даже пока платформа работает) */
function snapshot(label) {
  if (globalThis.__DEMO) return null; // демо-версия в браузере — копировать некуда
  try {
    const dir = path.join(config.DATA_DIR, 'backups');
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
    const file = path.join(dir, `${label}-${stamp}.sqlite`);
    db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    return file;
  } catch (e) {
    console.warn('Не удалось сделать копию базы:', e.message);
    return null;
  }
}

const userVersion = Number(db.prepare('PRAGMA user_version').get().user_version) || 0;
if (userVersion < SCHEMA_VERSION) {
  const hasData = db.prepare('SELECT COUNT(*) AS n FROM users').get().n > 0;
  if (hasData) {
    const file = snapshot(`before-update-v${SCHEMA_VERSION}`);
    if (file) console.log(`  Перед обновлением сохранена копия базы: ${file}`);
  }
}
const userCols = new Set(db.prepare('PRAGMA table_info(users)').all().map((c) => c.name));
for (const [col, type] of [['invite_token_hash', 'TEXT'], ['invite_expires_at', 'TEXT'], ['invited_at', 'TEXT'], ['invited_by', 'INTEGER'],
  // резервный e-mail для писем, когда логин — не почта (может повторяться у разных сотрудников)
  ['contact_email', "TEXT DEFAULT ''"]]) {
  if (!userCols.has(col)) db.exec(`ALTER TABLE users ADD COLUMN ${col} ${type}`);
}
db.exec(`
CREATE INDEX IF NOT EXISTS idx_users_invite ON users(invite_token_hash);
-- дополнительные попытки теста, которые куратор выдал ученику сверх лимита
CREATE TABLE IF NOT EXISTS test_attempt_grants (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  extra INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, lesson_id)
);
`);
if (userVersion < SCHEMA_VERSION) db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);

function json(value, fallback) {
  if (value == null || value === '') return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

// Транзакция (поддерживает вложенность через SAVEPOINT)
let depth = 0;
function tx(fn) {
  const sp = `sp${depth}`;
  db.exec(depth === 0 ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${sp}`);
  depth++;
  try {
    const r = fn();
    depth--;
    db.exec(depth === 0 ? 'COMMIT' : `RELEASE ${sp}`);
    return r;
  } catch (e) {
    depth--;
    db.exec(depth === 0 ? 'ROLLBACK' : `ROLLBACK TO ${sp}; RELEASE ${sp}`);
    throw e;
  }
}

/** Резервная копия базы «на ходу» */
function backupTo(dest) {
  return sqliteBackup(db, dest);
}

module.exports = { db, json, tx, backupTo, snapshot, DB_PATH };
