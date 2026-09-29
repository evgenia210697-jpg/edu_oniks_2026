// Точка входа демо-версии: сначала запускаем «сервер» в браузере, потом обычный интерфейс платформы
import { createRoot } from 'react-dom/client';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { boot, resetDemo } from './runtime';
import './demo.css';

const navigateRef = { current: null };

function NavBridge() {
  navigateRef.current = useNavigate();
  return null;
}

// Быстрый вход: при необходимости выходим из текущего аккаунта, заполняем форму входа и отправляем её
async function quickLogin(email, password) {
  if (!document.getElementById('password')) {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.dispatchEvent(new Event('lms:unauthorized'));
    for (let i = 0; i < 40 && !document.getElementById('password'); i++) await new Promise((r) => setTimeout(r, 50));
  }
  const set = (id, v) => {
    const el = document.getElementById(id);
    if (!el) return;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const tick = () => new Promise((r) => setTimeout(r, 30));
  set('email', email); await tick();
  set('password', password); await tick();
  document.getElementById('password')?.form?.requestSubmit();
}

function DemoPanel() {
  const [open, setOpenState] = useState(() => { try { return localStorage.getItem('lms-demo-panel') !== 'closed'; } catch { return true; } });
  const setOpen = (v) => { setOpenState(v); try { localStorage.setItem('lms-demo-panel', v ? 'open' : 'closed'); } catch { /* */ } };
  const [confirmReset, setConfirmReset] = useState(false);
  if (!open) return <button type="button" className="demo-fab" onClick={() => setOpen(true)}>Демо · сменить роль</button>;
  return (
    <div className="demo-panel" role="region" aria-label="Демо-версия">
      <div className="demo-head">
        <b>Демо-версия платформы</b>
        <button type="button" className="demo-x" onClick={() => setOpen(false)} aria-label="Свернуть">×</button>
      </div>
      <p>Всё работает прямо в вашем браузере: изменения сохраняются только здесь и не видны другим.</p>
      <div className="demo-logins">
        <button type="button" onClick={() => { setOpen(false); quickLogin('admin@company.local', 'admin12345'); }}>Войти как администратор</button>
        <button type="button" onClick={() => { setOpen(false); quickLogin('student@company.local', 'student12345'); }}>Войти как ученик</button>
      </div>
      <div className="demo-creds">
        <span>admin@company.local · admin12345</span>
        <span>student@company.local · student12345</span>
      </div>
      {confirmReset ? (
        <div className="demo-reset">
          <span>Удалить все изменения и вернуть пример?</span>
          <button type="button" className="danger" onClick={resetDemo}>Сбросить</button>
          <button type="button" onClick={() => setConfirmReset(false)}>Отмена</button>
        </div>
      ) : (
        <button type="button" className="demo-link" onClick={() => setConfirmReset(true)}>Сбросить демо к исходному виду</button>
      )}
    </div>
  );
}

(async () => {
  const root = createRoot(document.getElementById('root'));
  try {
    await boot({ navigateRef });
  } catch (e) {
    console.error(e);
    root.render(<div className="demo-fail"><h2>Не удалось запустить демо</h2><p>{String(e.message || e)}</p></div>);
    return;
  }
  const [{ default: App }, ui] = await Promise.all([import('../client/src/App'), import('../client/src/components/ui')]);
  await import('../client/src/styles.css');
  const { ToastProvider, ConfirmProvider, PromptProvider } = ui;
  root.render(
    <MemoryRouter>
      <NavBridge />
      <ToastProvider>
        <ConfirmProvider>
          <PromptProvider>
            <App />
          </PromptProvider>
        </ConfirmProvider>
      </ToastProvider>
      <DemoPanel />
    </MemoryRouter>,
  );
})();
