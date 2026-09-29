// Обёртка над API сервера
export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function request(method, url, body) {
  const opts = { method, headers: {}, credentials: 'same-origin' };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch('/api' + url, opts);
  } catch {
    throw new ApiError(0, 'Нет связи с сервером. Проверьте подключение.');
  }
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await res.json() : null;
  if (!res.ok) {
    if (res.status === 401 && !url.startsWith('/auth/')) window.dispatchEvent(new Event('lms:unauthorized'));
    throw new ApiError(res.status, (data && data.error) || `Ошибка ${res.status}`);
  }
  return data;
}

export const api = {
  get: (u) => request('GET', u),
  post: (u, b = {}) => request('POST', u, b),
  put: (u, b = {}) => request('PUT', u, b),
  del: (u) => request('DELETE', u),
};

/** Загрузка файла с прогрессом. onProgress(0..1) */
export function uploadFile(file, { scope = 'content', onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const fd = new FormData();
    fd.append('file', file, file.name);
    xhr.open('POST', `/api/files?scope=${encodeURIComponent(scope)}`);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
    xhr.onload = () => {
      let data = null;
      try { data = JSON.parse(xhr.responseText); } catch { /* ignore */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new ApiError(xhr.status, (data && data.error) || (xhr.status === 413 ? 'Файл слишком большой' : `Ошибка загрузки (${xhr.status})`)));
    };
    xhr.onerror = () => reject(new ApiError(0, 'Сбой сети при загрузке'));
    xhr.send(fd);
  });
}

export const fileUrl = (id, download) => (id ? `/api/files/${id}${download ? '?download=1' : ''}` : null);
