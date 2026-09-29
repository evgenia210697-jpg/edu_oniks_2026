import { Link, useParams } from 'react-router-dom';
import { ChevronLeft, Printer, Award, GraduationCap } from 'lucide-react';
import { useApi, Loading, ErrorBox, Empty } from '../../components/ui';
import { useAuth } from '../../App';
import { fmtDate, plural } from '../../utils';

/** Сертификат о прохождении курса: открывается после завершения, печатается или сохраняется в PDF */
export default function Certificate() {
  const { courseId } = useParams();
  const { user, settings } = useAuth();
  const { data: c, error, loading, reload } = useApi(`/learn/courses/${courseId}`);
  if (loading && !c) return <Loading variant="inline" />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;

  const back = <Link to={`/course/${c.id}`} className="btn btn-ghost btn-sm"><ChevronLeft size={16} />К курсу</Link>;
  if (!c.completedAt) {
    return (
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        {back}
        <div className="card mt-16">
          <Empty icon={Award} title="Сертификат пока недоступен" text={`Он появится после прохождения всех занятий курса. Сейчас пройдено ${c.completed} из ${c.total}.`}>
            <Link to={`/course/${c.id}`} className="btn btn-primary">Продолжить обучение</Link>
          </Empty>
        </div>
      </div>
    );
  }
  const number = `${String(c.id).padStart(3, '0')}-${String(user.id).padStart(4, '0')}`;
  return (
    <div className="cert-page">
      <div className="cert-actions no-print">
        {back}
        <span className="flex-1" />
        <button type="button" className="btn btn-primary" onClick={() => window.print()}><Printer size={16} />Распечатать или сохранить в PDF</button>
      </div>
      <div className="certificate" style={{ '--cert-accent': 'var(--accent)' }}>
        <div className="cert-frame">
          <div className="cert-top">
            <div className="cert-brand">
              <span className="brand-logo">{settings?.logo ? <img src={settings.logo} alt="" /> : <GraduationCap size={20} />}</span>
              {settings?.platformName || 'Учебный центр'}
            </div>
            <div className="cert-no">№ {number}</div>
          </div>
          <div className="cert-body">
            <div className="cert-kicker">Сертификат</div>
            <div className="cert-sub">подтверждает, что</div>
            <div className="cert-name">{user.name}</div>
            {(user.position || user.department) && <div className="cert-pos">{[user.position, user.department].filter(Boolean).join(', ')}</div>}
            <div className="cert-sub">успешно прошёл(а) курс</div>
            <div className="cert-course">«{c.title}»</div>
            <div className="cert-stats">
              <span>{c.total} {plural(c.total, 'занятие', 'занятия', 'занятий')}</span>
              {c.points > 0 && <span>{c.points} {plural(c.points, 'балл', 'балла', 'баллов')}</span>}
            </div>
          </div>
          <div className="cert-bottom">
            <div><div className="cert-line">{fmtDate(c.completedAt)}</div><div className="cert-cap">Дата завершения</div></div>
            <div className="cert-seal" aria-hidden="true"><Award size={34} /></div>
            <div><div className="cert-line">&nbsp;</div><div className="cert-cap">Подпись руководителя</div></div>
          </div>
        </div>
      </div>
    </div>
  );
}
