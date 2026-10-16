import { api } from '../api/client';
import { useLoad } from '../hooks/useLoad';
import type { CurrentEvent } from '../types';
import { plural } from './adminEvents';

const dayMonth = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' });
const startOfDay = (value: Date) =>
  new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();

const loadCurrentEvent = () => api.student.currentEvent();

/** The nearest mock exam open for booking, or null when there is none (or it is not loaded yet). */
export function useCurrentEvent(): CurrentEvent | null {
  return useLoad(loadCurrentEvent).data ?? null;
}

/** «26 октября — 2 ноября», or one date when the exam lasts a day. */
export function eventPeriod(event: CurrentEvent): string {
  const first = new Date(event.starts_at);
  const last = new Date(event.ends_at);
  return startOfDay(first) === startOfDay(last)
    ? dayMonth.format(first)
    : `${dayMonth.format(first)} — ${dayMonth.format(last)}`;
}

/** How long booking stays open, or when it opens. */
export function registrationLeft(event: CurrentEvent, now = new Date()): string {
  if (event.state === 'soon' && event.registration_open_at)
    return `Запись откроется ${dayMonth.format(new Date(event.registration_open_at))}`;
  const until = new Date(event.registration_close_at ?? event.starts_at);
  const days = Math.round((startOfDay(until) - startOfDay(now)) / 86_400_000);
  return days <= 0
    ? 'Запись закрывается сегодня'
    : `Осталось ${plural(days, 'день', 'дня', 'дней')} на запись`;
}

export const freeSeats = (event: CurrentEvent) =>
  `Свободно ${plural(event.free_seats, 'место', 'места', 'мест')}`;
