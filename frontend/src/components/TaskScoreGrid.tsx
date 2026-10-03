import { useState } from 'react';
import { MessageSquare, X } from 'lucide-react';
import type { Task } from '../types';

export interface TaskScoreValue {
  code: string;
  score: string;
  comment: string;
}

export function TaskScoreGrid({
  tasks,
  values,
  disabled = false,
  withComments = false,
  onChange,
}: {
  tasks: Task[];
  values: TaskScoreValue[];
  disabled?: boolean;
  withComments?: boolean;
  onChange: (values: TaskScoreValue[]) => void;
}) {
  const [open, setOpen] = useState<string[]>([]);
  const set = (index: number, patch: Partial<TaskScoreValue>) =>
    onChange(values.map((value, valueIndex) => (valueIndex === index ? { ...value, ...patch } : value)));
  const commented = tasks.flatMap((task, index) =>
    values[index]?.comment || open.includes(task.code) ? [{ task, index }] : [],
  );
  return (
    <>
      <div className="task-score-grid" aria-label="Баллы по заданиям">
        {tasks.map((task, index) => {
          const hasComment = Boolean(values[index]?.comment) || open.includes(task.code);
          return (
            <label
              className="task-score-cell"
              key={task.code}
              title={`${task.title}. Максимум: ${task.max_score}`}
            >
              <span>{task.code}</span>
              <input
                aria-label={`Балл за задание ${task.code}`}
                type="number"
                inputMode="decimal"
                min="0"
                max={task.max_score}
                step="any"
                required
                disabled={disabled}
                value={values[index]?.score ?? ''}
                onFocus={(event) => event.currentTarget.select()}
                onChange={(event) => {
                  const raw = event.target.value;
                  const numeric = Number(raw);
                  set(index, {
                    score: raw !== '' && numeric > task.max_score ? String(task.max_score) : raw,
                  });
                }}
              />
              <small>
                из {task.max_score}
                {withComments && (
                  <button
                    type="button"
                    className="task-comment-btn"
                    aria-pressed={hasComment}
                    aria-label={`${hasComment ? 'Изменить' : 'Добавить'} комментарий к заданию ${task.code}`}
                    onClick={(event) => {
                      event.preventDefault();
                      setOpen((prev) => (prev.includes(task.code) ? prev : [...prev, task.code]));
                    }}
                  >
                    <MessageSquare size={13} />
                  </button>
                )}
              </small>
            </label>
          );
        })}
      </div>
      {withComments && commented.length > 0 && (
        <div className="task-comments">
          <span className="qr-label">Комментарии к заданиям · ученик увидит их в разборе</span>
          {commented.map(({ task, index }) => (
            <div className="task-comment-row" key={task.code}>
              <span className="task-comment-tag">
                №{task.code}
                <small>
                  {values[index]?.score || '—'}/{task.max_score}
                </small>
              </span>
              <textarea
                rows={1}
                aria-label={`Комментарий к заданию ${task.code}`}
                placeholder="Что не так в решении и что повторить"
                value={values[index]?.comment ?? ''}
                onChange={(event) => set(index, { comment: event.target.value })}
              />
              <button
                type="button"
                aria-label={`Удалить комментарий к заданию ${task.code}`}
                onClick={() => {
                  set(index, { comment: '' });
                  setOpen((prev) => prev.filter((code) => code !== task.code));
                }}
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
