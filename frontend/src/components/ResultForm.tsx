import { useState, type FormEvent } from 'react';
import { Send, Save } from 'lucide-react';
import type { Exam, Participation, Student } from '../types';
import { api } from '../api/client';
import { date, examDate, examSubject, score } from '../lib/format';
import { automaticScore, resultScoreLabel } from '../lib/scoring';
import { useAction } from '../hooks/useAction';
import { Modal } from './Modal';
import { Button } from './Button';
import { ErrorNotice } from './ErrorNotice';
import { ConfirmDialog } from './ConfirmDialog';
import { ResultDetails } from './ResultDetails';
import { TaskScoreGrid } from './TaskScoreGrid';

export function ResultForm({
  item,
  exam,
  student,
  onClose,
  onSaved,
}: {
  item: Participation;
  exam: Exam;
  student: Student;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const tasks = exam.structure_data?.tasks ?? [];
  const [values, setValues] = useState(
    tasks.map((t) => ({
      code: t.code,
      score: String(item.result_data?.tasks.find((r) => r.code === t.code)?.score ?? 0),
      comment: item.result_data?.tasks.find((r) => r.code === t.code)?.comment ?? '',
    })),
  );
  const [primary, setPrimary] = useState(String(item.primary_score ?? ''));
  const [test, setTest] = useState(String(item.test_score ?? ''));
  const [comment, setComment] = useState(item.result_data?.overall_comment ?? '');
  const [confirming, setConfirming] = useState(false);
  const { busy, error, run } = useAction();
  const total = tasks.length ? values.reduce((sum, t) => sum + Number(t.score), 0) : Number(primary);
  const calculated = automaticScore(exam, total);
  const data = {
    primary_score: total,
    test_score: calculated ?? (test === '' ? null : Number(test)),
    result_data: tasks.length
      ? {
          version: 1 as const,
          tasks: values.map((t) => ({ ...t, score: Number(t.score) })),
          overall_comment: comment,
        }
      : null,
  };
  const submit = (publish: boolean) =>
    run(async () => {
      await (publish ? api.results.publish(item.id, data) : api.results.save(item.id, data));
      await onSaved();
      onClose();
    });
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const publish = (e.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'publish';
    if (publish) setConfirming(true);
    else void submit(false);
  }
  return (
    <Modal
      title={item.status === 'published' ? 'Результат ученика' : 'Проверка работы'}
      onClose={onClose}
      wide
      busy={busy}
    >
      {item.status === 'published' ? (
        <div className="modal-body">
          <h3>{student.full_name}</h3>
          <ResultDetails result={item} exam={exam} />
        </div>
      ) : (
        <form onSubmit={onSubmit}>
          <div className="modal-body stack">
            <div>
              <h3>{student.full_name}</h3>
              <p className="muted">
                {examSubject(exam)} · {date(examDate(exam, item.slot_id), true)}
              </p>
            </div>
            <ErrorNotice message={error} />
            {tasks.length > 0 ? (
              <div className="stack compact-stack">
                <div>
                  <h3>Баллы по заданиям</h3>
                  <p className="muted small">Номер задания сверху, полученный балл — под ним.</p>
                </div>
                <TaskScoreGrid tasks={tasks} values={values} onChange={setValues} />
                <details className="task-comments" open>
                  <summary>Комментарии к отдельным заданиям</summary>
                  <div className="task-comment-list">
                    {tasks.map((task, index) => (
                      <label key={task.code}>
                        Задание {task.code}
                        <input
                          aria-label={`Комментарий к заданию ${task.code}`}
                          placeholder="Комментарий к решению"
                          value={values[index].comment}
                          onChange={(event) =>
                            setValues(
                              values.map((value, valueIndex) =>
                                valueIndex === index ? { ...value, comment: event.target.value } : value,
                              ),
                            )
                          }
                        />
                      </label>
                    ))}
                  </div>
                </details>
              </div>
            ) : (
              <label>
                Первичный балл
                <input
                  type="number"
                  min="0"
                  step="any"
                  required
                  value={primary}
                  onChange={(e) => setPrimary(e.target.value)}
                />
              </label>
            )}
            <div className="result-summary">
              <span>
                Первичный балл <strong>{score(total)}</strong>
              </span>
              <label>
                {resultScoreLabel(exam)}
                <input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="Не указан"
                  value={calculated ?? test}
                  disabled={calculated != null}
                  onChange={(e) => setTest(e.target.value)}
                />
              </label>
            </div>
            {tasks.length > 0 && (
              <label>
                Общий комментарий
                <textarea
                  rows={3}
                  placeholder="Что получилось и над чем ещё поработать"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
              </label>
            )}
            <p className="muted small">
              Сохранённый результат доступен сотрудникам. Ученик увидит его после публикации.
            </p>
          </div>
          <div className="modal-footer">
            <Button type="submit" variant="secondary" icon={<Save size={16} />} disabled={busy}>
              Сохранить
            </Button>
            <Button type="submit" value="publish" icon={<Send size={16} />} disabled={busy}>
              Опубликовать результат
            </Button>
          </div>
        </form>
      )}
      {confirming && (
        <ConfirmDialog
          title="Опубликовать результат?"
          text="Ученик увидит баллы и комментарии. После публикации редактирование будет закрыто."
          confirm="Опубликовать"
          busy={busy}
          onClose={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            void submit(true);
          }}
        />
      )}
    </Modal>
  );
}
