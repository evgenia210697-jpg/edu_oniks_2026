import { Component, useEffect, useState } from 'react';
import { Target, Info, AlertTriangle, CheckCircle2, XCircle, ChevronRight, ExternalLink, Copy } from 'lucide-react';
import { RichText } from '../components/Rich';
import PdfViewer from '../components/PdfViewer';
import { FileItem } from '../components/Files';
import { fileUrl } from '../api';
import { toEmbedUrl, copyText } from '../utils';

const CALLOUT_ICON = { goal: Target, info: Info, warning: AlertTriangle, success: CheckCircle2, danger: XCircle };

export const safeUrl = (u = '') => (/^(https?:|mailto:|tel:|\/)/i.test(u.trim()) ? u.trim() : u.trim() ? `https://${u.trim()}` : '');

export function isEmbeddable(url = '') {
  return /(youtube\.com|youtu\.be|rutube\.ru|vk\.com|vkvideo\.ru)/i.test(url);
}

function Checklist({ block }) {
  const key = `lms-check-${block.id}`;
  const [done, setDone] = useState(() => { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; } });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(done)); } catch { /* */ } }, [key, done]);
  return (
    <div className="b-checklist">
      {(block.data.items || []).filter((i) => i.text).map((i) => {
        const on = done.includes(i.id);
        return (
          <label key={i.id} className={on ? 'on' : ''}>
            <input type="checkbox" checked={on} onChange={() => setDone(on ? done.filter((x) => x !== i.id) : [...done, i.id])} />
            <span>{i.text}</span>
          </label>
        );
      })}
    </div>
  );
}

export function BlockView({ block }) {
  const d = block.data || {};
  switch (block.type) {
    case 'text':
      return d.html ? <RichText html={d.html} /> : null;
    case 'callout': {
      const Icon = CALLOUT_ICON[d.variant] || Info;
      return (
        <div className={`b-callout ${d.variant || ''}`}>
          <span className="c-ic"><Icon size={20} /></span>
          <div className="flex-1">
            {d.title && <div className="c-title">{d.title}</div>}
            <RichText html={d.html} />
          </div>
        </div>
      );
    }
    case 'image': {
      const src = d.fileId ? fileUrl(d.fileId) : safeUrl(d.url);
      if (!src) return null;
      return (
        <figure className={`b-image ${d.size || 'full'}`} style={{ margin: 0 }}>
          <img src={src} alt={d.caption || ''} loading="lazy" />
          {d.caption && <figcaption className="b-caption">{d.caption}</figcaption>}
        </figure>
      );
    }
    case 'video': {
      if (!d.fileId && !d.url) return null;
      if (!d.fileId && isEmbeddable(d.url)) {
        return <div><div className="b-embed"><iframe src={toEmbedUrl(d.url)} title="video" allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowFullScreen /></div>{d.caption && <div className="b-caption">{d.caption}</div>}</div>;
      }
      return (
        <div className="b-video">
          <video src={d.fileId ? fileUrl(d.fileId) : safeUrl(d.url)} controls preload="metadata" playsInline controlsList="nodownload" />
          {d.caption && <div className="b-caption">{d.caption}</div>}
        </div>
      );
    }
    case 'audio':
      if (!d.fileId) return null;
      return (
        <div className="b-audio">
          {(d.caption || d.name) && <div className="bold small">{d.caption || d.name}</div>}
          <audio src={fileUrl(d.fileId)} controls preload="metadata" />
        </div>
      );
    case 'pdf':
      if (!d.fileId) return null;
      return (
        <div className="stack" style={{ gap: 10 }}>
          <PdfViewer url={fileUrl(d.fileId)} />
          {d.download && <FileItem file={{ id: d.fileId, name: d.name || 'presentation.pdf', size: d.size }} />}
        </div>
      );
    case 'file':
      if (!d.files?.length) return null;
      return <div className="file-list">{d.files.map((f) => <FileItem key={f.id} file={f} />)}</div>;
    case 'table': {
      const rows = d.rows || [];
      if (!rows.length) return null;
      const [head, ...body] = d.header ? rows : [null, ...rows];
      return (
        <div className="b-table">
          <table>
            {head && <thead><tr>{head.map((c, i) => <th key={i}>{c}</th>)}</tr></thead>}
            <tbody>{body.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
          </table>
        </div>
      );
    }
    case 'quote':
      return (
        <div className="b-quote">
          <RichText html={d.html} />
          {d.author && <div className="q-author">— {d.author}</div>}
        </div>
      );
    case 'spoiler':
      return (
        <details className="b-spoiler">
          <summary><ChevronRight size={18} />{d.title || 'Подробнее'}</summary>
          <div className="sp-body"><RichText html={d.html} /></div>
        </details>
      );
    case 'checklist':
      return <Checklist block={block} />;
    case 'button':
      if (!d.url) return null;
      return (
        <div className={`b-button ${d.align || 'left'}`}>
          <a className="btn btn-primary" href={safeUrl(d.url)} target={d.url.startsWith('/') ? undefined : '_blank'} rel="noreferrer">{d.text || 'Перейти'}<ExternalLink size={15} /></a>
        </div>
      );
    case 'embed': {
      const src = toEmbedUrl(d.url);
      if (!src) return null;
      return <div className="b-embed"><iframe src={src} title="embed" allow="autoplay; fullscreen; picture-in-picture; encrypted-media; clipboard-write" allowFullScreen /></div>;
    }
    case 'code':
      return (
        <div className="b-code">
          <div className="code-head"><span>{d.lang || 'код'}</span>
            <button className="btn btn-ghost btn-sm" style={{ color: '#8b98ab', height: 24 }} onClick={() => copyText(d.code || '')}><Copy size={13} />Копировать</button>
          </div>
          <pre><code>{d.code}</code></pre>
        </div>
      );
    case 'divider':
      return <hr className={`b-divider ${d.style || ''}`} />;
    default:
      return null;
  }
}

/** Ошибка в одном блоке не должна ломать всю страницу */
export class BlockBoundary extends Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  render() {
    if (this.state.err) return <div className="alert alert-warning small">Не удалось показать блок: {String(this.state.err.message || this.state.err)}</div>;
    return this.props.children;
  }
}

export function BlocksView({ blocks }) {
  if (!blocks?.length) return null;
  return <div className="blocks">{blocks.map((b) => <BlockBoundary key={b.id}><BlockView block={b} /></BlockBoundary>)}</div>;
}
