import { useCallback, useEffect, useRef, useState } from 'react';
import { Settings2, Eye, Send, MoreHorizontal, Copy, Trash2, EyeOff, Undo2, Plus, ArrowUp, ArrowDown, Check, CloudOff, Loader2, FileText, ListChecks, AlignLeft } from 'lucide-react';
import { api } from '../../api';
import { Menu, MenuItem, useConfirm, useToast, Loading, ErrorBox, TypeIcon } from '../../components/ui';
import BlocksEditor from '../../blocks/BlocksEditor';
import QuestionsEditor, { questionProblem } from '../../blocks/QuestionsEditor';
import LessonSettingsModal from './LessonSettings';
import { TYPE_LABEL, uid, plural } from '../../utils';

function SaveState({ state }) {
  if (state === 'saving') return <span className="save-state"><Loader2 size={14} className="spin" style={{ animation: 'spin 1s linear infinite' }} />Сохраняем…</span>;
  if (state === 'error') return <span className="save-state" style={{ color: 'var(--danger)' }}><CloudOff size={14} />Не сохранено — проверьте связь</span>;
  if (state === 'saved') return <span className="save-state"><Check size={14} />Черновик сохранён</span>;
  return null;
}

function PagesEditor({ pages, setPages, type }) {
  const confirm = useConfirm();
  const setPageBlocks = (pid) => (fn) => setPages((ps) => ps.map((p) => (p.id === pid ? { ...p, blocks: fn(p.blocks) } : p)));
  return (
    <>
      {pages.map((p, i) => (
        <div key={p.id} className="card page-card">
          <div className="page-card-head">
            <span className="label">{pages.length > 1 ? `Страница ${i + 1} из ${pages.length}` : (type === 'assignment' ? 'Описание задания' : 'Содержание урока')}</span>
            {pages.length > 1 && (
              <Menu trigger={({ toggle }) => <button className="btn btn-ghost btn-icon btn-sm" onClick={toggle} aria-label="Действия со страницей"><MoreHorizontal size={17} /></button>}>
                <MenuItem icon={ArrowUp} disabled={i === 0} onClick={() => setPages((ps) => { const n = [...ps]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n; })}>Переместить выше</MenuItem>
                <MenuItem icon={ArrowDown} disabled={i === pages.length - 1} onClick={() => setPages((ps) => { const n = [...ps]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; return n; })}>Переместить ниже</MenuItem>
                <div className="menu-sep" />
                <MenuItem icon={Trash2} danger onClick={async () => {
                  if (p.blocks.length && !(await confirm({ title: 'Удалить страницу?', text: 'Все блоки на этой странице будут удалены.', ok: 'Удалить', danger: true }))) return;
                  setPages((ps) => ps.filter((x) => x.id !== p.id));
                }}>Удалить страницу</MenuItem>
              </Menu>
            )}
          </div>
          <BlocksEditor blocks={p.blocks} onChange={setPageBlocks(p.id)} />
        </div>
      ))}
      {type === 'lecture' && (
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button className="btn btn-secondary" onClick={() => setPages((ps) => [...ps, { id: uid(), blocks: [] }])}><Plus size={16} />Добавить страницу</button>
          <div className="hint mt-8">Длинный урок удобно разбить на страницы — ученик будет листать их кнопкой «Далее».</div>
        </div>
      )}
      {type === 'assignment' && (
        <div className="alert alert-info mt-16"><FileText size={17} />Под описанием ученик увидит поле для ответа: текст, файлы и запись аудио. Ответы придут в раздел «Проверка заданий».</div>
      )}
    </>
  );
}

function TestEditor({ draft, setDraft, settings, openSettings }) {
  const [tab, setTab] = useState('questions');
  const qs = draft.questions || [];
  const problems = qs.filter((q) => questionProblem(q)).length;
  return (
    <>
      <div className="card card-pad mt-16" style={{ padding: '14px 18px' }}>
        <div className="row row-wrap small">
          <span className="muted">Проходной балл: <b>{settings.passPercent ?? 60}%</b></span>
          <span className="muted">Время: <b>{settings.timeLimitMin ? `${settings.timeLimitMin} мин` : 'без ограничений'}</b></span>
          <span className="muted">Попытки: <b>{settings.attemptsLimit || 'без ограничений'}</b></span>
          {settings.bankCount > 0 && <span className="muted">Банк: <b>{settings.bankCount} из {qs.length}</b></span>}
          <span className="flex-1" />
          <button className="btn btn-ghost btn-sm" onClick={openSettings}><Settings2 size={15} />Настройки теста</button>
        </div>
      </div>
      <div className="tabs mt-16">
        <button className={`tab ${tab === 'intro' ? 'active' : ''}`} onClick={() => setTab('intro')}><AlignLeft size={15} />Введение</button>
        <button className={`tab ${tab === 'questions' ? 'active' : ''}`} onClick={() => setTab('questions')}><ListChecks size={15} />Вопросы <span className="count">{qs.length}</span></button>
      </div>
      {problems > 0 && tab === 'questions' && <div className="alert alert-warning mb-16">Есть незаполненные вопросы: {problems}. Проверьте отмеченные жёлтым перед публикацией.</div>}
      {tab === 'intro' ? (
        <div className="card page-card" style={{ marginTop: 0 }}>
          <div className="page-card-head"><span className="label">Текст перед началом теста (необязательно)</span></div>
          <BlocksEditor blocks={draft.intro || []} onChange={(fn) => setDraft((d) => ({ ...d, intro: fn(d.intro || []) }))} emptyHint="Например: инструкция к тесту или напоминание, что нужно повторить." />
        </div>
      ) : (
        <QuestionsEditor questions={qs} onChange={(fn) => setDraft((d) => ({ ...d, questions: fn(d.questions || []) }))} />
      )}
    </>
  );
}

export default function LessonEditor({ lessonId, courseId, onChanged, onDeleted, onCreated }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [lesson, setLesson] = useState(null);
  const [error, setError] = useState(null);
  const [draft, setDraftState] = useState(null);
  const [title, setTitle] = useState('');
  const [saveState, setSaveState] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const timer = useRef(null);
  const pending = useRef(null);
  const dirtyCount = useRef(0);

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    setSaveState('saving');
    try {
      const l = await api.put(`/admin/lessons/${p.id}`, { draft: p.draft });
      setSaveState('saved');
      setLesson((cur) => (cur && cur.id === l.id ? { ...cur, hasChanges: l.hasChanges, updatedAt: l.updatedAt } : cur));
      onChanged?.(l);
    } catch (e) {
      setSaveState('error');
      if (!pending.current) pending.current = p;
      toast.error(e);
    }
  }, [onChanged, toast]);

  useEffect(() => {
    let alive = true;
    setLesson(null); setError(null); setSaveState(null);
    api.get(`/admin/lessons/${lessonId}`).then((l) => {
      if (!alive) return;
      setLesson(l); setDraftState(l.draft); setTitle(l.title);
    }).catch((e) => alive && setError(e));
    return () => { alive = false; flush(); };
  }, [lessonId]); // eslint-disable-line

  // Ctrl+S / ⌘S — сохранить черновик сразу, не дожидаясь автосохранения
  useEffect(() => {
    const h = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S' || e.code === 'KeyS')) {
        e.preventDefault();
        flush().then(() => toast('Черновик сохранён'));
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [flush, toast]);

  useEffect(() => {
    const h = (e) => { if (pending.current) { flush(); e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [flush]);

  const setDraft = useCallback((fn) => {
    setDraftState((d) => {
      const next = typeof fn === 'function' ? fn(d) : fn;
      pending.current = { id: lessonId, draft: next };
      dirtyCount.current += 1;
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, 900);
      return next;
    });
  }, [lessonId, flush]);

  if (error) return <div className="card"><ErrorBox error={error} /></div>;
  if (!lesson || !draft) return <div className="card card-pad"><Loading variant="inline" /></div>;

  const saveMeta = async (patch) => {
    try {
      const l = await api.put(`/admin/lessons/${lesson.id}`, patch);
      setLesson((cur) => ({ ...cur, title: l.title, settings: l.settings }));
      setTitle(l.title);
      onChanged?.(l);
      toast('Сохранено');
    } catch (e) { toast.error(e); throw e; }
  };
  const act = async (path, msg) => {
    await flush();
    try {
      const l = await api.post(`/admin/lessons/${lesson.id}/${path}`);
      setLesson(l); setDraftState(l.draft);
      onChanged?.(l);
      toast(msg);
    } catch (e) { toast.error(e); }
  };
  const publish = async () => {
    if (lesson.type === 'test') {
      const qs = draft.questions || [];
      if (!qs.length) { toast.error('Добавьте в тест хотя бы один вопрос'); return; }
      const bad = qs.filter((q) => questionProblem(q)).length;
      if (bad && !(await confirm({ title: 'Есть незаполненные вопросы', text: `Незаполненных вопросов: ${bad}. Они будут засчитываться неверно. Всё равно опубликовать?`, ok: 'Опубликовать' }))) return;
    }
    act('publish', 'Занятие опубликовано — ученики его видят');
  };
  const remove = async () => {
    if (!(await confirm({ title: 'Удалить занятие?', text: `«${lesson.title}» будет удалено вместе с результатами учеников. Это действие нельзя отменить.`, ok: 'Удалить', danger: true }))) return;
    pending.current = null; clearTimeout(timer.current);
    await api.del(`/admin/lessons/${lesson.id}`);
    toast('Занятие удалено');
    onDeleted?.(lesson.id);
  };
  const duplicate = async () => {
    await flush();
    const l = await api.post(`/admin/lessons/${lesson.id}/duplicate`);
    toast('Создана копия');
    onCreated?.(l);
  };

  const published = lesson.status === 'published';
  const upToDate = published && !lesson.hasChanges;

  return (
    <div>
      <div className="card lesson-editor-head">
        <span className="badge badge-accent"><TypeIcon type={lesson.type} size={13} />{TYPE_LABEL[lesson.type]}</span>
        <input className="title-input" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Название занятия"
          onBlur={() => { if (title.trim() && title !== lesson.title) saveMeta({ title }); else setTitle(lesson.title); }}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
        <SaveState state={saveState} />
        <div className="row" style={{ gap: 6 }}>
          <a className="btn btn-ghost btn-icon" href={`/course/${courseId}/lesson/${lesson.id}`} target="_blank" rel="noreferrer" title="Предпросмотр глазами ученика" onClick={() => flush()}><Eye size={18} /></a>
          <button className="btn btn-ghost btn-icon" onClick={() => setSettingsOpen(true)} title="Настройки занятия"><Settings2 size={18} /></button>
          <Menu trigger={({ toggle }) => <button className="btn btn-ghost btn-icon" onClick={toggle} aria-label="Ещё"><MoreHorizontal size={18} /></button>}>
            {published && <MenuItem icon={EyeOff} onClick={() => act('unpublish', 'Занятие скрыто от учеников')}>Снять с публикации</MenuItem>}
            {lesson.wasPublished && lesson.hasChanges && <MenuItem icon={Undo2} onClick={async () => {
              if (await confirm({ title: 'Отменить изменения?', text: 'Черновик вернётся к опубликованной версии.', ok: 'Отменить изменения', danger: true })) act('discard', 'Изменения отменены');
            }}>Отменить неопубликованные изменения</MenuItem>}
            <MenuItem icon={Copy} onClick={duplicate}>Дублировать</MenuItem>
            <div className="menu-sep" />
            <MenuItem icon={Trash2} danger onClick={remove}>Удалить занятие</MenuItem>
          </Menu>
          <button className={`btn ${upToDate ? 'btn-soft' : 'btn-primary'}`} onClick={publish} disabled={upToDate}>
            {upToDate ? <><Check size={16} />Опубликовано</> : <><Send size={15} />{published ? 'Опубликовать изменения' : 'Опубликовать занятие'}</>}
          </button>
        </div>
        {!published && <div className="xs muted" style={{ width: '100%' }}>Черновик — ученики не видят это занятие, пока вы его не опубликуете.</div>}
        {published && lesson.hasChanges && <div className="xs" style={{ width: '100%', color: 'var(--warning)' }}>Есть неопубликованные изменения — ученики видят предыдущую версию.</div>}
      </div>

      {lesson.type === 'test'
        ? <TestEditor draft={draft} setDraft={setDraft} settings={lesson.settings} openSettings={() => setSettingsOpen(true)} />
        : <PagesEditor pages={draft.pages || []} setPages={(fn) => setDraft((d) => ({ ...d, pages: fn(d.pages || []) }))} type={lesson.type} />}

      {lesson.type === 'test' && (draft.questions || []).length > 0 && (
        <div className="hint mt-16">{(draft.questions || []).length} {plural((draft.questions || []).length, 'вопрос', 'вопроса', 'вопросов')} · изменения сохраняются автоматически</div>
      )}

      {settingsOpen && <LessonSettingsModal lesson={{ ...lesson, title }} onClose={() => setSettingsOpen(false)} onSave={saveMeta} />}
    </div>
  );
}
