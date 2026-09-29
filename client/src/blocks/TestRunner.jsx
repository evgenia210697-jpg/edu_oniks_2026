import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ArrowUp, ArrowDown, Check, X, Timer, Trophy, RotateCcw, Flag } from 'lucide-react';
import { api, fileUrl } from '../api';
import { Ring, useConfirm, useToast } from '../components/ui';

function isAnswered(q, a) {
  if (a == null) return false;
  switch (q.type) {
    case 'choice': return Array.isArray(a) && a.length > 0;
    case 'gaps': return Array.isArray(a) && a.some(Boolean);
    case 'order': return Array.isArray(a) && a.length > 0;
    case 'match': return a && Object.values(a).some(Boolean);
    default: return String(a).trim() !== '';
  }
}

/** Поле ответа на вопрос (интерактивное или только для показа) */
export function QuestionAnswer({ q, value, onChange, review }) {
  const ro = !!review;
  const correct = review?.correctAnswer;
  switch (q.type) {
    case 'choice': {
      const sel = Array.isArray(value) ? value : [];
      const toggle = (id) => {
        if (ro) return;
        if (q.multiple) onChange(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);
        else onChange([id]);
      };
      const cls = (o) => {
        const s = sel.includes(o.id);
        if (review && Array.isArray(correct)) {
          if (correct.includes(o.id)) return 'correct';
          if (s) return 'wrong';
          return '';
        }
        if (review && s) return review.correct ? 'correct' : 'wrong';
        return s ? 'selected' : '';
      };
      const list = q.options.map((o) => (
        <div key={o.id} className={`answer-opt ${q.multiple ? 'multi' : ''} ${cls(o)} ${sel.includes(o.id) ? 'picked' : ''}`} onClick={() => toggle(o.id)} role={q.multiple ? 'checkbox' : 'radio'} aria-checked={sel.includes(o.id)} tabIndex={ro ? -1 : 0}
          onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(o.id); } }}>
          {o.image && <img src={fileUrl(o.image)} alt="" />}
          <div className="row">
            <span className="mark">{sel.includes(o.id) && <Check size={14} strokeWidth={3} />}</span>
            <span className="flex-1">{o.text}</span>
          </div>
        </div>
      ));
      return (
        <div>
          {!ro && <div className="hint mb-8">{q.multiple ? 'Выберите все правильные варианты' : 'Выберите один вариант'}</div>}
          {q.imageOptions ? <div className="img-opts">{list}</div> : list}
        </div>
      );
    }
    case 'gaps': {
      const vals = Array.isArray(value) ? value : [];
      return (
        <div className="gap-text">
          {q.segments.map((s, i) => (s.t === 'text'
            ? <span key={i}>{s.v}</span>
            : (
              <span key={i}>
                <select className="select" disabled={ro} value={vals[s.i] || ''} style={review ? { borderColor: Array.isArray(correct) ? (String(vals[s.i] || '').toLowerCase() === String(correct[s.i]).toLowerCase() ? 'var(--success)' : 'var(--danger)') : undefined } : undefined}
                  onChange={(e) => { const n = [...vals]; n[s.i] = e.target.value; onChange(n); }}>
                  <option value="">— выберите —</option>
                  {q.words.map((w) => <option key={w} value={w}>{w}</option>)}
                </select>
                {review && Array.isArray(correct) && String(vals[s.i] || '').toLowerCase() !== String(correct[s.i]).toLowerCase() && <span className="badge badge-success">{correct[s.i]}</span>}
              </span>
            )))}
        </div>
      );
    }
    case 'order': {
      const order = Array.isArray(value) && value.length ? value : q.items.map((i) => i.id);
      const byId = Object.fromEntries(q.items.map((i) => [i.id, i]));
      const move = (idx, dir) => {
        const n = [...order]; const j = idx + dir;
        if (j < 0 || j >= n.length) return;
        [n[idx], n[j]] = [n[j], n[idx]];
        onChange(n);
      };
      return (
        <div>
          {!ro && <div className="hint mb-8">Расставьте элементы в правильном порядке стрелками</div>}
          {order.map((id, idx) => (
            <div key={id} className="order-item" style={review && Array.isArray(correct) ? { borderColor: correct[idx] === id ? 'var(--success)' : 'var(--danger)' } : undefined}>
              <span className="o-num">{idx + 1}</span>
              <span className="flex-1">{byId[id]?.text}</span>
              {!ro && <>
                <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => move(idx, -1)} disabled={idx === 0} aria-label="Выше"><ArrowUp size={16} /></button>
                <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => move(idx, 1)} disabled={idx === order.length - 1} aria-label="Ниже"><ArrowDown size={16} /></button>
              </>}
            </div>
          ))}
          {review && Array.isArray(correct) && !review.correct && (
            <div className="hint mt-8">Правильный порядок: {correct.map((id) => byId[id]?.text).join(' → ')}</div>
          )}
        </div>
      );
    }
    case 'match': {
      const m = value && typeof value === 'object' ? value : {};
      const rightById = Object.fromEntries(q.rights.map((r) => [r.id, r.text]));
      return (
        <div>
          {q.lefts.map((l) => {
            const ok = review && correct ? m[l.id] === l.id : null;
            return (
              <div key={l.id} className="match-row">
                <div className="match-left">{l.text}</div>
                <span className="pair-link" />
                <div>
                  <select className="select" disabled={ro} value={m[l.id] || ''} onChange={(e) => onChange({ ...m, [l.id]: e.target.value })}
                    style={ok === null ? undefined : { borderColor: ok ? 'var(--success)' : 'var(--danger)' }}>
                    <option value="">— выберите —</option>
                    {q.rights.map((r) => <option key={r.id} value={r.id}>{r.text}</option>)}
                  </select>
                  {ok === false && <div className="xs mt-8" style={{ color: 'var(--success)' }}>Верно: {rightById[l.id]}</div>}
                </div>
              </div>
            );
          })}
        </div>
      );
    }
    case 'text':
      return (
        <div>
          <input className="input" disabled={ro} value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder="Введите ответ" style={{ maxWidth: 480 }} />
          {review && Array.isArray(correct) && !review.correct && correct.length > 0 && <div className="hint mt-8">Правильный ответ: <b>{correct.filter(Boolean).join(' / ')}</b></div>}
        </div>
      );
    case 'number':
      return (
        <div>
          <input className="input" disabled={ro} inputMode="decimal" value={value ?? ''} onChange={(e) => onChange(e.target.value.replace(/[^\d.,\-\s]/g, ''))} placeholder={q.integerOnly ? 'Целое число' : 'Число'} style={{ maxWidth: 240 }} />
          {review && correct && !review.correct && <div className="hint mt-8">Правильный ответ: <b>{Array.isArray(correct) ? correct.filter((x) => String(x).trim() !== '').join(' / ') : `от ${correct.min} до ${correct.max}`}</b></div>}
        </div>
      );
    default:
      return null;
  }
}

function fmtLeft(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** Прохождение теста */
export function TestRun({ attempt, lessonId, onFinished, onCancel }) {
  const confirm = useConfirm();
  const toast = useToast();
  const qs = attempt.questions;
  const storeKey = `lms-attempt-${attempt.id}`;
  const [answers, setAnswers] = useState(() => {
    if (!attempt.id) return {};
    try { return JSON.parse(sessionStorage.getItem(storeKey) || '{}'); } catch { return {}; }
  });
  const [idx, setIdx] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const submitted = useRef(false);
  const deadline = attempt.deadlineAt ? new Date(attempt.deadlineAt).getTime() : null;

  useEffect(() => { if (attempt.id) try { sessionStorage.setItem(storeKey, JSON.stringify(answers)); } catch { /* */ } }, [answers, storeKey, attempt.id]);
  useEffect(() => {
    if (!deadline) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [deadline]);

  const submit = async (auto = false) => {
    if (submitted.current) return;
    if (!auto) {
      const left = qs.filter((q) => !isAnswered(q, answers[q.id])).length;
      const ok = await confirm({ title: 'Завершить тест?', text: left ? `Без ответа осталось вопросов: ${left}. Они будут засчитаны как неверные.` : 'Все ответы будут отправлены на проверку.', ok: 'Завершить' });
      if (!ok) return;
    }
    submitted.current = true; setBusy(true);
    const full = { ...answers };
    qs.forEach((x) => { if (x.type === 'order' && !(Array.isArray(full[x.id]) && full[x.id].length)) full[x.id] = x.items.map((i) => i.id); });
    try {
      const res = await api.post(`/learn/attempts/${attempt.id}/submit`, attempt.id ? { answers: full } : { answers: full, lessonId, questions: qs });
      try { sessionStorage.removeItem(storeKey); } catch { /* */ }
      onFinished(res);
    } catch (e) {
      submitted.current = false; toast.error(e);
    } finally { setBusy(false); }
  };

  const left = deadline ? deadline - now : null;
  useEffect(() => { if (left != null && left <= 0) { toast('Время вышло — тест завершён'); submit(true); } }, [left]); // eslint-disable-line

  const q = qs[idx];
  return (
    <div>
      <div className="row row-wrap mb-16" style={{ justifyContent: 'space-between' }}>
        <div className="bold">Вопрос {idx + 1} из {qs.length}</div>
        <div className="row">
          {left != null && <span className={`timer ${left < 60000 ? 'low' : ''}`}><Timer size={16} />{fmtLeft(left)}</span>}
          {onCancel && <button className="btn btn-ghost btn-sm" onClick={onCancel}>Выйти из предпросмотра</button>}
        </div>
      </div>
      <div className="q-nav">
        {qs.map((x, i) => (
          <button key={x.id} type="button" className={`${isAnswered(x, answers[x.id]) ? 'answered' : ''} ${i === idx ? 'current' : ''}`} onClick={() => setIdx(i)}>{i + 1}</button>
        ))}
      </div>
      <div className="q-text">{q.text}</div>
      {q.image && <img className="q-image" src={fileUrl(q.image)} alt="" />}
      <QuestionAnswer q={q} value={answers[q.id]} onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))} />
      <div className="player-nav" style={{ marginTop: 28 }}>
        <button className="btn btn-secondary" onClick={() => setIdx(idx - 1)} disabled={idx === 0}><ChevronLeft size={17} />Назад</button>
        {idx < qs.length - 1
          ? <button className="btn btn-primary" onClick={() => setIdx(idx + 1)}>Следующий вопрос<ChevronRight size={17} /></button>
          : <button className="btn btn-success" onClick={() => submit(false)} disabled={busy}><Flag size={16} />{busy ? 'Отправляем…' : 'Завершить тест'}</button>}
      </div>
    </div>
  );
}

/** Результаты попытки */
export function TestResult({ result, onRetry, canRetry, onNext, nextLabel = 'Следующее занятие' }) {
  const detailsById = useMemo(() => Object.fromEntries((result.details || []).map((d) => [d.id, d])), [result]);
  return (
    <div>
      <div className="result-hero">
        <Ring value={result.score} size={120} stroke={9} label={<span style={{ fontSize: 26 }}>{result.score}%</span>} color={result.passed ? 'var(--success)' : 'var(--danger)'} />
        <h2 className="mt-16">{result.passed ? <><Trophy size={22} style={{ verticalAlign: '-3px', color: '#e0a800' }} /> Тест пройден!</> : 'Тест не пройден'}</h2>
        <p className="muted mt-8">
          {result.passed ? 'Отличный результат.' : `Нужно набрать не менее ${result.passPercent}% правильных ответов.`}
          {result.preview && ' (Предпросмотр — результат не сохраняется.)'}
        </p>
        <div className="row mt-16" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
          {canRetry && <button className="btn btn-secondary" onClick={onRetry}><RotateCcw size={16} />Пройти ещё раз</button>}
          {onNext && <button className="btn btn-primary" onClick={onNext}>{nextLabel}<ChevronRight size={17} /></button>}
        </div>
      </div>
      {result.mode !== 'none' && result.questions && (
        <div className="mt-24">
          <h3 className="mb-16">Разбор ответов</h3>
          {result.questions.map((q, i) => {
            const d = detailsById[q.id] || {};
            const cls = d.correct ? 'ok' : d.score > 0 ? 'part' : 'bad';
            return (
              <div key={q.id} className={`review-q ${cls}`}>
                <div className="row mb-8">
                  <span className="q-num">{i + 1}</span>
                  <span className="flex-1 bold">{q.text}</span>
                  {d.correct ? <span className="badge badge-success"><Check size={12} />Верно</span>
                    : d.score > 0 ? <span className="badge badge-warning">Частично</span>
                      : <span className="badge badge-danger"><X size={12} />Неверно</span>}
                </div>
                {q.image && <img className="q-image" src={fileUrl(q.image)} alt="" style={{ maxHeight: 180 }} />}
                <QuestionAnswer q={q} value={result.answers?.[q.id]} onChange={() => {}} review={result.mode === 'all' ? d : { correct: d.correct }} />
                {d.explanation && <div className="alert alert-info mt-16">{d.explanation}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
