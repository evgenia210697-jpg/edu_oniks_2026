import { useEffect, useState, useCallback, useRef } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  GraduationCap, BookOpen, LayoutGrid, Users, ClipboardCheck, Settings as Cog, Bell, Menu as Burger, LogOut, User, CheckCheck, Search,
} from 'lucide-react';
import CommandPalette from './CommandPalette';
import { useAuth } from '../App';
import { api } from '../api';
import { Avatar, Menu, MenuItem } from './ui';
import { fmtRelative, ROLE_LABEL } from '../utils';

function Notifications() {
  const nav = useNavigate();
  const [data, setData] = useState({ unread: 0, items: [] });
  const load = useCallback(() => api.get('/notifications').then(setData).catch(() => {}), []);
  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    window.addEventListener('lms:refresh-notifications', onFocus);
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus); window.removeEventListener('lms:refresh-notifications', onFocus); };
  }, [load]);
  const readAll = async () => { await api.post('/notifications/read', {}); load(); };
  const open = async (n, close) => {
    close();
    if (!n.read) api.post('/notifications/read', { ids: [n.id] }).then(load);
    if (n.link) nav(n.link);
  };
  return (
    <Menu className="notif-panel" trigger={({ toggle }) => (
      <button className="btn btn-ghost btn-icon" onClick={() => { toggle(); load(); }} aria-label="Уведомления" style={{ position: 'relative' }}>
        <Bell size={20} />
        {data.unread > 0 && <span className="bell-dot">{data.unread > 99 ? '99+' : data.unread}</span>}
      </button>
    )}>
      {({ close }) => (
        <>
          <div className="notif-head">
            <h3>Уведомления</h3>
            {data.unread > 0 && <button className="btn btn-ghost btn-sm" onClick={readAll}><CheckCheck size={15} />Прочитать все</button>}
          </div>
          <div className="notif-list">
            {data.items.length === 0 && <div className="empty small" style={{ padding: 30 }}>Пока уведомлений нет</div>}
            {data.items.map((n) => (
              <div key={n.id} className={`notif ${n.read ? '' : 'unread'}`} onClick={() => open(n, close)}>
                <div className="flex-1">
                  <div className="notif-title">{n.title}</div>
                  {n.body && <div className="notif-body">{n.body}</div>}
                  <div className="notif-time">{fmtRelative(n.createdAt)}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Menu>
  );
}

export default function Layout({ children }) {
  const { user, settings, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(0);
  const loc = useLocation();
  const nav = useNavigate();
  const isStaff = user.role === 'admin' || user.role === 'curator';
  const isAdmin = user.role === 'admin';

  const [searchOpen, setSearchOpen] = useState(false);
  const mainRef = useRef(null);
  const prevSection = useRef(null);
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '');

  useEffect(() => { setOpen(false); }, [loc.pathname]);
  // Плавное появление при переходе в другой раздел (внутри одного курса/урока — без анимации всей страницы)
  useEffect(() => {
    const section = loc.pathname.replace(/\/lesson\/\d+$/, '/lesson').replace(/^(\/admin\/courses\/\d+)\/.*$/, '$1');
    const el = mainRef.current;
    if (el && prevSection.current !== null && prevSection.current !== section) {
      el.classList.remove('route-in');
      void el.offsetWidth; // перезапуск анимации
      el.classList.add('route-in');
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
    prevSection.current = section;
  }, [loc.pathname]);
  // Ctrl+K / ⌘K — быстрый поиск
  useEffect(() => {
    const h = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K' || e.code === 'KeyK')) { e.preventDefault(); setSearchOpen((v) => !v); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
  useEffect(() => {
    if (!isStaff) return;
    const load = () => api.get('/admin/submissions/count').then((r) => setPending(r.pending)).catch(() => {});
    load();
    const t = setInterval(load, 60000);
    window.addEventListener('lms:refresh-pending', load);
    return () => { clearInterval(t); window.removeEventListener('lms:refresh-pending', load); };
  }, [isStaff, loc.pathname]);

  const link = (to, Icon, label, extra) => (
    <NavLink to={to} end={to === '/'} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
      <Icon size={19} /><span>{label}</span>{extra}
    </NavLink>
  );

  return (
    <div className="app">
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <div className="brand-logo">{settings?.logo ? <img src={settings.logo} alt="" /> : <GraduationCap size={20} />}</div>
          <div className="brand-name">{settings?.platformName || 'Учебный центр'}</div>
        </div>
        <nav className="sidebar-nav">
          <div className="nav-group">
            {isStaff && <div className="nav-group-title">Обучение</div>}
            {link('/', BookOpen, 'Моё обучение')}
          </div>
          {isStaff && (
            <div className="nav-group">
              <div className="nav-group-title">Управление</div>
              {isAdmin && link('/admin/courses', LayoutGrid, 'Курсы')}
              {link('/admin/users', Users, 'Сотрудники')}
              {link('/admin/reviews', ClipboardCheck, 'Проверка заданий', pending > 0 ? <span className="nav-badge">{pending}</span> : null)}
              {isAdmin && link('/admin/settings', Cog, 'Настройки')}
            </div>
          )}
        </nav>
        <div className="sidebar-foot">
          <NavLink to="/profile" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} style={{ marginBottom: 0 }}>
            <Avatar user={user} size="avatar-sm" />
            <span className="flex-1" style={{ lineHeight: 1.25 }}>
              <span className="ellipsis" style={{ display: 'block' }}>{user.name}</span>
              <span className="xs muted">{ROLE_LABEL[user.role]}</span>
            </span>
          </NavLink>
        </div>
      </aside>
      <div className={`backdrop ${open ? 'show' : ''}`} onClick={() => setOpen(false)} />
      <div className="main">
        <header className="topbar">
          <button className="btn btn-ghost btn-icon burger" onClick={() => setOpen(true)} aria-label="Меню"><Burger size={20} /></button>
          <button type="button" className="search-trigger" onClick={() => setSearchOpen(true)} aria-label="Поиск по платформе">
            <Search size={17} /><span className="st-text">Поиск</span><kbd>{isMac ? '⌘' : 'Ctrl'} K</kbd>
          </button>
          <div className="spacer" />
          <Notifications />
          <Menu trigger={({ toggle }) => (
            <button className="btn btn-ghost" style={{ padding: '0 6px', height: 44 }} onClick={toggle} aria-label="Профиль"><Avatar user={user} /></button>
          )}>
            <div style={{ padding: '8px 10px 10px' }}>
              <div className="bold">{user.name}</div>
              <div className="xs muted">{user.email}</div>
            </div>
            <div className="menu-sep" />
            <MenuItem icon={User} onClick={() => nav('/profile')}>Мой профиль</MenuItem>
            <MenuItem icon={LogOut} danger onClick={logout}>Выйти</MenuItem>
          </Menu>
        </header>
        <main className="content" ref={mainRef}>{children}</main>
        {searchOpen && <CommandPalette onClose={() => setSearchOpen(false)} />}
      </div>
    </div>
  );
}
