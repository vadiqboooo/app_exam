import { useSyncExternalStore } from 'react';

const KEY = 'probnik-theme';
const listeners = new Set<() => void>();

/** The Halloween week the theme is built for (shown on the login screen). */
export const WEEK = { start: new Date(2026, 9, 26), end: new Date(2026, 10, 2) };

export function isHalloween(): boolean {
  try {
    return localStorage.getItem(KEY) === 'halloween';
  } catch {
    return false;
  }
}

export function setHalloween(on: boolean) {
  try {
    if (on) localStorage.setItem(KEY, 'halloween');
    else localStorage.removeItem(KEY);
  } catch {
    // The theme just stays off when the storage is blocked.
  }
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
};

/** The student's own choice: it follows them from the login screen into the cabinet. */
export const useHalloween = () => useSyncExternalStore(subscribe, isHalloween, () => false);

/** Whole days left until the Halloween week starts; 0 when it is on or over. */
export function daysToWeek(now = new Date()) {
  const startOfDay = (value: Date) =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  return Math.max(0, Math.round((startOfDay(WEEK.start) - startOfDay(now)) / 86_400_000));
}
