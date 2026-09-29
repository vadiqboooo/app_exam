import { useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './Button';
import { EmptyState } from './EmptyState';

export interface Column<T> {
  title: string;
  render: (row: T) => ReactNode;
  className?: string;
}
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  empty = 'Нет записей',
  label = 'Список',
  page: controlledPage,
  onPageChange,
  onRowClick,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string | number;
  empty?: string;
  label?: string;
  page?: number;
  onPageChange?: (page: number) => void;
  onRowClick?: (row: T) => void;
}) {
  const [localPage, setLocalPage] = useState(0);
  const page = controlledPage ?? localPage;
  const setPage = onPageChange ?? setLocalPage;
  const pageCount = Math.max(1, Math.ceil(rows.length / 20));
  const current = Math.min(page, pageCount - 1);
  if (!rows.length)
    return (
      <div className="panel">
        <EmptyState title={empty} text="Попробуйте изменить фильтры или добавить данные." />
      </div>
    );
  return (
    <div className="table-panel">
      <div className="table-scroll">
        <table aria-label={label}>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.title}>{c.title}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(current * 20, current * 20 + 20).map((row) => (
              <tr
                key={rowKey(row)}
                className={onRowClick ? 'clickable-row' : undefined}
                onClick={
                  onRowClick
                    ? (event) => {
                        if (!(event.target as HTMLElement).closest('a, button, input, select'))
                          onRowClick(row);
                      }
                    : undefined
                }
              >
                {columns.map((c) => (
                  <td key={c.title} className={c.className}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-footer">
        <span>
          Показано {current * 20 + 1}–{Math.min(current * 20 + 20, rows.length)} из {rows.length}
        </span>
        <div className="inline">
          <Button
            variant="ghost"
            aria-label="Предыдущая страница"
            disabled={!current}
            onClick={() => setPage(current - 1)}
          >
            <ChevronLeft size={16} />
          </Button>
          <span>
            {current + 1} / {pageCount}
          </span>
          <Button
            variant="ghost"
            aria-label="Следующая страница"
            disabled={current + 1 >= pageCount}
            onClick={() => setPage(current + 1)}
          >
            <ChevronRight size={16} />
          </Button>
        </div>
      </div>
    </div>
  );
}
