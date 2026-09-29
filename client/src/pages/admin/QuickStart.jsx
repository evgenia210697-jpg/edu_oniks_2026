import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronRight, Rocket, X } from 'lucide-react';
import { useApi } from '../../components/ui';
import { useAuth } from '../../App';

const HIDE_KEY = 'lms-quickstart-hidden';
// Демонстрационные курсы и тестовый ученик не считаются — шаги про «ваши» курсы и сотрудников
const isExample = (c) => /\(пример\)/i.test(c.title);

/** Пошаговый запуск платформы для администратора. Скрывается сам, когда всё сделано */
export default function QuickStart({ courses }) {
  const { settings } = useAuth();
  const users = useApi('/admin/users?stats=0');
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(HIDE_KEY) === '1'; } catch { return false; } });
  if (hidden || !users.data) return null;

  const own = courses.filter((c) => !isExample(c));
  const staffAndStudents = users.data.filter((u) => u.email !== 'student@company.local');
  const steps = [
    { done: !!(settings?.logo || (settings?.accentColor || '').toLowerCase() !== '#e4570f' || (settings?.platformName && settings.platformName !== 'Учебный центр')),
      title: 'Оформите платформу', text: 'Название, логотип и фирменный цвет компании', to: '/admin/settings', cta: 'Настройки' },
    { done: own.length > 0, title: 'Создайте первый курс', text: 'Например, «Адаптация новых сотрудников»', to: '/admin/courses?new=1', cta: 'Создать курс' },
    { done: own.some((c) => c.lessonsCount > 0), title: 'Добавьте уроки, тесты и задания', text: 'Видео, презентации, файлы и проверка знаний', to: own[0] ? `/admin/courses/${own[0].id}` : '/admin/courses?new=1', cta: 'Открыть конструктор' },
    { done: staffAndStudents.length > 1, title: 'Добавьте сотрудников', text: 'По одному или списком из Excel', to: '/admin/users?new=1', cta: 'Добавить' },
    { done: own.some((c) => c.status === 'published' && c.studentsCount > 0), title: 'Опубликуйте курс и откройте его сотрудникам', text: 'Они получат уведомление и смогут начать обучение', to: own[0] ? `/admin/courses/${own[0].id}/students` : '/admin/courses', cta: 'Ученики курса' },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null;
  const hide = () => { setHidden(true); try { localStorage.setItem(HIDE_KEY, '1'); } catch { /* */ } };
  const current = steps.findIndex((s) => !s.done);

  return (
    <div className="card quickstart">
      <div className="qs-head">
        <span className="qs-icon"><Rocket size={20} /></span>
        <div className="flex-1">
          <h3>Быстрый старт</h3>
          <div className="small muted">Пять шагов, чтобы запустить обучение сотрудников · выполнено {doneCount} из {steps.length}</div>
        </div>
        <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={hide} title="Скрыть" aria-label="Скрыть быстрый старт"><X size={16} /></button>
      </div>
      <div className="qs-progress"><div style={{ width: `${(doneCount / steps.length) * 100}%` }} /></div>
      <ol className="qs-steps">
        {steps.map((s, i) => (
          <li key={s.title} className={`${s.done ? 'done' : ''} ${i === current ? 'current' : ''}`}>
            <span className="qs-num">{s.done ? <Check size={14} strokeWidth={3} /> : i + 1}</span>
            <div className="flex-1"><div className="qs-title">{s.title}</div><div className="qs-text">{s.text}</div></div>
            {!s.done && <Link to={s.to} className={`btn btn-sm ${i === current ? 'btn-primary' : 'btn-ghost'}`}>{s.cta}<ChevronRight size={15} /></Link>}
          </li>
        ))}
      </ol>
    </div>
  );
}
