import { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronDown, ChevronUp, CheckCircle2, RotateCcw, MessageSquare, Star } from 'lucide-react';
import { api } from '../../api';
import { useApi, Loading, ErrorBox, Avatar, SubmissionBadge, useToast } from '../../components/ui';
import { BlocksView } from '../../blocks/BlockView';
import { Thread, Composer } from '../../components/Thread';
import { fmtDate } from '../../utils';

export default function ReviewDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { data, error, loading, reload } = useApi(`/admin/submissions/${id}`);
  const [showTask, setShowTask] = useState(false);
  const [mode, setMode] = useState('accept');
  const [points, setPoints] = useState('');
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const s = data;
  const taskBlocks = (s.task?.pages || []).flatMap((p) => p.blocks || []);

  const review = async ({ body, files }) => {
    try {
      await api.post(`/admin/submissions/${s.id}/review`, { decision: mode, points: points === '' ? s.maxPoints : Number(points), comment: body, files });
      toast(mode === 'accept' ? 'Работа принята' : 'Работа отправлена на доработку');
      window.dispatchEvent(new Event('lms:refresh-pending'));
      reload();
    } catch (e) { toast.error(e); return false; }
  };
  const comment = async ({ body, files }) => {
    try { await api.post(`/admin/submissions/${s.id}/messages`, { body, files }); toast('Комментарий отправлен'); reload(); } catch (e) { toast.error(e); return false; }
  };

  return (
    <div>
      <div className="row mb-16"><button className="btn btn-ghost btn-sm" onClick={() => nav(-1)}><ChevronLeft size={16} />Назад</button></div>
      <div className="review-layout">
        <div style={{ minWidth: 0 }}>
          <div className="card card-pad">
            <div className="row row-wrap">
              <div className="flex-1"><div className="small muted">{s.course.title}</div><h2>{s.lesson.title}</h2></div>
              <SubmissionBadge status={s.status} />
            </div>
            <button className="btn btn-ghost btn-sm mt-8" onClick={() => setShowTask(!showTask)}>{showTask ? <ChevronUp size={15} /> : <ChevronDown size={15} />}{showTask ? 'Скрыть текст задания' : 'Показать текст задания'}</button>
            {showTask && <div className="mt-16" style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>{taskBlocks.length ? <BlocksView blocks={taskBlocks} /> : <span className="muted">Описание пустое</span>}</div>}
          </div>
          <div className="card card-pad mt-16">
            <h3 className="mb-16">Ответы и переписка</h3>
            <Thread messages={s.messages} />
          </div>
        </div>
        <div className="review-side">
          <div className="card card-pad">
            <div className="row mb-16">
              <Avatar user={s.user} size="avatar-lg" />
              <div className="flex-1"><Link to={`/admin/users/${s.user.id}`} className="bold" style={{ color: 'var(--text)' }}>{s.user.name}</Link><div className="xs muted">{s.user.email}</div>{s.user.department && <div className="xs muted">{s.user.department}</div>}</div>
            </div>
            <div className="small muted">Отправлено: {fmtDate(s.createdAt, true)}</div>
            {s.reviewedAt && <div className="small muted">Проверено: {fmtDate(s.reviewedAt, true)}{s.reviewer ? ` · ${s.reviewer.name}` : ''}</div>}
            {s.status === 'accepted' && s.maxPoints > 0 && <div className="mt-8 bold"><Star size={15} style={{ verticalAlign: '-2px', color: '#e0a800' }} /> {s.points} из {s.maxPoints}</div>}
          </div>

          <div className="card card-pad mt-16">
            <div className="tabs" style={{ width: '100%' }}>
              <button className={`tab ${mode === 'accept' ? 'active' : ''}`} onClick={() => setMode('accept')}><CheckCircle2 size={15} />Принять</button>
              <button className={`tab ${mode === 'return' ? 'active' : ''}`} onClick={() => setMode('return')}><RotateCcw size={15} />Вернуть</button>
              <button className={`tab ${mode === 'comment' ? 'active' : ''}`} onClick={() => setMode('comment')}><MessageSquare size={15} />Комментарий</button>
            </div>
            {mode === 'accept' && s.maxPoints > 0 && (
              <div className="field">
                <label>Оценка (из {s.maxPoints})</label>
                <input className="input" type="number" min={0} max={s.maxPoints} value={points} placeholder={String(s.maxPoints)} onChange={(e) => setPoints(e.target.value)} style={{ width: 120 }} />
              </div>
            )}
            {mode === 'comment'
              ? <Composer key="c" onSubmit={comment} submitLabel="Отправить" placeholder="Комментарий ученику (статус работы не изменится)" audio={false} />
              : <Composer key={mode} onSubmit={review} audio={false} icon={mode === 'accept' ? CheckCircle2 : RotateCcw}
                variant={mode === 'accept' ? 'btn-success' : 'btn-danger'} allowEmpty={mode === 'accept'}
                submitLabel={mode === 'accept' ? 'Принять работу' : 'Вернуть на доработку'}
                placeholder={mode === 'accept' ? 'Комментарий (необязательно): что получилось хорошо' : 'Что нужно исправить'} />}
            {mode === 'accept' && <div className="hint mt-8">Комментарий не обязателен — можно сразу нажать «Принять работу».</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
