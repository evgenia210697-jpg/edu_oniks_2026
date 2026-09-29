import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, BookOpen, CheckCircle2, PlayCircle, GraduationCap, PenTool, ListChecks } from 'lucide-react';
import { useApi, Loading, ErrorBox, Empty, Progress, Hero, Avatar, NutMark } from '../../components/ui';
import { useAuth } from '../../App';
import { plural } from '../../utils';

/** Обложка курса: картинка или «чертёжная» заглушка с номером курса */
export function CourseCover({ course }) {
  return (
    <div className={`course-cover ${course.cover ? '' : 'blank'}`}>
      {course.cover ? <img src={course.cover} alt="" loading="lazy" /> : (
        <>
          <NutMark className="cover-nut" size={170} />
          <span className="cover-no">КУРС № {String(course.id).padStart(2, '0')}</span>
        </>
      )}
    </div>
  );
}

export default function Library() {
  const { user, settings } = useAuth();
  const { data, error, loading, reload } = useApi('/learn/courses');
  const [q, setQ] = useState('');
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const list = data.filter((c) => `${c.title} ${c.description}`.toLowerCase().includes(q.toLowerCase()));
  const done = data.filter((c) => c.completedAt).length;
  const avg = data.length ? Math.round(data.reduce((s, c) => s + c.progress, 0) / data.length) : 0;
  const isStaff = user.role !== 'student';

  return (
    <div>
      <Hero title={settings?.libraryTitle || 'Моё обучение'} sub={settings?.librarySubtitle} cover={settings?.cover}>
        <div className="row mt-16" style={{ gap: 14 }}>
          <Avatar user={user} size="avatar-lg" />
          <div>
            <div className="bold" style={{ fontSize: 17 }}>{user.name}</div>
            <div className="hero-meta" style={{ marginTop: 6 }}>
              <span className="hero-chip"><BookOpen size={13} />{data.length} {plural(data.length, 'курс', 'курса', 'курсов')}</span>
              <span className="hero-chip"><CheckCircle2 size={13} />Завершено: {done}</span>
              {data.length > 0 && <span className="hero-chip">Общий прогресс: {avg}%</span>}
            </div>
          </div>
        </div>
      </Hero>

      {data.length > 3 && (
        <div className="toolbar">
          <div className="input-group"><Search size={17} /><input className="input" placeholder="Поиск по курсам" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        </div>
      )}

      {data.length === 0 ? (
        <div className="card">
          <Empty icon={GraduationCap} title="Курсов пока нет" text={isStaff
            ? 'Здесь появятся курсы, на которые вы записаны как ученик. Управлять курсами можно в разделе «Курсы».'
            : 'Когда администратор откроет вам курс, он появится здесь. Вы также получите уведомление.'} />
        </div>
      ) : (
        <div className="course-grid stagger">
          {list.map((c) => {
            const started = c.progress > 0 || c.startedAt;
            return (
              <Link key={c.id} to={`/course/${c.id}`} className="card course-card">
                <CourseCover course={c} />
                <div className="course-body">
                  <div className="row small" style={{ gap: 6, color: c.completedAt ? 'var(--success)' : 'var(--accent)', fontWeight: 600 }}>
                    {c.completedAt ? <><CheckCircle2 size={15} />Курс пройден · есть сертификат</> : <>{c.progress}% пройдено</>}
                  </div>
                  <div className="course-title">{c.title}</div>
                  {c.description && <div className="course-desc">{c.description}</div>}
                  <div className="row small muted" style={{ gap: 12, flexWrap: 'wrap' }}>
                    {c.counts.lecture > 0 && <span className="row" style={{ gap: 4 }}><GraduationCap size={14} />{c.counts.lecture} {plural(c.counts.lecture, 'урок', 'урока', 'уроков')}</span>}
                    {c.counts.assignment > 0 && <span className="row" style={{ gap: 4 }}><PenTool size={14} />{c.counts.assignment} {plural(c.counts.assignment, 'задание', 'задания', 'заданий')}</span>}
                    {c.counts.test > 0 && <span className="row" style={{ gap: 4 }}><ListChecks size={14} />{c.counts.test} {plural(c.counts.test, 'тест', 'теста', 'тестов')}</span>}
                  </div>
                  <div className="course-foot">
                    <Progress value={c.progress} />
                    <span className={`btn ${c.completedAt ? 'btn-secondary' : 'btn-soft'} btn-block mt-16`}>
                      <PlayCircle size={17} />{c.completedAt ? 'Повторить материалы' : started ? 'Продолжить' : 'Начать обучение'}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
