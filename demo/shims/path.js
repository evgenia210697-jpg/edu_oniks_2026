// Минимальный path для браузера (только то, что использует сервер платформы)
function normalize(p) {
  const abs = p.startsWith('/');
  const out = [];
  for (const s of p.split('/')) {
    if (!s || s === '.') continue;
    if (s === '..') out.pop(); else out.push(s);
  }
  return (abs ? '/' : '') + out.join('/');
}
const join = (...parts) => normalize(parts.filter(Boolean).join('/'));
function resolve(...parts) {
  let p = '';
  for (let i = parts.length - 1; i >= 0; i--) { p = parts[i] + (p ? '/' + p : ''); if (parts[i].startsWith('/')) break; }
  return normalize(p.startsWith('/') ? p : '/' + p);
}
const basename = (p) => String(p).split('/').pop();
const dirname = (p) => normalize(String(p).split('/').slice(0, -1).join('/') || '/');
const extname = (p) => { const b = basename(p); const i = b.lastIndexOf('.'); return i > 0 ? b.slice(i) : ''; };
const relative = (from, to) => (to.startsWith(from + '/') ? to.slice(from.length + 1) : to);
module.exports = { join, resolve, basename, dirname, extname, relative, normalize, sep: '/' };
