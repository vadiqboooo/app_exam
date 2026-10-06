// The server stores timestamps as naive UTC, so «Z» is needed for the browser to read them correctly.
const moment = (value: string) => new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`);

export const backupTime = (value: string) =>
  new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(moment(value));

export function backupAge(value: string) {
  const minutes = Math.max(0, Math.round((Date.now() - moment(value).getTime()) / 60000));
  if (minutes < 1) return 'только что';
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.floor(hours / 24);
  const word =
    days % 10 === 1 && days % 100 !== 11
      ? 'день'
      : days % 10 >= 2 && days % 10 <= 4 && (days % 100 < 12 || days % 100 > 14)
        ? 'дня'
        : 'дней';
  return `${days} ${word} назад`;
}

export const fileSize = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} КБ`
    : `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} МБ`;
