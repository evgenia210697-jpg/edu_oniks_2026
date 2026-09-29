import { useEffect, useRef, useState } from 'react';
import { Check, Pipette, RotateCcw } from 'lucide-react';

// Палитра в духе Google Docs: оттенки серого, яркие цвета и их светлые/тёмные варианты
const GRAYS = ['#000000', '#19212c', '#434b57', '#6b7686', '#9aa4b2', '#cfd6df', '#eef1f5', '#ffffff'];
const HUES = [
  // яркий, тёмный, средний, светлый, очень светлый
  ['#d63b3b', '#a52424', '#e46c6c', '#f3b3b3', '#fdecec'], // красный
  ['#e0730b', '#a8560a', '#ee9a4b', '#f8cfa6', '#fff1e3'], // оранжевый
  ['#e0b000', '#9c7a00', '#ecc94b', '#f5e3a0', '#fff8dc'], // жёлтый
  ['#15935b', '#0e6b42', '#4fb887', '#a8dcc2', '#e8f6ef'], // зелёный
  ['#0e9aa7', '#0a6f78', '#4dbcc6', '#a6e0e5', '#e5f7f8'], // бирюзовый
  ['#2878d6', '#1c5aa3', '#61a0e6', '#b3d2f4', '#e9f2fd'], // синий
  ['#2f5bea', '#1f3fae', '#6c8cf1', '#b8c8f8', '#ebf0fe'], // фирменный синий
  ['#7c4ddb', '#5831a8', '#a283e8', '#d3c3f4', '#f3eefd'], // фиолетовый
  ['#c2408f', '#8f2c68', '#d777b1', '#ecbcd9', '#fbeef6'], // розовый
  ['#8a5a2b', '#5f3d1c', '#b08560', '#dac4ae', '#f6efe7'], // коричневый
];
// Строки палитры: сначала яркие, затем оттенки
const ROWS = [GRAYS, HUES.map((h) => h[0]), HUES.map((h) => h[1]), HUES.map((h) => h[2]), HUES.map((h) => h[3]), HUES.map((h) => h[4])];

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;
export function normalizeHex(v) {
  const m = String(v || '').trim().match(HEX_RE);
  if (!m) return null;
  let h = m[1].toLowerCase();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return `#${h}`;
}

function loadRecent(key) {
  try { return JSON.parse(localStorage.getItem(key) || '[]').filter((c) => normalizeHex(c)).slice(0, 10); } catch { return []; }
}

/**
 * Палитра цветов: готовые цвета, недавние, свой цвет (пипетка браузера + HEX).
 * onChange(цвет) — выбран цвет; onChange(null) — «Без цвета».
 */
export default function ColorPicker({ value, onChange, resetLabel = 'Без цвета', recentKey = 'lms-recent-colors', extra = [] }) {
  const [recent, setRecent] = useState(() => loadRecent(recentKey));
  const current = normalizeHex(value);
  const [hex, setHex] = useState(current || '');
  const native = useRef(null);
  useEffect(() => { setHex(current || ''); }, [current]);
  // системная пипетка: событие change приходит, когда окно выбора цвета закрыли
  const pickRef = useRef(null);
  pickRef.current = (v) => pick(v);
  useEffect(() => {
    const el = native.current;
    if (!el) return undefined;
    const h = (e) => pickRef.current(e.target.value);
    el.addEventListener('change', h);
    return () => el.removeEventListener('change', h);
  }, []);

  const pick = (c) => {
    const n = normalizeHex(c);
    if (!n) return;
    const next = [n, ...recent.filter((x) => x !== n)].slice(0, 10);
    setRecent(next);
    try { localStorage.setItem(recentKey, JSON.stringify(next)); } catch { /* */ }
    onChange(n);
  };

  const sw = (c, i) => (
    <button key={`${c}-${i}`} type="button" className={`cp-swatch ${current === normalizeHex(c) ? 'on' : ''} ${normalizeHex(c) === '#ffffff' ? 'light' : ''}`}
      style={{ '--c': c }} title={c} aria-label={`Цвет ${c}`} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(c)}>
      {current === normalizeHex(c) && <Check size={12} strokeWidth={3} />}
    </button>
  );

  const hexOk = !!normalizeHex(hex);
  return (
    <div className="cp" onMouseDown={(e) => { if (e.target.tagName !== 'INPUT') e.preventDefault(); }}>
      {extra.length > 0 && (
        <>
          <div className="cp-label">Фирменные</div>
          <div className="cp-row">{extra.map(sw)}</div>
        </>
      )}
      <div className="cp-label">Палитра</div>
      <div className="cp-grid">{ROWS.map((row, r) => <div key={r} className={`cp-row ${r === 1 ? 'gap-top' : ''}`}>{row.map(sw)}</div>)}</div>
      {recent.length > 0 && (
        <>
          <div className="cp-label">Недавние</div>
          <div className="cp-row">{recent.map(sw)}</div>
        </>
      )}
      <div className="cp-custom">
        <button type="button" className="cp-native" style={{ '--c': hexOk ? normalizeHex(hex) : current || '#2f5bea' }}
          onClick={() => native.current?.click()} title="Выбрать любой цвет">
          <Pipette size={14} />
        </button>
        <input ref={native} type="color" className="cp-native-input" value={current || normalizeHex(hex) || '#2f5bea'}
          onChange={(e) => setHex(e.target.value)} tabIndex={-1} aria-hidden="true" />
        <input className="input input-sm cp-hex" value={hex} placeholder="#2F5BEA" maxLength={7} spellCheck={false} aria-label="Код цвета HEX"
          onChange={(e) => setHex(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (hexOk) pick(hex); } }} />
        <button type="button" className="btn btn-primary btn-sm" disabled={!hexOk} onClick={() => pick(hex)}>ОК</button>
      </div>
      {onChange && resetLabel && (
        <button type="button" className="cp-reset" onClick={() => onChange(null)}><RotateCcw size={13} />{resetLabel}</button>
      )}
    </div>
  );
}
