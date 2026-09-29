import type { ReactNode } from 'react';

export function StatCard({
  title,
  value,
  icon,
  hint,
}: {
  title: string;
  value: number | string;
  icon?: ReactNode;
  hint?: string;
}) {
  return (
    <div className="stat-card">
      <div className="stat-heading">
        <span>{title}</span>
        {icon && <span className="stat-icon">{icon}</span>}
      </div>
      <strong>{value}</strong>
      {hint && <small>{hint}</small>}
    </div>
  );
}
