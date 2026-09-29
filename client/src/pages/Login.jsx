import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { GraduationCap, Mail, KeyRound, Eye, EyeOff } from 'lucide-react';
import { api } from '../api';
import { useAuth, applyTheme } from '../App';

export default function Login() {
  const auth = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [settings, setSettings] = useState(auth.settings);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/public/settings').then((s) => { setSettings(s); applyTheme(s); }).catch(() => {});
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const { user } = await api.post('/auth/login', { email, password });
      const home = user.role === 'admin' ? '/admin/courses' : user.role === 'curator' ? '/admin/reviews' : '/';
      const target = loc.pathname && loc.pathname !== '/' && loc.pathname !== '/login' ? loc.pathname + loc.search : home;
      nav(target, { replace: true });
      await auth.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

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
          <h1>Учитесь в удобном темпе — с любого устройства</h1>
          <p>{settings?.loginText || 'Корпоративная платформа обучения сотрудников'}</p>
        </div>
        <div style={{ opacity: .7, fontSize: 13 }}>Доступ выдаёт администратор платформы</div>
      </div>
      <div className="login-form-wrap">
        <form className="login-form" onSubmit={submit}>
          <h2>Вход</h2>
          <p className="muted mb-16">Введите email и пароль, которые вам выдали</p>
          <div className="field">
            <label htmlFor="email">Email</label>
            <div className="input-group">
              <Mail size={17} />
              <input id="email" className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus placeholder="name@company.ru" />
            </div>
          </div>
          <div className="field">
            <label htmlFor="password">Пароль</label>
            <div className="input-group">
              <KeyRound size={17} />
              <input id="password" className="input" type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required style={{ paddingRight: 44 }} />
              <button type="button" className="btn btn-ghost btn-icon btn-sm" style={{ position: 'absolute', right: 6 }} onClick={() => setShow(!show)} aria-label="Показать пароль">
                {show ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </div>
          {error && <div className="alert alert-danger mb-16">{error}</div>}
          <button className="btn btn-primary btn-lg btn-block" disabled={busy}>{busy ? 'Входим…' : 'Войти'}</button>
          <p className="hint mt-16" style={{ textAlign: 'center' }}>Забыли пароль? Обратитесь к администратору — он выдаст новый.</p>
        </form>
      </div>
    </div>
  );
}
