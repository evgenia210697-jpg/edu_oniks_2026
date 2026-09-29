import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MoreHorizontal, Pencil, Copy, Trash2, Eye, EyeOff, Send, Users, Layers, ImagePlus, X } from 'lucide-react';
import { api } from '../../api';
import { Menu, MenuItem, Modal, Field, useConfirm, useToast } from '../../components/ui';
import { Dropzone, useUploader, UploadProgressList } from '../../components/Files';

/** Окно «Редактировать курс»: название, описание, обложка */
export function CourseEditModal({ course, onClose, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState({ title: course.title, description: course.description || '', coverFileId: course.coverFileId || null, cover: course.cover || null });
  const [busy, setBusy] = useState(false);
  const { uploads, upload } = useUploader();
  const save = async (e) => {
    e?.preventDefault();
    if (!f.title.trim()) return;
    setBusy(true);
    try {
      const c = await api.put(`/admin/courses/${course.id}`, { title: f.title, description: f.description, coverFileId: f.coverFileId });
      onSaved?.(c); toast('Курс обновлён'); onClose();
    } catch (err) { toast.error(err); setBusy(false); }
  };
  return (
    <Modal title="Редактировать курс" onClose={onClose} footer={<>
      <button type="button" className="btn btn-secondary" onClick={onClose}>Отмена</button>
      <button type="submit" form="course-edit" className="btn btn-primary" disabled={busy || !f.title.trim() || uploads.length > 0}>Сохранить</button>
    </>}>
      <form id="course-edit" onSubmit={save}>
        <Field label="Название курса"><input className="input" autoFocus value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={200} required /></Field>
        <Field label="Краткое описание" hint="Видно ученикам на карточке и в шапке курса">
          <textarea className="textarea" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={1000} rows={3} />
        </Field>
        <Field label="Обложка" hint="1280×720 (16:9), JPG или PNG. Без обложки курс получит фирменную заглушку">
          {uploads.length ? <UploadProgressList uploads={uploads} /> : f.cover ? (
            <div className="row">
              <img src={f.cover} alt="" style={{ width: 220, aspectRatio: '16/9', objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setF({ ...f, cover: null, coverFileId: null })}><X size={15} />Убрать</button>
            </div>
          ) : (
            <Dropzone accept="image/*" icon={ImagePlus} compact title="Загрузить обложку" onFiles={async ([file]) => { const r = await upload(file); if (r) setF((x) => ({ ...x, cover: r.url, coverFileId: r.id })); }} />
          )}
        </Field>
      </form>
    </Modal>
  );
}

/** Действия с курсом: копия, публикация, удаление */
export function useCourseActions() {
  const nav = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  return {
    duplicate: async (course) => {
      try {
        const c = await api.post(`/admin/courses/${course.id}/duplicate`);
        toast('Копия курса создана — она в черновиках'); nav(`/admin/courses/${c.id}`);
      } catch (e) { toast.error(e); }
    },
    setStatus: async (course, status) => {
      try {
        const c = await api.put(`/admin/courses/${course.id}`, { status });
        toast(status === 'published' ? 'Курс опубликован' : 'Курс скрыт от учеников'); return c;
      } catch (e) { toast.error(e); return null; }
    },
    remove: async (course) => {
      const ok = await confirm({ title: 'Удалить курс навсегда?', danger: true, ok: 'Удалить курс',
        text: `Курс «${course.title}», все его занятия и результаты учеников будут удалены. Отменить это нельзя. Если курс просто больше не нужен ученикам — лучше снять его с публикации.` });
      if (!ok) return false;
      try { await api.del(`/admin/courses/${course.id}`); toast('Курс удалён'); return true; } catch (e) { toast.error(e); return false; }
    },
  };
}

/** Кнопка «…» с меню действий курса */
export function CourseMenu({ course, onEdit, onChanged, onDeleted, dark, showOpen }) {
  const nav = useNavigate();
  const act = useCourseActions();
  const published = course.status === 'published';
  return (
    <Menu trigger={({ toggle, open }) => (
      <button type="button" className={`btn btn-icon ${dark ? 'btn-on-dark' : 'btn-secondary'} ${open ? 'active' : ''}`} onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(); }}
        aria-label="Действия с курсом" title="Действия с курсом"><MoreHorizontal size={18} /></button>
    )}>
      {showOpen && <MenuItem icon={Layers} onClick={() => nav(`/admin/courses/${course.id}`)}>Открыть конструктор</MenuItem>}
      <MenuItem icon={Pencil} onClick={onEdit}>Редактировать название и обложку</MenuItem>
      <MenuItem icon={Users} onClick={() => nav(`/admin/courses/${course.id}/students`)}>Ученики курса</MenuItem>
      <MenuItem icon={Eye} onClick={() => nav(`/course/${course.id}`)}>Посмотреть как ученик</MenuItem>
      <MenuItem icon={Copy} onClick={() => act.duplicate(course)}>Создать копию</MenuItem>
      {published
        ? <MenuItem icon={EyeOff} onClick={async () => { const c = await act.setStatus(course, 'draft'); if (c) onChanged?.(c); }}>Снять с публикации</MenuItem>
        : <MenuItem icon={Send} onClick={async () => { const c = await act.setStatus(course, 'published'); if (c) onChanged?.(c); }}>Опубликовать</MenuItem>}
      <div className="menu-sep" />
      <MenuItem icon={Trash2} danger onClick={async () => { if (await act.remove(course)) onDeleted?.(); }}>Удалить курс</MenuItem>
    </Menu>
  );
}
