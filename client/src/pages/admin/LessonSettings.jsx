import { useEffect, useState } from 'react';
import { GraduationCap, PenTool, ListChecks } from 'lucide-react';
import { api } from '../../api';
import { Modal, Field, Toggle } from '../../components/ui';

export const LESSON_TYPES = [
  { type: 'lecture', label: 'Урок', icon: GraduationCap, desc: 'Текст, видео, аудио, презентации, файлы для скачивания. Можно разбить на страницы.' },
  { type: 'assignment', label: 'Задание', icon: PenTool, desc: 'Ученик отправляет ответ (текст, файлы, аудио), куратор проверяет и принимает или возвращает на доработку.' },
  { type: 'test', label: 'Тест', icon: ListChecks, desc: 'Вопросы разных типов с автоматической проверкой, проходным баллом, таймером и попытками.' },
];

function NumToggle({ label, hint, value, onChange, suffix, min = 1, max, defaultOn = 1 }) {
  const on = Number(value) > 0;
  return (
    <div className="mb-16">
      <Toggle checked={on} onChange={(v) => onChange(v ? defaultOn : 0)} label={label} hint={hint} />
      {on && (
        <div className="row mt-8" style={{ paddingLeft: 48 }}>
          <input className="input input-sm" type="number" min={min} max={max} style={{ width: 120 }} value={value}
            onChange={(e) => onChange(Math.max(min, Math.min(max ?? 1e9, parseInt(e.target.value, 10) || 0)))} />
          {suffix && <span className="small muted">{suffix}</span>}
        </div>
      )}
    </div>
  );
}

export function SettingsFields({ type, s, set, staff }) {
  if (type === 'lecture') {
    return <NumToggle label="Начислять баллы за прохождение" hint="Баллы видны ученику и в статистике" value={s.points || 0} onChange={(v) => set({ points: v })} suffix="баллов" defaultOn={5} />;
  }
  if (type === 'assignment') {
    return (
      <>
        <NumToggle label="Оценивать в баллах" hint="Проверяющий поставит оценку от 0 до максимума" value={s.maxPoints || 0} onChange={(v) => set({ maxPoints: v })} suffix="максимум баллов" defaultOn={10} />
        <NumToggle label="Срок сдачи" hint="Отсчитывается от даты добавления ученика на курс" value={s.deadlineDays || 0} onChange={(v) => set({ deadlineDays: v })} suffix="дней" defaultOn={7} />
        {s.deadlineDays > 0 && <div className="mb-16" style={{ paddingLeft: 48 }}><Toggle checked={s.closeAfterDeadline} onChange={(v) => set({ closeAfterDeadline: v })} label="Не принимать ответы после срока" /></div>}
        <Field label="Кто проверяет" hint="Если выбрать сотрудника — уведомления о новых ответах придут только ему">
          <select className="select" value={s.reviewerId || ''} onChange={(e) => set({ reviewerId: e.target.value ? Number(e.target.value) : null })}>
            <option value="">Любой куратор или администратор</option>
            {staff.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.role === 'admin' ? 'администратор' : 'куратор'})</option>)}
          </select>
        </Field>
        <Toggle checked={s.autoAccept} onChange={(v) => set({ autoAccept: v })} label="Принимать ответы автоматически" hint="Без проверки — задание засчитывается сразу после отправки" />
      </>
    );
  }
  return (
    <>
      <Field label="Процент правильных ответов для сдачи">
        <div className="row"><input className="input" type="number" min={0} max={100} style={{ width: 120 }} value={s.passPercent ?? 60}
          onChange={(e) => set({ passPercent: Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0)) })} /><span className="muted">%</span></div>
      </Field>
      <Field label="Что показать ученику после теста">
        <select className="select" value={s.showAnswers || 'all'} onChange={(e) => set({ showAnswers: e.target.value })}>
          <option value="all">Все правильные ответы и пояснения</option>
          <option value="correct">Только где ответил верно / неверно (без правильных ответов)</option>
          <option value="none">Только итоговый результат</option>
        </select>
      </Field>
      <NumToggle label="Начислять баллы за успешную сдачу" value={s.points || 0} onChange={(v) => set({ points: v })} suffix="баллов" defaultOn={10} />
      <NumToggle label="Ограничить время" value={s.timeLimitMin || 0} onChange={(v) => set({ timeLimitMin: v })} suffix="минут" defaultOn={15} />
      <NumToggle label="Ограничить количество попыток" value={s.attemptsLimit || 0} onChange={(v) => set({ attemptsLimit: v })} suffix="попыток" defaultOn={3} />
      <NumToggle label="Банк вопросов" hint="Каждому ученику — случайные N вопросов из всех" value={s.bankCount || 0} onChange={(v) => set({ bankCount: v })} suffix="вопросов в попытке" defaultOn={10} />
      <div className="mb-16"><Toggle checked={s.shuffleQuestions} onChange={(v) => set({ shuffleQuestions: v })} label="Случайный порядок вопросов" /></div>
      <Toggle checked={s.shuffleOptions} onChange={(v) => set({ shuffleOptions: v })} label="Перемешивать варианты ответов" />
    </>
  );
}

export function useStaffList() {
  const [staff, setStaff] = useState([]);
  useEffect(() => {
    api.get('/admin/users?stats=0').then((list) => setStaff(list.filter((u) => u.role !== 'student' && u.isActive))).catch(() => {});
  }, []);
  return staff;
}

export default function LessonSettingsModal({ lesson, onClose, onSave }) {
  const [title, setTitle] = useState(lesson.title);
  const [s, setS] = useState(lesson.settings || {});
  const [busy, setBusy] = useState(false);
  const staff = useStaffList();
  const type = LESSON_TYPES.find((t) => t.type === lesson.type);
  const save = async () => {
    setBusy(true);
    try { await onSave({ title, settings: s }); onClose(); } finally { setBusy(false); }
  };
  return (
    <Modal title={`Настройки: ${type?.label.toLowerCase()}`} onClose={onClose} footer={<>
      <button className="btn btn-secondary" onClick={onClose}>Отмена</button>
      <button className="btn btn-primary" onClick={save} disabled={busy || !title.trim()}>Сохранить</button>
    </>}>
      <Field label="Название"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
      <SettingsFields type={lesson.type} s={s} set={(p) => setS({ ...s, ...p })} staff={staff} />
    </Modal>
  );
}

export function CreateLessonModal({ onClose, onCreate }) {
  const [type, setType] = useState(null);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e?.preventDefault();
    setBusy(true);
    try { await onCreate({ type, title: title.trim() || LESSON_TYPES.find((t) => t.type === type).label }); onClose(); } finally { setBusy(false); }
  };
  return (
    <Modal title={type ? `Новое занятие: ${LESSON_TYPES.find((t) => t.type === type).label.toLowerCase()}` : 'Выберите тип занятия'} onClose={onClose}
      footer={type ? <>
        <button className="btn btn-secondary" onClick={() => setType(null)}>Назад</button>
        <button className="btn btn-primary" onClick={submit} disabled={busy}>Создать</button>
      </> : null}>
      {!type ? (
        <div className="radio-cards" style={{ paddingBottom: 16 }}>
          {LESSON_TYPES.map((t) => (
            <div key={t.type} className="radio-card" onClick={() => setType(t.type)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setType(t.type)}>
              <span className="stat-icon" style={{ width: 40, height: 40 }}><t.icon size={20} /></span>
              <div><div className="bold">{t.label}</div><div className="small muted">{t.desc}</div></div>
            </div>
          ))}
        </div>
      ) : (
        <form onSubmit={submit}>
          <Field label="Название"><input className="input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder={type === 'test' ? 'Например: Тест по модулю 1' : type === 'assignment' ? 'Например: Практическое задание' : 'Например: Урок 1. Знакомство с компанией'} /></Field>
        </form>
      )}
    </Modal>
  );
}
