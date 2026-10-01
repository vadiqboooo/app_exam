import { useState } from 'react';
import { ArrowLeft, ArrowRight, Building2, CalendarDays, Check, ChevronRight, MapPin } from 'lucide-react';
import type { Exam, ExamSlot } from '../types';
import { api } from '../api/client';
import { useStudentWorkspace } from '../layouts/StudentWorkspace';
import { useAction } from '../hooks/useAction';
import { registrationState } from '../lib/format';
import { Button } from './Button';
import { ErrorNotice } from './ErrorNotice';

const dayLabel = (value: string) =>
  new Intl.DateTimeFormat('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' })
    .format(new Date(value))
    .replace('.', '');
const longDay = (value: string) =>
  new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(
    new Date(value),
  );
const timeLabel = (value: string) =>
  new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
const places = (count: number) => {
  const mod10 = count % 10;
  const mod100 = count % 100;
  const word =
    mod10 === 1 && mod100 !== 11
      ? 'место'
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? 'места'
        : 'мест';
  return `${count} ${word}`;
};
const isOpen = (slot: ExamSlot) => slot.remaining > 0 && new Date(slot.starts_at).getTime() > Date.now();
const uniqueSchools = (exam: Exam) => [...new Map(exam.slots.map((slot) => [slot.school_id, slot])).values()];

export function BookingFlow({ exams, onClose }: { exams: Exam[]; onClose: () => void }) {
  const { data, refresh } = useStudentWorkspace();
  const formats = [...new Set(exams.map((exam) => exam.format!))];
  const preferred = data.student.grade && data.student.grade <= 9 ? 'oge' : 'ege';
  const [format, setFormat] = useState(formats.includes(preferred) ? preferred : formats[0]);
  const [step, setStep] = useState(1);
  const [examId, setExamId] = useState<number | null>(null);
  const [schoolId, setSchoolId] = useState<number | null>(null);
  const [slotId, setSlotId] = useState<number | null>(null);
  const [done, setDone] = useState<{ exam: Exam; slot: ExamSlot } | null>(null);
  const { busy, error, run, clearError } = useAction();
  const registered = new Set(
    data.participations.filter((item) => item.status !== 'cancelled').map((item) => item.exam_id),
  );
  const exam = exams.find((item) => item.id === examId);
  const schools = exam ? uniqueSchools(exam) : [];
  const school = schools.find((item) => item.school_id === schoolId);
  const slots = exam?.slots.filter((slot) => slot.school_id === schoolId) ?? [];
  const slot = slots.find((item) => item.id === slotId);
  const state = registrationState(exams[0]);
  const title = exams[0].title || 'Пробный экзамен';
  const canRegister = data.student.is_active && state === 'open';

  const reset = () => {
    setStep(1);
    setExamId(null);
    setSchoolId(null);
    setSlotId(null);
    setDone(null);
    clearError();
  };
  const back = () => {
    clearError();
    setSlotId(null);
    if (step === 3) setStep(2);
    else {
      setSchoolId(null);
      setExamId(null);
      setStep(1);
    }
  };

  if (done)
    return (
      <div className="bf bf-done">
        <span className="bf-done-icon">
          <Check size={40} strokeWidth={2.4} />
        </span>
        <h2>Вы записаны!</h2>
        <p>Запись появилась в разделе «Пробники». Время можно изменить, пока запись открыта.</p>
        <div className="bf-done-card">
          <div>
            <small>
              {done.exam.format === 'oge' ? 'ОГЭ' : 'ЕГЭ'} · {title}
            </small>
            <strong>{done.exam.subject}</strong>
          </div>
          <p>
            <CalendarDays size={20} />
            <span>
              <b>{longDay(done.slot.starts_at)}</b> в {timeLabel(done.slot.starts_at)}
            </span>
          </p>
          <p>
            <MapPin size={20} />
            <span>
              <b>{done.slot.school_name}</b>
              {done.slot.school_address && <em>{done.slot.school_address}</em>}
            </span>
          </p>
          <div className="bf-done-note">Приходите за 15 минут до начала.</div>
        </div>
        <div className="bf-done-actions">
          <Button onClick={onClose}>К моим пробникам</Button>
          <Button variant="secondary" onClick={reset}>
            Записаться на ещё один предмет
          </Button>
        </div>
      </div>
    );

  const picked = [step > 1 ? exam?.subject : '', step > 2 ? school?.school_name : ''].filter(Boolean);
  return (
    <div className="bf">
      <div className="bf-head">
        <button
          type="button"
          className="bf-back"
          aria-label={step === 1 ? 'Назад к пробникам' : 'Предыдущий шаг'}
          onClick={step === 1 ? onClose : back}
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <strong>{title}</strong>
          {exams[0].registration_close_at && (
            <small>
              Запись до{' '}
              {new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(
                new Date(exams[0].registration_close_at),
              )}
            </small>
          )}
        </div>
      </div>
      <nav className="bf-steps" aria-label="Шаги записи">
        {['Предмет', 'Школа', 'Время'].map((label, index) => {
          const n = index + 1;
          return (
            <div
              key={label}
              className={`bf-step ${n < step ? 'is-done' : ''} ${n === step ? 'is-current' : ''}`}
            >
              <button
                type="button"
                disabled={n >= step}
                aria-current={n === step ? 'step' : undefined}
                onClick={() => {
                  clearError();
                  if (n === 1) reset();
                  else {
                    setSlotId(null);
                    setStep(2);
                  }
                }}
              >
                <span>{n < step ? <Check size={16} /> : n}</span>
                {label}
              </button>
              {n < 3 && <i />}
            </div>
          );
        })}
      </nav>
      {picked.length > 0 && (
        <div className="bf-picked">
          {picked.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      )}
      <ErrorNotice message={error} />
      {state !== 'open' && (
        <div className="info-panel">
          {state === 'soon' ? 'Запись на этот пробник ещё не началась.' : 'Запись на этот пробник закрыта.'}
        </div>
      )}

      {step === 1 && (
        <section>
          <h2>Выберите предмет</h2>
          {formats.length > 1 && (
            <div className="bf-seg" role="group" aria-label="Формат экзамена">
              {formats.map((item) => (
                <button
                  type="button"
                  key={item}
                  aria-pressed={format === item}
                  onClick={() => setFormat(item)}
                >
                  {item === 'ege' ? 'ЕГЭ' : 'ОГЭ'}
                </button>
              ))}
            </div>
          )}
          <div className="bf-list" role="group" aria-label="Предмет">
            {exams
              .filter((item) => item.format === format)
              .map((item) => {
                const signed = registered.has(item.id);
                const full = !item.slots.some(isOpen);
                return (
                  <button
                    type="button"
                    key={item.id}
                    className={signed ? 'is-signed' : full ? 'is-full' : ''}
                    disabled={signed || full || !canRegister}
                    onClick={() => {
                      setExamId(item.id);
                      setSchoolId(null);
                      setSlotId(null);
                      setStep(2);
                    }}
                  >
                    <span>{item.subject}</span>
                    <small>{signed ? '✓ Вы записаны' : full ? 'Мест нет' : ''}</small>
                  </button>
                );
              })}
          </div>
        </section>
      )}

      {step === 2 && exam && (
        <section>
          <h2>Выберите школу</h2>
          <div className="bf-list">
            {schools.map((item) => {
              const free = exam.slots
                .filter((s) => s.school_id === item.school_id && isOpen(s))
                .reduce((sum, s) => sum + s.remaining, 0);
              return (
                <button
                  type="button"
                  key={item.school_id}
                  className="bf-school"
                  onClick={() => {
                    setSchoolId(item.school_id);
                    setSlotId(null);
                    setStep(3);
                  }}
                >
                  <span className="bf-school-icon">
                    <Building2 size={22} />
                  </span>
                  <span>
                    <strong>{item.school_name}</strong>
                    {item.school_address && <small>{item.school_address}</small>}
                    <em className={free ? '' : 'is-none'}>
                      {free ? `Свободно ${places(free)}` : 'Мест нет'}
                    </em>
                  </span>
                  <ChevronRight size={20} />
                </button>
              );
            })}
          </div>
        </section>
      )}

      {step === 3 && exam && (
        <section>
          <h2>Выберите дату и время</h2>
          <div className="bf-slots" role="radiogroup" aria-label="Дата и время">
            {slots.map((item) => {
              const ok = isOpen(item);
              return (
                <button
                  type="button"
                  role="radio"
                  aria-checked={slotId === item.id}
                  key={item.id}
                  disabled={!ok}
                  onClick={() => setSlotId(item.id)}
                >
                  <span>{dayLabel(item.starts_at)}</span>
                  <strong>{timeLabel(item.starts_at)}</strong>
                  <small className={item.remaining <= 3 ? 'is-low' : ''}>
                    {ok
                      ? item.remaining <= 3
                        ? `Осталось ${places(item.remaining)}`
                        : places(item.remaining)
                      : 'Мест нет'}
                  </small>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {step === 3 && exam && slot && (
        <div className="bf-bar">
          <div>
            <strong>{exam.subject}</strong>
            <small>
              {dayLabel(slot.starts_at)}, {timeLabel(slot.starts_at)} · {slot.school_name}
            </small>
          </div>
          <Button
            icon={<ArrowRight size={20} />}
            disabled={busy || !canRegister}
            onClick={() =>
              void run(async () => {
                try {
                  await api.student.register(exam.id, slot.id);
                } finally {
                  await refresh();
                }
                setDone({ exam, slot });
              })
            }
          >
            {busy ? 'Записываем…' : 'Записаться'}
          </Button>
        </div>
      )}
    </div>
  );
}
