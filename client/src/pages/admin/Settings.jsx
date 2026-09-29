import { useState } from 'react';
import { ImagePlus, X, Mail, CheckCircle2, AlertTriangle, HardDrive } from 'lucide-react';
import { api } from '../../api';
import { useAuth } from '../../App';
import { useApi, Loading, ErrorBox, Field, useToast } from '../../components/ui';
import { Dropzone, useUploader, UploadProgressList } from '../../components/Files';

const PRESETS = ['#2F5BEA', '#1565C0', '#0E7C86', '#15935B', '#E0730B', '#D63B3B', '#7C4DDB', '#C2408F', '#1B2430'];

function ImageField({ label, hint, url, onChange, wide }) {
  const { uploads, upload } = useUploader();
  return (
    <Field label={label} hint={hint}>
      {uploads.length ? <UploadProgressList uploads={uploads} /> : url ? (
        <div className="row">
          <img src={url} alt="" style={wide ? { width: 280, aspectRatio: '16/5', objectFit: 'cover', borderRadius: 12 } : { width: 72, height: 72, objectFit: 'contain', borderRadius: 12, border: '1px solid var(--border)', background: '#fff' }} />
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(null)}><X size={15} />Убрать</button>
        </div>
      ) : (
        <Dropzone accept="image/*" icon={ImagePlus} compact title="Загрузить изображение" onFiles={async ([f]) => { const r = await upload(f); if (r) onChange(r); }} />
      )}
    </Field>
  );
}

export default function Settings() {
  const { setSettings } = useAuth();
  const toast = useToast();
  const { data, error, loading, reload } = useApi('/admin/settings');
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const v = f || data;
  const set = (patch) => setF({ ...v, ...patch });

  const save = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      const s = await api.put('/admin/settings', {
        platformName: v.platformName, accentColor: v.accentColor, logoFileId: v.logoFileId, coverFileId: v.coverFileId,
        loginText: v.loginText, libraryTitle: v.libraryTitle, librarySubtitle: v.librarySubtitle,
      });
      setSettings(s); setF(null); reload(); toast('Настройки сохранены');
    } catch (err) { toast.error(err); } finally { setBusy(false); }
  };

  return (
    <div style={{ maxWidth: 860 }}>
      <div className="page-head"><div className="flex-1"><h1>Настройки платформы</h1><div className="page-sub">Название, логотип и фирменный цвет. Сотрудники и их роли — в разделе «Сотрудники».</div></div></div>
      <form onSubmit={save}>
        <div className="card card-pad">
          <h3 className="mb-16">Оформление</h3>
          <Field label="Название платформы" hint="Показывается в меню, на странице входа и во вкладке браузера">
            <input className="input" value={v.platformName} onChange={(e) => set({ platformName: e.target.value })} maxLength={80} />
          </Field>
          <Field label="Фирменный цвет" hint="Кнопки, ссылки, баннеры">
            <div className="color-swatches">
              {PRESETS.map((c) => <button type="button" key={c} className={`color-swatch ${v.accentColor.toLowerCase() === c.toLowerCase() ? 'on' : ''}`} style={{ background: c }} onClick={() => { set({ accentColor: c }); document.documentElement.style.setProperty('--accent', c); }} aria-label={c} />)}
              <input type="color" value={v.accentColor} onChange={(e) => { set({ accentColor: e.target.value }); document.documentElement.style.setProperty('--accent', e.target.value); }} style={{ width: 44, height: 34, border: 0, background: 'none', cursor: 'pointer' }} title="Свой цвет" />
              <span className="small muted">{v.accentColor}</span>
            </div>
          </Field>
          <ImageField label="Логотип" hint="Квадратный PNG или SVG, от 128×128" url={v.logo} onChange={(r) => set({ logo: r?.url || null, logoFileId: r?.id || null })} />
          <ImageField wide label="Обложка раздела «Моё обучение»" hint="Широкая картинка ~1600×500. Без обложки используется фирменный цвет" url={v.cover} onChange={(r) => set({ cover: r?.url || null, coverFileId: r?.id || null })} />
        </div>
        <div className="card card-pad mt-16">
          <h3 className="mb-16">Тексты</h3>
          <Field label="Текст на странице входа"><input className="input" value={v.loginText} onChange={(e) => set({ loginText: e.target.value })} /></Field>
          <div className="grid-2">
            <Field label="Заголовок раздела учеников"><input className="input" value={v.libraryTitle} onChange={(e) => set({ libraryTitle: e.target.value })} /></Field>
            <Field label="Подзаголовок"><input className="input" value={v.librarySubtitle} onChange={(e) => set({ librarySubtitle: e.target.value })} /></Field>
          </div>
        </div>
        <div className="row mt-16"><button className="btn btn-primary btn-lg" disabled={busy || !f}>Сохранить настройки</button>{f && <button type="button" className="btn btn-ghost" onClick={() => { setF(null); document.documentElement.style.setProperty('--accent', data.accentColor); }}>Отменить</button>}</div>
      </form>

      <div className="card card-pad mt-24">
        <h3 className="mb-16">Почта и файлы</h3>
        {data.mailEnabled
          ? <div className="alert alert-success"><CheckCircle2 size={18} /><div><b>Email-уведомления включены.</b> Сотрудники получают письма о проверке заданий и новых курсах (если не отключили в профиле).</div></div>
          : <div className="alert alert-warning"><AlertTriangle size={18} /><div><b>Email-уведомления выключены</b> — уведомления видны только внутри платформы (колокольчик). Чтобы включить письма, IT-специалист указывает параметры почтового сервера (SMTP) в файле <span className="kbd">.env</span> — инструкция в файле README.</div></div>}
        <div className="row small muted mt-16"><HardDrive size={16} />Максимальный размер загружаемого файла: {data.maxUploadMb >= 1024 ? `${(data.maxUploadMb / 1024).toFixed(0)} ГБ` : `${data.maxUploadMb} МБ`} (меняется в .env — MAX_UPLOAD_MB)</div>
        <div className="row small muted mt-8"><Mail size={16} />Забытые пароли сбрасывает администратор в карточке сотрудника.</div>
      </div>
    </div>
  );
}
