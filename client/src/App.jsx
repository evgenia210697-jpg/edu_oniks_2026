import { createContext, useCallback, useContext, useEffect, useState, Component } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { api } from './api';
import { Spinner } from './components/ui';
import Layout from './components/Layout';
import Login from './pages/Login';
import Library from './pages/student/Library';
import CoursePage from './pages/student/CoursePage';
import LessonPage from './pages/student/LessonPage';
import Certificate from './pages/student/Certificate';
import Profile from './pages/Profile';
import AdminCourses from './pages/admin/Courses';
import CourseEditor from './pages/admin/CourseEditor';
import Users from './pages/admin/Users';
import UserDetail from './pages/admin/UserDetail';
import Reviews from './pages/admin/Reviews';
import ReviewDetail from './pages/admin/ReviewDetail';
import Settings from './pages/admin/Settings';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export const DEFAULT_ACCENT = '#2F5BEA';

// Цвет текста на кнопках фирменного цвета: белый, а на светлых цветах (жёлтый, салатовый) — графитовый
export function onAccent(hex) {
  const n = parseInt(String(hex || '').replace('#', ''), 16);
  if (Number.isNaN(n)) return '#fff';
  const lin = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  const L = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  return 1.05 / (L + 0.05) >= 2.6 ? '#fff' : '#16181d';
}

export function setAccent(color) {
  const c = color || DEFAULT_ACCENT;
  document.documentElement.style.setProperty('--accent', c);
  document.documentElement.style.setProperty('--on-accent', onAccent(c));
}

export function applyTheme(settings) {
  if (!settings) return;
  setAccent(settings.accentColor);
  document.title = settings.platformName || 'Обучение';
}

class ErrorBoundary extends Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidUpdate(prev) { if (prev.resetKey !== this.props.resetKey && this.state.err) this.setState({ err: null }); }
  render() {
    if (this.state.err) {
      return (
        <div className="empty">
          <h3>Что-то пошло не так</h3>
          <p className="muted">{String(this.state.err.message || this.state.err)}</p>
          <button className="btn btn-secondary mt-16" onClick={() => window.location.reload()}>Обновить страницу</button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [state, setState] = useState({ loading: true, user: null, settings: null });
  const location = useLocation();

  const refresh = useCallback(async () => {
    try {
      const r = await api.get('/auth/me');
      applyTheme(r.settings);
      setState({ loading: false, user: r.user, settings: r.settings });
    } catch {
      setState((s) => ({ ...s, loading: false }));
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const h = () => setState((s) => ({ ...s, user: null }));
    window.addEventListener('lms:unauthorized', h);
    return () => window.removeEventListener('lms:unauthorized', h);
  }, []);

  const ctx = {
    ...state,
    setUser: (user) => setState((s) => ({ ...s, user })),
    setSettings: (settings) => { applyTheme(settings); setState((s) => ({ ...s, settings })); },
    refresh,
    logout: async () => { await api.post('/auth/logout').catch(() => {}); setState((s) => ({ ...s, user: null })); },
  };

  if (state.loading) return <div className="loading-page"><Spinner /></div>;
  if (!state.user) {
    return (
      <AuthCtx.Provider value={ctx}>
        <Routes>
          <Route path="*" element={<Login />} />
        </Routes>
      </AuthCtx.Provider>
    );
  }

  const role = state.user.role;
  const isStaff = role === 'admin' || role === 'curator';
  const home = role === 'admin' ? '/admin/courses' : role === 'curator' ? '/admin/reviews' : '/';
  const adminOnly = (el) => (role === 'admin' ? el : <Navigate to={home} replace />);
  const staffOnly = (el) => (isStaff ? el : <Navigate to="/" replace />);

  // Основной интерфейс: меню слева, шапка, страницы разделов
  const mainUI = (
      <Layout>
        <ErrorBoundary resetKey={location.pathname}>
          <Routes>
            <Route path="/" element={<Library />} />
            <Route path="/course/:courseId" element={<CoursePage />} />
            <Route path="/course/:courseId/certificate" element={<Certificate />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/admin/courses" element={adminOnly(<AdminCourses />)} />
            <Route path="/admin/courses/:courseId" element={adminOnly(<CourseEditor />)} />
            <Route path="/admin/courses/:courseId/:tab" element={adminOnly(<CourseEditor />)} />
            <Route path="/admin/courses/:courseId/lesson/:lessonId" element={adminOnly(<CourseEditor />)} />
            <Route path="/admin/users" element={staffOnly(<Users />)} />
            <Route path="/admin/users/:userId" element={staffOnly(<UserDetail />)} />
            <Route path="/admin/reviews" element={staffOnly(<Reviews />)} />
            <Route path="/admin/reviews/:id" element={staffOnly(<ReviewDetail />)} />
            <Route path="/admin/settings" element={adminOnly(<Settings />)} />
            <Route path="/login" element={<Navigate to={home} replace />} />
            <Route path="*" element={<div className="empty"><h3>Страница не найдена</h3><p>Проверьте адрес или вернитесь на главную.</p></div>} />
          </Routes>
        </ErrorBoundary>
      </Layout>
  );

  return (
    <AuthCtx.Provider value={ctx}>
      <Routes>
        {/* Режим прохождения урока — на весь экран, без меню платформы */}
        <Route path="/course/:courseId/lesson/:lessonId" element={<ErrorBoundary resetKey={location.pathname}><LessonPage /></ErrorBoundary>} />
        <Route path="*" element={mainUI} />
      </Routes>
    </AuthCtx.Provider>
  );
}
