import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Building2,
  CalendarDays,
  ChevronRight,
  Clock3,
  Hourglass,
  MapPin,
  Plus,
  Trash2,
} from 'lucide-react';
import { useStudentWorkspace } from '../../layouts/StudentWorkspace';
import { api } from '../../api/client';
import type { Exam } from '../../types';
import { examDate, examTitle, groupExams, registrationState, score } from '../../lib/format';
import { useAction } from '../../hooks/useAction';
import { Button } from '../../components/Button';
import { ErrorNotice } from '../../components/ErrorNotice';
import { StatusBadge } from '../../components/StatusBadge';
import { BookingFlow } from '../../components/BookingFlow';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { SlotPicker } from '../../components/SlotPicker';
import { HwBackdrop } from '../../halloween/Chrome';
import { useHalloween } from '../../halloween/theme';
import { dateRange } from '../../lib/adminEvents';
import { HalloweenHome } from './HalloweenHome';

const month = (value: string) =>
  new Intl.DateTimeFormat('ru-RU', { month: 'short' }).format(new Date(value)).replace('.', '').toUpperCase();
const day = (value: string) => new Intl.DateTimeFormat('ru-RU', { day: '2-digit' }).format(new Date(value));
const weekday = (value: string) =>
  new Intl.DateTimeFormat('ru-RU', { weekday: 'short' }).format(new Date(value));
const time = (value: string) =>
  new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));

export function AvailableExams() {
  const { data, refresh } = useStudentWorkspace();
  const halloween = useHalloween();
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingIndex, setBookingIndex] = useState(0);
  const [editingParticipationId, setEditingParticipationId] = useState<number | null>(null);
  const [editSlotId, setEditSlotId] = useState('');
  const [deletingParticipationId, setDeletingParticipationId] = useState<number | null>(null);
  const action = useAction();
  const activeParticipations = data.participations.filter((item) => item.status !== 'cancelled');
  const exams = data.exams.filter(
    (exam) =>
      exam.is_active &&
      exam.type === 'mock' &&
      (new Date(exam.ends_at ?? exam.starts_at).getTime() > Date.now() ||
        activeParticipations.some((item) => item.exam_id === exam.id)),
  );
  const groups = groupExams(exams);
  const bookableGroups = groups.filter((subjects) =>
    subjects.some(
      (exam) =>
        registrationState(exam) === 'open' &&
        !activeParticipations.some((item) => item.exam_id === exam.id) &&
        (!exam.event_id ||
          exam.slots.some((slot) => slot.remaining > 0 && new Date(slot.starts_at).getTime() > Date.now())),
    ),
  );
  const schedule = activeParticipations
    .map((participation) => {
      const exam = data.exams.find((candidate) => candidate.id === participation.exam_id);
      const slot = exam?.slots.find((candidate) => candidate.id === participation.slot_id);
      const startsAt = slot?.starts_at ?? exam?.starts_at;
      return exam && startsAt ? { participation, exam, slot, startsAt } : null;
    })
    .filter(
      (item): item is NonNullable<typeof item> =>
        item !== null && new Date(item.startsAt).getTime() > Date.now(),
    )
    .sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime());
  // Registering the last free subject empties the list; the flow must stay to show its final screen.
  const lastGroup = useRef<Exam[]>(undefined);
  const selectedGroup =
    bookableGroups[Math.min(bookingIndex, bookableGroups.length - 1)] ??
    (bookingOpen ? lastGroup.current : undefined);
  if (selectedGroup) lastGroup.current = selectedGroup;
  const deletingRegistration = schedule.find(
    ({ participation }) => participation.id === deletingParticipationId,
  );
  const canBook = data.student.is_active && bookableGroups.length > 0;
  const bookableTitles = [...new Set(bookableGroups.map((subjects) => examTitle(subjects[0])))];
  const bookingPanel = bookingOpen && selectedGroup && (
    <section className="inline-booking-panel booking-flow-panel" aria-label="Запись на экзамен">
      <div className="inline-booking-body">
        {bookableGroups.length > 1 && (
          <div className="booking-event-selector" role="tablist" aria-label="Доступные пробники">
            {bookableGroups.map((subjects, index) => (
              <button
                type="button"
                role="tab"
                aria-selected={bookingIndex === index}
                key={subjects[0].event_id ?? subjects[0].id}
                onClick={() => setBookingIndex(index)}
              >
                <strong>{examTitle(subjects[0])}</strong>
                <span>{subjects.length} предметов</span>
              </button>
            ))}
          </div>
        )}
        {selectedGroup[0].event_id ? (
          <BookingFlow
            key={selectedGroup[0].event_id}
            exams={selectedGroup}
            onClose={() => setBookingOpen(false)}
          />
        ) : (
          <article className="standalone-booking-card">
            <span className="subject-icon">
              <BookOpen size={21} />
            </span>
            <div>
              <span>Пробный экзамен</span>
              <h3>{selectedGroup[0].subject}</h3>
              <p>{examTitle(selectedGroup[0])}</p>
            </div>
            <Button
              disabled={action.busy}
              onClick={() =>
                void action.run(async () => {
                  await api.student.register(selectedGroup[0].id);
                  await refresh();
                  setBookingOpen(false);
                })
              }
            >
              Записаться
            </Button>
          </article>
        )}
      </div>
    </section>
  );

  const latest = data.results
    .flatMap((result) => {
      const exam = data.exams.find((candidate) => candidate.id === result.exam_id);
      return exam ? [{ result, exam, at: examDate(exam, result.slot_id) }] : [];
    })
    .sort((a, b) => b.at.localeCompare(a.at));
  const lastResult = latest[0];
  const beforeLast = lastResult
    ? latest.find(
        (item) =>
          item.result.id !== lastResult.result.id &&
          item.exam.subject === lastResult.exam.subject &&
          item.result.test_score != null,
      )
    : undefined;
  const lastDelta =
    lastResult?.result.test_score != null && beforeLast?.result.test_score != null
      ? lastResult.result.test_score - beforeLast.result.test_score
      : null;
  const reviewing = data.participations
    .filter(
      (item) =>
        ['attended', 'submitted', 'checked'].includes(item.status) &&
        !data.results.some((result) => result.id === item.id),
    )
    .flatMap((item) => data.exams.filter((exam) => exam.id === item.exam_id));

  const deleteDialog = deletingRegistration && (
    <ConfirmDialog
      title="Удалить запись?"
      text={`Запись на «${deletingRegistration.exam.subject}» будет удалена, а место снова станет свободным.`}
      confirm="Удалить запись"
      danger
      busy={action.busy}
      error={action.error}
      onClose={() => setDeletingParticipationId(null)}
      onConfirm={() =>
        void action.run(async () => {
          await api.student.cancelRegistration(deletingRegistration.participation.id);
          await refresh();
          setDeletingParticipationId(null);
        })
      }
    />
  );

  if (halloween) {
    const heroGroup = bookableGroups[0];
    const times = heroGroup?.flatMap((exam) => exam.slots.map((slot) => slot.starts_at)).sort() ?? [];
    const closes = heroGroup?.[0].registration_close_at;
    const hero =
      canBook && heroGroup && times.length
        ? {
            title: examTitle(heroGroup[0]),
            subjects: heroGroup.length,
            schools: new Set(heroGroup.flatMap((exam) => exam.slots.map((slot) => slot.school_id))).size,
            range: dateRange(times[0], times[times.length - 1]),
            closes: closes
              ? new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(new Date(closes))
              : undefined,
          }
        : null;
    const editing = schedule.find(({ participation }) => participation.id === editingParticipationId);
    const startEdit = (participationId: number) => {
      const item = schedule.find(({ participation }) => participation.id === participationId);
      if (!item?.slot) return;
      action.clearError();
      setBookingOpen(false);
      setEditSlotId(String(item.slot.id));
      setEditingParticipationId(participationId);
    };
    return (
      <>
        {bookingOpen && selectedGroup ? (
          <div className="hw-booking-screen">
            <HwBackdrop />
            <ErrorNotice message={action.error} />
            {bookingPanel}
          </div>
        ) : editing?.slot ? (
          <div className="hw-booking-screen hw-edit">
            <HwBackdrop />
            <div className="hw-edit-head">
              <button
                type="button"
                aria-label="Назад к пробникам"
                onClick={() => setEditingParticipationId(null)}
              >
                <ArrowLeft size={20} />
              </button>
              <div>
                <strong>Изменение записи</strong>
                <small>
                  {editing.exam.subject} · {examTitle(editing.exam)}
                </small>
              </div>
            </div>
            <ErrorNotice message={action.error} />
            <SlotPicker
              key={editing.participation.id}
              slots={editing.exam.slots}
              value={editSlotId}
              onChange={setEditSlotId}
              disabled={action.busy}
              variant="cards"
              currentSlotId={editing.slot.id}
              stepStart={1}
            />
            <div className="hw-edit-actions">
              <button type="button" disabled={action.busy} onClick={() => setEditingParticipationId(null)}>
                Отмена
              </button>
              <button
                type="button"
                className="is-primary"
                disabled={action.busy || !editSlotId || Number(editSlotId) === editing.participation.slot_id}
                onClick={() =>
                  void action.run(async () => {
                    await api.student.updateRegistration(editing.participation.id, Number(editSlotId));
                    await refresh();
                    setEditingParticipationId(null);
                  })
                }
              >
                Сохранить изменения
              </button>
            </div>
          </div>
        ) : (
          <HalloweenHome
            student={data.student}
            schedule={schedule}
            hero={hero}
            results={latest.slice(0, 3)}
            reviewing={reviewing}
            error={action.error}
            onBook={() => {
              setBookingIndex(0);
              setBookingOpen(true);
            }}
            onEdit={startEdit}
            onCancel={(participationId) => {
              action.clearError();
              setDeletingParticipationId(participationId);
            }}
          />
        )}
        {deleteDialog}
      </>
    );
  }

  if (bookingOpen && selectedGroup)
    return (
      <div className="stack page-stack student-home">
        <ErrorNotice message={action.error} />
        {bookingPanel}
      </div>
    );

  return (
    <div className="stack page-stack student-home">
      <div className="student-greeting">
        <h1>Привет, {data.student.full_name.split(/\s+/)[1] ?? data.student.full_name}!</h1>
        <p>Здесь ваши записи на пробники и ближайшие экзамены.</p>
      </div>
      <ErrorNotice message={action.error} />
      {!data.student.is_active && (
        <div className="info-panel">
          Ваш профиль находится в архиве. История результатов доступна, а для новой записи обратитесь к
          администратору.
        </div>
      )}

      <section className="student-schedule" aria-label="Расписание пробных экзаменов">
        <div className="student-schedule-header">
          <div>
            <span className="student-schedule-eyebrow">ВАШЕ РАСПИСАНИЕ</span>
            <h2>{schedule.length ? 'Предстоящие экзамены' : 'У вас пока нет записей'}</h2>
            <p>
              {schedule.length
                ? 'Вся важная информация о предстоящих пробниках в одном месте.'
                : 'После записи здесь появятся дата, время и адрес проведения экзамена.'}
            </p>
          </div>
        </div>

        {schedule.length ? (
          <div className="student-schedule-list">
            {schedule.map(({ participation, exam, slot, startsAt }, index) => {
              const editable = participation.status === 'registered' && !!slot && !!exam.event_id;
              if (editingParticipationId === participation.id && slot) {
                return (
                  <section
                    className="inline-edit-registration"
                    aria-label={`Изменение записи: ${exam.subject}`}
                    key={participation.id}
                  >
                    <div className="inline-edit-registration-header">
                      <div>
                        <span>ИЗМЕНЕНИЕ ЗАПИСИ</span>
                        <h3>{exam.subject}</h3>
                        <p>{examTitle(exam)} · выберите новую школу, дату или время</p>
                      </div>
                      <StatusBadge status={participation.status} />
                    </div>
                    <ErrorNotice message={action.error} />
                    <div className="inline-edit-registration-body">
                      <SlotPicker
                        key={participation.id}
                        slots={exam.slots}
                        value={editSlotId}
                        onChange={setEditSlotId}
                        disabled={action.busy}
                        variant="cards"
                        currentSlotId={slot.id}
                        stepStart={1}
                      />
                    </div>
                    <div className="inline-edit-registration-actions">
                      <Button
                        variant="secondary"
                        disabled={action.busy}
                        onClick={() => setEditingParticipationId(null)}
                      >
                        Отмена
                      </Button>
                      <Button
                        disabled={action.busy || !editSlotId || Number(editSlotId) === participation.slot_id}
                        onClick={() =>
                          void action.run(async () => {
                            await api.student.updateRegistration(participation.id, Number(editSlotId));
                            await refresh();
                            setEditingParticipationId(null);
                          })
                        }
                      >
                        Сохранить изменения
                      </Button>
                    </div>
                  </section>
                );
              }
              return (
                <article
                  className={`student-schedule-card ${editable ? 'is-editable' : ''}`}
                  key={participation.id}
                  tabIndex={editable ? 0 : undefined}
                  aria-label={editable ? `Изменить запись: ${exam.subject}` : undefined}
                  onClick={() => {
                    if (!editable) return;
                    action.clearError();
                    setBookingOpen(false);
                    setEditSlotId(String(slot.id));
                    setEditingParticipationId(participation.id);
                  }}
                  onKeyDown={(event) => {
                    if (
                      !editable ||
                      event.target !== event.currentTarget ||
                      !['Enter', ' '].includes(event.key)
                    )
                      return;
                    event.preventDefault();
                    action.clearError();
                    setBookingOpen(false);
                    setEditSlotId(String(slot.id));
                    setEditingParticipationId(participation.id);
                  }}
                >
                  <div className="schedule-date-block">
                    <span>{month(startsAt)}</span>
                    <strong>{day(startsAt)}</strong>
                    <small>{weekday(startsAt)}</small>
                    <div>
                      <Clock3 size={16} /> {time(startsAt)}
                    </div>
                  </div>
                  <div className="schedule-exam-details">
                    <span className="schedule-exam-type">
                      {exam.format === 'ege' ? 'ЕГЭ' : exam.format === 'oge' ? 'ОГЭ' : 'Пробный экзамен'} ·{' '}
                      Пробный экзамен
                    </span>
                    <h3>{exam.subject}</h3>
                    <p>{examTitle(exam)}</p>
                    <div className="schedule-location">
                      {slot ? (
                        <>
                          <span>
                            <Building2 size={16} /> {slot.school_name}
                          </span>
                          {slot.school_address && (
                            <span>
                              <MapPin size={16} /> {slot.school_address}
                            </span>
                          )}
                        </>
                      ) : (
                        <span>
                          <CalendarDays size={16} /> Очный пробный экзамен
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="schedule-status-block">
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <StatusBadge status={participation.status} />
                    {participation.status === 'registered' && (
                      <div className="schedule-record-actions">
                        {editable && slot && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              action.clearError();
                              setBookingOpen(false);
                              setEditSlotId(String(slot.id));
                              setEditingParticipationId(participation.id);
                            }}
                          >
                            Изменить время
                          </button>
                        )}
                        <button
                          type="button"
                          className="is-danger"
                          onClick={(event) => {
                            event.stopPropagation();
                            action.clearError();
                            setDeletingParticipationId(participation.id);
                          }}
                        >
                          <Trash2 size={14} /> Отменить запись
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        ) : bookingPanel ? (
          bookingPanel
        ) : canBook ? (
          <div className="student-schedule-empty student-first-booking">
            <span>
              <BookOpen size={28} />
            </span>
            <small className="student-first-booking-label">ДОСТУПНА ЗАПИСЬ НА ПРОБНИК</small>
            <h3>{bookableTitles.length === 1 ? bookableTitles[0] : 'Доступные пробники'}</h3>
            <p>
              {bookableTitles.length > 1
                ? bookableTitles.join(', ')
                : 'Выберите предмет, школу и удобное время проведения экзамена.'}
            </p>
            <Button
              icon={<ArrowRight size={17} />}
              onClick={() => {
                setBookingIndex(0);
                setBookingOpen(true);
              }}
            >
              Записаться на пробник
            </Button>
          </div>
        ) : (
          <div className="student-schedule-empty">
            <span>
              <BookOpen size={28} />
            </span>
            <h3>Расписание пока пусто</h3>
            <p>Доступных пробников для записи пока нет.</p>
          </div>
        )}
      </section>

      {schedule.length > 0 && canBook && !bookingOpen && (
        <button
          type="button"
          className="add-another-exam"
          aria-label="Записаться на ещё один предмет"
          onClick={() => {
            setBookingIndex(0);
            setBookingOpen(true);
          }}
        >
          <span className="add-another-icon">
            <Plus size={31} />
          </span>
          <div>
            <h2>Записаться на ещё один предмет</h2>
            <p>
              {bookableTitles.length === 1 ? 'Доступный пробник' : 'Доступные пробники'}:{' '}
              <strong>{bookableTitles.join(', ')}</strong>
            </p>
          </div>
          <span className="add-another-action">
            Выбрать предметы <ArrowRight size={17} />
          </span>
        </button>
      )}

      {(lastResult || reviewing.length > 0) && (
        <section className="home-results" aria-label="Последние результаты">
          <div className="home-results-head">
            <h2>Последние результаты</h2>
            <Link to="/my-results">Все</Link>
          </div>
          {lastResult && (
            <Link className="home-result" to={`/my-results/${lastResult.result.id}`}>
              <span className="home-result-score">
                <strong>{score(lastResult.result.test_score ?? lastResult.result.primary_score)}</strong>
                <small>баллов</small>
              </span>
              <span className="home-result-text">
                <b>{lastResult.exam.subject}</b>
                <small>{examTitle(lastResult.exam)}</small>
                {lastDelta != null && (
                  <em className={lastDelta < 0 ? 'is-down' : ''}>
                    {lastDelta >= 0 ? '+' : ''}
                    {lastDelta} к прошлому
                  </em>
                )}
              </span>
              <ChevronRight size={20} />
            </Link>
          )}
          {reviewing.map((exam) => (
            <div className="home-result home-result-pending" key={exam.id}>
              <span className="home-result-score">
                <Hourglass size={24} />
              </span>
              <span className="home-result-text">
                <b>{exam.subject}</b>
                <small>Работа на проверке. Результат появится здесь, когда учитель его опубликует.</small>
              </span>
            </div>
          ))}
        </section>
      )}

      {deleteDialog}
    </div>
  );
}
