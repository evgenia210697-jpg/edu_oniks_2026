import { useEffect, useRef, useState } from 'react';
import { ImagePlus, X, Mail, CheckCircle2, AlertTriangle, HardDrive, Palette, Check } from 'lucide-react';
import { api } from '../../api';
import { useAuth } from '../../App';
import { useApi, Loading, ErrorBox, Field, useToast, Menu } from '../../components/ui';
import ColorPicker from '../../components/ColorPicker';
import { Dropzone, useUploader, UploadProgressList } from '../../components/Files';

// Контраст белого текста на фирменном цвете (WCAG): ниже 3 — надписи на кнопках читаются плохо
function contrastWithWhite(hex) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  if (Number.isNaN(n)) return 21;
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  const L = 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  return 1.05 / (L + 0.05);
}

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
  // несохранённый цвет — только предпросмотр: при уходе со страницы возвращаем сохранённый
  const savedAccent = useRef(null);
  savedAccent.current = data?.accentColor;
  useEffect(() => () => { if (savedAccent.current) document.documentElement.style.setProperty('--accent', savedAccent.current); }, []);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const v = f || data;
  const set = (patch) => setF({ ...v, ...patch });
  const pickAccent = (c) => { set({ accentColor: c }); document.documentElement.style.setProperty('--accent', c); };

  const save = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      const s = await api.put('/admin/settings', {
        platformName: v.platformName, accentColor: v.accentColor, logoFileId: v.logoFileId, coverFileId: v.coverFileId,
        loginText: v.loginText, libraryTitle: v.libraryTitle, librarySubtitle: v.librarySubtitle,
      });
      savedAccent.current = s.accentColor; setSettings(s); setF(null); reload(); toast('Настройки сохранены');
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
          <Field label="Фирменный цвет" hint="Кнопки, ссылки, баннеры. Цвет сразу виден на странице — сохраните, если нравится">
            <div className="color-swatches">
              {PRESETS.map((c) => (
                <button type="button" key={c} className={`color-swatch ${v.accentColor.toLowerCase() === c.toLowerCase() ? 'on' : ''}`} style={{ background: c }}
                  onClick={() => pickAccent(c)} aria-label={c}>{v.accentColor.toLowerCase() === c.toLowerCase() && <Check size={15} strokeWidth={3} />}</button>
              ))}
              <Menu align="left" className="cp-menu" trigger={({ toggle, open }) => (
                <button type="button" className={`btn btn-secondary btn-sm ${open ? 'active' : ''}`} onClick={toggle}><Palette size={15} />Свой цвет</button>
              )}>
                {({ close }) => <ColorPicker value={v.accentColor} resetLabel={null} recentKey="lms-recent-accent" onChange={(c) => { if (c) pickAccent(c); close(); }} />}
              </Menu>
              <span className="accent-code">{v.accentColor.toUpperCase()}</span>
            </div>
            <div className="accent-preview">
              <span className="btn btn-primary btn-sm">Начать обучение</span>
              <span className="btn btn-soft btn-sm">Продолжить</span>
              <span className="badge badge-accent">Урок</span>
              <div className="progress" style={{ width: 120 }}><div style={{ width: '64%' }} /></div>
            </div>
            {contrastWithWhite(v.accentColor) < 3 && (
              <div className="alert alert-warning mt-8"><AlertTriangle size={16} />Цвет слишком светлый: белый текст на кнопках будет плохо читаться. Лучше выбрать оттенок темнее.</div>
            )}
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
