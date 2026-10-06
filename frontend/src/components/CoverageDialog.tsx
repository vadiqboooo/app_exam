import { useState } from 'react';
import type { Task } from '../types';
import { useAction } from '../hooks/useAction';
import { Button } from './Button';
import { ErrorNotice } from './ErrorNotice';
import { Modal } from './Modal';

/** Marks the tasks of one exam the group has already covered; every change is saved at once. */
export function CoverageDialog({
  groupName,
  examTitle,
  tasks,
  covered,
  previous,
  onSave,
  onClose,
}: {
  groupName: string;
  examTitle: string;
  tasks: Task[];
  covered: string[];
  /** Marks of the previous exam of the same subject, offered as a starting point. */
  previous: string[];
  onSave: (codes: string[]) => Promise<void>;
  onClose: () => void;
}) {
  const [marked, setMarked] = useState(covered);
  const { busy, error, run } = useAction();
  const order = tasks.map((task) => task.code);
  const apply = (codes: string[]) => {
    const before = marked;
    setMarked(codes);
    void run(async () => {
      try {
        await onSave(codes);
      } catch (reason) {
        setMarked(before);
        throw reason;
      }
    });
  };
  const fromPrevious = previous.filter((code) => order.includes(code));

  return (
    <Modal title="Пройденные задания группы" onClose={onClose} wide>
      <div className="modal-body stack cov-dialog">
        <p className="cov-lead">
          Отметьте задания, которые группа {groupName} разобрала <b>к этому пробнику</b>. У каждого пробника
          свои отметки.
        </p>
        <div className="cov-meta">
          <span>Пробник: {examTitle}</span>
          <b>
            Пройдено {marked.length} из {tasks.length}
          </b>
        </div>
        <ErrorNotice message={error} />
        <div className="cov-grid">
          {tasks.map((task) => {
            const on = marked.includes(task.code);
            return (
              <button
                type="button"
                key={task.code}
                aria-pressed={on}
                aria-label={`Задание ${task.code}${on ? ': пройдено' : ': не пройдено'}`}
                onClick={() =>
                  apply(order.filter((code) => (code === task.code ? !on : marked.includes(code))))
                }
              >
                <strong>{task.code}</strong>
                <small>{task.max_score} б.</small>
              </button>
            );
          })}
        </div>
        <div className="cov-legend">
          <span>
            <i className="is-on" />
            пройдено
          </span>
          <span>
            <i />
            ещё не проходили
          </span>
        </div>
      </div>
      <div className="modal-footer cov-footer">
        <div>
          <Button variant="secondary" onClick={() => apply(order)}>
            Отметить все
          </Button>
          <Button variant="secondary" onClick={() => apply([])}>
            Сбросить
          </Button>
          {fromPrevious.length > 0 && (
            <Button variant="secondary" onClick={() => apply(fromPrevious)}>
              Взять отметки прошлого пробника ({fromPrevious.length})
            </Button>
          )}
        </div>
        <span>{busy ? 'Сохраняем…' : 'Сохраняется автоматически'}</span>
        <Button onClick={onClose}>Готово</Button>
      </div>
    </Modal>
  );
}
