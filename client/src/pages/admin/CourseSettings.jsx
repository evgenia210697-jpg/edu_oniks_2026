import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, Trash2, ImagePlus, X } from 'lucide-react';
import { api } from '../../api';
import { Field, Toggle, useToast, useConfirm } from '../../components/ui';
import { Dropzone, useUploader, UploadProgressList } from '../../components/Files';

export default function CourseSettings({ course, onSaved }) {
  const nav = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const [f, setF] = useState({ title: course.title, description: course.description, status: course.status, sequential: course.sequential, coverFileId: course.coverFileId, cover: course.cover });
  const [busy, setBusy] = useState(false);
  const { uploads, upload } = useUploader();

  const save = async (e) => {
    e?.preventDefault(); setBusy(true);
    try {
      const c = await api.put(`/admin/courses/${course.id}`, { title: f.title, description: f.description, status: f.status, sequential: f.sequential, coverFileId: f.coverFileId });
      onSaved(c); toast('Настройки курса сохранены');
    } catch (err) { toast.error(err); } finally { setBusy(false); }
  };
  const duplicate = async () => {
    const c = await api.post(`/admin/courses/${course.id}/duplicate`);
    toast('Копия курса создана'); nav(`/admin/courses/${c.id}`);
  };
  const remove = async () => {
    if (!(await confirm({ title: 'Удалить курс навсегда?', text: `Курс «${course.title}», все занятия и результаты учеников будут удалены. Отменить нельзя.`, ok: 'Удалить курс', danger: true }))) return;
    await api.del(`/admin/courses/${course.id}`);
    toast('Курс удалён'); nav('/admin/courses');
  };

  return (
    <div style={{ maxWidth: 820 }}>
      <form className="card card-pad" onSubmit={save}>
        <h3 className="mb-16">Основные настройки</h3>
        <Field label="Статус курса">
          <div className="radio-cards" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className={`radio-card ${f.status === 'draft' ? 'active' : ''}`} onClick={() => setF({ ...f, status: 'draft' })}>
              <input type="radio" checked={f.status === 'draft'} readOnly /><div><div className="bold">Черновик</div><div className="small muted">Ученики не видят курс</div></div>
            </div>
            <div className={`radio-card ${f.status === 'published' ? 'active' : ''}`} onClick={() => setF({ ...f, status: 'published' })}>
              <input type="radio" checked={f.status === 'published'} readOnly /><div><div className="bold">Опубликован</div><div className="small muted">Доступен добавленным ученикам</div></div>
            </div>
          </div>
        </Field>
        <Field label="Название курса"><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required /></Field>
        <Field label="Краткое описание" hint="Показывается на карточке курса"><textarea className="textarea" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={1000} /></Field>
        <Field label="Обложка курса" hint="Рекомендуемый размер 1280×720 (16:9), JPG или PNG">
          {uploads.length ? <UploadProgressList uploads={uploads} /> : f.cover ? (
            <div className="row">
              <img src={f.cover} alt="" style={{ width: 260, aspectRatio: '16/9', objectFit: 'cover', borderRadius: 12 }} />
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setF({ ...f, cover: null, coverFileId: null })}><X size={15} />Убрать</button>
            </div>
          ) : (
            <Dropzone accept="image/*" icon={ImagePlus} compact title="Загрузить обложку" onFiles={async ([file]) => { const r = await upload(file); if (r) setF((x) => ({ ...x, cover: r.url, coverFileId: r.id })); }} />
          )}
        </Field>
        <div className="mb-16">
          <Toggle checked={f.sequential} onChange={(v) => setF({ ...f, sequential: v })} label="Последовательное прохождение"
            hint="Следующее занятие открывается только после выполнения предыдущего (задание — после отправки ответа, тест — после сдачи). Кто прошёл курс целиком, может открывать занятия в любом порядке" />
        </div>
        <button className="btn btn-primary" disabled={busy}>Сохранить</button>
      </form>

      <div className="card card-pad mt-16">
        <h3 className="mb-16">Другие действия</h3>
        <div className="row row-wrap">
          <button className="btn btn-secondary" onClick={duplicate}><Copy size={16} />Создать копию курса</button>
          <button className="btn btn-danger-soft" onClick={remove}><Trash2 size={16} />Удалить курс</button>
        </div>
      </div>
    </div>
  );
}
