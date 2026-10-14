import { useState } from 'react';
import { Printer } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';
import { examSubject } from '../lib/format';
import type { Exam } from '../types';

export interface PrintSlot {
  id: number;
  school_id: number;
  school_name: string;
  starts_at: string;
}

/** One registered student: which subject and which session. */
export interface PrintRegistration {
  examId: number;
  slot?: PrintSlot;
}

const dayKey = (value: string) => {
  const date = new Date(value);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
};
const dayLabel = (value: string) =>
  new Intl.DateTimeFormat('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' })
    .format(new Date(value))
    .replace(/\./g, '')
    .toUpperCase();
const slotText = (slot: PrintSlot) =>
  `${slot.school_name}, ${new Intl.DateTimeFormat('ru-RU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
    .format(new Date(slot.starts_at))
    .replace(/\./g, '')}`;

/** Copies to print: everyone registered, plus a tenth in reserve when asked. */
export const copiesToPrint = (registered: number, reserve: boolean) =>
  reserve ? Math.ceil(registered * 1.1) : registered;

export function PrintCounts({
  exams,
  registrations,
  slots,
  activeSlot,
  onClose,
}: {
  exams: Exam[];
  registrations: PrintRegistration[];
  slots: PrintSlot[];
  activeSlot?: PrintSlot;
  onClose: () => void;
}) {
  const [whole, setWhole] = useState(!activeSlot);
  const [school, setSchool] = useState('');
  const [reserve, setReserve] = useState(false);

  const schools = [...new Map(slots.map((slot) => [slot.school_id, slot.school_name])).entries()];
  const inSchool = (slot?: PrintSlot) => !school || slot?.school_id === Number(school);
  const days = whole
    ? [
        ...new Map(
          slots.filter((slot) => inSchool(slot)).map((slot) => [dayKey(slot.starts_at), slot.starts_at]),
        ).entries(),
      ].sort((a, b) => a[1].localeCompare(b[1]))
    : [];

  const rows = exams.map((exam) => {
    const mine = registrations.filter((item) => item.examId === exam.id);
    if (!whole)
      return {
        exam,
        perDay: [] as number[],
        registered: mine.filter((item) => item.slot?.id === activeSlot?.id).length,
      };
    const perDay = days.map(
      ([key]) =>
        mine.filter((item) => inSchool(item.slot) && item.slot && dayKey(item.slot.starts_at) === key).length,
    );
    return { exam, perDay, registered: perDay.reduce((total, count) => total + count, 0) };
  });

  const sum = (pick: (row: (typeof rows)[number]) => number) =>
    rows.reduce((total, row) => total + pick(row), 0);
  const grid = { gridTemplateColumns: `2.2fr repeat(${days.length + 2}, minmax(0, 1fr))` };

  return (
    <Modal title="Сколько работ печатать" onClose={onClose} wide>
      <div className="pc-body">
        <p className="pc-sub">
          {whole
            ? 'Весь пробник: сколько человек записано на каждый предмет по датам.'
            : activeSlot
              ? `${slotText(activeSlot)} · записано ${sum((row) => row.registered)} чел.`
              : 'Выберите сеанс.'}
        </p>
        <div className="pc-controls">
          <div className="ad-tabs" role="group" aria-label="Что считать">
            <button
              type="button"
              aria-pressed={!whole}
              disabled={!activeSlot}
              onClick={() => setWhole(false)}
            >
              Выбранный сеанс
            </button>
            <button type="button" aria-pressed={whole} onClick={() => setWhole(true)}>
              Весь пробник
            </button>
          </div>
          {whole && schools.length > 1 && (
            <div className="ad-tabs" role="group" aria-label="Школа">
              <button type="button" aria-pressed={!school} onClick={() => setSchool('')}>
                Все школы
              </button>
              {schools.map(([id, name]) => (
                <button
                  type="button"
                  key={id}
                  aria-pressed={school === String(id)}
                  onClick={() => setSchool(String(id))}
                >
                  {name}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            role="switch"
            aria-checked={reserve}
            className="pc-reserve"
            onClick={() => setReserve(!reserve)}
          >
            <span aria-hidden="true">{reserve ? '✓' : ''}</span>
            Запас 10%
          </button>
          <Button onClick={() => window.print()}>
            <Printer size={16} /> Версия для печати
          </Button>
        </div>
      </div>
      <div className="pc-table" role="table" aria-label="Сколько работ печатать">
        <div className="pc-row pc-head" role="row" style={grid}>
          <span role="columnheader">ПРЕДМЕТ</span>
          {days.map(([key, value]) => (
            <span role="columnheader" key={key}>
              {dayLabel(value)}
            </span>
          ))}
          <span role="columnheader">{whole ? 'ВСЕГО ЗАПИСАНО' : 'ЗАПИСАНО'}</span>
          <span role="columnheader">{reserve ? 'ПЕЧАТАТЬ (С ЗАПАСОМ)' : 'ПЕЧАТАТЬ'}</span>
        </div>
        {rows.map((row) => (
          <div className="pc-row" role="row" style={grid} key={row.exam.id}>
            <span role="cell" className="pc-name">
              {examSubject(row.exam)}
            </span>
            {row.perDay.map((count, index) => (
              <span role="cell" key={days[index][0]}>
                {count}
              </span>
            ))}
            <span role="cell" className={whole ? 'pc-strong' : ''}>
              {row.registered}
            </span>
            <span role="cell" className="pc-print">
              {copiesToPrint(row.registered, reserve)} шт.
            </span>
          </div>
        ))}
        <div className="pc-row pc-sum" role="row" style={grid}>
          <span role="cell" className="pc-name">
            Итого
          </span>
          {days.map(([key], index) => (
            <span role="cell" className="pc-strong" key={key}>
              {sum((row) => row.perDay[index])}
            </span>
          ))}
          <span role="cell" className="pc-strong">
            {sum((row) => row.registered)}
          </span>
          <span role="cell" className="pc-print">
            {sum((row) => copiesToPrint(row.registered, reserve))} шт.
          </span>
        </div>
      </div>
    </Modal>
  );
}
