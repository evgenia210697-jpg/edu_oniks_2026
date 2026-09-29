import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ClipboardCheck } from 'lucide-react';
import { useApi, Loading, ErrorBox, Avatar, SubmissionBadge, Empty } from '../../components/ui';
import { fmtDate, fmtRelative } from '../../utils';

export default function Reviews() {
  const nav = useNavigate();
  const [status, setStatus] = useState('pending');
  const [courseId, setCourseId] = useState('');
  const [q, setQ] = useState('');
  const courses = useApi('/admin/courses');
  const { data, error, loading, reload } = useApi(`/admin/submissions?status=${status === 'all' ? '' : status}&courseId=${courseId}`);
  const list = (data || []).filter((s) => `${s.user.name} ${s.user.email} ${s.lesson.title} ${s.course.title}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <div className="page-head">
        <div className="flex-1"><h1>Проверка заданий</h1><div className="page-sub">Ответы учеников на задания. Откройте работу, чтобы принять её или вернуть на доработку.</div></div>
      </div>
      <div className="tabs">
        {[['pending', 'Ждут проверки'], ['returned', 'На доработке'], ['accepted', 'Принятые'], ['all', 'Все']].map(([k, l]) => (
          <button key={k} className={`tab ${status === k ? 'active' : ''}`} onClick={() => setStatus(k)}>{l}</button>
        ))}
      </div>
      <div className="toolbar">
        <div className="input-group"><Search size={17} /><input className="input" placeholder="Поиск по ученику или заданию" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {courses.data?.length > 0 && (
          <select className="select" style={{ width: 260 }} value={courseId} onChange={(e) => setCourseId(e.target.value)}>
            <option value="">Все курсы</option>{courses.data.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        )}
      </div>
      <div className="card">
        {loading ? <Loading /> : error ? <ErrorBox error={error} onRetry={reload} /> : list.length === 0 ? (
          <Empty icon={ClipboardCheck} title={status === 'pending' ? 'Все работы проверены' : 'Здесь пока пусто'} text={status === 'pending' ? 'Новые ответы учеников появятся здесь. Вы также получите уведомление.' : ''} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Ученик</th><th>Задание</th><th>Курс</th><th>Последний ответ</th><th>Статус</th></tr></thead>
              <tbody>
                {list.map((s) => (
                  <tr key={s.id} className="clickable" onClick={() => nav(`/admin/reviews/${s.id}`)}>
                    <td><div className="cell-user"><Avatar user={s.user} size="avatar-sm" /><div><div className="bold">{s.user.name}</div><div className="xs muted">{s.user.department || s.user.email}</div></div></div></td>
                    <td className="bold">{s.lesson.title}</td>
                    <td className="small muted">{s.course.title}</td>
                    <td className="small nowrap" title={fmtDate(s.updatedAt, true)}>{fmtRelative(s.updatedAt)}</td>
                    <td><SubmissionBadge status={s.status} />{s.status === 'accepted' && s.maxPoints > 0 && <div className="xs muted mt-8">{s.points} из {s.maxPoints}</div>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
