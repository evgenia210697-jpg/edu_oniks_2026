import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, AlertCircle, Lock, Clock, RotateCcw, GraduationCap, PenTool, ListChecks, Inbox } from 'lucide-react';
import { api } from '../api';
import { initials } from '../utils';

/* ---------- Загрузка данных ---------- */
export function useApi(url, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!url) { setState({ data: null, error: null, loading: false }); return; }
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    api.get(url).then(
      (data) => alive && setState({ data, error: null, loading: false }),
      (error) => alive && setState({ data: null, error, loading: false }),
    );
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, tick, ...deps]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  const setData = useCallback((fn) => setState((s) => ({ ...s, data: typeof fn === 'function' ? fn(s.data) : fn })), []);
  return { ...state, reload, setData };
}

/* ---------- Тосты ---------- */
const ToastCtx = createContext(null);
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((text, type = 'ok') => {
    const id = Math.random();
    setItems((a) => [...a.slice(-3), { id, text, type }]);
    const life = type === 'error' ? 5000 : 2800;
    setTimeout(() => setItems((a) => a.map((x) => (x.id === id ? { ...x, leaving: true } : x))), life);
    setTimeout(() => setItems((a) => a.filter((x) => x.id !== id)), life + 240);
  }, []);
  const toast = useCallback((t) => push(t, 'ok'), [push]);
  toast.error = (t) => push(t instanceof Error ? t.message : t, 'error');
  return (
    <ToastCtx.Provider value={toast}>
      {children}
      {createPortal(
        <div className="toasts">
          {items.map((t) => (
            <div key={t.id} className={`toast ${t.type === 'error' ? 'error' : ''} ${t.leaving ? 'leaving' : ''}`} role="status">
              {t.type === 'error' ? <AlertCircle size={18} /> : <Check size={18} />}{t.text}
            </div>
          ))}
        </div>, document.body)}
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

/* ---------- Модальное окно ---------- */
export function Modal({ title, children, footer, onClose, size = '', closeOnBackdrop = true }) {
  const [closing, setClosing] = useState(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  // закрытие по Esc, фону и крестику — с анимацией исчезновения
  const animatedClose = useCallback(() => {
    setClosing((was) => {
      if (!was) setTimeout(() => closeRef.current?.(), 150);
      return true;
    });
  }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') animatedClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [animatedClose]);
  const down = useRef(false);
  return createPortal(
    <div className={`modal-backdrop ${closing ? 'closing' : ''}`} onMouseDown={(e) => { down.current = e.target === e.currentTarget; }}
      onMouseUp={(e) => { if (closeOnBackdrop && down.current && e.target === e.currentTarget) animatedClose(); }}>
      <div className={`modal ${size}`} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={animatedClose} aria-label="Закрыть"><X size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/* ---------- Подтверждение ---------- */
const ConfirmCtx = createContext(null);
export function ConfirmProvider({ children }) {
  const [st, setSt] = useState(null);
  const confirm = useCallback((opts) => new Promise((resolve) => setSt({ ...opts, resolve })), []);
  const close = (v) => { st?.resolve(v); setSt(null); };
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {st && (
        <Modal title={st.title || 'Подтвердите действие'} onClose={() => close(false)}
          footer={<>
            <button className="btn btn-secondary" onClick={() => close(false)}>Отмена</button>
            <button className={`btn ${st.danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => close(true)} autoFocus>{st.ok || 'Подтвердить'}</button>
          </>}>
          <p className="muted">{st.text}</p>
        </Modal>
      )}
    </ConfirmCtx.Provider>
  );
}
export const useConfirm = () => useContext(ConfirmCtx);

/* ---------- Запрос строки (вместо системного window.prompt) ---------- */
const PromptCtx = createContext(null);
function PromptModal({ st, onClose }) {
  const [value, setValue] = useState(st.value || '');
  const submit = (e) => { e.preventDefault(); onClose(value); };
  return (
    <Modal title={st.title} onClose={() => onClose(null)}
      footer={<>
        <button className="btn btn-secondary" onClick={() => onClose(null)}>Отмена</button>
        <button className="btn btn-primary" form="prompt-form">{st.ok || 'Сохранить'}</button>
      </>}>
      <form id="prompt-form" onSubmit={submit}>
        <Field label={st.label} hint={st.hint}>
          <input className="input" autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder={st.placeholder}
            onFocus={(e) => e.target.select()} />
        </Field>
      </form>
    </Modal>
  );
}
export function PromptProvider({ children }) {
  const [st, setSt] = useState(null);
  const prompt = useCallback((opts) => new Promise((resolve) => setSt({ ...opts, resolve })), []);
  const close = (v) => { st?.resolve(v); setSt(null); };
  return (
    <PromptCtx.Provider value={prompt}>
      {children}
      {st && <PromptModal st={st} onClose={close} />}
    </PromptCtx.Provider>
  );
}
/** prompt({ title, label, value, placeholder, hint, ok }) → Promise<строка | null> */
export const usePrompt = () => useContext(PromptCtx);

/* ---------- Выпадающее меню ---------- */
export function Menu({ trigger, children, align = 'right', className = '' }) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [place, setPlace] = useState({ align, up: false });
  const ref = useRef(null);
  const menuRef = useRef(null);
  const close = useCallback(() => {
    setClosing(true);
    setTimeout(() => { setOpen(false); setClosing(false); }, 110);
  }, []);
  const toggle = useCallback(() => { if (open) close(); else { setPlace({ align, up: false }); setOpen(true); } }, [open, close, align]);
  useEffect(() => {
    if (!open) return undefined;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) close(); };
    const k = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', h);
    document.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k); };
  }, [open, close]);
  // если меню не помещается на экране — разворачиваем его в другую сторону
  useLayoutEffect(() => {
    if (!open || !menuRef.current) return;
    const r = menuRef.current.getBoundingClientRect();
    const next = { ...place };
    if (r.right > window.innerWidth - 8 && place.align === 'left') next.align = 'right';
    else if (r.left < 8 && place.align !== 'left') next.align = 'left';
    if (r.bottom > window.innerHeight - 8 && r.height < r.top - 16) next.up = true;
    if (next.align !== place.align || next.up !== place.up) setPlace(next);
  }, [open, place]);
  return (
    <div className="menu-wrap" ref={ref}>
      {trigger({ open, toggle })}
      {open && (
        <div ref={menuRef} className={`menu ${place.align === 'left' ? 'left' : ''} ${place.up ? 'up' : ''} ${closing ? 'closing' : ''} ${className}`}
          onClick={(e) => { if (e.target.closest('.menu-item')) close(); }}>
          {typeof children === 'function' ? children({ close }) : children}
        </div>
      )}
    </div>
  );
}
export function MenuItem({ icon: Icon, children, danger, ...rest }) {
  return (
    <button type="button" className={`menu-item ${danger ? 'danger' : ''}`} {...rest}>
      {Icon && <Icon size={16} />}{children}
    </button>
  );
}

/* ---------- Мелочи ---------- */
export function Toggle({ checked, onChange, label, hint, disabled }) {
  return (
    <label className="toggle" style={disabled ? { opacity: .5, pointerEvents: 'none' } : undefined}>
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} disabled={disabled} />
      <span className="track" />
      {(label || hint) && <span className="t-label">{label}{hint && <span className="t-hint">{hint}</span>}</span>}
    </label>
  );
}

export function Field({ label, hint, children, style }) {
  return (
    <div className="field" style={style}>
      {label && <label>{label}</label>}
      {children}
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export const Spinner = ({ small }) => <div className={`spinner ${small ? 'sm' : ''}`} />;
/** Загрузка страницы: скелет вместо пустого экрана (появляется с небольшой задержкой, чтобы не мигать) */
export const Loading = ({ variant = 'page' }) => (
  <div className="skeleton-page" aria-busy="true" aria-label="Загрузка">
    {variant === 'page' && <div className="sk sk-hero" />}
    <div className="sk sk-line" style={{ width: '38%', height: 22 }} />
    <div className="sk sk-line" style={{ width: '62%' }} />
    <div className="sk-grid mt-16">
      <div className="sk sk-card" /><div className="sk sk-card" /><div className="sk sk-card" />
    </div>
  </div>
);

export function ErrorBox({ error, onRetry }) {
  return (
    <div className="empty">
      <div className="empty-icon" style={{ background: 'var(--danger-50)', color: 'var(--danger)' }}><AlertCircle /></div>
      <h3>Не удалось загрузить</h3>
      <p>{error?.message || 'Ошибка'}</p>
      {onRetry && <button className="btn btn-secondary mt-16" onClick={onRetry}>Повторить</button>}
    </div>
  );
}

export function Empty({ icon: Icon = Inbox, title, text, children }) {
  return (
    <div className="empty">
      <div className="empty-icon"><Icon /></div>
      {title && <h3>{title}</h3>}
      {text && <p>{text}</p>}
      {children && <div className="mt-16">{children}</div>}
    </div>
  );
}

export function Avatar({ user, size = '' }) {
  return (
    <span className={`avatar ${size}`}>
      {user?.avatar ? <img src={user.avatar} alt="" /> : initials(user?.name)}
    </span>
  );
}

export function Progress({ value, success }) {
  return <div className={`progress ${success || value >= 100 ? 'success' : ''}`}><div style={{ width: `${Math.max(0, Math.min(100, value || 0))}%` }} /></div>;
}

export function Ring({ value = 0, size = 44, stroke = 4, label, color }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  const col = color || (v >= 100 ? 'var(--success)' : 'var(--accent)');
  return (
    <span className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} style={{ transition: 'stroke-dashoffset .5s' }} />
      </svg>
      <span className="ring-label">{label ?? `${v}%`}</span>
    </span>
  );
}

export function TypeIcon({ type, size = 18 }) {
  const I = type === 'test' ? ListChecks : type === 'assignment' ? PenTool : GraduationCap;
  return <I size={size} className="type-ic" />;
}

export function StatusIcon({ status, locked }) {
  if (locked) return <span className="status-ic locked"><Lock size={12} /></span>;
  if (status === 'completed') return <span className="status-ic done"><Check size={14} strokeWidth={3} /></span>;
  if (status === 'pending') return <span className="status-ic pending"><Clock size={13} /></span>;
  if (status === 'returned' || status === 'failed') return <span className="status-ic returned"><RotateCcw size={12} /></span>;
  if (status === 'opened') return <span className="status-ic opened" />;
  return <span className="status-ic" />;
}

export const STATUS_TEXT = {
  completed: 'Пройдено', pending: 'На проверке', returned: 'На доработке', failed: 'Не сдан', opened: 'Начато', available: 'Не начато',
};

export function SubmissionBadge({ status }) {
  if (status === 'pending') return <span className="badge badge-warning"><Clock size={12} />Ждёт проверки</span>;
  if (status === 'accepted') return <span className="badge badge-success"><Check size={12} />Принято</span>;
  if (status === 'returned') return <span className="badge badge-danger"><RotateCcw size={12} />На доработке</span>;
  return null;
}

/** Контурный рисунок шестигранной гайки — фирменный мотив платформы (как на техническом чертеже) */
export function NutMark({ className = '', size = 320 }) {
  const hex = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i + Math.PI / 6;
    return `${(100 + 88 * Math.cos(a)).toFixed(2)},${(100 + 88 * Math.sin(a)).toFixed(2)}`;
  }).join(' ');
  return (
    <svg className={`nut-mark ${className}`} width={size} height={size} viewBox="0 0 200 200" fill="none" aria-hidden="true">
      <polygon points={hex} stroke="currentColor" strokeWidth="1.4" />
      <circle cx="100" cy="100" r="76" stroke="currentColor" strokeWidth=".8" strokeDasharray="2 5" />
      <circle cx="100" cy="100" r="46" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="100" cy="100" r="38" stroke="currentColor" strokeWidth=".8" />
      <path d="M100 4v26M100 170v26M4 100h26M170 100h26" stroke="currentColor" strokeWidth=".8" />
      <path d="M62 100a38 38 0 0 1 38-38" stroke="currentColor" strokeWidth=".8" strokeDasharray="1 3" />
    </svg>
  );
}

export function Hero({ title, sub, cover, back, children, kicker }) {
  return (
    <div className={`hero ${cover ? 'has-cover' : ''}`} style={cover ? { '--hero-img': `url("${cover}")` } : undefined}>
      {!cover && <NutMark className="hero-nut" />}
      {back && <div className="hero-back">{back}</div>}
      <div className="hero-inner" style={{ marginTop: back ? 40 : 0 }}>
        {kicker && <div className="hero-kicker">{kicker}</div>}
        <h1>{title}</h1>
        {sub && <div className="hero-sub">{sub}</div>}
        {children}
      </div>
    </div>
  );
}
