import { useEffect, useRef, useState } from 'react';
import { ArrowRight, BookOpen, Building2, CalendarDays, CheckCircle2, MapPin } from 'lucide-react';
import type { Exam } from '../types';
import { useStudentWorkspace } from '../layouts/StudentWorkspace';
import { useAction } from '../hooks/useAction';
import { api } from '../api/client';
import { date, examSubject, registrationState } from '../lib/format';
import { Button } from './Button';
import { ErrorNotice } from './ErrorNotice';
import { SlotPicker } from './SlotPicker';
import { StatusBadge } from './StatusBadge';

export function StudentExamEvent({
  exams,
  showRegistrations = true,
  onRegistered,
}: {
  exams: Exam[];
  showRegistrations?: boolean;
  onRegistered?: () => void;
}) {
  const { data, refresh } = useStudentWorkspace();
  const formats = [...new Set(exams.map((exam) => exam.format!))];
  const preferredFormat = data.student.grade && data.student.grade <= 9 ? 'oge' : 'ege';
  const [format, setFormat] = useState(formats.includes(preferredFormat) ? preferredFormat : formats[0]);
  const [examId, setExamId] = useState('');
  const [slotId, setSlotId] = useState('');
  const submitRef = useRef<HTMLDivElement>(null);
  const { busy, error, run } = useAction();
  const choices = exams.filter((exam) => exam.format === format);
  const selected =
    choices.find((exam) => exam.id === Number(examId)) ?? (choices.length === 1 ? choices[0] : undefined);
  const registrations = data.participations.filter(
    (participation) =>
      participation.status !== 'cancelled' && exams.some((exam) => exam.id === participation.exam_id),
  );
  const signed = registrations.some((participation) => participation.exam_id === selected?.id);
  const state = selected ? registrationState(selected) : registrationState(exams[0]);
  const slot = selected?.slots.find((item) => item.id === Number(slotId));
  const schoolCount = new Set(exams[0].slots.map((item) => item.school_id)).size;
  const stateLabel =
    state === 'open' ? 'Регистрация открыта' : state === 'soon' ? 'Скоро регистрация' : 'Регистрация закрыта';

  useEffect(() => {
    if (slotId) submitRef.current?.scrollIntoView({ block: 'nearest' });
  }, [slotId]);

  return (
    <article className={`event-student-card ${showRegistrations ? '' : 'event-student-card-compact'}`}>
      <header className="event-booking-header">
        <div className="event-booking-title">
          <span className="event-booking-icon">
            <CalendarDays size={24} />
          </span>
          <div>
            <h3>{exams[0].title}</h3>
            <p>
              {exams.length} {exams.length === 1 ? 'предмет' : 'предметов'} · {schoolCount}{' '}
              {schoolCount === 1 ? 'школа' : 'школы'}
            </p>
          </div>
        </div>
        <span className={`event-registration-state registration-${state}`}>{stateLabel}</span>
      </header>

      <ErrorNotice message={error} />
      <div className="event-booking-layout">
        <form
          className="event-booking-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!selected || !slot) return;
            void run(async () => {
              try {
                await api.student.register(selected.id, slot.id);
              } finally {
                await refresh();
              }
              setSlotId('');
              onRegistered?.();
            });
          }}
        >
          <section className="booking-section">
            <div className="booking-section-heading">
              <span>1</span>
              <div>
                <h4>Выберите предмет</h4>
                <p>Сначала укажите формат экзамена, затем предмет</p>
              </div>
            </div>
            <div className="format-switch" role="group" aria-label="Формат">
              {formats.map((item) => (
                <button
                  type="button"
                  key={item}
                  aria-pressed={format === item}
                  disabled={busy}
                  onClick={() => {
                    setFormat(item);
                    setExamId('');
                    setSlotId('');
                  }}
                >
                  {item === 'ege' ? 'ЕГЭ' : 'ОГЭ'}
                </button>
              ))}
            </div>
            <div className="subject-choice-grid" role="group" aria-label="Предмет">
              {choices.map((exam) => {
                const active = selected?.id === exam.id;
                const registered = registrations.some((item) => item.exam_id === exam.id);
                return (
                  <button
                    className={`subject-choice ${active ? 'is-selected' : ''}`}
                    type="button"
                    key={exam.id}
                    aria-pressed={active}
                    disabled={busy}
                    onClick={() => {
                      setExamId(String(exam.id));
                      setSlotId('');
                    }}
                  >
                    <span className="choice-icon">
                      <BookOpen size={18} />
                    </span>
                    <span>{exam.subject}</span>
                    {registered && <CheckCircle2 className="subject-choice-check" size={17} />}
                  </button>
                );
              })}
            </div>
          </section>

          {selected && !signed && (
            <SlotPicker
              key={selected.id}
              slots={selected.slots}
              value={slotId}
              onChange={setSlotId}
              disabled={busy}
              variant="cards"
            />
          )}

          {selected && signed && (
            <div className="booking-success">
              <span>
                <CheckCircle2 size={22} />
              </span>
              <div>
                <strong>Вы записаны на этот предмет</strong>
                <p>Выберите другой предмет, если хотите оформить ещё одну запись.</p>
              </div>
            </div>
          )}

          {!signed && (
            <div className="booking-submit" ref={submitRef}>
              {slot && (
                <Button variant="secondary" disabled={busy} onClick={() => setSlotId('')}>
                  Изменить время
                </Button>
              )}
              <Button
                type="submit"
                icon={<ArrowRight size={17} />}
                disabled={
                  busy ||
                  !data.student.is_active ||
                  state !== 'open' ||
                  !slot ||
                  !slot.remaining ||
                  new Date(slot.starts_at).getTime() <= Date.now()
                }
              >
                {state === 'soon'
                  ? 'Регистрация ещё не началась'
                  : state === 'closed'
                    ? 'Регистрация закрыта'
                    : 'Записаться'}
              </Button>
              {state === 'open' && !slot && (
                <small>{selected ? 'Выберите школу и свободное время' : 'Сначала выберите предмет'}</small>
              )}
            </div>
          )}
        </form>

        {showRegistrations && (
          <aside className="event-bookings-aside">
            <div className="event-bookings-heading">
              <h4>Ваши записи</h4>
              {!!registrations.length && <span>{registrations.length}</span>}
            </div>
            {registrations.length ? (
              <div className="event-registration-list">
                {registrations.map((item) => {
                  const exam = exams.find((candidate) => candidate.id === item.exam_id)!;
                  const registeredSlot = exam.slots.find((candidate) => candidate.id === item.slot_id);
                  return (
                    <div className="event-registration-card" key={item.id}>
                      <div className="between">
                        <strong>{examSubject(exam)}</strong>
                        <StatusBadge status={item.status} />
                      </div>
                      {registeredSlot && (
                        <div className="event-registration-details">
                          <p>
                            <Building2 size={15} /> {registeredSlot.school_name}
                          </p>
                          {registeredSlot.school_address && (
                            <p>
                              <MapPin size={15} /> {registeredSlot.school_address}
                            </p>
                          )}
                          <p>
                            <CalendarDays size={15} /> {date(registeredSlot.starts_at, true)}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="booking-empty-state">
                <span>
                  <BookOpen size={22} />
                </span>
                <strong>Записей пока нет</strong>
                <p>Выберите предмет, школу и свободное время — запись появится здесь.</p>
              </div>
            )}
          </aside>
        )}
      </div>
    </article>
  );
}
