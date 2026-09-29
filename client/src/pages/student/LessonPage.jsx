import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Eye, CheckCircle2, Clock, RotateCcw, Star, Timer, ListChecks, Lock, ArrowLeft } from 'lucide-react';
import { api } from '../../api';
import { useApi, Loading, ErrorBox, Progress, StatusIcon, useToast, TypeIcon } from '../../components/ui';
import { BlocksView } from '../../blocks/BlockView';
import { TestRun, TestResult } from '../../blocks/TestRunner';
import { Composer, Thread } from '../../components/Thread';
import { TYPE_LABEL, fmtDate, plural } from '../../utils';
import { celebrate } from '../../components/celebrate';

function Sidebar({ data, courseId, lessonId }) {
  const currentModule = data.modules.find((m) => m.lessons.some((l) => l.id === lessonId))?.id;
  const [open, setOpen] = useState(() => ({ [currentModule]: true }));
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => { setOpen((o) => ({ ...o, [currentModule]: true })); }, [currentModule]);
  return (
    <aside className="card player-side" style={{ padding: 14 }}>
      <div className="row" style={{ cursor: 'pointer' }} onClick={() => setMobileOpen(!mobileOpen)}>
        <div className="bold flex-1">Программа курса</div>
        <span className="small muted">{data.progress}%</span>
      </div>
      <div className="mt-8 mb-8"><Progress value={data.progress} /></div>
      {data.modules.map((m) => (
        <div key={m.id}>
          <div className="side-module" onClick={() => setOpen({ ...open, [m.id]: !open[m.id] })}>
            <span className="flex-1">{m.title}</span>
            <span className="xs muted">{m.completed}/{m.lessons.length}</span>
            <ChevronDown size={15} className="muted chev" style={{ transform: open[m.id] ? 'rotate(180deg)' : 'none' }} />
          </div>
          <div className={`collapse ${open[m.id] ? '' : 'closed'}`}><div className="collapse-inner">
          {m.lessons.map((l) => (l.locked && !data.preview
            ? <div key={l.id} className="side-lesson" style={{ opacity: .55 }}><StatusIcon locked /><span className="ellipsis">{l.title}</span></div>
            : (
              <Link key={l.id} to={`/course/${courseId}/lesson/${l.id}`} className={`side-lesson ${l.id === lessonId ? 'current' : ''}`}>
                <StatusIcon status={l.status} /><span className="ellipsis flex-1">{l.title}</span>
              </Link>
            )))}
          </div></div>
        </div>
      ))}
    </aside>
  );
}

function LectureView({ data, onComplete, busy, goPrev }) {
  const pages = data.content.pages?.filter((p) => p.blocks?.length) || [];
  const [page, setPageState] = useState(0);
  const dir = useRef('fwd');
  const setPage = (n) => { dir.current = n < page ? 'back' : 'fwd'; setPageState(n); };
  useEffect(() => { setPageState(0); }, [data.lesson.id]);
  const total = Math.max(1, pages.length);
  const last = page >= total - 1;
  const top = () => window.scrollTo({ top: 0, behavior: 'smooth' });
  const completed = data.state.status === 'completed';
  // Листание страниц урока стрелками ← → (если курсор не в поле ввода)
  const keyRef = useRef(null);
  keyRef.current = (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.target.closest('input, textarea, [contenteditable="true"], .pdf-viewer, video, audio, .modal')) return;
    if (e.key === 'ArrowRight' && !last) { setPage(page + 1); top(); }
    if (e.key === 'ArrowLeft' && page > 0) { setPage(page - 1); top(); }
  };
  useEffect(() => {
    const h = (e) => keyRef.current(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
  return (
    <>
      <div className="card lesson-paper">
        <div className="lesson-topline">
          <span className="badge badge-accent"><TypeIcon type="lecture" size={13} />Урок</span>
          {total > 1 && <><span className="small muted">Страница {page + 1} из {total}</span><div className="page-dots">{pages.map((p, i) => <span key={p.id} className={i <= page ? 'on' : ''} />)}</div></>}
          {data.lecture.points > 0 && <span className="badge"><Star size={12} />{data.lecture.points} {plural(data.lecture.points, 'балл', 'балла', 'баллов')}</span>}
          {completed && <span className="badge badge-success"><CheckCircle2 size={12} />Пройдено</span>}
        </div>
        <h1 className="lesson-h1">{data.lesson.title}</h1>
        {pages.length
          ? <div key={`${data.lesson.id}-${page}`} className={`page-in ${dir.current === 'back' ? 'back' : ''}`}><BlocksView blocks={pages[page].blocks} /></div>
          : <p className="muted">В этом уроке пока нет материалов.</p>}
      </div>
      <div className="player-nav">
        <button className="btn btn-secondary" onClick={() => { if (page > 0) { setPage(page - 1); top(); } else goPrev(); }} disabled={page === 0 && !data.prev}>
          <ChevronLeft size={17} />Назад
        </button>
        {!last
          ? <button className="btn btn-primary" onClick={() => { setPage(page + 1); top(); }}>Далее<ChevronRight size={17} /></button>
          : <button className="btn btn-primary" onClick={onComplete} disabled={busy}>
            {data.next ? (completed ? 'Следующее занятие' : 'Завершить и продолжить') : (completed ? 'К программе курса' : 'Завершить урок')}<ChevronRight size={17} />
          </button>}
      </div>
    </>
  );
}

function TestView({ data, reload, goNext }) {
  const t = data.test;
  const toast = useToast();
  const [run, setRun] = useState(t.active || null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setRun(t.active || null); setResult(null); }, [data.lesson.id]); // eslint-disable-line

  const start = async () => {
    setBusy(true);
    try { setRun(await api.post(`/learn/lessons/${data.lesson.id}/attempts`)); setResult(null); window.scrollTo({ top: 0 }); } catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  const showAttempt = async (id) => {
    try { setResult(await api.get(`/learn/attempts/${id}`)); } catch (e) { toast.error(e); }
  };
  const canStart = !data.preview ? (t.attemptsLeft === null || t.attemptsLeft > 0) : true;

  if (run) {
    return (
      <div className="card lesson-paper">
        <div className="lesson-topline"><span className="badge badge-accent"><ListChecks size={13} />Тест</span></div>
        <h1 className="lesson-h1" style={{ marginBottom: 12 }}>{data.lesson.title}</h1>
        <TestRun attempt={run} lessonId={data.lesson.id} onCancel={data.preview ? () => setRun(null) : null}
          onFinished={(r) => { setRun(null); setResult({ ...r, fresh: true }); window.scrollTo({ top: 0 }); if (r.passed) setTimeout(() => celebrate(), 250); if (!data.preview) reload(); }} />
      </div>
    );
  }

  if (result) {
    const left = data.preview ? 1 : (t.attemptsLeft === null ? 1 : t.attemptsLeft);
    return (
      <div className="card lesson-paper">
        <div className="row mb-16"><button className="btn btn-ghost btn-sm" onClick={() => setResult(null)}><ArrowLeft size={15} />К описанию теста</button></div>
        <TestResult result={result} canRetry={left > 0} onRetry={start}
          onNext={data.next && (result.passed || t.passed) ? goNext : null} />
      </div>
    );
  }

  return (
    <div className="card lesson-paper">
      <div className="lesson-topline">
        <span className="badge badge-accent"><ListChecks size={13} />Тест</span>
        {t.passed && <span className="badge badge-success"><CheckCircle2 size={12} />Сдан</span>}
      </div>
      <h1 className="lesson-h1">{data.lesson.title}</h1>
      <BlocksView blocks={data.content.intro} />
      <div className="test-info">
        <div className="ti"><div className="ti-label">Вопросов</div><div className="ti-value">{t.questionsCount}</div></div>
        <div className="ti"><div className="ti-label">Проходной балл</div><div className="ti-value">{t.passPercent}%</div></div>
        <div className="ti"><div className="ti-label">Время</div><div className="ti-value">{t.timeLimitMin ? `${t.timeLimitMin} мин` : 'Без ограничений'}</div></div>
        <div className="ti"><div className="ti-label">Попытки</div><div className="ti-value">{t.attemptsLimit ? `${t.attemptsLeft ?? t.attemptsLimit} из ${t.attemptsLimit}` : 'Без ограничений'}</div></div>
        {t.points > 0 && <div className="ti"><div className="ti-label">Баллы за сдачу</div><div className="ti-value">{t.points}</div></div>}
      </div>
      {t.attempts.length > 0 && (
        <div className="mb-16">
          <div className="label mb-8">Ваши попытки</div>
          <div className="stack" style={{ gap: 6 }}>
            {t.attempts.slice().reverse().map((a, i) => (
              <div key={a.id} className="lesson-row" style={{ cursor: 'pointer' }} onClick={() => showAttempt(a.id)}>
                {a.passed ? <CheckCircle2 size={18} color="var(--success)" /> : <RotateCcw size={17} color="var(--danger)" />}
                <span className="l-title">Попытка {t.attempts.length - i} · {fmtDate(a.finishedAt, true)}</span>
                <span className={`badge ${a.passed ? 'badge-success' : 'badge-danger'}`}>{a.score}%</span>
                <ChevronRight size={16} className="muted" />
              </div>
            ))}
          </div>
        </div>
      )}
      {t.questionsCount === 0 ? <div className="alert alert-warning">В тесте пока нет вопросов.</div> : (
        <div className="row row-wrap">
          {canStart
            ? <button className="btn btn-primary btn-lg" onClick={start} disabled={busy}><ListChecks size={18} />{t.attempts.length ? 'Пройти ещё раз' : 'Начать тест'}</button>
            : <div className="alert alert-warning" style={{ flex: 1 }}><Lock size={17} />Попытки закончились. Если нужна ещё одна — напишите куратору.</div>}
          {t.passed && data.next && <button className="btn btn-secondary btn-lg" onClick={goNext}>Следующее занятие<ChevronRight size={17} /></button>}
          {t.timeLimitMin > 0 && canStart && <span className="small muted"><Timer size={14} style={{ verticalAlign: '-2px' }} /> Таймер запустится после нажатия</span>}
        </div>
      )}
    </div>
  );
}

function AssignmentView({ data, reload, goNext }) {
  const a = data.assignment;
  const s = a.submission;
  const toast = useToast();
  const blocks = (data.content.pages || []).flatMap((p) => p.blocks || []);
  const expired = a.deadline && new Date(a.deadline) < new Date();
  const locked = a.closeAfterDeadline && expired && (!s || s.status === 'returned');

  const submitAnswer = async ({ body, files }) => {
    try {
      const r = await api.post(`/learn/lessons/${data.lesson.id}/submission`, { body, files });
      toast(r.status === 'accepted' ? 'Ответ принят автоматически' : 'Ответ отправлен на проверку');
      reload();
    } catch (e) { toast.error(e); return false; }
  };
  const sendComment = async ({ body, files }) => {
    try { await api.post(`/learn/submissions/${s.id}/messages`, { body, files }); toast('Комментарий отправлен'); reload(); } catch (e) { toast.error(e); return false; }
  };

  return (
    <>
      <div className="card lesson-paper">
        <div className="lesson-topline">
          <span className="badge badge-accent"><TypeIcon type="assignment" size={13} />Задание</span>
          {a.maxPoints > 0 && <span className="badge"><Star size={12} />до {a.maxPoints} {plural(a.maxPoints, 'балла', 'баллов', 'баллов')}</span>}
          {a.deadline && <span className={`badge ${expired && s?.status !== 'accepted' ? 'badge-danger' : ''}`}><Clock size={12} />Сдать до {fmtDate(a.deadline)}</span>}
        </div>
        <h1 className="lesson-h1">{data.lesson.title}</h1>
        {blocks.length ? <BlocksView blocks={blocks} /> : <p className="muted">Описание задания пока не заполнено.</p>}
      </div>

      <div className="card lesson-paper mt-16" id="answer">
        {s?.status === 'pending' && (
          <div className="status-banner pending"><span className="sb-ic"><Clock size={20} /></span>
            <div><div className="bold">Ответ на проверке</div><div className="small muted">Куратор проверит работу и оставит комментарий. Вы получите уведомление.</div></div></div>
        )}
        {s?.status === 'accepted' && (
          <div className="status-banner accepted"><span className="sb-ic"><CheckCircle2 size={20} /></span>
            <div className="flex-1"><div className="bold">Задание принято{a.maxPoints > 0 ? ` — ${s.points} из ${a.maxPoints} ${plural(a.maxPoints, 'балла', 'баллов', 'баллов')}` : ''}</div><div className="small muted">Отличная работа!</div></div>
            {data.next && <button className="btn btn-primary" onClick={goNext}>Дальше<ChevronRight size={16} /></button>}
          </div>
        )}
        {s?.status === 'returned' && (
          <div className="status-banner returned"><span className="sb-ic"><RotateCcw size={18} /></span>
            <div><div className="bold">Нужна доработка</div><div className="small muted">Посмотрите комментарий проверяющего ниже, исправьте и отправьте ответ снова.</div></div></div>
        )}

        {s && <><h3 className="mb-16">История</h3><Thread messages={s.messages} /><div className="divider-h" /></>}

        {data.preview ? (
          <div className="alert alert-info"><Eye size={17} />Здесь ученик пишет ответ, прикрепляет файлы или записывает аудио и отправляет на проверку.</div>
        ) : locked ? (
          <div className="alert alert-danger"><Lock size={17} />Срок сдачи истёк. Обратитесь к куратору.</div>
        ) : (!s || s.status === 'returned') ? (
          <>
            <h3 className="mb-16">{s ? 'Исправленный ответ' : 'Ваш ответ на задание'}</h3>
            <Composer key="answer" onSubmit={submitAnswer} submitLabel="Отправить на проверку" placeholder="Напишите ответ. Можно прикрепить файлы или записать аудио." />
          </>
        ) : (
          <>
            <h3 className="mb-16">Написать комментарий куратору</h3>
            <Composer key="comment" onSubmit={sendComment} submitLabel="Отправить" placeholder="Вопрос или уточнение по заданию…" />
          </>
        )}
      </div>
    </>
  );
}

export default function LessonPage() {
  const { courseId, lessonId } = useParams();
  const id = Number(lessonId);
  const nav = useNavigate();
  const toast = useToast();
  const { data, error, loading, reload } = useApi(`/learn/lessons/${id}`);
  const [busy, setBusy] = useState(false);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [id]);

  if (loading && !data) return <Loading />;
  if (error) {
    return (
      <div className="card">
        <ErrorBox error={error} onRetry={reload} />
        <div style={{ textAlign: 'center', paddingBottom: 24 }}><Link to={`/course/${courseId}`} className="btn btn-secondary">К программе курса</Link></div>
      </div>
    );
  }
  if (!data || data.lesson.id !== id) return <Loading />;

  const goNext = () => {
    window.dispatchEvent(new Event('lms:refresh-notifications'));
    if (data.next && !data.next.locked) nav(`/course/${courseId}/lesson/${data.next.id}`);
    else if (data.next?.locked) { toast.error('Следующее занятие откроется после выполнения текущего'); reload(); }
    else nav(`/course/${courseId}`);
  };
  const goPrev = () => data.prev && nav(`/course/${courseId}/lesson/${data.prev.id}`);

  const completeLecture = async () => {
    setBusy(true);
    try {
      if (data.state.status !== 'completed' && !data.preview) await api.post(`/learn/lessons/${id}/complete`);
      if (data.next) nav(`/course/${courseId}/lesson/${data.next.id}`);
      else { toast('Урок завершён'); nav(`/course/${courseId}`); }
      window.dispatchEvent(new Event('lms:refresh-notifications'));
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };

  return (
    <div>
      {data.preview && <div className="preview-banner"><Eye size={17} />Предпросмотр глазами ученика — прогресс не сохраняется.</div>}
      <div className="row mb-16" style={{ flexWrap: 'wrap' }}>
        <Link to={`/course/${courseId}`} className="btn btn-ghost btn-sm"><ChevronLeft size={16} />{data.course.title}</Link>
        <span className="flex-1" />
        <span className="small muted">{TYPE_LABEL[data.lesson.type]}</span>
      </div>
      <div className="player">
        <div className="player-main">
          {data.lesson.type === 'lecture' && <LectureView data={data} onComplete={completeLecture} busy={busy} goPrev={goPrev} />}
          {data.lesson.type === 'test' && <TestView data={data} reload={reload} goNext={goNext} />}
          {data.lesson.type === 'assignment' && <AssignmentView data={data} reload={reload} goNext={goNext} />}
          {data.lesson.type !== 'lecture' && (
            <div className="player-nav">
              <button className="btn btn-secondary" onClick={goPrev} disabled={!data.prev}><ChevronLeft size={17} />Предыдущее</button>
              {data.next && <button className="btn btn-secondary" onClick={goNext}>Следующее<ChevronRight size={17} /></button>}
            </div>
          )}
        </div>
        <Sidebar data={data} courseId={courseId} lessonId={id} />
      </div>
    </div>
  );
}
