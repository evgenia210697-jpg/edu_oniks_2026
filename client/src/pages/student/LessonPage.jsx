import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Eye, CheckCircle2, Clock, RotateCcw, Star, Timer, ListChecks, Lock, ArrowLeft, PanelLeftClose, PanelLeftOpen, ListTree, Award, GraduationCap } from 'lucide-react';
import { api } from '../../api';
import { useApi, Loading, ErrorBox, Progress, StatusIcon, useToast, TypeIcon, Avatar, CountUp } from '../../components/ui';
import { useAuth } from '../../App';
import { Notifications } from '../../components/Layout';
import { BlocksView } from '../../blocks/BlockView';
import { TestRun, TestResult } from '../../blocks/TestRunner';
import { Composer, Thread } from '../../components/Thread';
import { TYPE_LABEL, fmtDate, plural } from '../../utils';

/** Программа курса в режиме прохождения: модули, занятия, статусы */
function ProgramNav({ data, courseId, lessonId, onNavigate }) {
  const currentModule = data.modules.find((m) => m.lessons.some((l) => l.id === lessonId))?.id;
  const [open, setOpen] = useState(() => ({ [currentModule]: true }));
  useEffect(() => { setOpen((o) => ({ ...o, [currentModule]: true })); }, [currentModule]);
  return (
    <nav className="prog" aria-label="Программа курса">
      {data.modules.map((m, mi) => (
        <div key={m.id} className={`prog-module ${m.id === currentModule ? 'current' : ''}`}>
          <button type="button" className="prog-module-head" onClick={() => setOpen({ ...open, [m.id]: !open[m.id] })} aria-expanded={!!open[m.id]}>
            <span className="prog-mnum">{String(mi + 1).padStart(2, '0')}</span>
            <span className="prog-mtitle">{m.title}</span>
            <span className="prog-mcount">{m.completed}/{m.lessons.length}</span>
            <ChevronDown size={16} className="chev" style={{ transform: open[m.id] ? 'rotate(180deg)' : 'none' }} />
          </button>
          <div className={`collapse ${open[m.id] ? '' : 'closed'}`}><div className="collapse-inner">
            <div className="prog-lessons">
              {m.lessons.map((l) => {
                const inner = (
                  <>
                    <StatusIcon status={l.status} locked={l.locked && !data.preview} />
                    <span className="prog-ltext">
                      <span className="prog-ltitle">{l.title}</span>
                      <span className="prog-lmeta">{TYPE_LABEL[l.type]}{l.maxPoints > 0 ? ` · ${l.maxPoints} ${plural(l.maxPoints, 'балл', 'балла', 'баллов')}` : ''}{l.status === 'pending' ? ' · на проверке' : l.status === 'returned' ? ' · на доработке' : ''}</span>
                    </span>
                  </>
                );
                return l.locked && !data.preview
                  ? <div key={l.id} className="prog-lesson locked" title="Откроется после выполнения предыдущих занятий">{inner}</div>
                  : <Link key={l.id} to={`/course/${courseId}/lesson/${l.id}`} onClick={onNavigate} className={`prog-lesson ${l.id === lessonId ? 'current' : ''} ${l.status}`}>{inner}</Link>;
              })}
            </div>
          </div></div>
        </div>
      ))}
    </nav>
  );
}

/** Нижняя закреплённая панель навигации — как в плеере Skillspace */
function PlayerBar({ left, center, right }) {
  return (
    <div className="player-bar">
      <div className="player-bar-inner">
        <div className="pb-left">{left}</div>
        <div className="pb-center">{center}</div>
        <div className="pb-right">{right}</div>
      </div>
    </div>
  );
}

const PrevButton = ({ data, onClick, label }) => (
  <button type="button" className="btn btn-secondary" onClick={onClick} disabled={!data.prev && !label} title={data.prev ? data.prev.title : undefined}>
    <ChevronLeft size={17} /><span className="pb-label">{label || 'Предыдущее'}</span>
  </button>
);

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
          {data.lecture.points > 0 && <span className="badge"><Star size={12} />{data.lecture.points} {plural(data.lecture.points, 'балл', 'балла', 'баллов')}</span>}
          {completed && <span className="badge badge-success"><CheckCircle2 size={12} />Пройдено</span>}
        </div>
        <h1 className="lesson-h1">{data.lesson.title}</h1>
        {pages.length
          ? <div key={`${data.lesson.id}-${page}`} className={`page-in ${dir.current === 'back' ? 'back' : ''}`}><BlocksView blocks={pages[page].blocks} /></div>
          : <p className="muted">В этом уроке пока нет материалов.</p>}
      </div>
      <PlayerBar
        left={page > 0
          ? <PrevButton data={data} label="Назад" onClick={() => { setPage(page - 1); top(); }} />
          : <PrevButton data={data} onClick={goPrev} />}
        center={total > 1 && (
          <div className="pb-pages">
            {pages.map((p, i) => <button key={p.id} type="button" className={`pb-dot ${i === page ? 'on' : i < page ? 'done' : ''}`} onClick={() => { setPage(i); top(); }} aria-label={`Страница ${i + 1}`} />)}
            <span className="mono">{page + 1} / {total}</span>
          </div>
        )}
        right={!last
          ? <button type="button" className="btn btn-primary" onClick={() => { setPage(page + 1); top(); }}><span className="pb-label">Далее</span><ChevronRight size={17} /></button>
          : <button type="button" className="btn btn-primary" onClick={onComplete} disabled={busy} aria-busy={busy}>
            {busy && <span className="spinner sm btn-spin" aria-hidden="true" />}
            <span className="pb-label">{data.next ? (completed ? 'Следующее занятие' : 'Завершить и продолжить') : (completed ? 'К программе курса' : 'Завершить урок')}</span><ChevronRight size={17} />
          </button>}
      />
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
          onFinished={(r) => { setRun(null); setResult({ ...r, fresh: true }); window.scrollTo({ top: 0 }); if (!data.preview) reload(); }} />
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
            : !t.passed && <div className="alert alert-warning" style={{ flex: 1 }}><Lock size={17} /><div>Попытки закончились. Куратор уже получил уведомление и может открыть дополнительную попытку — тогда придёт уведомление в колокольчик.{data.course.sequential ? ' Следующие занятия откроются после сдачи теста.' : ''}</div></div>}
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

  // пока грузится следующее занятие, оставляем на экране программу и шапку предыдущего
  const last = useRef(null);
  if (data && data.lesson.id === id) last.current = data;
  const shell = (data && data.lesson.id === id) ? data : last.current;

  if (error) {
    return (
      <PlayerShell data={shell} courseId={courseId} lessonId={id}>
        <div className="player-content"><div className="card"><ErrorBox error={error} onRetry={reload} />
          <div style={{ textAlign: 'center', paddingBottom: 24 }}><Link to={`/course/${courseId}`} className="btn btn-secondary">К программе курса</Link></div>
        </div></div>
      </PlayerShell>
    );
  }
  if (!data || data.lesson.id !== id) {
    return <PlayerShell data={shell} courseId={courseId} lessonId={id}><div className="player-content"><Loading variant="inline" /></div></PlayerShell>;
  }

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

  const flat = data.modules.flatMap((m, mi) => m.lessons.map((l) => ({ ...l, mi })));
  const pos = flat.findIndex((l) => l.id === id);
  const done = data.state.status === 'completed';
  const statusText = { completed: 'Занятие пройдено', pending: 'Ответ на проверке', returned: 'Нужна доработка', failed: 'Тест пока не сдан' }[data.state.status];

  return (
    <PlayerShell data={data} courseId={courseId} lessonId={id}>
      <div className="player-content">
        {data.preview && <div className="preview-banner"><Eye size={17} />Предпросмотр глазами ученика — прогресс не сохраняется.</div>}
        <div className="lesson-crumbs">
          <span>Модуль {String((flat[pos]?.mi ?? 0) + 1).padStart(2, '0')}</span>
          <span className="sep" />
          <span>Занятие {pos + 1} из {flat.length}</span>
          {statusText && <span className={`crumb-status ${data.state.status}`}>{done ? <CheckCircle2 size={14} /> : null}{statusText}</span>}
        </div>
        {data.lesson.type === 'lecture' && <LectureView data={data} onComplete={completeLecture} busy={busy} goPrev={goPrev} />}
        {data.lesson.type === 'test' && <TestView data={data} reload={reload} goNext={goNext} />}
        {data.lesson.type === 'assignment' && <AssignmentView data={data} reload={reload} goNext={goNext} />}
      </div>
      {data.lesson.type !== 'lecture' && (
        <PlayerBar
          left={<PrevButton data={data} onClick={goPrev} />}
          right={data.next
            ? <button type="button" className={`btn ${done || data.state.status === 'pending' ? 'btn-primary' : 'btn-secondary'}`} onClick={goNext} title={data.next.title}><span className="pb-label">Следующее занятие</span><ChevronRight size={17} /></button>
            : <Link to={`/course/${courseId}`} className="btn btn-secondary"><span className="pb-label">К программе курса</span><ChevronRight size={17} /></Link>}
        />
      )}
    </PlayerShell>
  );
}

/** Оболочка режима прохождения: шапка с прогрессом, программа слева, материал по центру */
function PlayerShell({ data, courseId, lessonId, children }) {
  const { user, settings } = useAuth();
  const [side, setSide] = useState(() => { try { return localStorage.getItem('lms-player-side') !== 'hidden'; } catch { return true; } });
  const [drawer, setDrawer] = useState(false);
  useEffect(() => { setDrawer(false); }, [lessonId]);
  const toggleSide = () => {
    if (window.matchMedia('(max-width: 960px)').matches) { setDrawer((v) => !v); return; }
    setSide((v) => { try { localStorage.setItem('lms-player-side', v ? 'hidden' : 'shown'); } catch { /* */ } return !v; });
  };
  const all = data ? data.modules.flatMap((m) => m.lessons) : [];
  const completed = all.filter((l) => l.status === 'completed').length;
  const moduleTitle = data?.modules.find((m) => m.lessons.some((l) => l.id === lessonId))?.title;
  return (
    <div className={`player-app ${side ? '' : 'side-hidden'} ${drawer ? 'drawer-open' : ''}`}>
      <header className="player-top">
        <Link to={`/course/${courseId}`} className="btn btn-ghost btn-sm pt-back" title="Вернуться к странице курса"><ArrowLeft size={17} /><span>К курсу</span></Link>
        <button type="button" className="btn btn-ghost btn-icon pt-toggle" onClick={toggleSide} title={side ? 'Скрыть программу курса' : 'Показать программу курса'} aria-label="Программа курса">
          <span className="only-desktop">{side ? <PanelLeftClose size={19} /> : <PanelLeftOpen size={19} />}</span>
          <span className="only-mobile"><ListTree size={19} /></span>
        </button>
        <div className="pt-title">
          <div className="pt-course">{data?.course.title || ''}</div>
          {moduleTitle && <div className="pt-module">{moduleTitle}</div>}
        </div>
        {data && (
          <div className="pt-progress" title={`Пройдено ${completed} из ${all.length}`}>
            <span className="pt-count">{completed} / {all.length}</span>
            <div className="pt-bar"><div style={{ width: `${data.progress}%` }} /></div>
            <span className="pt-pct"><CountUp value={data.progress} suffix="%" /></span>
          </div>
        )}
        <Notifications />
        <Link to="/profile" className="pt-user" title={user.name}><Avatar user={user} size="avatar-sm" /></Link>
      </header>
      <aside className="player-aside">
        <div className="pa-head">
          <span className="brand-logo">{settings?.logo ? <img src={settings.logo} alt="" /> : <GraduationCap size={17} />}</span>
          <span className="pa-title">Программа курса</span>
        </div>
        {data ? <ProgramNav data={data} courseId={courseId} lessonId={lessonId} onNavigate={() => setDrawer(false)} /> : null}
        {data && data.progress >= 100 && !data.preview && (
          <Link to={`/course/${courseId}/certificate`} className="pa-cert"><Award size={18} />Сертификат о прохождении</Link>
        )}
      </aside>
      <div className="player-scrim" onClick={() => setDrawer(false)} />
      <main className="player-body">{children}</main>
    </div>
  );
}
