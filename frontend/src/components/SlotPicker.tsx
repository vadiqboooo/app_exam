import { useState } from 'react';
import { Building2, CalendarDays, Clock3, MapPin, Users } from 'lucide-react';
import type { ExamSlot } from '../types';
import { date } from '../lib/format';

const day = (value: string) =>
  new Intl.DateTimeFormat('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' }).format(
    new Date(value),
  );
const time = (value: string) =>
  new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));

export function SlotPicker({
  slots,
  value,
  onChange,
  disabled = false,
  variant = 'select',
  currentSlotId,
  stepStart = 2,
}: {
  slots: ExamSlot[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  variant?: 'select' | 'cards';
  currentSlotId?: number;
  stepStart?: number;
}) {
  const schools = [...new Map(slots.map((s) => [s.school_id, s])).values()];
  const [chosenSchool, setChosenSchool] = useState('');
  const selected = slots.find((s) => s.id === Number(value));
  const school =
    chosenSchool ||
    (selected ? String(selected.school_id) : schools.length === 1 ? String(schools[0].school_id) : '');
  const selectedSchool = schools.find((s) => s.school_id === Number(school));
  const address = selectedSchool?.school_address;
  if (variant === 'cards') {
    return (
      <div className="stack slot-picker slot-picker-cards">
        <div className="booking-section-heading">
          <span>{stepStart}</span>
          <div>
            <h4>Выберите школу</h4>
            <p>Можно записаться в любую удобную школу</p>
          </div>
        </div>
        <div className="school-choice-grid" role="group" aria-label="Школа">
          {schools.map((item) => {
            const active = item.school_id === Number(school);
            return (
              <button
                className={`school-choice ${active ? 'is-selected' : ''}`}
                type="button"
                key={item.school_id}
                aria-pressed={active}
                disabled={disabled}
                onClick={() => {
                  setChosenSchool(String(item.school_id));
                  onChange('');
                }}
              >
                <span className="choice-icon">
                  <Building2 size={19} />
                </span>
                <span>
                  <strong>{item.school_name}</strong>
                  {item.school_address && (
                    <small>
                      <MapPin size={13} /> {item.school_address}
                    </small>
                  )}
                </span>
              </button>
            );
          })}
        </div>
        {school && (
          <div className="booking-time-section">
            <div className="booking-section-heading">
              <span>{stepStart + 1}</span>
              <div>
                <h4>Выберите дату и время</h4>
                <p>{selectedSchool?.school_name}</p>
              </div>
            </div>
            <div className="time-choice-grid" role="radiogroup" aria-label="Дата и время записи">
              {slots
                .filter((item) => item.school_id === Number(school))
                .map((item) => {
                  const current = item.id === currentSlotId;
                  const closed =
                    (!item.remaining && !current) || new Date(item.starts_at).getTime() <= Date.now();
                  const active = item.id === Number(value);
                  return (
                    <label
                      className={`time-choice ${active ? 'is-selected' : ''} ${closed ? 'is-disabled' : ''}`}
                      key={item.id}
                    >
                      <input
                        type="radio"
                        name={`event-slot-${slots[0]?.id}`}
                        value={item.id}
                        checked={active}
                        disabled={disabled || closed}
                        onChange={(event) => onChange(event.target.value)}
                      />
                      <span className="time-choice-date">
                        <CalendarDays size={17} />
                        <strong>{day(item.starts_at)}</strong>
                      </span>
                      <span className="time-choice-time">
                        <Clock3 size={17} /> {time(item.starts_at)}
                      </span>
                      <span className={`time-choice-places ${item.remaining <= 3 ? 'is-low' : ''}`}>
                        <Users size={14} />
                        {current
                          ? 'Текущая запись'
                          : closed
                            ? 'Мест нет'
                            : `${item.remaining} из ${item.capacity} мест`}
                      </span>
                    </label>
                  );
                })}
            </div>
          </div>
        )}
        {selected && (
          <div className="selected-slot-summary">
            <Clock3 size={17} />
            <span>
              Вы выбрали <strong>{date(selected.starts_at, true)}</strong>
            </span>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="stack slot-picker">
      <label>
        Школа
        <select
          aria-label="Школа"
          required
          disabled={disabled}
          value={school}
          onChange={(e) => {
            setChosenSchool(e.target.value);
            onChange('');
          }}
        >
          <option value="">Выберите школу</option>
          {schools.map((s) => (
            <option key={s.school_id} value={s.school_id}>
              {s.school_name}
            </option>
          ))}
        </select>
      </label>
      {address && <p className="muted small">{address}</p>}
      <label>
        Дата и время записи
        <select
          aria-label="Дата и время записи"
          required
          disabled={disabled || !school}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Выберите дату и время</option>
          {slots
            .filter((s) => s.school_id === Number(school))
            .map((s) => (
              <option
                key={s.id}
                value={s.id}
                disabled={
                  (!s.remaining && s.id !== currentSlotId) || new Date(s.starts_at).getTime() <= Date.now()
                }
              >
                {date(s.starts_at, true)} ·{' '}
                {s.id === currentSlotId
                  ? 'Текущая запись'
                  : new Date(s.starts_at).getTime() <= Date.now()
                    ? 'Запись закрыта'
                    : `Свободно ${s.remaining} из ${s.capacity}`}
              </option>
            ))}
        </select>
      </label>
      {selected && (
        <p className="muted small">
          Записано: {selected.booked} · Свободно: {selected.remaining} из {selected.capacity}
        </p>
      )}
    </div>
  );
}
