import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserPlus, Download, Search, Trash2, Users, CheckCircle2, Clock, TrendingUp } from 'lucide-react';
import { api } from '../../api';
import { useApi, Loading, ErrorBox, Avatar, Progress, Modal, useToast, useConfirm, Empty } from '../../components/ui';
import { fmtDate, fmtRelative, ROLE_LABEL } from '../../utils';

export function PickUsersModal({ title, exclude = [], onClose, onPick, okLabel = 'Добавить' }) {
  const { data, loading } = useApi('/admin/users?stats=0');
  const [q, setQ] = useState('');
  const [dept, setDept] = useState('');
  const [sel, setSel] = useState([]);
  const [busy, setBusy] = useState(false);
  const list = useMemo(() => (data || []).filter((u) => u.isActive && !exclude.includes(u.id))
    .filter((u) => !dept || u.department === dept)
    .filter((u) => `${u.name} ${u.email} ${u.department} ${u.position}`.toLowerCase().includes(q.toLowerCase())), [data, q, dept, exclude]);
  const depts = [...new Set((data || []).map((u) => u.department).filter(Boolean))].sort();
  const allSel = list.length > 0 && list.every((u) => sel.includes(u.id));
  return (
    <Modal title={title} size="wide" onClose={onClose} footer={<>
      <span className="small muted flex-1">Выбрано: {sel.length}</span>
      <button className="btn btn-secondary" onClick={onClose}>Отмена</button>
      <button className="btn btn-primary" disabled={!sel.length || busy} onClick={async () => { setBusy(true); try { await onPick(sel); onClose(); } finally { setBusy(false); } }}>{okLabel}</button>
    </>}>
      <div className="toolbar">
        <div className="input-group"><Search size={17} /><input className="input" placeholder="Поиск по имени, email, отделу" value={q} onChange={(e) => setQ(e.target.value)} autoFocus /></div>
        {depts.length > 0 && (
          <select className="select" style={{ width: 200 }} value={dept} onChange={(e) => setDept(e.target.value)}>
            <option value="">Все отделы</option>{depts.map((d) => <option key={d}>{d}</option>)}
          </select>
        )}
      </div>
      {loading ? <Loading /> : list.length === 0 ? <div className="empty small">Никого не найдено. Новых сотрудников добавляют в разделе «Сотрудники».</div> : (
        <div className="card table-wrap" style={{ maxHeight: 420, overflowY: 'auto' }}>
          <table className="table">
            <thead><tr>
              <th className="w-check"><input type="checkbox" checked={allSel} onChange={() => setSel(allSel ? sel.filter((id) => !list.some((u) => u.id === id)) : [...new Set([...sel, ...list.map((u) => u.id)])])} /></th>
              <th>Сотрудник</th><th>Отдел</th><th>Роль</th>
            </tr></thead>
            <tbody>
              {list.map((u) => (
                <tr key={u.id} className="clickable" onClick={() => setSel(sel.includes(u.id) ? sel.filter((x) => x !== u.id) : [...sel, u.id])}>
                  <td><input type="checkbox" checked={sel.includes(u.id)} readOnly /></td>
                  <td><div className="cell-user"><Avatar user={u} size="avatar-sm" /><div><div className="bold">{u.name}</div><div className="xs muted">{u.email}</div></div></div></td>
                  <td className="small">{u.department || '—'}</td>
                  <td className="small muted">{ROLE_LABEL[u.role]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

export default function CourseStudents({ course }) {
  const nav = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { data, error, loading, reload } = useApi(`/admin/courses/${course.id}/students`);
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const list = data.filter((u) => `${u.name} ${u.email} ${u.department}`.toLowerCase().includes(q.toLowerCase()));
  const students = data.filter((u) => u.role === 'student');
  const completed = students.filter((u) => u.completedAt).length;
  const avg = students.length ? Math.round(students.reduce((s, u) => s + u.progress, 0) / students.length) : 0;
  const pending = data.reduce((s, u) => s + u.pending, 0);

  const add = async (ids) => {
    const r = await api.post(`/admin/courses/${course.id}/students`, { userIds: ids });
    toast(`Добавлено: ${r.added}`);
    if (course.status !== 'published') toast('Курс ещё не опубликован — ученики увидят его после публикации');
    reload();
  };
  const remove = async (u) => {
    if (!(await confirm({ title: 'Убрать с курса?', text: `${u.name} потеряет доступ к курсу. Прогресс сохранится, если добавить снова.`, ok: 'Убрать', danger: true }))) return;
    await api.del(`/admin/courses/${course.id}/students/${u.id}`);
    reload();
  };

  return (
    <div>
      <div className="stats">
        <div className="card stat"><div className="stat-label"><span className="stat-icon"><Users size={16} /></span>Учеников на курсе</div><div className="stat-value">{students.length}</div></div>
        <div className="card stat"><div className="stat-label"><span className="stat-icon"><TrendingUp size={16} /></span>Средний прогресс</div><div className="stat-value">{avg}%</div></div>
        <div className="card stat"><div className="stat-label"><span className="stat-icon"><CheckCircle2 size={16} /></span>Завершили курс</div><div className="stat-value">{completed}</div></div>
        <div className="card stat"><div className="stat-label"><span className="stat-icon"><Clock size={16} /></span>Работ ждут проверки</div><div className="stat-value">{pending}</div></div>
      </div>
      <div className="toolbar">
        <div className="input-group"><Search size={17} /><input className="input" placeholder="Поиск" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <a className="btn btn-secondary" href={`/api/admin/courses/${course.id}/export`}><Download size={16} />Выгрузить в Excel</a>
        <button className="btn btn-primary" onClick={() => setAdding(true)}><UserPlus size={16} />Добавить учеников</button>
      </div>
      <div className="card">
        {data.length === 0 ? (
          <Empty icon={Users} title="На курсе пока никого" text="Добавьте сотрудников, чтобы они начали обучение."><button className="btn btn-primary" onClick={() => setAdding(true)}><UserPlus size={16} />Добавить учеников</button></Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Ученик</th><th>Отдел</th><th>Прогресс</th><th>Занятий</th><th>Баллы</th><th>Добавлен</th><th>Был(а) онлайн</th><th /></tr></thead>
              <tbody>
                {list.map((u) => (
                  <tr key={u.id} className="clickable" onClick={() => nav(`/admin/users/${u.id}`)}>
                    <td><div className="cell-user"><Avatar user={u} size="avatar-sm" /><div><div className="bold">{u.name}</div><div className="xs muted">{u.email}</div></div></div></td>
                    <td className="small">{u.department || '—'}</td>
                    <td><div className="progress-inline"><Progress value={u.progress} /><span className="small bold">{u.progress}%</span></div>
                      {u.completedAt && <div className="xs" style={{ color: 'var(--success)' }}>Завершил {fmtDate(u.completedAt)}</div>}
                      {u.pending > 0 && <div className="xs" style={{ color: 'var(--warning)' }}>Ждут проверки: {u.pending}</div>}</td>
                    <td className="small nowrap">{u.completed} / {u.total}</td>
                    <td className="small">{u.points}</td>
                    <td className="small nowrap">{fmtDate(u.enrolledAt)}</td>
                    <td className="small muted nowrap">{fmtRelative(u.lastSeenAt)}</td>
                    <td onClick={(e) => e.stopPropagation()}><button className="btn btn-ghost btn-icon btn-sm" title="Убрать с курса" onClick={() => remove(u)}><Trash2 size={15} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {adding && <PickUsersModal title="Добавить учеников на курс" exclude={data.map((u) => u.id)} onClose={() => setAdding(false)} onPick={add} />}
    </div>
  );
}
