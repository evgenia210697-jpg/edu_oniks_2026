// Файловая система для демо: загруженные файлы живут в памяти браузера (и в IndexedDB)
const UPLOAD_DIR = '/app/data/uploads';
const rel = (p) => (String(p).startsWith(UPLOAD_DIR + '/') ? String(p).slice(UPLOAD_DIR.length + 1) : null);
module.exports = {
  existsSync: (p) => { const r = rel(p); return !!(r && globalThis.__DEMO.files.has(r)); },
  mkdirSync: () => {},
  readFileSync: () => { throw new Error('fs недоступна в демо'); },
  cpSync: () => {},
  UPLOAD_DIR,
  rel,
};
