import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Maximize2, Minimize2 } from 'lucide-react';
import { Spinner } from './ui';

let pdfjsPromise = null;
function loadPdfjs() {
  if (!pdfjsPromise) {
    // legacy-сборка работает и в не самых свежих браузерах
    pdfjsPromise = Promise.all([import('pdfjs-dist/legacy/build/pdf.min.mjs'), import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')]).then(([lib, w]) => {
      lib.GlobalWorkerOptions.workerSrc = w.default;
      return lib;
    });
  }
  return pdfjsPromise;
}

/** Просмотр презентации (PDF) постранично, как слайды */
export default function PdfViewer({ url }) {
  const [doc, setDoc] = useState(null);
  const [page, setPage] = useState(1);
  const [input, setInput] = useState('1');
  const [error, setError] = useState('');
  const [fs, setFs] = useState(false);
  const [rendering, setRendering] = useState(true);
  const canvas = useRef(null);
  const stage = useRef(null);
  const task = useRef(null);

  useEffect(() => {
    let alive = true; let loadingTask = null;
    setDoc(null); setError(''); setPage(1); setInput('1');
    loadPdfjs().then((lib) => {
      if (!alive) return null;
      loadingTask = lib.getDocument({ url, withCredentials: true });
      return loadingTask.promise;
    }).then((d) => { if (alive && d) setDoc(d); })
      .catch((e) => alive && setError('Не удалось открыть PDF: ' + (e?.message || '')));
    return () => { alive = false; try { loadingTask?.destroy(); } catch { /* */ } };
  }, [url]);

  useEffect(() => {
    if (!doc || !canvas.current) return;
    let cancelled = false;
    const render = async () => {
      setRendering(true);
      const p = await doc.getPage(page);
      if (cancelled) return;
      const base = p.getViewport({ scale: 1 });
      const width = stage.current?.clientWidth || 800;
      const height = fs ? window.innerHeight - 60 : Math.max(320, window.innerHeight * 0.72);
      const scale = Math.min(width / base.width, height / base.height);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const vp = p.getViewport({ scale: scale * dpr });
      const c = canvas.current;
      c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
      c.style.width = `${Math.floor(vp.width / dpr)}px`;
      try { task.current?.cancel(); } catch { /* */ }
      task.current = p.render({ canvasContext: c.getContext('2d'), viewport: vp });
      try { await task.current.promise; } catch { /* отменено */ }
      if (!cancelled) setRendering(false);
    };
    render();
    const onResize = () => render();
    window.addEventListener('resize', onResize);
    return () => { cancelled = true; window.removeEventListener('resize', onResize); };
  }, [doc, page, fs]);

  useEffect(() => { setInput(String(page)); }, [page]);
  useEffect(() => {
    if (!fs) return;
    const k = (e) => {
      if (e.key === 'Escape') setFs(false);
      if (e.key === 'ArrowRight' || e.key === 'PageDown') setPage((p) => Math.min(doc?.numPages || p, p + 1));
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') setPage((p) => Math.max(1, p - 1));
    };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [fs, doc]);

  const total = doc?.numPages || 0;
  const go = (n) => setPage(Math.max(1, Math.min(total, n)));

  if (error) return <div className="alert alert-danger">{error}</div>;
  return (
    <div className={`pdf-viewer ${fs ? 'fs' : ''}`}>
      <div className="pdf-bar">
        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => go(page - 1)} disabled={page <= 1} aria-label="Предыдущая"><ChevronLeft size={18} /></button>
        <span className="muted">Страница</span>
        <input className="input" value={input} onChange={(e) => setInput(e.target.value.replace(/\D/g, ''))}
          onBlur={() => go(Number(input) || 1)} onKeyDown={(e) => { if (e.key === 'Enter') go(Number(input) || 1); }} />
        <span className="muted">из {total || '…'}</span>
        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => go(page + 1)} disabled={page >= total} aria-label="Следующая"><ChevronRight size={18} /></button>
        <span style={{ flex: 1 }} />
        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setFs(!fs)} aria-label="Во весь экран">{fs ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</button>
      </div>
      <div className="pdf-stage" ref={stage} onClick={(e) => {
        if (!total) return;
        const r = e.currentTarget.getBoundingClientRect();
        if (e.clientX - r.left > r.width * 0.6) go(page + 1); else if (e.clientX - r.left < r.width * 0.4) go(page - 1);
      }}>
        {(!doc || rendering) && <div style={{ position: 'absolute' }}><Spinner /></div>}
        <canvas ref={canvas} />
      </div>
    </div>
  );
}
