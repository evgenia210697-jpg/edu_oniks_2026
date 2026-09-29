import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Search, Users, Layers, CheckCircle2, EyeOff, PlusCircle } from 'lucide-react';
import { api } from '../../api';
import { useApi, Loading, ErrorBox, Modal, Field, useToast, Empty } from '../../components/ui';
import { CourseCover } from '../student/Library';
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
  const [creating, setCreating] = useState(false);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const list = data.filter((c) => c.title.toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <div className="page-head">
        <div className="flex-1"><h1>Курсы</h1><div className="page-sub">Создавайте курсы, наполняйте уроками, тестами и заданиями</div></div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={17} />Создать курс</button>
      </div>
      {data.length > 4 && (
        <div className="toolbar"><div className="input-group"><Search size={17} /><input className="input" placeholder="Поиск по курсам" value={q} onChange={(e) => setQ(e.target.value)} /></div></div>
      )}
      {data.length === 0 ? (
        <div className="card"><Empty icon={Layers} title="Пока нет ни одного курса" text="Создайте первый курс — например, «Адаптация новых сотрудников»."><button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={17} />Создать курс</button></Empty></div>
      ) : (
        <div className="course-grid">
          {list.map((c) => (
            <Link key={c.id} to={`/admin/courses/${c.id}`} className="card course-card">
              <CourseCover course={c} />
              <div className="course-body">
                <div>{c.status === 'published'
                  ? <span className="badge badge-success"><CheckCircle2 size={12} />Опубликован</span>
                  : <span className="badge"><EyeOff size={12} />Черновик</span>}</div>
                <div className="course-title">{c.title}</div>
                {c.description && <div className="course-desc">{c.description}</div>}
                <div className="course-foot row small muted" style={{ gap: 14 }}>
                  <span className="row" style={{ gap: 4 }}><Layers size={14} />{c.lessonsCount} {plural(c.lessonsCount, 'занятие', 'занятия', 'занятий')}</span>
                  <span className="row" style={{ gap: 4 }}><Users size={14} />{c.studentsCount} {plural(c.studentsCount, 'ученик', 'ученика', 'учеников')}</span>
                  {c.completedCount > 0 && <span className="row" style={{ gap: 4 }}><CheckCircle2 size={14} />{c.completedCount}</span>}
                </div>
                <span className="btn btn-soft btn-block mt-8">Редактировать курс</span>
              </div>
            </Link>
          ))}
          <div className="card course-card add" onClick={() => setCreating(true)} role="button" tabIndex={0}>
            <div style={{ textAlign: 'center' }}><PlusCircle size={30} /><div className="mt-8">Создать курс</div></div>
          </div>
        </div>
      )}
      {creating && <CreateCourseModal onClose={() => setCreating(false)} />}
    </div>
  );
}
