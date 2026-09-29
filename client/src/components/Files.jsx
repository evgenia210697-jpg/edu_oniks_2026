import { useRef, useState } from 'react';
import { UploadCloud, Download, X, Paperclip } from 'lucide-react';
import { uploadFile, fileUrl } from '../api';
import { fileSize } from '../utils';
import { Progress, useToast } from './ui';

export function useUploader({ scope = 'content' } = {}) {
  const [uploads, setUploads] = useState([]);
  const toast = useToast();
  const upload = async (file) => {
    const key = Math.random();
    setUploads((u) => [...u, { key, name: file.name, size: file.size, progress: 0 }]);
    try {
      const res = await uploadFile(file, { scope, onProgress: (p) => setUploads((u) => u.map((x) => (x.key === key ? { ...x, progress: p } : x))) });
      return res;
    } catch (e) {
      toast.error(`${file.name}: ${e.message}`);
      return null;
    } finally {
      setUploads((u) => u.filter((x) => x.key !== key));
    }
  };
  return { uploads, upload, busy: uploads.length > 0 };
}

export function UploadProgressList({ uploads }) {
  if (!uploads.length) return null;
  return (
    <div className="stack" style={{ gap: 8 }}>
      {uploads.map((u) => (
        <div key={u.key} className="upload-progress">
          <div className="row small"><span className="flex-1 ellipsis bold">{u.name}</span><span className="muted">{Math.round(u.progress * 100)}% из {fileSize(u.size)}</span></div>
          <Progress value={u.progress * 100} />
        </div>
      ))}
    </div>
  );
}

/** Зона загрузки: клик или перетаскивание */
export function Dropzone({ accept, multiple, onFiles, title = 'Нажмите, чтобы выбрать файл, или перетащите его сюда', hint, icon: Icon = UploadCloud, compact }) {
  const input = useRef(null);
  const [over, setOver] = useState(false);
  return (
    <div className={`dropzone ${over ? 'over' : ''}`} style={compact ? { padding: '16px 12px' } : undefined}
      onClick={() => input.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); const fs = Array.from(e.dataTransfer.files || []); if (fs.length) onFiles(multiple ? fs : [fs[0]]); }}>
      <Icon size={compact ? 22 : 30} />
      <div className="dz-title">{title}</div>
      {hint && <div className="dz-hint">{hint}</div>}
      <input ref={input} type="file" hidden accept={accept} multiple={multiple}
        onChange={(e) => { const fs = Array.from(e.target.files || []); e.target.value = ''; if (fs.length) onFiles(fs); }} />
    </div>
  );
}

export function FileExt({ name }) {
  const ext = (name || '').split('.').pop().toLowerCase().slice(0, 4);
  return <span className={`file-ext ${ext}`}>{ext || 'file'}</span>;
}

export function FileItem({ file, onRemove, download = true }) {
  const href = file.id ? fileUrl(file.id, download) : file.url;
  return (
    <a className="file-item" href={href} target={download ? undefined : '_blank'} rel="noreferrer" onClick={(e) => { if (e.target.closest('.no-link')) e.preventDefault(); }}>
      <FileExt name={file.name} />
      <span className="file-name">{file.name}</span>
      {file.size ? <span className="small muted nowrap">{fileSize(file.size)}</span> : null}
      {onRemove
        ? <button type="button" className="btn btn-ghost btn-icon btn-sm no-link" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(); }} aria-label="Удалить"><X size={16} /></button>
        : <Download size={17} className="muted" />}
    </a>
  );
}

/** Кнопка «Прикрепить файлы» + чипы */
export function AttachButton({ onFiles, disabled, label = 'Прикрепить файлы' }) {
  const input = useRef(null);
  return (
    <>
      <button type="button" className="btn btn-secondary btn-sm" disabled={disabled} onClick={() => input.current?.click()}><Paperclip size={15} />{label}</button>
      <input ref={input} type="file" hidden multiple onChange={(e) => { const fs = Array.from(e.target.files || []); e.target.value = ''; if (fs.length) onFiles(fs); }} />
    </>
  );
}

export function AttachChips({ files, onRemove }) {
  if (!files?.length) return null;
  return (
    <div className="attach-chips">
      {files.map((f, i) => (
        <span key={f.id || i} className="attach-chip">
          <Paperclip size={13} /><span>{f.name}</span><span className="xs muted">{fileSize(f.size)}</span>
          {onRemove && <button type="button" className="btn btn-ghost btn-icon btn-sm" style={{ width: 22, height: 22 }} onClick={() => onRemove(i)}><X size={13} /></button>}
        </span>
      ))}
    </div>
  );
}
