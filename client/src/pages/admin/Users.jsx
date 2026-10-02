import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { UserPlus, Download, Search, Users as UsersIcon, Activity, TrendingUp, Clock, Award, FileSpreadsheet, BookPlus, Copy, CheckCircle2, Send, KeyRound, MailWarning, ExternalLink, Wand2 } from 'lucide-react';
import { api } from '../../api';
import { useAuth } from '../../App';
import { useApi, Loading, ErrorBox, Avatar, Progress, Modal, Field, useToast, Empty, CountUp, Toggle } from '../../components/ui';
import { fmtRelative, ROLE_LABEL, copyText, plural, downloadBlob } from '../../utils';

function credsText(list, url) {
  return list.map((u) => `${u.name}\nАдрес: ${url}\nЛогин: ${u.email}\nПароль: ${u.password}`).join('\n\n');
}

export function CredsBox({ list }) {
  const toast = useToast();
  const url = window.location.origin;
  const text = credsText(list, url);
  return (
    <div>
      <div className="alert alert-success mb-16"><CheckCircle2 size={18} />Передайте сотруднику данные для входа. Пароль показывается только сейчас — потом его можно только сбросить.</div>
      <div className="creds" style={{ maxHeight: 300, overflowY: 'auto' }}>{text}</div>
      <div className="row mt-16">
        <button className="btn btn-secondary" onClick={() => copyText(text).then(() => toast('Скопировано'))}><Copy size={16} />Скопировать</button>
        {list.length > 1 && <button className="btn btn-secondary" onClick={() => downloadBlob('Доступы сотрудников.csv', '﻿' + ['ФИО;Логин;Пароль', ...list.map((u) => `${u.name};${u.email};${u.password}`)].join('\r\n'))}><Download size={16} />Скачать списком</button>}
      </div>
    </div>
  );
}

/** Результат приглашения: статус письма и личная ссылка (её можно отправить в мессенджере) */
export function InviteBox({ list }) {
  const toast = useToast();
  const nav = useNavigate();
  // в демо-версии писем нет, а ссылка вне демо не откроется — показываем страницу приглашения прямо здесь
  const demo = !!globalThis.__DEMO;
  const sent = list.filter((x) => x.invite?.emailSent).length;
  const copy = (text, msg = 'Ссылка скопирована') => copyText(text).then(() => toast(msg)).catch(() => toast.error('Не удалось скопировать — выделите ссылку вручную'));
  const all = list.map((x) => `${x.name} (${x.email}): ${x.invite.link}`).join('\n');
  return (
    <div className="invite-box">
      {demo ? (
        <div className="alert alert-info"><Send size={18} /><div><b>Демо-версия:</b> письма здесь не отправляются. На рабочем сервере сотрудник получит письмо с кнопкой «Принять приглашение».
          <div className="small muted mt-8">Чтобы увидеть, что увидит сотрудник, нажмите «Открыть как сотрудник», затем «Выйти и принять приглашение».</div></div></div>
      ) : list.every((x) => x.invite?.noEmail) ? (
        <div className="alert alert-info"><Send size={18} /><div>У {list.length === 1 ? 'сотрудника' : 'сотрудников'} не указан e-mail — письмо отправлять некуда. Скопируйте {list.length === 1 ? 'ссылку' : 'ссылки'} и передайте сами (в мессенджере, лично).
          <div className="small muted mt-8">Резервный e-mail можно добавить в карточке сотрудника → «Изменить».</div></div></div>
      ) : sent === list.length ? (
        <div className="alert alert-success"><CheckCircle2 size={18} /><div>{list.length === 1
          ? <>Приглашение отправлено на <b>{list[0].email}</b>. Сотрудник откроет ссылку из письма, задаст пароль и сразу попадёт на платформу.</>
          : <>Приглашения отправлены: {list.length}. Каждый сотрудник получит письмо со своей ссылкой.</>}
          <div className="small muted mt-8">Ссылка действует 7 дней. Если письмо не пришло — проверьте «Спам» или отправьте ссылку ниже в мессенджере.</div></div></div>
      ) : (
        <div className="alert alert-warning"><MailWarning size={18} /><div><b>Почта на сервере не настроена</b> — письмо не отправлено. Скопируйте {list.length === 1 ? 'ссылку' : 'ссылки'} и отправьте {list.length === 1 ? 'сотруднику' : 'сотрудникам'} сами (почтой, в мессенджере).
          <div className="small muted mt-8">Чтобы письма уходили автоматически, IT-специалист заполняет блок SMTP в файле .env — инструкция в README.</div></div></div>
      )}
      <div className="stack" style={{ gap: 8, maxHeight: 280, overflowY: 'auto' }}>
        {list.map((x) => (
          <div key={x.email}>
            {list.length > 1 && <div className="small bold mb-8">{x.name} · <span className="muted">{x.email}</span></div>}
            <div className="invite-link">
              <code title={x.invite.link}>{x.invite.link}</code>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => copy(x.invite.link)}><Copy size={14} />Копировать</button>
              {demo
                ? <button type="button" className="btn btn-primary btn-sm" onClick={() => nav(x.invite.path)}><ExternalLink size={14} />Открыть как сотрудник</button>
                : list.length === 1 && <a className="btn btn-ghost btn-sm" href={x.invite.path} target="_blank" rel="noreferrer" title="Открыть страницу приглашения"><ExternalLink size={14} /></a>}
            </div>
          </div>
        ))}
      </div>
      {list.length > 1 && <button type="button" className="btn btn-secondary" onClick={() => copy(all, 'Все ссылки скопированы')}><Copy size={16} />Скопировать все ссылки</button>}
    </div>
  );
}

function CourseChecklist({ courses, value, onChange }) {
  if (!courses?.length) return <div className="small muted">Курсов пока нет</div>;
  return (
    <div className="stack" style={{ gap: 6, maxHeight: 180, overflowY: 'auto' }}>
      {courses.map((c) => (
        <label key={c.id} className="check">
          <input type="checkbox" checked={value.includes(c.id)} onChange={() => onChange(value.includes(c.id) ? value.filter((x) => x !== c.id) : [...value, c.id])} />
          {c.title}{c.status !== 'published' && <span className="badge">черновик</span>}
        </label>
      ))}
    </div>
  );
}

export function UserFormModal({ user, onClose, onSaved, departments = [] }) {
  const toast = useToast();
  const isNew = !user;
  const { data: courses } = useApi(isNew ? '/admin/courses' : null);
  const [f, setF] = useState(user
    ? { ...user, login: user.login || user.email, contactEmail: user.contactEmail || '', password: '' }
    : { name: '', email: '', login: '', contactEmail: '', role: 'student', department: '', position: '', phone: '', comment: '', password: '', courseIds: [] });
  const [autoPw, setAutoPw] = useState(true);
  const [mode, setMode] = useState('invite'); // invite — письмо со ссылкой; password — пароль задаёт администратор
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const [genBusy, setGenBusy] = useState(false);
  // логин по ФИО: «Иванов Иван» → ivanov.ivan (с цифрой, если такой уже есть)
  // force — по кнопке (заменяет логин); без него — автоподстановка, только если поле ещё пустое
  const genLogin = async (name = f.name, force = true) => {
    setGenBusy(true);
    try { const r = await api.get(`/admin/users/suggest-login?name=${encodeURIComponent(name || '')}`); setF((x) => (force || !x.login ? { ...x, login: r.login } : x)); }
    catch (err) { toast.error(err); } finally { setGenBusy(false); }
  };
  const loginField = (
    <Field label="Логин" hint={isNew ? 'Латиница, цифры, точка — или e-mail. По нему сотрудник входит на платформу' : 'По нему сотрудник входит на платформу'}>
      <div className="row" style={{ gap: 8 }}>
        <input className="input" value={f.login} onChange={(e) => setF({ ...f, login: e.target.value.trim().toLowerCase() })} required placeholder="ivanov.ivan" autoComplete="off" spellCheck={false} />
        {isNew && <button type="button" className="btn btn-secondary nowrap" onClick={() => genLogin()} disabled={genBusy}><Wand2 size={15} />Сгенерировать</button>}
      </div>
    </Field>
  );
  const contactField = (
    <Field label="E-mail (резервный, необязательно)" hint="Для уведомлений и восстановления доступа. Можно указать один e-mail для нескольких сотрудников">
      <input className="input" type="email" value={f.contactEmail} onChange={set('contactEmail')} placeholder="sklad@company.ru" />
    </Field>
  );

  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      if (isNew) {
        const invite = mode === 'invite';
        const r = await api.post('/admin/users', { ...f, invite, origin: window.location.origin, password: !invite && !autoPw ? f.password : '', login: invite ? undefined : f.login, contactEmail: invite ? '' : f.contactEmail });
        setCreated({ name: r.name, email: r.email, password: r.password, invite: r.invite });
        onSaved?.(r);
      } else {
        const r = await api.put(`/admin/users/${user.id}`, { ...f, password: f.password || undefined });
        toast('Изменения сохранены'); onSaved?.(r); onClose();
      }
    } catch (err) { toast.error(err); } finally { setBusy(false); }
  };

  if (created) {
    return (
      <Modal title={created.invite ? 'Приглашение создано' : 'Сотрудник добавлен'} onClose={onClose} footer={<button className="btn btn-primary" onClick={onClose}>Готово</button>}>
        {created.invite ? <InviteBox list={[created]} /> : <CredsBox list={[created]} />}
      </Modal>
    );
  }
  return (
    <Modal title={isNew ? 'Пригласить сотрудника' : 'Редактировать сотрудника'} size="wide" onClose={onClose} footer={<>
      <button className="btn btn-secondary" onClick={onClose}>Отмена</button>
      <button className="btn btn-primary" form="user-form" disabled={busy}>{isNew ? (mode === 'invite' ? <><Send size={16} />Отправить приглашение</> : 'Добавить') : 'Сохранить'}</button>
    </>}>
      <form id="user-form" onSubmit={submit}>
        {isNew && (
          <Field label="Как выдать доступ">
            <div className="radio-cards" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div className={`radio-card ${mode === 'invite' ? 'active' : ''}`} onClick={() => setMode('invite')} role="button" tabIndex={0}>
                <input type="radio" checked={mode === 'invite'} readOnly /><div><div className="bold">Приглашение на e-mail</div><div className="small muted">Сотрудник получит письмо и сам задаст пароль</div></div>
              </div>
              <div className={`radio-card ${mode === 'password' ? 'active' : ''}`} onClick={() => setMode('password')} role="button" tabIndex={0}>
                <input type="radio" checked={mode === 'password'} readOnly /><div><div className="bold">Выдать пароль</div><div className="small muted">Вы передадите логин и пароль сами</div></div>
              </div>
            </div>
          </Field>
        )}
        <div className="grid-2">
          {isNew && mode === 'invite' && <Field label="Email (будет логином)"><input className="input" type="email" value={f.email} onChange={set('email')} required autoFocus placeholder="ivanov@company.ru" /></Field>}
          <Field label={isNew && mode === 'invite' ? 'ФИО (необязательно)' : 'ФИО'} hint={isNew && mode === 'invite' ? 'Если не знаете — сотрудник впишет сам' : undefined}>
            <input className="input" value={f.name} onChange={set('name')} required={!isNew || mode !== 'invite'} autoFocus={!isNew || mode === 'password'} placeholder="Иванов Иван"
              onBlur={() => { if (isNew && mode === 'password' && !f.login && f.name.trim()) genLogin(f.name, false); }} />
          </Field>
          {(!isNew || mode === 'password') && <>{loginField}{contactField}</>}
          <Field label="Отдел">
            <input className="input" value={f.department} onChange={set('department')} list="departments" placeholder="Отдел продаж" />
            <datalist id="departments">{departments.map((d) => <option key={d} value={d} />)}</datalist>
          </Field>
          <Field label="Должность"><input className="input" value={f.position} onChange={set('position')} placeholder="Менеджер" /></Field>
          <Field label="Роль" hint={f.role === 'curator' ? 'Проверяет задания, видит прогресс сотрудников' : f.role === 'admin' ? 'Полный доступ: курсы, сотрудники, настройки' : 'Проходит обучение'}>
            <select className="select" value={f.role} onChange={set('role')}>
              <option value="student">Ученик</option><option value="curator">Куратор</option><option value="admin">Администратор</option>
            </select>
          </Field>
          <Field label="Телефон"><input className="input" value={f.phone} onChange={set('phone')} /></Field>
        </div>
        {isNew ? (
          <>
            {mode === 'password' && <>
              <div className="mb-16"><label className="check"><input type="checkbox" checked={autoPw} onChange={(e) => setAutoPw(e.target.checked)} />Сгенерировать пароль автоматически</label></div>
              {!autoPw && <Field label="Пароль" hint="Минимум 6 символов"><input className="input" value={f.password} onChange={set('password')} minLength={6} required /></Field>}
            </>}
            <Field label="Сразу открыть курсы"><CourseChecklist courses={courses} value={f.courseIds} onChange={(courseIds) => setF({ ...f, courseIds })} /></Field>
          </>
        ) : (
          <Field label="Новый пароль" hint="Оставьте пустым, чтобы не менять"><input className="input" value={f.password} onChange={set('password')} minLength={6} autoComplete="new-password" /></Field>
        )}
        <Field label="Комментарий (видят только администраторы)"><input className="input" value={f.comment || ''} onChange={set('comment')} placeholder="Например: стажировка до 01.12" /></Field>
      </form>
    </Modal>
  );
}

function ImportModal({ onClose, onDone }) {
  const toast = useToast();
  const { data: courses } = useApi('/admin/courses');
  const [text, setText] = useState('');
  const [courseIds, setCourseIds] = useState([]);
  const [invite, setInvite] = useState(true);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const rows = useMemo(() => text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    const p = l.split(/\t|;/).map((x) => x.trim());
    const emailIdx = p.findIndex((x) => /@/.test(x));
    const email = emailIdx >= 0 ? p[emailIdx] : '';
    const rest = p.filter((_, i) => i !== emailIdx);
    return { name: rest[0] || '', email, department: rest[1] || '', position: rest[2] || '' };
  }).filter((r) => !/^фио$/i.test(r.name) && (invite ? r.email : r.name)), [text, invite]);

  const run = async () => {
    setBusy(true);
    try { const r = await api.post('/admin/users/import', { rows, courseIds, invite, origin: window.location.origin }); setResult(r); onDone(); } catch (e) { toast.error(e); } finally { setBusy(false); }
  };

  if (result) {
    return (
      <Modal title={invite ? `Приглашено сотрудников: ${result.created.length}` : `Добавлено сотрудников: ${result.created.length}`} size="wide" onClose={onClose} footer={<button className="btn btn-primary" onClick={onClose}>Готово</button>}>
        {result.errors.length > 0 && <div className="alert alert-warning mb-16"><div>Не добавлены ({result.errors.length}):<br />{result.errors.map((e) => <div key={e.row} className="small">Строка {e.row}: {e.error}</div>)}</div></div>}
        {result.created.length > 0 && (invite ? <InviteBox list={result.created} /> : <CredsBox list={result.created} />)}
      </Modal>
    );
  }
  return (
    <Modal title="Добавить сотрудников списком" size="wide" onClose={onClose} footer={<>
      <button className="btn btn-secondary" onClick={onClose}>Отмена</button>
      <button className="btn btn-primary" disabled={!rows.length || busy} onClick={run}>{invite ? <><Send size={16} />Пригласить {rows.length || ''}</> : `Добавить ${rows.length || ''}`}</button>
    </>}>
      <p className="muted small mb-16">Скопируйте столбцы из Excel и вставьте ниже. Порядок: <b>ФИО, Email, Отдел, Должность</b> — по одному сотруднику в строке. {invite
        ? 'Для приглашений достаточно одних e-mail — имя сотрудник впишет сам.'
        : 'Логины и пароли сгенерируются по ФИО. E-mail необязателен — он станет резервным (может повторяться).'}</p>
      <textarea className="textarea" style={{ minHeight: 150, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13 }} value={text} onChange={(e) => setText(e.target.value)}
        placeholder={'Иванов Иван\tivanov@company.ru\tОтдел продаж\tМенеджер\nПетрова Анна\tpetrova@company.ru\tСклад\tКладовщик'} />
      {rows.length > 0 && (
        <div className="card table-wrap mt-16" style={{ maxHeight: 220, overflowY: 'auto' }}>
          <table className="table"><thead><tr><th>ФИО</th><th>{invite ? 'Email' : 'E-mail (резервный)'}</th><th>Отдел</th><th>Должность</th></tr></thead>
            <tbody>{rows.map((r, i) => <tr key={i}><td>{r.name || <span style={{ color: 'var(--danger)' }}>нет имени</span>}</td><td>{r.email || (invite ? <span style={{ color: 'var(--danger)' }}>нет email</span> : <span className="muted">—</span>)}</td><td>{r.department}</td><td>{r.position}</td></tr>)}</tbody>
          </table>
        </div>
      )}
      <div className="mt-16"><Toggle checked={invite} onChange={setInvite} label="Отправить приглашения на e-mail" hint={invite ? 'Каждый получит письмо со своей ссылкой и сам задаст пароль' : 'Логины и пароли сгенерируются автоматически — их нужно будет передать сотрудникам'} /></div>
      <Field label="Открыть курсы всем добавленным" style={{ marginTop: 16 }}><CourseChecklist courses={courses} value={courseIds} onChange={setCourseIds} /></Field>
    </Modal>
  );
}

function EnrollModal({ userIds, onClose, onDone }) {
  const toast = useToast();
  const { data: courses } = useApi('/admin/courses');
  const [courseIds, setCourseIds] = useState([]);
  return (
    <Modal title={`Открыть курсы (${userIds.length} ${plural(userIds.length, 'сотрудник', 'сотрудника', 'сотрудников')})`} onClose={onClose} footer={<>
      <button className="btn btn-secondary" onClick={onClose}>Отмена</button>
      <button className="btn btn-primary" disabled={!courseIds.length} onClick={async () => {
        try { const r = await api.post('/admin/users/enroll', { userIds, courseIds }); toast(`Готово: добавлено ${r.added} ${plural(r.added, 'запись', 'записи', 'записей')} на курсы`); onDone(); onClose(); } catch (e) { toast.error(e); }
      }}>Открыть доступ</button>
    </>}>
      <CourseChecklist courses={courses} value={courseIds} onChange={setCourseIds} />
    </Modal>
  );
}

function ActivityChart({ activity }) {
  const days = Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - 13 + i); return d.toISOString().slice(0, 10); });
  const map = Object.fromEntries((activity || []).map((a) => [a.d, a.n]));
  const max = Math.max(1, ...days.map((d) => map[d] || 0));
  return (
    <div>
      <div className="chart-bars">{days.map((d) => <div key={d} className="bar" style={{ height: `${((map[d] || 0) / max) * 100}%` }} title={`${d.split('-').reverse().slice(0, 2).join('.')}: ${map[d] || 0}`} />)}</div>
      <div className="chart-labels">{days.map((d, i) => <span key={d}>{i % 2 === 0 ? d.slice(8) : ''}</span>)}</div>
    </div>
  );
}

export default function Users() {
  const { user: me } = useAuth();
  const isAdmin = me.role === 'admin';
  const nav = useNavigate();
  const [role, setRole] = useState('student');
  const { data, error, loading, reload } = useApi('/admin/users');
  const stats = useApi('/admin/stats');
  const [q, setQ] = useState('');
  const [dept, setDept] = useState('');
  const [sel, setSel] = useState([]);
  const [params, setParams] = useSearchParams();
  const [modal, setModalState] = useState(() => (params.get('new') === '1' ? { type: 'new' } : null));
  const setModal = (m) => { setModalState(m); if (!m && params.get('new')) setParams({}, { replace: true }); };
  useEffect(() => { if (params.get('new') === '1') setModalState({ type: 'new' }); }, [params]);

  const departments = useMemo(() => [...new Set((data || []).map((u) => u.department).filter(Boolean))].sort(), [data]);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const counts = { student: 0, curator: 0, admin: 0 };
  data.forEach((u) => { counts[u.role]++; });
  const list = data.filter((u) => (role === 'all' || u.role === role) && (!dept || u.department === dept)
    && `${u.name} ${u.email} ${u.department} ${u.position}`.toLowerCase().includes(q.toLowerCase()));
  const s = stats.data;
  const allSel = list.length > 0 && list.every((u) => sel.includes(u.id));

  return (
    <div>
      <div className="page-head">
        <div className="flex-1"><h1>Сотрудники</h1><div className="page-sub">Ученики, кураторы и администраторы платформы. Здесь же — прогресс обучения.</div></div>
        <a className="btn btn-secondary" href="/api/admin/users/export"><Download size={16} />Выгрузить</a>
        {isAdmin && <button className="btn btn-secondary" onClick={() => setModal({ type: 'import' })}><FileSpreadsheet size={16} />Пригласить списком</button>}
        {isAdmin && <button className="btn btn-primary" onClick={() => setModal({ type: 'new' })}><UserPlus size={16} />Пригласить сотрудника</button>}
      </div>

      {s && (
        <div className="stats stagger">
          <div className="card stat"><div className="stat-label"><span className="stat-icon"><UsersIcon size={16} /></span>Учеников</div><div className="stat-value"><CountUp value={s.students} /></div><div className="stat-note">+{s.newStudents30} за 30 дней</div></div>
          <div className="card stat"><div className="stat-label"><span className="stat-icon"><Activity size={16} /></span>Активны за 7 дней</div><div className="stat-value"><CountUp value={s.active7} /></div><div className="stat-note">из {s.students}</div></div>
          <div className="card stat"><div className="stat-label"><span className="stat-icon"><TrendingUp size={16} /></span>Средний прогресс</div><div className="stat-value"><CountUp value={s.avgProgress} suffix="%" /></div><div className="stat-note">завершено курсов: {s.completedCourses}</div></div>
          <div className="card stat"><div className="stat-label"><span className="stat-icon"><Award size={16} /></span>Средний балл тестов</div><div className="stat-value">{s.avgTestScore == null ? '—' : <CountUp value={s.avgTestScore} suffix="%" />}</div></div>
          <div className="card stat" style={{ cursor: 'pointer' }} onClick={() => nav('/admin/reviews')}><div className="stat-label"><span className="stat-icon"><Clock size={16} /></span>Ждут проверки</div><div className="stat-value" style={{ color: s.pending ? 'var(--warning)' : undefined }}><CountUp value={s.pending} /></div></div>
          <div className="card stat"><div className="stat-label">Активность за 2 недели</div><ActivityChart activity={s.activity} /></div>
        </div>
      )}

      <div className="row row-wrap" style={{ alignItems: 'flex-start' }}>
        <div className="tabs">
          {[['student', 'Ученики'], ['curator', 'Кураторы'], ['admin', 'Администраторы'], ['all', 'Все']].map(([k, label]) => (
            <button key={k} className={`tab ${role === k ? 'active' : ''}`} onClick={() => { setRole(k); setSel([]); }}>{label}<span className="count">{k === 'all' ? data.length : counts[k]}</span></button>
          ))}
        </div>
      </div>
      <div className="toolbar">
        <div className="input-group"><Search size={17} /><input className="input" placeholder="Поиск по имени, email, отделу, должности" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {departments.length > 0 && (
          <select className="select" style={{ width: 210 }} value={dept} onChange={(e) => setDept(e.target.value)}>
            <option value="">Все отделы</option>{departments.map((d) => <option key={d}>{d}</option>)}
          </select>
        )}
        {isAdmin && sel.length > 0 && <button className="btn btn-soft" onClick={() => setModal({ type: 'enroll' })}><BookPlus size={16} />Открыть курсы ({sel.length})</button>}
      </div>

      <div className="card">
        {list.length === 0 ? <Empty icon={UsersIcon} title="Никого не найдено" text={data.length <= 1 ? 'Добавьте сотрудников по одному или списком из Excel.' : 'Измените условия поиска.'} /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr>
                {isAdmin && <th className="w-check"><input type="checkbox" aria-label="Выбрать всех" checked={allSel} ref={(el) => { if (el) el.indeterminate = !allSel && sel.length > 0; }} onChange={() => setSel(allSel ? [] : list.map((u) => u.id))} /></th>}
                <th>Сотрудник</th><th>Отдел / должность</th>{role !== 'admin' && role !== 'curator' && <><th>Курсы</th><th>Прогресс</th><th>Баллы</th></>}<th>Роль</th><th>Был(а) онлайн</th>
              </tr></thead>
              <tbody>
                {list.map((u) => (
                  <tr key={u.id} className="clickable" onClick={() => nav(`/admin/users/${u.id}`)} style={u.isActive ? undefined : { opacity: .55 }}>
                    {isAdmin && <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={sel.includes(u.id)} onChange={() => setSel(sel.includes(u.id) ? sel.filter((x) => x !== u.id) : [...sel, u.id])} /></td>}
                    <td><div className="cell-user"><Avatar user={u} size="avatar-sm" /><div><div className="bold">{u.name}{!u.isActive && <span className="badge" style={{ marginLeft: 6 }}>доступ отключён</span>}</div><div className="xs muted">{u.email}</div></div></div></td>
                    <td className="small">{u.department || '—'}{u.position && <div className="xs muted">{u.position}</div>}</td>
                    {role !== 'admin' && role !== 'curator' && <>
                      <td className="small nowrap">{u.coursesCount ? `${u.coursesCompleted} из ${u.coursesCount} завершено` : <span className="muted">нет курсов</span>}</td>
                      <td>{u.coursesCount ? <div className="progress-inline"><Progress value={u.avgProgress} /><span className="small bold">{u.avgProgress}%</span></div> : '—'}</td>
                      <td className="small">{u.points}</td>
                    </>}
                    <td className="small muted">{ROLE_LABEL[u.role]}</td>
                    <td className="small muted nowrap">{u.invitePending ? <span className="badge badge-invite" title={`Приглашение отправлено ${fmtRelative(u.invitedAt)}`}><Send size={11} />приглашён</span> : fmtRelative(u.lastSeenAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal?.type === 'new' && <UserFormModal departments={departments} onClose={() => setModal(null)} onSaved={() => { reload(); stats.reload(); }} />}
      {modal?.type === 'import' && <ImportModal onClose={() => setModal(null)} onDone={() => { reload(); stats.reload(); }} />}
      {modal?.type === 'enroll' && <EnrollModal userIds={sel} onClose={() => setModal(null)} onDone={() => { setSel([]); reload(); }} />}
    </div>
  );
}
