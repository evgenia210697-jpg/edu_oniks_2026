import { useEffect, useState } from 'react';
import { celebrate } from '../../components/celebrate';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, ChevronDown, ChevronUp, PlayCircle, Star, Award, Eye, GraduationCap, PenTool, ListChecks, Clock } from 'lucide-react';
import { useApi, Loading, ErrorBox, Hero, Ring, StatusIcon, TypeIcon, STATUS_TEXT } from '../../components/ui';
import { plural, fmtDate } from '../../utils';

export function LessonMeta({ l }) {
  return (
    <span className="row small muted" style={{ gap: 10 }}>
      {l.type === 'test' && l.attempts > 0 && <span className="nowrap">{l.attempts} {plural(l.attempts, 'попытка', 'попытки', 'попыток')} · {l.bestScore}%</span>}
      {l.status === 'pending' && <span className="badge badge-warning"><Clock size={12} />На проверке</span>}
      {l.status === 'returned' && <span className="badge badge-danger">На доработке</span>}
      {l.deadline && l.status !== 'completed' && <span className="nowrap">до {fmtDate(l.deadline)}</span>}
      {l.maxPoints > 0 && (
        <span className="row nowrap" style={{ gap: 3, color: l.points ? '#d99a00' : undefined }}><Star size={14} fill={l.points ? '#f5b400' : 'none'} />{l.status === 'completed' ? l.points : l.maxPoints}</span>
      )}
    </span>
  );
}

export default function CoursePage() {
  const { courseId } = useParams();
  const nav = useNavigate();
  const { data, error, loading, reload } = useApi(`/learn/courses/${courseId}`);
  const [closed, setClosed] = useState({});
  // Курс только что завершён — поздравляем один раз
  useEffect(() => {
    if (!data?.completedAt || data.preview) return;
    const key = `lms-celebrated-course-${data.id}`;
    try { if (localStorage.getItem(key)) return; localStorage.setItem(key, '1'); } catch { return; }
    setTimeout(() => celebrate({ count: 180 }), 350);
  }, [data]);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const c = data;
  const firstId = c.modules[0]?.lessons[0]?.id;
  const target = c.nextLessonId || firstId;

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      {c.preview && <div className="preview-banner"><Eye size={17} />Режим предпросмотра: вы видите курс глазами ученика, прогресс не сохраняется.</div>}
      <Hero title={c.title} sub={c.description} cover={c.cover}
        back={<Link to={c.preview ? `/admin/courses/${c.id}` : '/'} className="btn btn-sm"><ChevronLeft size={16} />{c.preview ? 'К редактору' : 'Моё обучение'}</Link>}>
        <div className="hero-meta">
          {c.counts.lecture > 0 && <span className="hero-chip"><GraduationCap size={13} />{c.counts.lecture} {plural(c.counts.lecture, 'урок', 'урока', 'уроков')}</span>}
          {c.counts.assignment > 0 && <span className="hero-chip"><PenTool size={13} />{c.counts.assignment} {plural(c.counts.assignment, 'задание', 'задания', 'заданий')}</span>}
          {c.counts.test > 0 && <span className="hero-chip"><ListChecks size={13} />{c.counts.test} {plural(c.counts.test, 'тест', 'теста', 'тестов')}</span>}
          {c.points > 0 && <span className="hero-chip"><Star size={13} />{c.points} {plural(c.points, 'балл', 'балла', 'баллов')}</span>}
        </div>
        <div className="hero-progress"><div style={{ width: `${c.progress}%` }} /></div>
        <div className="row mt-16" style={{ flexWrap: 'wrap' }}>
          {target && (
            <button className="btn btn-primary" onClick={() => nav(`/course/${c.id}/lesson/${target}`)}>
              <PlayCircle size={18} />{c.completedAt ? 'Открыть материалы' : c.progress > 0 ? 'Продолжить обучение' : 'Начать обучение'}
            </button>
          )}
          {c.completedAt && !c.preview && (
            <Link to={`/course/${c.id}/certificate`} className="btn btn-on-dark"><Award size={17} />Сертификат</Link>
          )}
          <span className="mono" style={{ color: '#b8bdc6', fontSize: 13 }}>Пройдено {c.completed} / {c.total}</span>
        </div>
      </Hero>

      {c.total === 0 && <div className="card card-pad muted">В курсе пока нет опубликованных занятий.</div>}

      {c.modules.map((m, mi) => {
        const pct = m.lessons.length ? Math.round((m.completed / m.lessons.length) * 100) : 0;
        const isClosed = closed[m.id] ?? false;
        return (
          <div key={m.id} className="card module-card">
            <div className="module-head" onClick={() => setClosed({ ...closed, [m.id]: !isClosed })}>
              <Ring value={pct} size={46} label={pct >= 100 ? '✓' : mi + 1} />
              <div className="flex-1">
                <h3>{m.title}</h3>
                <div className="small muted">{m.completed} из {m.lessons.length} {plural(m.lessons.length, 'занятия', 'занятий', 'занятий')} пройдено</div>
              </div>
              <ChevronUp size={20} className={`muted chev ${isClosed ? 'closed' : ''}`} style={isClosed ? { transform: 'rotate(180deg)' } : undefined} />
            </div>
            <div className={`collapse ${isClosed ? 'closed' : ''}`}><div className="collapse-inner">
              <div className="module-lessons">
                {m.lessons.map((l) => {
                  const inner = (
                    <>
                      <StatusIcon status={l.status} locked={l.locked} />
                      <TypeIcon type={l.type} />
                      <span className="l-title">{l.title}</span>
                      <LessonMeta l={l} />
                    </>
                  );
                  return l.locked && !c.preview
                    ? <div key={l.id} className="lesson-row locked" title="Сначала пройдите предыдущие занятия">{inner}</div>
                    : <Link key={l.id} to={`/course/${c.id}/lesson/${l.id}`} className={`lesson-row ${l.status === 'completed' ? 'done' : ''}`} title={STATUS_TEXT[l.status]}>{inner}</Link>;
                })}
              </div>
            </div></div>
          </div>
        );
      })}

      {c.total > 0 && (
        <div className="card module-card">
          <div className="module-head" style={{ cursor: 'default' }}>
            <Ring value={c.completedAt ? 100 : c.progress} size={46} label={<Award size={18} />} />
            <div className="flex-1">
              <h3>Завершение курса</h3>
              <div className="small muted">{c.completedAt ? `Курс пройден ${fmtDate(c.completedAt)}` : 'Чтобы завершить курс, пройдите все занятия. Задания должны быть приняты куратором, тесты — сданы.'}</div>
            </div>
            {c.completedAt && !c.preview && <Link to={`/course/${c.id}/certificate`} className="btn btn-soft"><Award size={16} />Открыть сертификат</Link>}
          </div>
        </div>
      )}
    </div>
  );
}
