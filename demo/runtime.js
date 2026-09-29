// Демо-режим: сервер платформы работает прямо в браузере.
// База SQLite (sql.js) и загруженные файлы сохраняются в IndexedDB этого браузера.
import initSqlJs from 'sql.js/dist/sql-asm-memory-growth.js';

const IDB_NAME = 'lms-demo';
const SID_KEY = 'lms-demo-sid';

/* ---------- IndexedDB ---------- */
let idb = null;
// В некоторых встроенных просмотрщиках IndexedDB не отвечает вовсе — не ждём дольше пары секунд
const withTimeout = (promise, ms, fallback) => Promise.race([promise, new Promise((r) => setTimeout(() => r(fallback), ms))]);

function openIdb() {
  return withTimeout(new Promise((resolve) => {
    try {
      const r = indexedDB.open(IDB_NAME, 1);
      r.onupgradeneeded = () => { r.result.createObjectStore('kv'); r.result.createObjectStore('files'); };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => resolve(null);
      r.onblocked = () => resolve(null);
    } catch { resolve(null); }
  }), 2500, null);
}
function idbReq(store, mode, fn) {
  if (!idb) return Promise.resolve(null);
  return withTimeout(new Promise((resolve) => {
    try {
      const tx = idb.transaction(store, mode);
      const r = fn(tx.objectStore(store));
      tx.oncomplete = () => resolve(r && r.result);
      tx.onerror = () => resolve(null);
    } catch { resolve(null); }
  }), 3000, null);
}
const idbGet = (store, key) => idbReq(store, 'readonly', (s) => s.get(key));
const idbPut = (store, key, val) => idbReq(store, 'readwrite', (s) => s.put(val, key));
function idbAll(store) {
  if (!idb) return Promise.resolve([]);
  return withTimeout(new Promise((resolve) => {
    try {
      const out = [];
      const r = idb.transaction(store).objectStore(store).openCursor();
      r.onsuccess = () => { const c = r.result; if (c) { out.push([c.key, c.value]); c.continue(); } else resolve(out); };
      r.onerror = () => resolve(out);
    } catch { resolve([]); }
  }), 5000, []);
}

/* ---------- Сессия (вместо cookie) ---------- */
let memSid = null;
const getSid = () => { try { return localStorage.getItem(SID_KEY) || memSid; } catch { return memSid; } };
const setSid = (v) => { memSid = v; try { if (v) localStorage.setItem(SID_KEY, v); else localStorage.removeItem(SID_KEY); } catch { /* */ } };

/* ---------- Сохранение базы ---------- */
let saveTimer = null;
function scheduleSave() {
  if (!globalThis.__DEMO.dirty) return;
  globalThis.__DEMO.dirty = false;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const raw = globalThis.__DEMO.db.db;
    const bytes = raw.export(); // export сбрасывает PRAGMA — включаем внешние ключи снова
    raw.exec('PRAGMA foreign_keys = ON;');
    idbPut('kv', 'db', bytes);
  }, 400);
}

/* ---------- Запрос к «серверу» ---------- */
let server = null;
function dispatch(method, url, body, file) {
  const req = {
    method, path: url.pathname, url: url.pathname + url.search, params: {},
    query: Object.fromEntries(url.searchParams), body: body || {}, _file: file || null,
    cookies: { lms_sid: getSid() }, ip: 'demo', headers: {},
  };
  const res = {
    statusCode: 200, headers: {}, ended: false, payload: null, blob: null,
    status(c) { this.statusCode = c; return this; },
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    json(o) { this.headers['content-type'] = 'application/json'; this.payload = JSON.stringify(o); this.ended = true; },
    send(s) { this.payload = String(s); this.ended = true; },
    sendFile(abs, opts = {}) {
      const key = abs.slice('/app/data/uploads/'.length);
      this.blob = globalThis.__DEMO.files.get(key) || null;
      Object.entries(opts.headers || {}).forEach(([k, v]) => this.setHeader(k, v));
      if (!this.blob) this.statusCode = 404;
      this.ended = true;
    },
    cookie(_n, v) { setSid(v); },
    clearCookie() { setSid(null); },
  };
  server.app(req, res, (err) => {
    if (err) server.errorHandler(err, res);
    else if (!res.ended) res.status(404).json({ error: 'Не найдено' });
  });
  scheduleSave();
  return res;
}

function toResponse(res) {
  const headers = { ...res.headers };
  if (res.blob) {
    headers['content-length'] = String(res.blob.size);
    return new Response(res.blob, { status: res.statusCode, headers });
  }
  return new Response(res.payload ?? '', { status: res.statusCode, headers });
}

const isApi = (u) => u.origin === location.origin && u.pathname.startsWith('/api/');

function patchNetwork() {
  const origFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const u = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url, location.href);
    if (!isApi(u)) return origFetch(input, init);
    const method = (init.method || (input && input.method) || 'GET').toUpperCase();
    let body = null;
    if (typeof init.body === 'string') { try { body = JSON.parse(init.body); } catch { body = null; } }
    await new Promise((r) => setTimeout(r, 0));
    return toResponse(dispatch(method, u, body));
  };

  const RealXHR = window.XMLHttpRequest;
  class DemoXHR extends RealXHR {
    open(method, url, ...rest) {
      const u = new URL(url, location.href);
      if (isApi(u)) { this._demo = { method: method.toUpperCase(), u }; return undefined; }
      return super.open(method, url, ...rest);
    }
    send(body) {
      if (!this._demo) return super.send(body);
      const file = body instanceof FormData ? body.get('file') : null;
      setTimeout(() => {
        const total = file ? file.size : 1;
        try { this.upload.onprogress?.({ lengthComputable: true, loaded: total, total }); } catch { /* */ }
        const res = dispatch(this._demo.method, this._demo.u, null, file);
        Object.defineProperty(this, 'status', { value: res.statusCode });
        Object.defineProperty(this, 'readyState', { value: 4 });
        Object.defineProperty(this, 'responseText', { value: res.payload || '' });
        this.onload?.();
      }, 30);
      return undefined;
    }
  }
  window.XMLHttpRequest = DemoXHR;
}

/* ---------- Ссылки на файлы: /api/files/N → blob: ---------- */
const urlCache = new Map();
function blobUrlFor(id) {
  if (urlCache.has(id)) return urlCache.get(id);
  const row = globalThis.__DEMO.db.prepare('SELECT stored_path, mime FROM files WHERE id = ?').get(Number(id));
  const blob = row && globalThis.__DEMO.files.get(row.stored_path);
  if (!blob) return null;
  const typed = blob.type ? blob : new Blob([blob], { type: row.mime });
  const url = URL.createObjectURL(typed);
  urlCache.set(id, url);
  return url;
}
const FILE_RE = /\/api\/files\/(\d+)(\?download=1)?/g;
function rewrite(el) {
  if (el.nodeType !== 1) return;
  if (el.tagName !== 'A') {
    const src = el.getAttribute('src');
    if (src && src.startsWith('/api/files/')) {
      const u = blobUrlFor(src.match(/\d+/)[0]);
      if (u) el.setAttribute('src', u);
    }
  }
  const st = el.getAttribute('style');
  if (st && st.includes('/api/files/')) {
    el.setAttribute('style', st.replace(FILE_RE, (m, id) => blobUrlFor(id) || m));
  }
}
function watchDom() {
  const scan = (root) => { rewrite(root); root.querySelectorAll?.('[src^="/api/files/"], [style*="/api/files/"]').forEach(rewrite); };
  new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'attributes') rewrite(m.target);
      else m.addedNodes.forEach((n) => n.nodeType === 1 && scan(n));
    }
  }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['src', 'style'] });
}

/* ---------- Подсказки вместо недоступных в демо действий ---------- */
export function demoNotice(text) {
  const box = document.createElement('div');
  box.className = 'demo-toast';
  box.textContent = text;
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 4200);
}

function watchClicks(navigate) {
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0) return;
    const a = e.target.closest?.('a[href]');
    if (!a) return;
    const href = a.getAttribute('href');
    if (href.startsWith('/api/files/')) {
      e.preventDefault();
      demoNotice('В демо-версии скачивание файлов отключено. В рабочей платформе файл скачается на компьютер.');
    } else if (href.startsWith('/api/')) {
      e.preventDefault();
      demoNotice('Выгрузка в Excel работает в рабочей платформе. В демо-версии скачивание отключено.');
    } else if (href.startsWith('/')) {
      e.preventDefault();
      navigate(href);
    }
  });
}

export async function resetDemo() {
  setSid(null);
  if (idb) {
    await idbReq('kv', 'readwrite', (s) => s.clear());
    await idbReq('files', 'readwrite', (s) => s.clear());
  }
  location.reload();
}

/* ---------- Запуск ---------- */
export async function boot({ navigateRef }) {
  const base = new URL('.', document.baseURI);
  globalThis.process = { env: { SEED_DEMO: 'true', ADMIN_EMAIL: 'admin@company.local', ADMIN_PASSWORD: 'admin12345' }, emitWarning() {} };
  const files = new Map();
  globalThis.__DEMO = {
    files, dirty: false,
    putFile(key, blob) { files.set(key, blob); idbPut('files', key, blob); },
  };
  const [SQL, db] = await Promise.all([initSqlJs(), openIdb()]);
  idb = db;
  globalThis.__DEMO.SQL = SQL;

  let bytes = await idbGet('kv', 'db');
  if (bytes) {
    for (const [k, v] of await idbAll('files')) files.set(k, v);
  } else {
    // исходная база примера хранится в base64 (хостинг демо не отдаёт двоичные .sqlite)
    const r = await fetch(new URL('seed/lms.b64.txt', base));
    if (!r.ok) throw new Error(`не загрузился пример данных (HTTP ${r.status})`);
    const b64 = (await r.text()).trim();
    bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
    const manifest = await (await fetch(new URL('seed/manifest.json', base))).json();
    await Promise.all(manifest.map(async (key) => {
      const blob = await (await fetch(new URL(`seed/files/${key}`, base))).blob();
      files.set(key, blob);
      idbPut('files', key, blob);
    }));
    idbPut('kv', 'db', bytes);
  }
  globalThis.__DEMO.dbBytes = bytes;

  server = await import('./server-entry.js');
  globalThis.__DEMO.dirty = true; // сохранить, если сид дописал данные
  patchNetwork();
  watchDom();
  watchClicks((to) => navigateRef.current?.(to));
}
