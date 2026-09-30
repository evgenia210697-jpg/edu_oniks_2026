import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { GraduationCap, KeyRound, Eye, EyeOff, User, Mail, CheckCircle2, AlertCircle, LogOut } from 'lucide-react';
import { api } from '../api';
import { useAuth, applyTheme } from '../App';
import { Spinner } from '../components/ui';

/** Оценка надёжности пароля — подсказка, а не запрет */
function strength(pw) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-zа-яё]/.test(pw) && /[A-ZА-ЯЁ]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^\wа-яё]/i.test(pw)) score++;
  if (pw.length < 6) return { level: 0, text: 'Минимум 6 символов' };
  if (score <= 1) return { level: 1, text: 'Простой пароль' };
  if (score <= 3) return { level: 2, text: 'Нормальный пароль' };
  return { level: 3, text: 'Надёжный пароль' };
}

/** Страница по ссылке из письма: сотрудник задаёт имя и пароль и сразу попадает на платформу */
export default function Invite() {
  const { token } = useParams();
  const auth = useAuth();
  const nav = useNavigate();
  const [settings, setSettings] = useState(auth.settings);
  const [info, setInfo] = useState(null);
  const [problem, setProblem] = useState(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.get('/public/settings').then((s) => { setSettings(s); applyTheme(s); }).catch(() => {}); }, []);
  useEffect(() => {
    api.get(`/auth/invite/${encodeURIComponent(token)}`)
      .then((r) => { setInfo(r); setName(r.name || ''); })
      .catch((e) => setProblem({ expired: e.status === 410, text: e.message }));
  }, [token]);

  const st = strength(password);
  const mismatch = repeat && repeat !== password;
  const submit = async (e) => {
    e.preventDefault();
    if (password.length < 6) { setError('Пароль — минимум 6 символов'); return; }
    if (password !== repeat) { setError('Пароли не совпадают'); return; }
    setError(''); setBusy(true);
    try {
      await api.post(`/auth/invite/${encodeURIComponent(token)}`, { name, password });
      nav('/', { replace: true });
      await auth.refresh();
    } catch (err) { setError(err.message); setBusy(false); }
  };

  const loggedInAs = auth.user;
  let body;
  if (loggedInAs && !busy) {
    body = (
      <div className="invite-state">
        <span className="invite-ic"><User size={24} /></span>
        <h2>Вы уже вошли</h2>
        <p className="muted">Сейчас открыт аккаунт <b>{loggedInAs.name}</b>. Чтобы принять приглашение для другого сотрудника, выйдите из аккаунта.</p>
        <div className="row mt-16" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-primary" onClick={async () => { await auth.logout(); }}><LogOut size={16} />Выйти и принять приглашение</button>
          <Link to="/" className="btn btn-secondary">Остаться</Link>
        </div>
      </div>
    );
  } else if (problem) {
    body = (
      <div className="invite-state">
        <span className="invite-ic bad"><AlertCircle size={24} /></span>
        <h2>{problem.expired ? 'Срок приглашения истёк' : 'Ссылка не работает'}</h2>
        <p className="muted">{problem.expired
          ? 'Приглашение действует 7 дней. Попросите администратора платформы отправить его снова — придёт новое письмо.'
          : 'Возможно, приглашение уже приняли или администратор отправил новое письмо. Если вы уже задали пароль — просто войдите.'}</p>
        <Link to="/" className="btn btn-primary btn-block mt-16">Перейти ко входу</Link>
      </div>
    );
  } else if (!info) {
    body = <div className="invite-state"><Spinner /></div>;
  } else {
    body = (
      <form className="login-form" onSubmit={submit}>
        <span className="invite-ic ok"><CheckCircle2 size={24} /></span>
        <h2>Добро пожаловать!</h2>
        <p className="muted mb-16">{info.invitedBy ? `${info.invitedBy} пригласил(а) вас` : 'Вас пригласили'} на платформу обучения. Осталось указать имя и придумать пароль.</p>
        <div className="field">
          <label>Email — это ваш логин</label>
          <div className="input-group"><Mail size={17} /><input className="input" value={info.email} readOnly tabIndex={-1} /></div>
        </div>
        <div className="field">
          <label htmlFor="inv-name">Имя и фамилия</label>
          <div className="input-group"><User size={17} /><input id="inv-name" className="input" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" placeholder="Иванов Иван" autoFocus={!name} /></div>
        </div>
        <div className="field">
          <label htmlFor="inv-pass">Придумайте пароль</label>
          <div className="input-group">
            <KeyRound size={17} />
            <input id="inv-pass" className="input" type={show ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} style={{ paddingRight: 44 }} autoFocus={!!name} />
            <button type="button" className="btn btn-ghost btn-icon btn-sm" style={{ position: 'absolute', right: 6 }} onClick={() => setShow(!show)} aria-label="Показать пароль">{show ? <EyeOff size={17} /> : <Eye size={17} />}</button>
          </div>
          {password && (
            <div className={`pw-meter l${st.level}`}><span /><span /><span /><em>{st.text}</em></div>
          )}
        </div>
        <div className="field">
          <label htmlFor="inv-pass2">Повторите пароль</label>
          <div className="input-group"><KeyRound size={17} /><input id="inv-pass2" className="input" type={show ? 'text' : 'password'} autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} required /></div>
          {mismatch && <div className="hint" style={{ color: 'var(--danger)' }}>Пароли не совпадают</div>}
        </div>
        {error && <div className="alert alert-danger mb-16">{error}</div>}
        <button className="btn btn-primary btn-lg btn-block" disabled={busy || !name.trim() || password.length < 6 || password !== repeat}>
          {busy ? 'Входим…' : 'Начать обучение'}
        </button>
        <p className="hint mt-16" style={{ textAlign: 'center' }}>Уже задавали пароль? <Link to="/">Войти</Link></p>
      </form>
    );
  }

  return (
    <div className="login-page">
      <div className="login-art">
        <div className="hero-deco" /><div className="hero-deco two" />
        <div className="row">
          <div className="brand-logo" style={{ background: 'rgba(255,255,255,.18)' }}>
            {settings?.logo ? <img src={settings.logo} alt="" /> : <GraduationCap size={20} />}
          </div>
          <div className="brand-name">{settings?.platformName || 'Учебный центр'}</div>
        </div>
        <div>
          <h1>Вас пригласили на платформу обучения</h1>
          <p>{settings?.loginText || 'Корпоративная платформа обучения сотрудников'}</p>
        </div>
        <div style={{ opacity: .7, fontSize: 13 }}>Ссылка личная — не пересылайте её другим</div>
      </div>
      <div className="login-form-wrap">{body}</div>
    </div>
  );
}
