import { useState } from 'react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  GripVertical, Copy, Trash2, Plus, ChevronDown, ChevronRight, ListChecks, Images, TextCursorInput, ArrowDownUp, Link2 as LinkIcon,
  MessageSquareText, Hash, Check, ImagePlus, X, AlertTriangle,
} from 'lucide-react';
import { Toggle, useToast } from '../components/ui';
import { uploadFile, fileUrl } from '../api';
import { uid } from '../utils';

export const Q_TYPES = [
  { type: 'choice', label: 'Выбор ответа', desc: 'Один или несколько правильных вариантов', icon: ListChecks, make: () => ({ options: [{ id: uid(), text: '', correct: true }, { id: uid(), text: '', correct: false }] }) },
  { type: 'choice-img', label: 'Варианты с картинками', desc: 'Ученик выбирает картинку', icon: Images, make: () => ({ type: 'choice', imageOptions: true, options: [{ id: uid(), text: '', image: null, correct: true }, { id: uid(), text: '', image: null, correct: false }] }) },
  { type: 'gaps', label: 'Заполнить пропуски', desc: 'Выбрать слова для пропусков в тексте', icon: TextCursorInput, make: () => ({ gapText: '', distractors: [] }) },
  { type: 'order', label: 'Расставить по порядку', desc: 'Упорядочить шаги или элементы', icon: ArrowDownUp, make: () => ({ items: [{ id: uid(), text: '' }, { id: uid(), text: '' }, { id: uid(), text: '' }] }) },
  { type: 'match', label: 'Сопоставить', desc: 'Соединить пары: термин — определение', icon: LinkIcon, make: () => ({ pairs: [{ id: uid(), left: '', right: '' }, { id: uid(), left: '', right: '' }] }) },
  { type: 'text', label: 'Короткий ответ', desc: 'Ученик вводит слово или фразу', icon: MessageSquareText, make: () => ({ answers: [''], caseSensitive: false, anyAnswer: false }) },
  { type: 'number', label: 'Числовой ответ', desc: 'Ответ — число или диапазон', icon: Hash, make: () => ({ answers: [''], range: false, min: '', max: '', integerOnly: false }) },
];
const typeInfo = (q) => Q_TYPES.find((t) => t.type === (q.type === 'choice' && q.imageOptions ? 'choice-img' : q.type)) || Q_TYPES[0];

export function newQuestion(kind) {
  const t = Q_TYPES.find((x) => x.type === kind);
  const extra = t.make();
  return { id: uid(), type: extra.type || kind, text: '', image: null, explanation: '', ...extra };
}

/** Короткая проверка вопроса на ошибки заполнения */
export function questionProblem(q) {
  if (!q.text?.trim()) return 'Не заполнен текст вопроса';
  switch (q.type) {
    case 'choice':
      if ((q.options || []).length < 2) return 'Нужно минимум 2 варианта';
      if (!(q.options || []).some((o) => o.correct)) return 'Отметьте правильный вариант';
      if ((q.options || []).some((o) => !o.text?.trim() && !o.image)) return 'Есть пустой вариант';
      return null;
    case 'gaps': return /\[[^\]]+\]/.test(q.gapText || '') ? null : 'Отметьте пропуски квадратными скобками';
    case 'order': return (q.items || []).filter((i) => i.text?.trim()).length < 2 ? 'Нужно минимум 2 элемента' : null;
    case 'match': return (q.pairs || []).filter((p) => p.left?.trim() && p.right?.trim()).length < 2 ? 'Нужно минимум 2 заполненные пары' : null;
    case 'text': return q.anyAnswer || (q.answers || []).some((a) => a.trim()) ? null : 'Укажите правильный ответ';
    case 'number': return q.range ? (q.min === '' || q.max === '' ? 'Укажите диапазон' : null) : ((q.answers || []).some((a) => String(a).trim() !== '') ? null : 'Укажите правильное число');
    default: return null;
  }
}

function ImagePick({ fileId, onChange, small }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const pick = () => {
    const i = document.createElement('input');
    i.type = 'file'; i.accept = 'image/*';
    i.onchange = async () => {
      const f = i.files?.[0]; if (!f) return;
      setBusy(true);
      try { const r = await uploadFile(f); onChange(r.id); } catch (e) { toast.error(e); } finally { setBusy(false); }
    };
    i.click();
  };
  if (small) {
    return (
      <div className="opt-img" onClick={pick} title={fileId ? 'Заменить картинку' : 'Загрузить картинку'}>
        {busy ? '…' : fileId ? <img src={fileUrl(fileId)} alt="" /> : <ImagePlus size={18} />}
      </div>
    );
  }
  return fileId ? (
    <div className="row mb-8">
      <img src={fileUrl(fileId)} alt="" style={{ maxHeight: 140, borderRadius: 10 }} />
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(null)}><X size={14} />Убрать картинку</button>
    </div>
  ) : (
    <button type="button" className="btn btn-ghost btn-sm mb-8" onClick={pick} disabled={busy}><ImagePlus size={15} />{busy ? 'Загрузка…' : 'Добавить картинку к вопросу'}</button>
  );
}

function ListEditor({ items, onChange, render, add, addLabel, min = 1 }) {
  return (
    <div>
      {items.map((it, i) => (
        <div key={it.id || i} className="opt-row">
          {render(it, i, (patch) => onChange(items.map((x, j) => (j === i ? (typeof patch === 'object' && !Array.isArray(patch) && x && typeof x === 'object' ? { ...x, ...patch } : patch) : x))))}
          <button type="button" className="btn btn-ghost btn-icon btn-sm" disabled={items.length <= min} onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label="Удалить"><Trash2 size={15} /></button>
        </div>
      ))}
      <button type="button" className="btn btn-soft btn-sm" onClick={() => onChange([...items, add()])}><Plus size={14} />{addLabel}</button>
    </div>
  );
}

function QuestionBody({ q, set }) {
  switch (q.type) {
    case 'choice': {
      const multi = (q.options || []).filter((o) => o.correct).length > 1;
      return (
        <div className="field">
          <label>Варианты ответа <span className="hint">— отметьте правильные. Если правильных несколько, ученик сможет выбрать несколько.</span></label>
          <ListEditor items={q.options || []} min={2} addLabel="Добавить вариант" add={() => ({ id: uid(), text: '', image: null, correct: false })}
            onChange={(options) => set({ options })}
            render={(o, i, upd) => (<>
              {q.imageOptions && <ImagePick small fileId={o.image} onChange={(image) => upd({ image })} />}
              <input className="input" value={o.text} placeholder={q.imageOptions ? 'Подпись (необязательно)' : `Вариант ${i + 1}`} onChange={(e) => upd({ text: e.target.value })} />
              <span className={`correct-toggle ${o.correct ? 'on' : ''}`} onClick={() => upd({ correct: !o.correct })}>
                {o.correct ? <Check size={15} /> : <span style={{ width: 15 }} />}Правильный
              </span>
            </>)} />
          {multi && <div className="hint mt-8">Несколько правильных ответов — засчитывается, только если выбраны все правильные и ни одного лишнего.</div>}
        </div>
      );
    }
    case 'gaps':
      return (
        <>
          <div className="field">
            <label>Текст с пропусками</label>
            <textarea className="textarea" value={q.gapText} onChange={(e) => set({ gapText: e.target.value })}
              placeholder="Например: Болт М10 имеет [метрическую] резьбу с шагом [1,5] мм." />
            <div className="hint">Слова в <span className="kbd">[квадратных скобках]</span> станут пропусками. Ученик выбирает их из списка.</div>
          </div>
          <div className="field">
            <label>Неверные варианты (для усложнения)</label>
            <ListEditor items={(q.distractors || []).map((v, i) => ({ id: i, v }))} min={0} addLabel="Добавить неверный вариант" add={() => ({ id: Math.random(), v: '' })}
              onChange={(list) => set({ distractors: list.map((x) => x.v) })}
              render={(it, i, upd) => <input className="input" value={it.v} placeholder="Неверное слово" onChange={(e) => upd({ v: e.target.value })} />} />
          </div>
        </>
      );
    case 'order':
      return (
        <div className="field">
          <label>Элементы в правильном порядке <span className="hint">— ученик увидит их перемешанными</span></label>
          <ListEditor items={q.items || []} min={2} addLabel="Добавить элемент" add={() => ({ id: uid(), text: '' })} onChange={(items) => set({ items })}
            render={(it, i, upd) => (<><span className="q-num">{i + 1}</span><input className="input" value={it.text} placeholder={`Шаг ${i + 1}`} onChange={(e) => upd({ text: e.target.value })} /></>)} />
        </div>
      );
    case 'match':
      return (
        <div className="field">
          <label>Пары для сопоставления</label>
          <ListEditor items={q.pairs || []} min={2} addLabel="Добавить пару" add={() => ({ id: uid(), left: '', right: '' })} onChange={(pairs) => set({ pairs })}
            render={(p, i, upd) => (<>
              <input className="input" value={p.left} placeholder="Слева (термин)" onChange={(e) => upd({ left: e.target.value })} />
              <span className="pair-link" />
              <input className="input" value={p.right} placeholder="Справа (определение)" onChange={(e) => upd({ right: e.target.value })} />
            </>)} />
        </div>
      );
    case 'text':
      return (
        <div className="field">
          <div className="stack mb-8" style={{ gap: 8 }}>
            <Toggle checked={q.anyAnswer} onChange={(v) => set({ anyAnswer: v })} label="Засчитывать любой непустой ответ" hint="Для открытых вопросов без единственно верного ответа" />
            {!q.anyAnswer && <Toggle checked={q.caseSensitive} onChange={(v) => set({ caseSensitive: v })} label="Учитывать регистр (заглавные/строчные)" />}
          </div>
          {!q.anyAnswer && <>
            <label>Правильные ответы <span className="hint">— можно указать несколько вариантов написания</span></label>
            <ListEditor items={(q.answers || ['']).map((v, i) => ({ id: i, v }))} min={1} addLabel="Добавить вариант ответа" add={() => ({ id: Math.random(), v: '' })}
              onChange={(list) => set({ answers: list.map((x) => x.v) })}
              render={(it, i, upd) => <input className="input" value={it.v} placeholder="Правильный ответ" onChange={(e) => upd({ v: e.target.value })} />} />
          </>}
        </div>
      );
    case 'number':
      return (
        <div className="field">
          <div className="stack mb-8" style={{ gap: 8 }}>
            <Toggle checked={q.integerOnly} onChange={(v) => set({ integerOnly: v })} label="Только целые числа" />
            <Toggle checked={q.range} onChange={(v) => set({ range: v })} label="Правильный ответ — в диапазоне" />
          </div>
          {q.range ? (
            <div className="row">
              <input className="input" style={{ width: 160 }} value={q.min} placeholder="От" onChange={(e) => set({ min: e.target.value })} />
              <span className="muted">—</span>
              <input className="input" style={{ width: 160 }} value={q.max} placeholder="До" onChange={(e) => set({ max: e.target.value })} />
            </div>
          ) : (
            <ListEditor items={(q.answers || ['']).map((v, i) => ({ id: i, v }))} min={1} addLabel="Добавить вариант" add={() => ({ id: Math.random(), v: '' })}
              onChange={(list) => set({ answers: list.map((x) => x.v) })}
              render={(it, i, upd) => <input className="input" inputMode="decimal" value={it.v} placeholder="Верное число" onChange={(e) => upd({ v: e.target.value })} />} />
          )}
        </div>
      );
    default:
      return null;
  }
}

function SortableQuestion({ q, index, open, onToggle, onChange, onDuplicate, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: q.id });
  const t = typeInfo(q);
  const problem = questionProblem(q);
  const set = (patch) => onChange({ ...q, ...patch });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={`card q-card ${isDragging ? 'dragging' : ''}`}>
      <div className="q-card-head" onClick={onToggle}>
        <button type="button" className="drag-handle" {...attributes} {...listeners} onClick={(e) => e.stopPropagation()} aria-label="Перетащить"><GripVertical size={16} /></button>
        <span className="q-num">{index + 1}</span>
        <t.icon size={17} className="muted" />
        <span className="flex-1 ellipsis" style={{ fontWeight: 550 }}>{q.text || <span className="faint">Новый вопрос — {t.label.toLowerCase()}</span>}</span>
        {problem && <span className="badge badge-warning" title={problem}><AlertTriangle size={12} />{problem}</span>}
        <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={(e) => { e.stopPropagation(); onDuplicate(); }} title="Дублировать"><Copy size={15} /></button>
        <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={(e) => { e.stopPropagation(); onRemove(); }} title="Удалить"><Trash2 size={15} /></button>
        {open ? <ChevronDown size={18} className="muted" /> : <ChevronRight size={18} className="muted" />}
      </div>
      {open && (
        <div className="q-card-body">
          <div className="field mt-16">
            <label>Вопрос</label>
            <textarea className="textarea" style={{ minHeight: 64 }} value={q.text} onChange={(e) => set({ text: e.target.value })} placeholder="Введите текст вопроса" autoFocus={!q.text} />
          </div>
          <ImagePick fileId={q.image} onChange={(image) => set({ image })} />
          <QuestionBody q={q} set={set} />
          <div className="field">
            <label>Пояснение после ответа <span className="hint">— необязательно, ученик увидит его в результатах</span></label>
            <textarea className="textarea" style={{ minHeight: 56 }} value={q.explanation || ''} onChange={(e) => set({ explanation: e.target.value })} placeholder="Почему правильный ответ именно такой" />
          </div>
        </div>
      )}
    </div>
  );
}

export default function QuestionsEditor({ questions, onChange }) {
  const [openId, setOpenId] = useState(questions[0]?.id || null);
  const [picker, setPicker] = useState(questions.length === 0);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const add = (kind) => {
    const q = newQuestion(kind);
    onChange((qs) => [...qs, q]);
    setOpenId(q.id); setPicker(false);
    setTimeout(() => document.getElementById(`q-${q.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  };
  return (
    <div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={({ active, over }) => {
        if (over && active.id !== over.id) onChange((qs) => arrayMove(qs, qs.findIndex((x) => x.id === active.id), qs.findIndex((x) => x.id === over.id)));
      }}>
        <SortableContext items={questions.map((q) => q.id)} strategy={verticalListSortingStrategy}>
          {questions.map((q, i) => (
            <div id={`q-${q.id}`} key={q.id}>
              <SortableQuestion q={q} index={i} open={openId === q.id} onToggle={() => setOpenId(openId === q.id ? null : q.id)}
                onChange={(nq) => onChange((qs) => qs.map((x) => (x.id === nq.id ? nq : x)))}
                onDuplicate={() => { const c = { ...structuredClone(q), id: uid() }; onChange((qs) => [...qs.slice(0, i + 1), c, ...qs.slice(i + 1)]); setOpenId(c.id); }}
                onRemove={() => onChange((qs) => qs.filter((x) => x.id !== q.id))} />
            </div>
          ))}
        </SortableContext>
      </DndContext>
      {picker ? (
        <div className="card card-pad" style={{ padding: 16 }}>
          <div className="row mb-8"><span className="label flex-1">Выберите тип вопроса</span>
            {questions.length > 0 && <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => setPicker(false)}><X size={16} /></button>}
          </div>
          <div className="palette" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
            {Q_TYPES.map((t) => (
              <button type="button" key={t.type} className="palette-item" style={{ alignItems: 'flex-start', textAlign: 'left', padding: 14 }} onClick={() => add(t.type)}>
                <t.icon size={20} /><span style={{ color: 'var(--text)', fontWeight: 650 }}>{t.label}</span><span className="xs muted" style={{ fontWeight: 400 }}>{t.desc}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <button type="button" className="btn btn-primary" onClick={() => setPicker(true)}><Plus size={16} />Добавить вопрос</button>
      )}
    </div>
  );
}
