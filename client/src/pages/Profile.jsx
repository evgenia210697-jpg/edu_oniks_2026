import { useState } from 'react';
import { Camera, LogOut } from 'lucide-react';
import { api, uploadFile } from '../api';
import { useAuth } from '../App';
import { Avatar, Field, Toggle, useToast } from '../components/ui';
import { ROLE_LABEL } from '../utils';

export default function Profile() {
  const { user, setUser, logout } = useAuth();
  const toast = useToast();
  const [f, setF] = useState({ name: user.name, phone: user.phone, city: user.city, about: user.about, avatarFileId: user.avatarFileId, emailNotify: user.emailNotify });
  const [avatarPreview, setAvatarPreview] = useState(user.avatar);
  const [pw, setPw] = useState({ current: '', next: '', repeat: '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const pickAvatar = () => {
    const i = document.createElement('input');
    i.type = 'file'; i.accept = 'image/*';
    i.onchange = async () => {
      const file = i.files?.[0]; if (!file) return;
      try { const r = await uploadFile(file, { scope: 'avatar' }); setF((x) => ({ ...x, avatarFileId: r.id })); setAvatarPreview(r.url); } catch (e) { toast.error(e); }
    };
    i.click();
  };
  const save = async (e) => {
    e.preventDefault(); setBusy(true);
    try { const r = await api.put('/auth/profile', f); setUser(r.user); toast('Профиль сохранён'); } catch (err) { toast.error(err); } finally { setBusy(false); }
  };
  const changePw = async (e) => {
    e.preventDefault();
    if (pw.next !== pw.repeat) { toast.error('Пароли не совпадают'); return; }
    try { await api.put('/auth/password', { current: pw.current, next: pw.next }); toast('Пароль изменён'); setPw({ current: '', next: '', repeat: '' }); } catch (err) { toast.error(err); }
  };

  return (
    <div>
      <div className="page-head"><h1>Мой профиль</h1><button className="btn btn-secondary" onClick={logout}><LogOut size={16} />Выйти</button></div>
      <div className="profile-grid">
        <form className="card card-pad" onSubmit={save}>
          <div className="avatar-edit">
            <Avatar user={{ ...user, name: f.name, avatar: avatarPreview }} size="avatar-xl" />
            <div>
              <div className="bold" style={{ fontSize: 18 }}>{user.name}</div>
              <div className="muted small">{ROLE_LABEL[user.role]}{user.position ? ` · ${user.position}` : ''}{user.department ? ` · ${user.department}` : ''}</div>
              <button type="button" className="btn btn-secondary btn-sm mt-8" onClick={pickAvatar}><Camera size={15} />Сменить фото</button>
            </div>
          </div>
          <Field label="Email (логин)" hint="Изменить email может администратор"><input className="input" value={user.email} disabled /></Field>
          <Field label="Имя и фамилия"><input className="input" value={f.name} onChange={set('name')} required /></Field>
          <div className="grid-2">
            <Field label="Телефон"><input className="input" value={f.phone} onChange={set('phone')} placeholder="+7 …" /></Field>
            <Field label="Город"><input className="input" value={f.city} onChange={set('city')} /></Field>
          </div>
          <Field label="О себе"><textarea className="textarea" value={f.about} onChange={set('about')} placeholder="Пара слов о себе и опыте" /></Field>
          <div className="mb-16"><Toggle checked={f.emailNotify} onChange={(v) => setF({ ...f, emailNotify: v })} label="Дублировать уведомления на email" hint="Работает, если администратор настроил почту" /></div>
          <button className="btn btn-primary" disabled={busy}>Сохранить</button>
        </form>
        <form className="card card-pad" onSubmit={changePw}>
          <h3 className="mb-16">Смена пароля</h3>
          <Field label="Текущий пароль"><input className="input" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required /></Field>
          <Field label="Новый пароль" hint="Не короче 6 символов"><input className="input" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} required minLength={6} /></Field>
          <Field label="Повторите новый пароль"><input className="input" type="password" autoComplete="new-password" value={pw.repeat} onChange={(e) => setPw({ ...pw, repeat: e.target.value })} required /></Field>
          <button className="btn btn-secondary">Изменить пароль</button>
        </form>
      </div>
    </div>
  );
}
