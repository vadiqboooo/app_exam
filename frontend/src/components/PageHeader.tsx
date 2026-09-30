import type { ReactNode } from 'react';
import { useSectionTitle } from '../layouts/AppLayout';

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  const duplicate = title === useSectionTitle();
  if (duplicate && !subtitle && !action) return null;
  return (
    <div className={`page-header ${duplicate && !subtitle ? 'page-header-bare' : ''}`}>
      <div>
        {!duplicate && <h1>{title}</h1>}
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
