import { Plus, Trash2, RefreshCw, Rows3, Columns3, Link2 } from 'lucide-react';
import { RichEditor } from '../components/Rich';
import { Dropzone, useUploader, UploadProgressList, FileItem } from '../components/Files';
import { Toggle } from '../components/ui';
import { BlockView, isEmbeddable } from './BlockView';
import { CALLOUT_VARIANTS } from './registry';
import { toEmbedUrl, uid } from '../utils';

function MediaUpload({ accept, hint, title, onUploaded, multiple }) {
  const { uploads, upload } = useUploader();
  const onFiles = async (files) => {
    const results = [];
    for (const f of files) {
      const r = await upload(f);
      if (r) results.push(r);
    }
    if (!results.length) return;
    if (multiple) onUploaded(results); else onUploaded(results[0]);
  };
  return (
    <div className="stack" style={{ gap: 8 }}>
      {uploads.length ? <UploadProgressList uploads={uploads} /> : <Dropzone accept={accept} hint={hint} title={title} onFiles={onFiles} multiple={multiple} />}
    </div>
  );
}

function ReplaceBar({ name, onReplace, children }) {
  return (
    <div className="row mt-8" style={{ flexWrap: 'wrap' }}>
      {name && <span className="small muted ellipsis flex-1">{name}</span>}
      {children}
      <button type="button" className="btn btn-ghost btn-sm" onClick={onReplace}><RefreshCw size={14} />Заменить</button>
    </div>
  );
}

export function BlockEdit({ block, onChange, autoFocus }) {
  const d = block.data || {};
  const set = (patch) => onChange({ ...block, data: { ...d, ...patch } });

  switch (block.type) {
    case 'text':
      return <RichEditor value={d.html} onChange={(html) => set({ html })} placeholder="Введите текст урока…" autoFocus={autoFocus} />;

    case 'callout':
      return (
        <div className="stack" style={{ gap: 8 }}>
          <div className="row row-wrap">
            <select className="select input-sm" style={{ width: 250 }} value={d.variant} onChange={(e) => set({ variant: e.target.value })}>
              {CALLOUT_VARIANTS.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
            </select>
            <input className="input input-sm flex-1" style={{ minWidth: 180 }} placeholder="Заголовок (необязательно)" value={d.title} onChange={(e) => set({ title: e.target.value })} />
          </div>
          <RichEditor value={d.html} onChange={(html) => set({ html })} placeholder="Текст блока" minimal compact autoFocus={autoFocus} />
          <div className="xs muted">Как увидит ученик:</div>
          <BlockView block={block} />
        </div>
      );

    case 'image':
      if (!d.fileId && !d.url) {
        return (
          <div className="stack" style={{ gap: 8 }}>
            <MediaUpload accept="image/*" title="Загрузите картинку или перетащите её сюда" hint="JPG, PNG, WEBP, GIF, SVG" onUploaded={(f) => set({ fileId: f.id })} />
            <input className="input input-sm" placeholder="…или вставьте ссылку на картинку" onBlur={(e) => e.target.value && set({ url: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') set({ url: e.target.value }); }} />
          </div>
        );
      }
      return (
        <div>
          <BlockView block={block} />
          <div className="row row-wrap mt-8">
            <input className="input input-sm flex-1" style={{ minWidth: 180 }} placeholder="Подпись к картинке" value={d.caption} onChange={(e) => set({ caption: e.target.value })} />
            <select className="select input-sm" style={{ width: 170 }} value={d.size || 'full'} onChange={(e) => set({ size: e.target.value })}>
              <option value="full">На всю ширину</option><option value="medium">Средняя</option><option value="small">Маленькая</option>
            </select>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => set({ fileId: null, url: '' })}><RefreshCw size={14} />Заменить</button>
          </div>
        </div>
      );

    case 'video':
      if (!d.fileId && !d.url) {
        return (
          <div className="stack" style={{ gap: 8 }}>
            <MediaUpload accept="video/*" title="Загрузите видео или перетащите файл сюда" hint="Лучше всего MP4 (H.264). Видео хранится на вашем сервере" onUploaded={(f) => set({ fileId: f.id, name: f.name })} />
            <input className="input input-sm" placeholder="…или вставьте ссылку: YouTube, Rutube, VK Видео или прямая ссылка на .mp4" onBlur={(e) => e.target.value && set({ url: e.target.value.trim() })} onKeyDown={(e) => { if (e.key === 'Enter') set({ url: e.target.value.trim() }); }} />
          </div>
        );
      }
      return (
        <div>
          <BlockView block={block} />
          <div className="row row-wrap mt-8">
            <input className="input input-sm flex-1" style={{ minWidth: 180 }} placeholder="Подпись к видео" value={d.caption} onChange={(e) => set({ caption: e.target.value })} />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => set({ fileId: null, url: '', name: '' })}><RefreshCw size={14} />Заменить</button>
          </div>
          {!d.fileId && !isEmbeddable(d.url) && <div className="hint mt-8">Если видео не воспроизводится — проверьте, что ссылка ведёт прямо на файл .mp4.</div>}
        </div>
      );

    case 'audio':
      if (!d.fileId) {
        return <MediaUpload accept="audio/*,.mp3,.m4a,.wav,.ogg" title="Загрузите аудио или перетащите файл сюда" hint="MP3, M4A, WAV, OGG" onUploaded={(f) => set({ fileId: f.id, name: f.name })} />;
      }
      return (
        <div>
          <BlockView block={block} />
          <div className="row row-wrap mt-8">
            <input className="input input-sm flex-1" placeholder="Название аудио" value={d.caption} onChange={(e) => set({ caption: e.target.value })} />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => set({ fileId: null, name: '' })}><RefreshCw size={14} />Заменить</button>
          </div>
        </div>
      );

    case 'pdf':
      if (!d.fileId) {
        return (
          <div className="stack" style={{ gap: 8 }}>
            <MediaUpload accept=".pdf,application/pdf" title="Загрузите презентацию в формате PDF" hint="PowerPoint: Файл → Экспорт → PDF. Ученик будет листать слайды прямо на странице" onUploaded={(f) => set({ fileId: f.id, name: f.name, size: f.size })} />
          </div>
        );
      }
      return (
        <div>
          <BlockView block={{ ...block, data: { ...d, download: false } }} />
          <div className="row row-wrap mt-8">
            <Toggle checked={d.download} onChange={(v) => set({ download: v })} label="Разрешить скачивание файла" />
            <span className="flex-1" />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => set({ fileId: null, name: '', size: 0 })}><RefreshCw size={14} />Заменить</button>
          </div>
        </div>
      );

    case 'file':
      return (
        <div className="stack" style={{ gap: 8 }}>
          {(d.files || []).map((f, i) => <FileItem key={f.id} file={f} onRemove={() => set({ files: d.files.filter((_, j) => j !== i) })} />)}
          <MediaUpload multiple title="Прикрепите файлы для скачивания или перетащите их сюда" hint="Любые форматы: PDF, Word, Excel, архивы…"
            onUploaded={(list) => set({ files: [...(d.files || []), ...list.map((f) => ({ id: f.id, name: f.name, size: f.size }))] })} />
        </div>
      );

    case 'table': {
      const rows = d.rows || [[]];
      const cols = Math.max(1, ...rows.map((r) => r.length));
      const setCell = (i, j, v) => set({ rows: rows.map((r, ri) => (ri === i ? Array.from({ length: cols }, (_, cj) => (cj === j ? v : r[cj] || '')) : r)) });
      const onPaste = (i, j, e) => {
        const text = e.clipboardData.getData('text/plain');
        if (!text || (!text.includes('\t') && !text.includes('\n'))) return;
        e.preventDefault();
        const grid = text.replace(/\r/g, '').replace(/\n$/, '').split('\n').map((line) => line.split('\t'));
        const needRows = Math.max(rows.length, i + grid.length);
        const needCols = Math.max(cols, j + Math.max(...grid.map((g) => g.length)));
        const next = Array.from({ length: needRows }, (_, ri) => Array.from({ length: needCols }, (_, ci) => {
          const g = grid[ri - i]?.[ci - j];
          return g !== undefined && ri >= i && ci >= j ? g : (rows[ri]?.[ci] || '');
        }));
        set({ rows: next });
      };
      return (
        <div>
          <div className="row row-wrap mb-8">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => set({ rows: [...rows, Array(cols).fill('')] })}><Rows3 size={14} />+ строка</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => set({ rows: rows.map((r) => [...r, '']) })}><Columns3 size={14} />+ столбец</button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={rows.length <= 1} onClick={() => set({ rows: rows.slice(0, -1) })}>− строка</button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={cols <= 1} onClick={() => set({ rows: rows.map((r) => r.slice(0, cols - 1)) })}>− столбец</button>
            <span className="flex-1" />
            <Toggle checked={d.header} onChange={(v) => set({ header: v })} label="Первая строка — заголовок" />
          </div>
          <div className="tbl-edit">
            <table>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className={d.header && i === 0 ? 'head' : ''}>
                    {Array.from({ length: cols }, (_, j) => (
                      <td key={j}><textarea rows={1} value={r[j] || ''} onChange={(e) => setCell(i, j, e.target.value)} onPaste={(e) => onPaste(i, j, e)} placeholder={d.header && i === 0 ? 'Заголовок' : ''} /></td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="hint mt-8">Совет: скопируйте ячейки из Excel и вставьте в любую ячейку (Ctrl+V) — таблица заполнится сама.</div>
        </div>
      );
    }

    case 'quote':
      return (
        <div className="stack" style={{ gap: 8 }}>
          <RichEditor value={d.html} onChange={(html) => set({ html })} placeholder="Текст цитаты" minimal compact autoFocus={autoFocus} />
          <input className="input input-sm" placeholder="Автор (необязательно)" value={d.author} onChange={(e) => set({ author: e.target.value })} />
        </div>
      );

    case 'spoiler':
      return (
        <div className="stack" style={{ gap: 8 }}>
          <input className="input input-sm" placeholder="Заголовок спойлера (виден сразу)" value={d.title} onChange={(e) => set({ title: e.target.value })} />
          <RichEditor value={d.html} onChange={(html) => set({ html })} placeholder="Скрытый текст — откроется по нажатию" minimal compact />
        </div>
      );

    case 'checklist':
      return (
        <div>
          {(d.items || []).map((it, i) => (
            <div key={it.id} className="opt-row">
              <input type="checkbox" disabled />
              <input className="input input-sm" value={it.text} placeholder={`Пункт ${i + 1}`} autoFocus={autoFocus && i === 0}
                onChange={(e) => set({ items: d.items.map((x) => (x.id === it.id ? { ...x, text: e.target.value } : x)) })}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); set({ items: [...d.items.slice(0, i + 1), { id: uid(), text: '' }, ...d.items.slice(i + 1)] }); } }} />
              <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => set({ items: d.items.filter((x) => x.id !== it.id) })} aria-label="Удалить пункт"><Trash2 size={15} /></button>
            </div>
          ))}
          <button type="button" className="btn btn-soft btn-sm" onClick={() => set({ items: [...(d.items || []), { id: uid(), text: '' }] })}><Plus size={14} />Добавить пункт</button>
          <div className="hint mt-8">Ученик сможет отмечать пункты галочками — для самоконтроля.</div>
        </div>
      );

    case 'button':
      return (
        <div className="stack" style={{ gap: 8 }}>
          <div className="row row-wrap">
            <input className="input input-sm" style={{ width: 220 }} placeholder="Текст кнопки" value={d.text} onChange={(e) => set({ text: e.target.value })} />
            <div className="input-group flex-1" style={{ minWidth: 200 }}>
              <Link2 size={15} />
              <input className="input input-sm" placeholder="https://… — куда ведёт кнопка" value={d.url} onChange={(e) => set({ url: e.target.value })} />
            </div>
            <select className="select input-sm" style={{ width: 150 }} value={d.align} onChange={(e) => set({ align: e.target.value })}>
              <option value="left">Слева</option><option value="center">По центру</option><option value="right">Справа</option>
            </select>
          </div>
          {d.url && <BlockView block={block} />}
        </div>
      );

    case 'embed':
      return (
        <div className="stack" style={{ gap: 8 }}>
          <input className="input input-sm" placeholder="Ссылка на YouTube / Rutube / VK Видео / Яндекс Формы или код <iframe>" value={d.url} onChange={(e) => set({ url: e.target.value })} autoFocus={autoFocus} />
          {d.url && !toEmbedUrl(d.url) && <div className="hint" style={{ color: 'var(--danger)' }}>Не похоже на ссылку. Вставьте адрес, начинающийся с https://</div>}
          {toEmbedUrl(d.url) && <BlockView block={block} />}
        </div>
      );

    case 'code':
      return (
        <div className="stack" style={{ gap: 8 }}>
          <input className="input input-sm" style={{ width: 240 }} placeholder="Язык / подпись (необязательно)" value={d.lang} onChange={(e) => set({ lang: e.target.value })} />
          <textarea className="textarea" style={{ fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: 13.5, minHeight: 120 }} value={d.code} onChange={(e) => set({ code: e.target.value })} placeholder="// Ваш код" spellCheck={false} />
        </div>
      );

    case 'divider':
      return (
        <div className="row">
          <hr className={`b-divider ${d.style || ''} flex-1`} />
          <select className="select input-sm" style={{ width: 150 }} value={d.style} onChange={(e) => set({ style: e.target.value })}>
            <option value="solid">Сплошная</option><option value="dashed">Пунктирная</option><option value="dotted">Точечная</option>
          </select>
        </div>
      );

    default:
      return <div className="muted small">Неизвестный блок</div>;
  }
}
