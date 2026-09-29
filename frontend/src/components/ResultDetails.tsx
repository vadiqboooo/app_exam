import type { Exam, Participation } from '../types';
import { date, examDate, examSubject, examTitle, score } from '../lib/format';
import { resultScoreLabel } from '../lib/scoring';
import { StatCard } from './StatCard';
import { DataTable } from './DataTable';

export function ResultDetails({ result, exam }: { result: Participation; exam: Exam }) {
  return (
    <div className="stack">
      <div>
        <h3>{examSubject(exam)}</h3>
        <p className="muted">
          {examTitle(exam)} · {date(examDate(exam, result.slot_id), true)}
        </p>
        <p className="muted">{exam.slots.find((s) => s.id === result.slot_id)?.school_name}</p>
      </div>
      <div className="stats-grid two">
        <StatCard title="Первичный балл" value={score(result.primary_score)} />
        <StatCard title={resultScoreLabel(exam)} value={score(result.test_score)} />
      </div>
      {!!result.result_data?.tasks.length && (
        <DataTable
          rows={result.result_data.tasks}
          rowKey={(r) => r.code}
          label="Баллы по заданиям"
          columns={[
            { title: 'Задание', render: (r) => <strong>{r.code}</strong> },
            {
              title: 'Результат',
              render: (r) => (
                <span className="score-pill">
                  {score(r.score)} /{' '}
                  {score(exam.structure_data?.tasks.find((t) => t.code === r.code)?.max_score)}
                </span>
              ),
            },
            {
              title: 'Комментарий',
              render: (r) => <span className="preserve-text">{r.comment || '—'}</span>,
            },
          ]}
        />
      )}
      {result.result_data?.overall_comment && (
        <div className="comment-card">
          <span className="eyebrow">Комментарий преподавателя</span>
          <p className="preserve-text">{result.result_data.overall_comment}</p>
        </div>
      )}
    </div>
  );
}
