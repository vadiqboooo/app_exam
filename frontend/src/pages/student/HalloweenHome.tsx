import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Clock3, Hourglass, MapPin } from 'lucide-react';
import type { Exam, ExamSlot, Participation, Student, StudentParticipation } from '../../types';
import { statusLabels } from '../../components/StatusBadge';
import { ErrorNotice } from '../../components/ErrorNotice';
import { examTitle } from '../../lib/format';
import { HwGround, HwNav, HwSky } from '../../halloween/Chrome';
import { Art } from '../../halloween/Art';
import { setHalloween } from '../../halloween/theme';
import { useHalloweenSession } from '../../layouts/HalloweenShell';

export interface HomeItem {
  participation: StudentParticipation;
  exam: Exam;
  slot?: ExamSlot;
  startsAt: string;
}

export interface HomeHero {
  title: string;
  subjects: number;
  schools: number;
  range: string;
  closes?: string;
}

const month = (value: string) =>
  new Intl.DateTimeFormat('ru-RU', { month: 'short' }).format(new Date(value)).replace('.', '').toUpperCase();
const day = (value: string) => new Intl.DateTimeFormat('ru-RU', { day: 'numeric' }).format(new Date(value));
const weekday = (value: string) =>
  new Intl.DateTimeFormat('ru-RU', { weekday: 'short' }).format(new Date(value));
const time = (value: string) =>
  new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
const shortDay = (value: string) =>
  new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' })
    .format(new Date(value))
    .replace('.', '');
const duration = (exam: Exam, startsAt: string) => {
  if (!exam.ends_at) return '';
  const minutes = Math.round((new Date(exam.ends_at).getTime() - new Date(startsAt).getTime()) / 60000);
  if (minutes <= 0 || minutes > 600) return '';
  return ` · ${Math.floor(minutes / 60)} ч${minutes % 60 ? ` ${minutes % 60} мин` : ''}`;
};
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
const forms = (count: number, one: string, few: string, many: string) =>
  count % 10 === 1 && count % 100 !== 11
    ? one
    : count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 12 || count % 100 > 14)
      ? few
      : many;

function Profile() {
  const { session, logout } = useHalloweenSession();
  const [open, setOpen] = useState(false);
  return (
    <div className="hw-profile">
      <button
        type="button"
        aria-label={`Профиль: ${session.name}`}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {initials(session.name)}
      </button>
      {open && (
        <div className="hw-profile-menu" role="menu">
          <strong>{session.name}</strong>
          <button type="button" role="menuitem" onClick={() => setHalloween(false)}>
            Обычная тема
          </button>
          <button type="button" role="menuitem" onClick={logout}>
            Выйти
          </button>
        </div>
      )}
    </div>
  );
}

export function HalloweenHome({
  student,
  schedule,
  hero,
  results,
  reviewing,
  error,
  onBook,
  onEdit,
  onCancel,
}: {
  student: Student;
  schedule: HomeItem[];
  hero: HomeHero | null;
  results: { result: Participation; exam: Exam }[];
  reviewing: Exam[];
  error?: string;
  onBook: () => void;
  onEdit: (participationId: number) => void;
  onCancel: (participationId: number) => void;
}) {
  const first = student.full_name.split(/\s+/)[1] ?? student.full_name;
  const format = student.grade && student.grade <= 9 ? 'ОГЭ' : 'ЕГЭ';
  return (
    <div className="hw-home">
      <HwSky />
      <div className="hw-home-body">
        <header className="hw-top">
          <div className="hw-brand">
            <span>Г</span>
            Гарри
          </div>
          <Profile />
        </header>
        <div className="hw-greet">
          <h1 className="hw-display">
            Привет, <span>{first}</span>!
          </h1>
          <p>
            {student.grade ? `${student.grade} класс · ` : ''}готовимся к {format}
          </p>
        </div>
        <ErrorNotice message={error} />
        {hero && (
          <section className="hw-hero" aria-label="Запись на пробник">
            <div className="hw-hero-top">
              <span>ХЭЛЛОУИНСКИЙ ПРОБНИК</span>
              {hero.closes && <b>до {hero.closes}</b>}
            </div>
            <div className="hw-hero-title">
              <strong>{hero.title}</strong>
              <small>
                {hero.subjects} {forms(hero.subjects, 'предмет', 'предмета', 'предметов')} · {hero.schools}{' '}
                {forms(hero.schools, 'филиал', 'филиала', 'филиалов')} · {hero.range}
              </small>
            </div>
            <button type="button" onClick={onBook}>
              Записаться на предмет
              <ArrowRight size={18} />
            </button>
          </section>
        )}
        <section className="hw-section">
          <div className="hw-section-head">
            <h2>Ближайшие пробники</h2>
            <span>
              {schedule.length
                ? `${schedule.length} ${forms(schedule.length, 'запись', 'записи', 'записей')}`
                : ''}
            </span>
          </div>
          {schedule.length === 0 && (
            <div className="hw-empty">
              <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">
                <Art name="pumpkin" s={0.085} color="#ff8f33" />
              </svg>
              <p>
                У вас пока нет записей. После записи здесь появятся дата, время и адрес проведения экзамена.
              </p>
            </div>
          )}
          {schedule.map(({ participation, exam, slot, startsAt }) => {
            const editable = participation.status === 'registered' && !!slot && !!exam.event_id;
            return (
              <article className="hw-exam" key={participation.id}>
                <div className="hw-exam-main">
                  <div className="hw-exam-date">
                    <span>{month(startsAt)}</span>
                    <strong>{day(startsAt)}</strong>
                    <small>{weekday(startsAt)}</small>
                  </div>
                  <div className="hw-exam-info">
                    <div className="hw-exam-top">
                      <span>
                        {exam.format === 'oge' ? 'ОГЭ' : exam.format === 'ege' ? 'ЕГЭ' : 'ПРОБНИК'} · ПРОБНИК
                      </span>
                      <b>
                        {participation.status === 'registered'
                          ? 'Записан'
                          : statusLabels[participation.status]}
                      </b>
                    </div>
                    <h3>{exam.subject}</h3>
                    <span className="hw-exam-line">
                      <Clock3 size={15} />
                      {time(startsAt)}
                      {duration(exam, startsAt)}
                    </span>
                    {slot && (
                      <span className="hw-exam-line is-place">
                        <MapPin size={15} />
                        {[slot.school_name, slot.school_address].filter(Boolean).join(', ')}
                      </span>
                    )}
                  </div>
                </div>
                {participation.status === 'registered' && (
                  <div className="hw-exam-actions">
                    {editable ? (
                      <button type="button" onClick={() => onEdit(participation.id)}>
                        Изменить время
                      </button>
                    ) : (
                      <span />
                    )}
                    <button type="button" className="is-danger" onClick={() => onCancel(participation.id)}>
                      Отменить запись
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </section>
        {(results.length > 0 || reviewing.length > 0) && (
          <section className="hw-section">
            <div className="hw-section-head">
              <h2>Последние результаты</h2>
              <Link to="/my-results">Все</Link>
            </div>
            {results.map(({ result, exam }) => (
              <Link className="hw-card hw-seal hw-ball" to={`/my-results/${result.id}/ball`} key={result.id}>
                <span className="hw-shine" />
                <span className="hw-ball-icon">
                  <svg width="58" height="58" viewBox="0 0 58 58" className="hw-tiltb" aria-hidden="true">
                    <Art name="crystal" x={9} y={9} s={0.078125} color="#d9ccff" />
                  </svg>
                </span>
                <span className="hw-ball-text">
                  <strong>{exam.subject}</strong>
                  <small>
                    {examTitle(exam)} · {shortDay(exam.starts_at)}
                  </small>
                  <b>Балл скрыт — нажми</b>
                </span>
                <span className="hw-ball-open">Открыть</span>
              </Link>
            ))}
            {reviewing.map((exam) => (
              <div className="hw-pending" key={exam.id}>
                <span>
                  <Hourglass size={24} />
                </span>
                <div>
                  <strong>{exam.subject}</strong>
                  <small>Работа на проверке. Результат появится здесь, когда учитель его опубликует.</small>
                </div>
              </div>
            ))}
          </section>
        )}
        <HwGround />
      </div>
      <HwNav />
    </div>
  );
}
