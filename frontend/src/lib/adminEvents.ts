import type { Exam, Participation } from '../types';
import { registrationState } from './format';

export type EventState = 'open' | 'soon' | 'closed' | 'review' | 'done' | 'draft';
export const stateLabels: Record<EventState, string> = {
  open: 'Запись открыта',
  soon: 'Скоро запись',
  closed: 'Запись закрыта',
  review: 'Идёт проверка',
  done: 'Завершён',
  draft: 'Черновик',
};

const dm = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' });
const day = new Intl.DateTimeFormat('ru-RU', { day: 'numeric' });
const clean = (value: string) => value.replace('.', '');

export function dateRange(start: string, end: string) {
  const a = new Date(start);
  const b = new Date(end);
  if (a.toDateString() === b.toDateString()) return clean(dm.format(a));
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear())
    return `${day.format(a)}–${clean(dm.format(b))}`;
  return `${clean(dm.format(a))} – ${clean(dm.format(b))}`;
}
const dmy = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
export const dateRangeYear = (start: string, end: string) => {
  const a = new Date(start);
  const b = new Date(end);
  const range = dateRange(start, end);
  return a.getFullYear() === b.getFullYear()
    ? `${range} ${b.getFullYear()}`
    : `${clean(dmy.format(a))} – ${clean(dmy.format(b))}`;
};
export function plural(n: number, one: string, few: string, many: string) {
  const m = n % 10;
  const h = n % 100;
  return `${n} ${m === 1 && h !== 11 ? one : m >= 2 && m <= 4 && (h < 12 || h > 14) ? few : many}`;
}
export const shortDay = (value: string) => clean(dm.format(new Date(value)));

export function summarize(exams: Exam[], participations: Participation[]) {
  const ids = new Set(exams.map((exam) => exam.id));
  const regs = participations.filter((item) => ids.has(item.exam_id) && item.status !== 'cancelled');
  const slots = [...new Map(exams.flatMap((exam) => exam.slots).map((slot) => [slot.id, slot])).values()];
  const times = exams.flatMap((exam) =>
    exam.slots.length ? exam.slots.map((slot) => slot.starts_at) : [exam.starts_at],
  );
  times.sort();
  const start = times[0];
  const end = times[times.length - 1];
  const endsAt = exams.map((exam) => exam.ends_at).filter((value): value is string => !!value);
  const lastMoment = Math.max(new Date(end).getTime(), ...endsAt.map((value) => new Date(value).getTime()));
  const finished = lastMoment < Date.now();
  const reviewing = regs.some((item) => ['attended', 'submitted', 'checked'].includes(item.status));
  const published = regs.filter((item) => item.status === 'published').length;
  const worked = regs.filter((item) =>
    ['attended', 'submitted', 'checked', 'published'].includes(item.status),
  ).length;
  const first = exams[0];
  const state: EventState = !first.is_active
    ? 'draft'
    : finished
      ? reviewing
        ? 'review'
        : 'done'
      : (registrationState(first) as EventState);
  return {
    first,
    regs,
    slots,
    schools: new Set(slots.map((slot) => slot.school_id)).size,
    start,
    end,
    finished,
    state,
    reg: regs.length,
    free: slots.reduce((sum, slot) => sum + slot.remaining, 0),
    capacity: slots.reduce((sum, slot) => sum + slot.capacity, 0),
    published,
    worked,
  };
}
