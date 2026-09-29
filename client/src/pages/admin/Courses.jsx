import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search, Users, Layers, CheckCircle2, EyeOff, PlusCircle, Pencil, ArrowRight } from 'lucide-react';
import { api } from '../../api';
import { useApi, Loading, ErrorBox, Modal, Field, useToast, Empty } from '../../components/ui';
import { CourseCover } from '../student/Library';
import QuickStart from './QuickStart';
import { CourseMenu, CourseEditModal } from './CourseActions';
import { plural } from '../../utils';

export function CreateCourseModal({ onClose }) {
  const nav = useNavigate();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    try { const c = await api.post('/admin/courses', { title }); nav(`/admin/courses/${c.id}`); } catch (err) { toast.error(err); setBusy(false); }
  };
  return (
    <Modal title="Новый курс" onClose={onClose} footer={<>
      <button className="btn btn-secondary" onClick={onClose}>Отмена</button>
      <button className="btn btn-primary" form="new-course" disabled={busy || !title.trim()}>Создать</button>
    </>}>
      <form id="new-course" onSubmit={submit}>
        <Field label="Название курса" hint="Можно изменить позже">
          <input className="input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Например: Основы продаж" />
        </Field>
      </form>
    </Modal>
  );
}

export default function Courses() {
  const { data, error, loading, reload } = useApi('/admin/courses');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);
  const [params, setParams] = useSearchParams();
  const [creating, setCreatingState] = useState(params.get('new') === '1');
  const setCreating = (v) => { setCreatingState(v); if (!v && params.get('new')) setParams({}, { replace: true }); };
  useEffect(() => { if (params.get('new') === '1') setCreatingState(true); }, [params]);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const list = data.filter((c) => c.title.toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <div className="page-head">
        <div className="flex-1"><h1>Курсы</h1><div className="page-sub">Создавайте курсы, наполняйте уроками, тестами и заданиями</div></div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={17} />Создать курс</button>
      </div>
      <QuickStart courses={data} />
      {data.length > 4 && (
        <div className="toolbar"><div className="input-group"><Search size={17} /><input className="input" placeholder="Поиск по курсам" value={q} onChange={(e) => setQ(e.target.value)} /></div></div>
      )}
      {data.length === 0 ? (
        <div className="card"><Empty icon={Layers} title="Пока нет ни одного курса" text="Создайте первый курс — например, «Адаптация новых сотрудников»."><button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={17} />Создать курс</button></Empty></div>
      ) : (
        <div className="course-grid stagger">
          {list.map((c) => (
            <div key={c.id} className="card course-card">
              <Link to={`/admin/courses/${c.id}`} className="cc-link" aria-label={`Открыть курс «${c.title}»`}><CourseCover course={c} /></Link>
              <div className="cc-actions"><CourseMenu course={c} showOpen onEdit={() => setEditing(c)} onChanged={() => reload()} onDeleted={() => reload()} dark /></div>
              <div className="course-body">
                <div>{c.status === 'published'
                  ? <span className="badge badge-success"><CheckCircle2 size={12} />Опубликован</span>
                  : <span className="badge"><EyeOff size={12} />Черновик</span>}</div>
                <Link to={`/admin/courses/${c.id}`} className="course-title cc-title">{c.title}</Link>
                {c.description && <div className="course-desc">{c.description}</div>}
                <div className="course-foot row small muted" style={{ gap: 14 }}>
                  <span className="row mono" style={{ gap: 4 }}><Layers size={14} />{c.lessonsCount} {plural(c.lessonsCount, 'занятие', 'занятия', 'занятий')}</span>
                  <span className="row mono" style={{ gap: 4 }}><Users size={14} />{c.studentsCount} {plural(c.studentsCount, 'ученик', 'ученика', 'учеников')}</span>
                  {c.completedCount > 0 && <span className="row mono" style={{ gap: 4 }}><CheckCircle2 size={14} />{c.completedCount}</span>}
                </div>
                <div className="cc-buttons">
                  <Link to={`/admin/courses/${c.id}`} className="btn btn-soft flex-1">Конструктор<ArrowRight size={16} /></Link>
                  <button type="button" className="btn btn-secondary btn-icon" onClick={() => setEditing(c)} title="Редактировать название и обложку" aria-label="Редактировать курс"><Pencil size={16} /></button>
                </div>
              </div>
            </div>
          ))}
          <div className="card course-card add" onClick={() => setCreating(true)} role="button" tabIndex={0}>
            <div style={{ textAlign: 'center' }}><PlusCircle size={30} /><div className="mt-8">Создать курс</div></div>
          </div>
        </div>
      )}
      {creating && <CreateCourseModal onClose={() => setCreating(false)} />}
      {editing && <CourseEditModal course={editing} onClose={() => setEditing(null)} onSaved={() => reload()} />}
    </div>
  );
}
