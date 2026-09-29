import { ArrowUpRight, CalendarDays, BookOpen } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Exam, Participation } from '../types';
import { date, examTitle, examSubject, registrationState } from '../lib/format';

export function ExamCard({
  exam,
  participations,
  subjects,
  layout = 'card',
}: {
  exam: Exam;
  participations: Participation[];
  subjects?: Exam[];
  layout?: 'card' | 'row';
}) {
  const exams = subjects ?? [exam];
  const rows = participations.filter((p) => exams.some((e) => e.id === p.exam_id));
  const states = exams.map(registrationState);
  const state = states.includes('open') ? 'open' : states.includes('soon') ? 'soon' : 'closed';
  const arrived = rows.filter((p) =>
    ['attended', 'submitted', 'checked', 'published'].includes(p.status),
  ).length;
  const submitted = rows.filter((p) => ['submitted', 'checked', 'published'].includes(p.status)).length;
  const checked = rows.filter((p) => ['checked', 'published'].includes(p.status)).length;
  const registered = rows.filter((p) => p.status !== 'cancelled').length;
  const stateLabel =
    exam.type === 'ege'
      ? 'ЕГЭ'
      : state === 'open'
        ? 'Регистрация открыта'
        : state === 'soon'
          ? 'Скоро регистрация'
          : 'Регистрация закрыта';
  const startsAt = exams.reduce(
    (earliest, item) => (new Date(item.starts_at) < new Date(earliest) ? item.starts_at : earliest),
    exams[0].starts_at,
  );
  const endsAt = exams.reduce((latest, item) => {
    const itemEnd = item.ends_at ?? item.starts_at;
    return new Date(itemEnd) > new Date(latest) ? itemEnd : latest;
  }, exams[0].ends_at ?? exams[0].starts_at);
  const sameDay = new Date(startsAt).toDateString() === new Date(endsAt).toDateString();
  const href = subjects && exam.event_id ? `/exam-events/${exam.event_id}` : `/exams/${exam.id}`;

  if (layout === 'row') {
    return (
      <Link to={href} className="exam-card exam-card-row">
        <div className="exam-row-summary">
          <span className="subject-icon">
            <BookOpen size={21} />
          </span>
          <div className="exam-row-heading">
            <h3>{subjects && exam.event_id ? examTitle(exam) : examSubject(exam)}</h3>
            <div className="exam-date exam-period">
              <CalendarDays size={16} />
              <span>
                {sameDay ? date(startsAt) : `с ${date(startsAt)} по ${date(endsAt)}`}
              </span>
            </div>
          </div>
        </div>
        <span className={`badge registration-${state}`}>{stateLabel}</span>
        <div className="exam-counts">
          <div>
            <strong>{registered}</strong>
            <span>Записано</span>
          </div>
          <div>
            <strong>{arrived}</strong>
            <span>Пришло</span>
          </div>
          <div>
            <strong>{submitted}</strong>
            <span>Сдано</span>
          </div>
          <div>
            <strong>{checked}</strong>
            <span>Проверено</span>
          </div>
        </div>
        <span className="exam-row-link">
          Открыть <ArrowUpRight size={17} />
        </span>
      </Link>
    );
  }

  return (
    <Link to={href} className="exam-card">
      <div className="between">
        <span className="subject-icon">
          <BookOpen size={21} />
        </span>
        <span className={`badge registration-${state}`}>{stateLabel}</span>
      </div>
      <h3>{subjects && exam.event_id ? examTitle(exam) : examSubject(exam)}</h3>
      <p>{subjects && exam.event_id ? subjects.map(examSubject).join(', ') : examTitle(exam)}</p>
      <div className="exam-date">
        <CalendarDays size={16} />
        {date(exam.starts_at, true)}
      </div>
      <div className="exam-counts">
        <div>
          <strong>{registered}</strong>
          <span>Записано</span>
        </div>
        <div>
          <strong>{arrived}</strong>
          <span>Пришло</span>
        </div>
        <div>
          <strong>{submitted}</strong>
          <span>Сдано</span>
        </div>
        <div>
          <strong>{checked}</strong>
          <span>Проверено</span>
        </div>
      </div>
      <div className="card-link">
        Открыть пробник <ArrowUpRight size={17} />
      </div>
    </Link>
  );
}
