export type CodeState = 'set' | 'first' | 'reset' | 'lock';

type Account = {
  has_code?: boolean;
  locked_until?: string | null;
  last_login_at?: string | null;
};

export const codeStateLabels: Record<CodeState, { label: string; hint: string }> = {
  set: { label: 'Код создан', hint: '' },
  first: { label: 'Не входил', hint: 'придумает код при первом входе' },
  reset: { label: 'Код сброшен', hint: 'придумает новый при входе' },
  lock: { label: 'Вход приостановлен', hint: '5 неверных попыток' },
};

export function codeState(account: Account, now = Date.now()): CodeState {
  if (account.has_code && account.locked_until && new Date(account.locked_until).getTime() > now)
    return 'lock';
  if (account.has_code) return 'set';
  return account.last_login_at ? 'reset' : 'first';
}

const time = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });

function plural(n: number, one: string, few: string, many: string) {
  const m = n % 10;
  const h = n % 100;
  return m === 1 && h !== 11 ? one : m >= 2 && m <= 4 && (h < 12 || h > 14) ? few : many;
}

/** «сейчас», «сегодня, 08:12», «вчера», «5 дней назад», «2 недели назад». */
export function lastLogin(value: string | null | undefined, now = new Date()): string {
  if (!value) return '—';
  const date = new Date(value);
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (now.getTime() - date.getTime() < 5 * 60_000) return 'сейчас';
  if (days <= 0) return `сегодня, ${time.format(date)}`;
  if (days === 1) return 'вчера';
  if (days < 7) return `${days} ${plural(days, 'день', 'дня', 'дней')} назад`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return weeks === 1 ? 'неделю назад' : `${weeks} ${plural(weeks, 'неделю', 'недели', 'недель')} назад`;
  }
  const months = Math.floor(days / 30);
  return months < 12
    ? `${months} ${plural(months, 'месяц', 'месяца', 'месяцев')} назад`
    : new Intl.DateTimeFormat('ru-RU').format(date);
}
