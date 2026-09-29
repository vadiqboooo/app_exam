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
  onChange,
}: {
  tasks: Task[];
  values: TaskScoreValue[];
  disabled?: boolean;
  onChange: (values: TaskScoreValue[]) => void;
}) {
  return (
    <div className="task-score-grid" aria-label="Баллы по заданиям">
      {tasks.map((task, index) => (
        <label className="task-score-cell" key={task.code} title={`${task.title}. Максимум: ${task.max_score}`}>
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
              const score = raw !== '' && numeric > task.max_score ? String(task.max_score) : raw;
              onChange(values.map((value, valueIndex) => (valueIndex === index ? { ...value, score } : value)));
            }}
          />
          <small>из {task.max_score}</small>
        </label>
      ))}
    </div>
  );
}
