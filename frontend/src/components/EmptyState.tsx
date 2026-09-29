import { Inbox } from 'lucide-react';
import type { ReactNode } from 'react';

export function EmptyState({
  title = 'Пока ничего нет',
  text,
  action,
}: {
  title?: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Inbox size={28} />
      </span>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}
