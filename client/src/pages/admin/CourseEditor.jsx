import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ChevronLeft, Eye, Plus, MoreHorizontal, Pencil, ArrowUp, ArrowDown, Trash2, GripVertical, Layers, Users as UsersIcon, Settings2, FolderInput, CheckCircle2, EyeOff, Send,
} from 'lucide-react';
import { api } from '../../api';
import { useApi, Loading, ErrorBox, Menu, MenuItem, useConfirm, usePrompt, useToast, TypeIcon, Empty, Hero } from '../../components/ui';
import LessonEditor from './LessonEditor';
import { CreateLessonModal } from './LessonSettings';
import CourseStudents from './CourseStudents';
import CourseSettings from './CourseSettings';
import { CourseMenu, CourseEditModal } from './CourseActions';
import { plural } from '../../utils';

function LessonItem({ l, active, onClick, modules, onMoveTo }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `l-${l.id}` });
  const dot = l.status === 'published' ? (l.hasChanges ? 'changes' : 'published') : '';
  const title = l.status === 'published' ? (l.hasChanges ? 'Опубликовано, есть несохранённые в публикацию изменения' : 'Опубликовано') : 'Черновик';
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={`outline-lesson ${active ? 'active' : ''} ${isDragging ? 'dragging' : ''}`} onClick={onClick}>
      <button className="drag-handle" {...attributes} {...listeners} onClick={(e) => e.stopPropagation()} aria-label="Перетащить"><GripVertical size={14} /></button>
      <TypeIcon type={l.type} size={15} />
      <span className="l-title">{l.title}</span>
      <span className={`st-dot ${dot}`} title={title} />
      {modules.length > 1 && (
        <span onClick={(e) => e.stopPropagation()}>
          <Menu trigger={({ toggle }) => <button className="drag-handle" onClick={toggle} aria-label="Переместить в модуль"><MoreHorizontal size={14} /></button>}>
            <div className="xs muted" style={{ padding: '6px 10px' }}>Переместить в модуль:</div>
            {modules.filter((m) => m.id !== l.moduleId).map((m) => <MenuItem key={m.id} icon={FolderInput} onClick={() => onMoveTo(l, m.id)}>{m.title}</MenuItem>)}
          </Menu>
        </span>
      )}
    </div>
  );
}

function Outline({ course, modules, setModules, activeId, onSelect, reloadCourse }) {
  const toast = useToast();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const [creatingIn, setCreatingIn] = useState(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const saveOrder = async (mods) => {
    setModules(mods);
    try { await api.post(`/admin/courses/${course.id}/reorder`, { modules: mods.map((m) => ({ id: m.id, lessons: m.lessons.map((l) => l.id) })) }); } catch (e) { toast.error(e); reloadCourse(); }
  };
  const onDragEnd = (mid) => ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const mods = modules.map((m) => {
      if (m.id !== mid) return m;
      const a = m.lessons.findIndex((l) => `l-${l.id}` === active.id);
      const b = m.lessons.findIndex((l) => `l-${l.id}` === over.id);
      return a < 0 || b < 0 ? m : { ...m, lessons: arrayMove(m.lessons, a, b) };
    });
    saveOrder(mods);
  };
  const moveModule = (i, dir) => { const n = [...modules]; [n[i], n[i + dir]] = [n[i + dir], n[i]]; saveOrder(n); };
  const moveLessonTo = (l, mid) => {
    const mods = modules.map((m) => ({ ...m, lessons: m.id === mid ? [...m.lessons, { ...l, moduleId: mid }] : m.lessons.filter((x) => x.id !== l.id) }));
    saveOrder(mods);
  };
  const renameModule = async (m) => {
    const title = await prompt({ title: 'Переименовать модуль', label: 'Название модуля', value: m.title });
    if (!title || !title.trim()) return;
    await api.put(`/admin/modules/${m.id}`, { title });
    setModules(modules.map((x) => (x.id === m.id ? { ...x, title } : x)));
  };
  const deleteModule = async (m) => {
    if (!(await confirm({ title: 'Удалить модуль?', text: m.lessons.length ? `Вместе с модулем удалятся все его занятия (${m.lessons.length}) и результаты учеников.` : 'Модуль пустой.', ok: 'Удалить', danger: true }))) return;
    await api.del(`/admin/modules/${m.id}`);
    setModules(modules.filter((x) => x.id !== m.id));
    toast('Модуль удалён');
  };
  const addModule = async () => {
    const title = await prompt({ title: 'Новый модуль', label: 'Название модуля', value: `Модуль ${modules.length + 1}`, ok: 'Создать' });
    if (!title || !title.trim()) return;
    const m = await api.post(`/admin/courses/${course.id}/modules`, { title });
    setModules([...modules, { ...m, lessons: [] }]);
  };
  const createLesson = async ({ type, title }) => {
    try {
      const l = await api.post(`/admin/modules/${creatingIn}/lessons`, { type, title });
      setModules(modules.map((m) => (m.id === creatingIn ? { ...m, lessons: [...m.lessons, { id: l.id, moduleId: m.id, type: l.type, title: l.title, status: l.status, hasChanges: false, settings: l.settings }] } : m)));
      onSelect(l.id);
    } catch (e) { toast.error(e); throw e; }
  };

  return (
    <aside className="card outline">
      {modules.map((m, i) => (
        <div key={m.id} className="outline-module">
          <div className="outline-module-head">
            <Layers size={15} className="muted" />
            <span className="m-title" title={m.title}>{m.title}</span>
            <Menu trigger={({ toggle }) => <button className="drag-handle" onClick={toggle} aria-label="Действия с модулем"><MoreHorizontal size={16} /></button>}>
              <MenuItem icon={Pencil} onClick={() => renameModule(m)}>Переименовать</MenuItem>
              <MenuItem icon={ArrowUp} disabled={i === 0} onClick={() => moveModule(i, -1)}>Выше</MenuItem>
              <MenuItem icon={ArrowDown} disabled={i === modules.length - 1} onClick={() => moveModule(i, 1)}>Ниже</MenuItem>
              <div className="menu-sep" />
              <MenuItem icon={Trash2} danger onClick={() => deleteModule(m)}>Удалить модуль</MenuItem>
            </Menu>
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd(m.id)}>
            <SortableContext items={m.lessons.map((l) => `l-${l.id}`)} strategy={verticalListSortingStrategy}>
              {m.lessons.map((l) => <LessonItem key={l.id} l={l} active={l.id === activeId} onClick={() => onSelect(l.id)} modules={modules} onMoveTo={moveLessonTo} />)}
            </SortableContext>
          </DndContext>
          <button className="btn btn-soft btn-sm add-lesson-btn" onClick={() => setCreatingIn(m.id)}><Plus size={14} />Занятие</button>
        </div>
      ))}
      <button className="btn btn-secondary btn-sm btn-block mt-8" onClick={addModule}><Plus size={14} />Модуль</button>
      <div className="xs muted mt-16 row" style={{ gap: 12, flexWrap: 'wrap' }}>
        <span className="row" style={{ gap: 5 }}><span className="st-dot published" />опубликовано</span>
        <span className="row" style={{ gap: 5 }}><span className="st-dot changes" />есть изменения</span>
        <span className="row" style={{ gap: 5 }}><span className="st-dot" />черновик</span>
      </div>
      {creatingIn && <CreateLessonModal onClose={() => setCreatingIn(null)} onCreate={createLesson} />}
    </aside>
  );
}

export default function CourseEditor() {
  const { courseId, tab: tabParam, lessonId } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const { data, error, loading, reload, setData } = useApi(`/admin/courses/${courseId}`);
  const tab = tabParam === 'students' || tabParam === 'settings' ? tabParam : 'constructor';
  const activeId = lessonId ? Number(lessonId) : null;

  const setModules = useCallback((mods) => setData((d) => ({ ...d, modules: typeof mods === 'function' ? mods(d.modules) : mods })), [setData]);
  const onLessonChanged = useCallback((l) => setModules((mods) => mods.map((m) => ({
    ...m, lessons: m.lessons.map((x) => (x.id === l.id ? { ...x, title: l.title, status: l.status, hasChanges: l.hasChanges, settings: l.settings } : x)),
  }))), [setModules]);

  // если урок не выбран — открываем первый
  useEffect(() => {
    if (tab !== 'constructor' || activeId || !data) return;
    const first = data.modules.flatMap((m) => m.lessons)[0];
    if (first) nav(`/admin/courses/${courseId}/lesson/${first.id}`, { replace: true });
  }, [tab, activeId, data, courseId, nav]);

  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const course = data;
  const allLessons = course.modules.flatMap((m) => m.lessons);
  const publishedCount = allLessons.filter((l) => l.status === 'published').length;

  const publishCourse = async () => {
    if (!publishedCount) {
      const ok = await confirm({ title: 'Опубликовать курс?', text: 'В курсе ещё нет опубликованных занятий — ученики увидят пустой курс. Опубликуйте занятия кнопкой «Опубликовать занятие» в редакторе.', ok: 'Всё равно опубликовать' });
      if (!ok) return;
    }
    try {
      const c = await api.put(`/admin/courses/${course.id}`, { status: 'published' });
      setData((d) => ({ ...d, ...c }));
      toast(publishedCount < allLessons.length
        ? `Курс опубликован. Ученикам доступно ${publishedCount} из ${allLessons.length} занятий — черновики они не видят`
        : 'Курс опубликован — ученики, которым он открыт, уже его видят');
    } catch (e) { toast.error(e); }
  };

  return (
    <div>
      <Hero title={course.title} sub={course.description} cover={course.cover}
        back={<Link to="/admin/courses" className="btn btn-sm"><ChevronLeft size={16} />Все курсы</Link>}
        kicker={`Курс № ${String(course.id).padStart(2, '0')}`}>
        <div className="hero-tools">
          <button type="button" className="btn btn-on-dark btn-sm" onClick={() => setEditing(true)}><Pencil size={15} />Редактировать</button>
          <CourseMenu course={course} dark onEdit={() => setEditing(true)} onChanged={(c) => setData((d) => ({ ...d, ...c }))} onDeleted={() => nav('/admin/courses')} />
        </div>
        <div className="hero-meta">
          <span className="hero-chip">{course.status === 'published' ? <><CheckCircle2 size={13} />Курс опубликован</> : <><EyeOff size={13} />Курс-черновик — ученики его не видят</>}</span>
          <span className="hero-chip">{allLessons.length} {plural(allLessons.length, 'занятие', 'занятия', 'занятий')} · опубликовано {allLessons.filter((l) => l.status === 'published').length}</span>
        </div>
        {course.status !== 'published' && (
          <button type="button" className="btn btn-primary mt-16 pulse" onClick={publishCourse}>
            <Send size={16} />Опубликовать курс
          </button>
        )}
      </Hero>
      <div className="row row-wrap" style={{ alignItems: 'flex-start' }}>
        <div className="tabs">
          <Link to={activeId ? `/admin/courses/${courseId}/lesson/${activeId}` : `/admin/courses/${courseId}`} className={`tab ${tab === 'constructor' ? 'active' : ''}`}><Layers size={15} />Конструктор</Link>
          <Link to={`/admin/courses/${courseId}/students`} className={`tab ${tab === 'students' ? 'active' : ''}`}><UsersIcon size={15} />Ученики курса</Link>
          <Link to={`/admin/courses/${courseId}/settings`} className={`tab ${tab === 'settings' ? 'active' : ''}`}><Settings2 size={15} />Настройки курса</Link>
        </div>
        <span className="flex-1" />
        <a className="btn btn-secondary" href={`/course/${courseId}`} target="_blank" rel="noreferrer"><Eye size={16} />Предпросмотр курса</a>
      </div>

      {tab === 'constructor' && (
        <div className="editor-layout">
          <Outline course={course} modules={course.modules} setModules={setModules} activeId={activeId} reloadCourse={reload}
            onSelect={(id) => nav(`/admin/courses/${courseId}/lesson/${id}`)} />
          <div style={{ minWidth: 0 }}>
            {activeId && allLessons.some((l) => l.id === activeId) ? (
              <LessonEditor key={activeId} lessonId={activeId} courseId={course.id} onChanged={onLessonChanged}
                onDeleted={(id) => { setModules((mods) => mods.map((m) => ({ ...m, lessons: m.lessons.filter((x) => x.id !== id) }))); nav(`/admin/courses/${courseId}`, { replace: true }); }}
                onCreated={() => reload()} />
            ) : (
              <div className="card">
                <Empty icon={Layers} title={allLessons.length ? 'Выберите занятие слева' : 'Добавьте первое занятие'}
                  text={allLessons.length ? 'Откройте занятие в списке слева, чтобы редактировать его.' : 'Нажмите «+ Занятие» в модуле слева и выберите тип: урок, задание или тест.'} />
              </div>
            )}
          </div>
        </div>
      )}
      {tab === 'students' && <CourseStudents course={course} />}
      {tab === 'settings' && <CourseSettings course={course} onSaved={(c) => setData((d) => ({ ...d, ...c }))} />}
      {editing && <CourseEditModal course={course} onClose={() => setEditing(false)} onSaved={(c) => setData((d) => ({ ...d, ...c }))} />}
    </div>
  );
}
