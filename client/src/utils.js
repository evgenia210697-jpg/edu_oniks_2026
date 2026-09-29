export const uid = () => Math.random().toString(36).slice(2, 10);

export function parseDate(s) {
  if (!s) return null;
  if (s instanceof Date) return s;
  // SQLite отдаёт «YYYY-MM-DD HH:MM:SS» в UTC
  const iso = /\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s) && !s.includes('T') ? s.replace(' ', 'T') + 'Z' : s;
  const d = new Date(iso);
  return isNaN(d) ? null : d;
}

export function fmtDate(s, withTime = false) {
  const d = parseDate(s);
  if (!d) return '—';
  const opts = { day: '2-digit', month: '2-digit', year: 'numeric' };
  if (withTime) Object.assign(opts, { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleString('ru-RU', opts);
}

export function fmtRelative(s) {
  const d = parseDate(s);
  if (!d) return 'ещё не заходил(а)';
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 90) return 'только что';
  if (diff < 3600) return `${Math.round(diff / 60)} ${plural(Math.round(diff / 60), 'минуту', 'минуты', 'минут')} назад`;
  if (diff < 86400) return `${Math.round(diff / 3600)} ${plural(Math.round(diff / 3600), 'час', 'часа', 'часов')} назад`;
  if (diff < 86400 * 7) return `${Math.round(diff / 86400)} ${plural(Math.round(diff / 86400), 'день', 'дня', 'дней')} назад`;
  return fmtDate(d);
}

export function plural(n, one, few, many) {
  const a = Math.abs(n) % 100; const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

export function fileSize(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} КБ`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} МБ`;
  return `${(bytes / 1024 ** 3).toFixed(2)} ГБ`;
}

export const ROLE_LABEL = { student: 'Ученик', curator: 'Куратор', admin: 'Администратор' };
export const TYPE_LABEL = { lecture: 'Урок', assignment: 'Задание', test: 'Тест' };

export function initials(name = '') {
  const p = name.trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || '?';
}

export function stripHtml(html = '') {
  const d = document.createElement('div');
  d.innerHTML = html;
  return (d.textContent || '').trim();
}

export function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); } finally { ta.remove(); }
  return Promise.resolve();
}

/** Из ссылки YouTube / Rutube / VK Видео делает адрес для встраивания */
export function toEmbedUrl(input = '') {
  let s = input.trim();
  const m = s.match(/<iframe[^>]+src=["']([^"']+)["']/i);
  if (m) s = m[1];
  if (!/^https?:\/\//i.test(s)) return '';
  try {
    const u = new URL(s);
    const h = u.hostname.replace(/^www\./, '');
    if (h === 'youtu.be') return `https://www.youtube.com/embed/${u.pathname.slice(1)}`;
    if (h.endsWith('youtube.com')) {
      if (u.pathname.startsWith('/embed/')) return s;
      const v = u.searchParams.get('v') || (u.pathname.startsWith('/shorts/') ? u.pathname.split('/')[2] : '');
      if (v) return `https://www.youtube.com/embed/${v}`;
    }
    if (h === 'rutube.ru') {
      const id = u.pathname.match(/\/video\/(?:private\/)?([a-f0-9]{20,})/i);
      if (id) return `https://rutube.ru/play/embed/${id[1]}`;
    }
    if (h === 'vk.com' || h === 'vkvideo.ru') {
      const id = (u.pathname + u.search).match(/video(-?\d+)_(\d+)/);
      if (id) return `https://vkvideo.ru/video_ext.php?oid=${id[1]}&id=${id[2]}&hd=2`;
    }
    return s;
  } catch { return ''; }
}

export function downloadBlob(filename, content, type = 'text/csv;charset=utf-8') {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
