import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { api } from '../api/client';
import { useLoad } from '../hooks/useLoad';

const KEY = 'probnik-theme';
const listeners = new Set<() => void>();
const loadEnabledThemes = () => api.themes.enabled();
const ThemeContext = createContext<{
  enabled: ReadonlySet<string>;
  refresh: () => Promise<void>;
}>({ enabled: new Set(), refresh: async () => undefined });

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

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { data, refresh } = useLoad(loadEnabledThemes);
  const enabled = useMemo(() => new Set(data?.enabled ?? []), [data]);
  useEffect(() => {
    if (data && !enabled.has('halloween')) setHalloween(false);
  }, [data, enabled]);
  return createElement(ThemeContext.Provider, { value: { enabled, refresh } }, children);
}

export const useThemeSettings = () => useContext(ThemeContext);
export const useThemeEnabled = (key: string) => useThemeSettings().enabled.has(key);

/** The student's own choice, constrained by themes the administrator has enabled. */
export const useHalloween = () => {
  const enabled = useThemeEnabled('halloween');
  const selected = useSyncExternalStore(subscribe, isHalloween, () => false);
  return enabled && selected;
};

/** Whole days left until the Halloween week starts; 0 when it is on or over. */
export function daysToWeek(now = new Date()) {
  const startOfDay = (value: Date) =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  return Math.max(0, Math.round((startOfDay(WEEK.start) - startOfDay(now)) / 86_400_000));
}
