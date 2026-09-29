import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Pencil, KeyRound, Power, Trash2, BookPlus, ChevronDown, ChevronUp, Mail, Phone, Building2, RotateCcw, CheckCircle2, X, MoreHorizontal, ListChecks } from 'lucide-react';
import { api } from '../../api';
import { useAuth } from '../../App';
import { useApi, Loading, ErrorBox, Avatar, Progress, Modal, useToast, useConfirm, StatusIcon, TypeIcon, Menu, MenuItem, STATUS_TEXT, Empty } from '../../components/ui';
import { UserFormModal, CredsBox } from './Users';
import { TestResult } from '../../blocks/TestRunner';
import { fmtDate, fmtRelative, ROLE_LABEL } from '../../utils';
import { LessonMeta } from '../student/CoursePage';

function CourseProgress({ c, userId, isAdmin, onChanged }) {
  const [open, setOpen] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();
  const unenroll = async () => {
    if (!(await confirm({ title: 'Убрать с курса?', text: `Сотрудник потеряет доступ к курсу «${c.title}».`, ok: 'Убрать', danger: true }))) return;
    await api.del(`/admin/courses/${c.id}/students/${userId}`); toast('Убран с курса'); onChanged();
  };
  const resetProgress = async () => {
    if (!(await confirm({ title: 'Сбросить прогресс?', text: 'Удалятся все результаты по этому курсу: пройденные уроки, попытки тестов и ответы на задания.', ok: 'Сбросить', danger: true }))) return;
    await api.post(`/admin/users/${userId}/reset-progress`, { courseId: c.id }); toast('Прогресс сброшен'); onChanged();
  };
  return (
    <div className="card module-card">
      <div className="module-head" onClick={() => setOpen(!open)}>
        <div className="flex-1">
          <h3>{c.title}</h3>
          <div className="small muted">Добавлен {fmtDate(c.enrolledAt)}{c.startedAt ? ` · начал ${fmtDate(c.startedAt)}` : ' · ещё не начинал'}{c.completedAt ? ` · завершил ${fmtDate(c.completedAt)}` : ''}</div>
        </div>
        <div style={{ width: 180 }} className="progress-inline"><Progress value={c.progress} /><span className="small bold">{c.progress}%</span></div>
        <span className="small muted nowrap">{c.completed}/{c.total}</span>
        {isAdmin && (
          <span onClick={(e) => e.stopPropagation()}>
            <Menu trigger={({ toggle }) => <button className="btn btn-ghost btn-icon btn-sm" onClick={toggle}><MoreHorizontal size={17} /></button>}>
              <MenuItem icon={RotateCcw} onClick={resetProgress}>Сбросить прогресс</MenuItem>
              <MenuItem icon={X} danger onClick={unenroll}>Убрать с курса</MenuItem>
            </Menu>
          </span>
        )}
        {open ? <ChevronUp size={18} className="muted" /> : <ChevronDown size={18} className="muted" />}
      </div>
      {open && (
        <div className="module-lessons">
          {c.modules.map((m) => (
            <div key={m.id}>
              <div className="small bold muted" style={{ padding: '8px 4px 4px' }}>{m.title}</div>
              {m.lessons.map((l) => {
                const inner = <><StatusIcon status={l.status} /><TypeIcon type={l.type} /><span className="l-title">{l.title}</span><span className="xs muted">{STATUS_TEXT[l.status]}</span><LessonMeta l={l} /></>;
                return l.submissionId
                  ? <Link key={l.id} to={`/admin/reviews/${l.submissionId}`} className={`lesson-row ${l.status === 'completed' ? 'done' : ''}`} style={{ marginBottom: 6 }}>{inner}</Link>
                  : <div key={l.id} className={`lesson-row ${l.status === 'completed' ? 'done' : ''}`} style={{ marginBottom: 6 }}>{inner}</div>;
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function UserDetail() {
  const { userId } = useParams();
  const { user: me } = useAuth();
  const isAdmin = me.role === 'admin';
  const nav = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { data, error, loading, reload } = useApi(`/admin/users/${userId}`);
  const [modal, setModal] = useState(null);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const { user: u, stats, courses, attempts } = data;

  const resetPw = async () => {
    if (!(await confirm({ title: 'Сбросить пароль?', text: 'Будет создан новый пароль, старый перестанет работать.', ok: 'Сбросить' }))) return;
    const r = await api.post(`/admin/users/${u.id}/reset-password`);
    setModal({ type: 'creds', list: [{ name: u.name, email: u.email, password: r.password }] });
  };
  const toggleActive = async () => {
    if (u.isActive && !(await confirm({ title: 'Отключить доступ?', text: 'Сотрудник не сможет войти. Данные и прогресс сохранятся — доступ можно вернуть.', ok: 'Отключить', danger: true }))) return;
    await api.put(`/admin/users/${u.id}`, { isActive: !u.isActive }); toast(u.isActive ? 'Доступ отключён' : 'Доступ восстановлен'); reload();
  };
  const remove = async () => {
    if (!(await confirm({ title: 'Удалить сотрудника?', text: 'Будут удалены аккаунт и все результаты обучения. Если сотрудник уволился — лучше отключите доступ, чтобы сохранить историю.', ok: 'Удалить навсегда', danger: true }))) return;
    await api.del(`/admin/users/${u.id}`); toast('Сотрудник удалён'); nav('/admin/users');
  };
  const showAttempt = async (id) => {
    try {
      const a = await api.get(`/learn/attempts/${id}`);
      setModal({ type: 'attempt', attempt: a });
    } catch (e) { toast.error(e); }
  };

  return (
    <div>
      <div className="row mb-16"><Link to="/admin/users" className="btn btn-ghost btn-sm"><ChevronLeft size={16} />Все сотрудники</Link></div>
      <div className="card card-pad">
        <div className="row row-wrap" style={{ gap: 18, alignItems: 'flex-start' }}>
          <Avatar user={u} size="avatar-xl" />
          <div className="flex-1" style={{ minWidth: 240 }}>
            <div className="row row-wrap"><h1 style={{ fontSize: 24 }}>{u.name}</h1><span className="badge badge-accent">{ROLE_LABEL[u.role]}</span>{!u.isActive && <span className="badge badge-danger">Доступ отключён</span>}</div>
            <div className="row row-wrap small muted mt-8" style={{ gap: 16 }}>
              <span className="row" style={{ gap: 5 }}><Mail size={14} />{u.email}</span>
              {u.phone && <span className="row" style={{ gap: 5 }}><Phone size={14} />{u.phone}</span>}
              {(u.department || u.position) && <span className="row" style={{ gap: 5 }}><Building2 size={14} />{[u.department, u.position].filter(Boolean).join(' · ')}</span>}
            </div>
            <div className="small muted mt-8">Добавлен {fmtDate(u.createdAt)} · был(а) онлайн: {fmtRelative(u.lastSeenAt)}</div>
            {u.comment && <div className="alert alert-info mt-16 small">{u.comment}</div>}
          </div>
          {isAdmin && (
            <div className="row row-wrap">
              <button className="btn btn-secondary" onClick={() => setModal({ type: 'edit' })}><Pencil size={15} />Изменить</button>
              <Menu trigger={({ toggle }) => <button className="btn btn-secondary btn-icon" onClick={toggle}><MoreHorizontal size={18} /></button>}>
                <MenuItem icon={KeyRound} onClick={resetPw}>Сбросить пароль</MenuItem>
                <MenuItem icon={Power} onClick={toggleActive}>{u.isActive ? 'Отключить доступ' : 'Восстановить доступ'}</MenuItem>
                {u.id !== me.id && <><div className="menu-sep" /><MenuItem icon={Trash2} danger onClick={remove}>Удалить сотрудника</MenuItem></>}
              </Menu>
            </div>
          )}
        </div>
      </div>

      <div className="stats mt-16">
        <div className="card stat"><div className="stat-label">Курсов</div><div className="stat-value">{stats.coursesCount}</div></div>
        <div className="card stat"><div className="stat-label">Завершено</div><div className="stat-value">{stats.coursesCompleted}</div></div>
        <div className="card stat"><div className="stat-label">Средний прогресс</div><div className="stat-value">{stats.avgProgress}%</div></div>
        <div className="card stat"><div className="stat-label">Баллы</div><div className="stat-value">{stats.points}</div></div>
      </div>

      <div className="section-title">
        <h2>Обучение</h2>
        {isAdmin && <button className="btn btn-soft" onClick={() => setModal({ type: 'enroll' })}><BookPlus size={16} />Открыть курс</button>}
      </div>
      {courses.length === 0 ? <div className="card"><Empty title="Курсы не назначены" text="Откройте сотруднику курс, чтобы он начал обучение." /></div>
        : courses.map((c) => <CourseProgress key={c.id} c={c} userId={u.id} isAdmin={isAdmin} onChanged={reload} />)}

      {attempts.length > 0 && (
        <>
          <div className="section-title"><h2>Попытки тестов</h2></div>
          <div className="card table-wrap">
            <table className="table">
              <thead><tr><th>Тест</th><th>Дата</th><th>Результат</th><th /></tr></thead>
              <tbody>
                {attempts.map((a) => (
                  <tr key={a.id} className={a.finishedAt ? 'clickable' : ''} onClick={() => a.finishedAt && showAttempt(a.id)}>
                    <td><span className="row" style={{ gap: 8 }}><ListChecks size={16} className="muted" />{a.title}</span></td>
                    <td className="small">{fmtDate(a.finishedAt || a.startedAt, true)}</td>
                    <td>{a.finishedAt ? <span className={`badge ${a.passed ? 'badge-success' : 'badge-danger'}`}>{a.passed && <CheckCircle2 size={12} />}{a.score}%</span> : <span className="badge">в процессе</span>}</td>
                    <td className="small muted">{a.finishedAt ? 'Смотреть ответы' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {modal?.type === 'edit' && <UserFormModal user={u} onClose={() => setModal(null)} onSaved={reload} />}
      {modal?.type === 'creds' && <Modal title="Новый пароль" onClose={() => setModal(null)} footer={<button className="btn btn-primary" onClick={() => setModal(null)}>Готово</button>}><CredsBox list={modal.list} /></Modal>}
      {modal?.type === 'enroll' && <EnrollOne userId={u.id} exclude={courses.map((c) => c.id)} onClose={() => setModal(null)} onDone={reload} />}
      {modal?.type === 'attempt' && <Modal title="Ответы в попытке" size="wide" onClose={() => setModal(null)}><TestResult result={modal.attempt} /></Modal>}
    </div>
  );
}

function EnrollOne({ userId, exclude, onClose, onDone }) {
  const { data } = useApi('/admin/courses');
  const toast = useToast();
  const [ids, setIds] = useState([]);
  const list = (data || []).filter((c) => !exclude.includes(c.id));
  return (
    <Modal title="Открыть курс" onClose={onClose} footer={<>
      <button className="btn btn-secondary" onClick={onClose}>Отмена</button>
      <button className="btn btn-primary" disabled={!ids.length} onClick={async () => { await api.post('/admin/users/enroll', { userIds: [userId], courseIds: ids }); toast('Курсы открыты'); onDone(); onClose(); }}>Открыть</button>
    </>}>
      {list.length === 0 ? <div className="muted">Все курсы уже открыты.</div> : (
        <div className="stack" style={{ gap: 8 }}>
          {list.map((c) => (
            <label key={c.id} className="check"><input type="checkbox" checked={ids.includes(c.id)} onChange={() => setIds(ids.includes(c.id) ? ids.filter((x) => x !== c.id) : [...ids, c.id])} />{c.title}{c.status !== 'published' && <span className="badge">черновик</span>}</label>
          ))}
        </div>
      )}
    </Modal>
  );
}
