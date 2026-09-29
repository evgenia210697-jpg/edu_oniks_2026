import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Search, BookOpen, LayoutGrid, Users, ClipboardCheck, Settings, User, Plus, UserPlus, CornerDownLeft, GraduationCap, PenTool, ListChecks } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../App';
import { Avatar } from './ui';

const LESSON_ICON = { lecture: GraduationCap, assignment: PenTool, test: ListChecks };

// Быстрые действия, доступные без ввода текста
function quickActions(role) {
  const list = [{ key: 'a-learn', title: 'Моё обучение', sub: 'Мои курсы и прогресс', icon: BookOpen, link: '/' }];
  if (role === 'admin') {
    list.push(
      { key: 'a-courses', title: 'Курсы', sub: 'Конструктор курсов', icon: LayoutGrid, link: '/admin/courses' },
      { key: 'a-new-course', title: 'Создать курс', sub: 'Откроется окно создания', icon: Plus, link: '/admin/courses?new=1' },
    );
  }
  if (role === 'admin' || role === 'curator') {
    list.push(
      { key: 'a-users', title: 'Сотрудники', sub: 'Ученики, кураторы и статистика', icon: Users, link: '/admin/users' },
      { key: 'a-reviews', title: 'Проверка заданий', sub: 'Работы, которые ждут проверки', icon: ClipboardCheck, link: '/admin/reviews' },
    );
  }
  if (role === 'admin') {
    list.push(
      { key: 'a-new-user', title: 'Добавить сотрудника', sub: 'Выдать доступ к платформе', icon: UserPlus, link: '/admin/users?new=1' },
      { key: 'a-settings', title: 'Настройки', sub: 'Название, логотип, фирменный цвет', icon: Settings, link: '/admin/settings' },
    );
  }
  list.push({ key: 'a-profile', title: 'Мой профиль', sub: 'Фото, контакты, пароль', icon: User, link: '/profile' });
  return list;
}

export default function CommandPalette({ onClose }) {
  const { user } = useAuth();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(0);
  const listRef = useRef(null);

  useEffect(() => {
    const term = q.trim();
    if (!term) { setRes(null); setBusy(false); return undefined; }
    setBusy(true);
    const t = setTimeout(() => {
      api.get(`/search?q=${encodeURIComponent(term)}`).then((r) => { setRes(r); setBusy(false); }).catch(() => setBusy(false));
    }, 140);
    return () => clearTimeout(t);
  }, [q]);

  const term = q.trim().toLowerCase();
  const groups = useMemo(() => {
    const actions = quickActions(user.role).filter((a) => !term || a.title.toLowerCase().includes(term));
    const g = [];
    if (res?.courses?.length) g.push({ title: 'Курсы', items: res.courses.map((c) => ({ key: `c${c.id}`, ...c, icon: BookOpen })) });
    if (res?.lessons?.length) g.push({ title: 'Занятия', items: res.lessons.map((l) => ({ key: `l${l.id}`, ...l, icon: LESSON_ICON[l.type] || GraduationCap })) });
    if (res?.users?.length) g.push({ title: 'Сотрудники', items: res.users.map((u) => ({ key: `u${u.id}`, ...u, person: true })) });
    if (actions.length) g.push({ title: term ? 'Разделы' : 'Быстрый переход', items: actions });
    return g;
  }, [res, term, user.role]);
  const flat = groups.flatMap((g) => g.items);

  useEffect(() => { setActive(0); }, [res, term]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const go = (item) => { if (!item) return; onClose(); nav(item.link); };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(flat.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); go(flat[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  let idx = -1;
  return createPortal(
    <div className="cmdk-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cmdk" role="dialog" aria-modal="true" aria-label="Поиск по платформе">
        <div className="cmdk-input">
          <Search size={19} />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey}
            placeholder={user.role === 'student' ? 'Найти курс или урок…' : 'Найти курс, урок, сотрудника или раздел…'} aria-label="Поиск" />
          {busy ? <span className="spinner sm" /> : <kbd>Esc</kbd>}
        </div>
        <div className="cmdk-list" ref={listRef}>
          {groups.map((g) => (
            <div key={g.title} className="cmdk-group">
              <div className="cmdk-group-title">{g.title}</div>
              {g.items.map((it) => {
                idx += 1;
                const i = idx;
                const Icon = it.icon;
                return (
                  <button key={it.key} type="button" data-idx={i} className={`cmdk-item ${i === active ? 'active' : ''}`}
                    onMouseMove={() => setActive(i)} onClick={() => go(it)}>
                    {it.person ? <Avatar user={{ name: it.title, avatar: it.avatar }} size="avatar-sm" /> : <span className="cmdk-ic"><Icon size={17} /></span>}
                    <span className="cmdk-text"><span className="cmdk-title">{it.title}</span>{it.sub && <span className="cmdk-sub">{it.sub}</span>}</span>
                    {i === active && <CornerDownLeft size={15} className="cmdk-enter" />}
                  </button>
                );
              })}
            </div>
          ))}
          {term && !busy && res && flat.length === 0 && <div className="cmdk-empty">Ничего не нашлось по запросу «{q.trim()}»</div>}
        </div>
        <div className="cmdk-foot"><span><kbd>↑</kbd><kbd>↓</kbd> выбрать</span><span><kbd>Enter</kbd> открыть</span><span><kbd>Esc</kbd> закрыть</span></div>
      </div>
    </div>,
    document.body,
  );
}
