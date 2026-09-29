import type { Status } from '../types';

export const statusLabels: Record<Status, string> = {
  registered: 'Записан',
  attended: 'Пришёл',
  submitted: 'Сдал работу',
  checked: 'Проверено',
  published: 'Опубликован',
  absent: 'Не пришёл',
  cancelled: 'Запись отменена',
};
export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`badge badge-${status}`}>
      <span className="status-dot" />
      {statusLabels[status]}
    </span>
  );
}
