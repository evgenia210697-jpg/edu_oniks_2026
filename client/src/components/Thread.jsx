import { useEffect, useRef, useState } from 'react';
import { Send, Mic, Square, CheckCircle2, RotateCcw, FileText } from 'lucide-react';
import { RichEditor, RichText } from './Rich';
import { AttachButton, AttachChips, FileItem, UploadProgressList, useUploader } from './Files';
import { Avatar, useToast } from './ui';
import { fmtDate, ROLE_LABEL } from '../utils';
import { fileUrl } from '../api';

const KIND = {
  answer: { label: 'Ответ на задание', icon: FileText },
  message: { label: 'Комментарий', icon: null },
  accepted: { label: 'Работа принята', icon: CheckCircle2, color: 'var(--success)' },
  returned: { label: 'Отправлено на доработку', icon: RotateCcw, color: 'var(--danger)' },
};

export function Thread({ messages }) {
  if (!messages?.length) return null;
  return (
    <div className="thread">
      {messages.map((m) => {
        const k = KIND[m.kind] || KIND.message;
        const staff = m.author && m.author.role !== 'student';
        return (
          <div key={m.id} className={`msg ${staff ? 'staff' : ''}`}>
            <Avatar user={m.author || { name: '?' }} />
            <div className="msg-bubble">
              <div className="msg-head">
                <span className="msg-author">{m.author?.name || 'Удалённый пользователь'}</span>
                {staff && <span className="badge">{ROLE_LABEL[m.author.role]}</span>}
                <span className="badge" style={k.color ? { color: k.color } : undefined}>{k.icon && <k.icon size={12} />}{k.label}</span>
                <span className="msg-time">{fmtDate(m.createdAt, true)}</span>
              </div>
              {m.body && <RichText html={m.body} />}
              {m.files?.length > 0 && (
                <div className="file-list msg-files">
                  {m.files.map((f) => (/^audio\//.test(f.mime) || /\.(webm|ogg|mp3|m4a|wav)$/i.test(f.name))
                    ? <div key={f.id} className="b-audio"><span className="small bold">{f.name}</span><audio src={fileUrl(f.id)} controls preload="metadata" /></div>
                    : <FileItem key={f.id} file={f} />)}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Recorder({ onRecorded, disabled }) {
  const [rec, setRec] = useState(null);
  const [secs, setSecs] = useState(0);
  const chunks = useRef([]);
  const toast = useToast();
  useEffect(() => {
    if (!rec) return;
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [rec]);
  const supported = typeof window !== 'undefined' && window.isSecureContext && navigator.mediaDevices?.getUserMedia && window.MediaRecorder;
  const start = async () => {
    if (!supported) { toast.error('Запись аудио работает только по защищённому адресу (https) или на localhost'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream);
      chunks.current = [];
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const type = r.mimeType || 'audio/webm';
        const ext = type.includes('ogg') ? 'ogg' : type.includes('mp4') ? 'm4a' : 'webm';
        const file = new File(chunks.current, `Аудиоответ ${new Date().toLocaleString('ru-RU').replace(/[/:]/g, '-')}.${ext}`, { type });
        onRecorded(file);
      };
      r.start(); setSecs(0); setRec(r);
    } catch { toast.error('Нет доступа к микрофону'); }
  };
  const stop = () => { rec?.stop(); setRec(null); };
  return rec
    ? <button type="button" className="btn btn-danger-soft btn-sm" onClick={stop}><Square size={13} />Остановить {String(Math.floor(secs / 60)).padStart(2, '0')}:{String(secs % 60).padStart(2, '0')}</button>
    : <button type="button" className="btn btn-secondary btn-sm" onClick={start} disabled={disabled}><Mic size={15} />Записать аудио</button>;
}

/** Поле ввода ответа/комментария с файлами */
export function Composer({ onSubmit, submitLabel = 'Отправить', placeholder = 'Напишите сообщение…', scope = 'submission', audio = true, extra, busyExternal, variant = 'btn-primary', icon: Icon = Send, allowEmpty = false }) {
  const [body, setBody] = useState('');
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const { uploads, upload } = useUploader({ scope });
  const addFiles = async (list) => {
    for (const f of list) {
      const r = await upload(f);
      if (r) setFiles((fs) => [...fs, { id: r.id, name: r.name, size: r.size, mime: r.mime }]);
    }
  };
  const send = async () => {
    setBusy(true);
    try {
      const ok = await onSubmit({ body, files });
      if (ok !== false) { setBody(''); setFiles([]); }
    } finally { setBusy(false); }
  };
  const empty = !body.replace(/<[^>]+>/g, '').trim() && !files.length;
  return (
    <div>
      <RichEditor value={body} onChange={setBody} placeholder={placeholder} minimal compact />
      <AttachChips files={files} onRemove={(i) => setFiles(files.filter((_, j) => j !== i))} />
      {uploads.length > 0 && <div className="mt-8"><UploadProgressList uploads={uploads} /></div>}
      <div className="row row-wrap mt-8">
        <AttachButton onFiles={addFiles} />
        {audio && <Recorder onRecorded={(f) => addFiles([f])} />}
        <span className="flex-1" />
        {extra}
        <button type="button" className={`btn ${variant}`} onClick={send} disabled={busy || busyExternal || (empty && !allowEmpty) || uploads.length > 0}><Icon size={16} />{busy ? 'Отправляем…' : submitLabel}</button>
      </div>
    </div>
  );
}
