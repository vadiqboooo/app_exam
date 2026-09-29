import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Save, Send } from 'lucide-react';
import type { Exam, Group, Participation, Student, Task } from '../types';
import { api } from '../api/client';
import { date, examDate, examSubject, examTitle, score } from '../lib/format';
import { automaticScore, resultScoreLabel } from '../lib/scoring';
import { useAction } from '../hooks/useAction';
import { Button } from './Button';
import { ConfirmDialog } from './ConfirmDialog';
import { EmptyState } from './EmptyState';
import { ErrorNotice } from './ErrorNotice';
import { StatusBadge } from './StatusBadge';

const normalize = (value: string | null | undefined) =>
  (value ?? '')
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[^а-яa-z0-9]+/g, ' ')
    .trim();

function belongsToSubject(exam: Exam, subject: string | null) {
  const groupSubject = normalize(subject);
  const examSubjectName = normalize(exam.subject);
  return (
    !!groupSubject &&
    (groupSubject === examSubjectName ||
      groupSubject.includes(examSubjectName) ||
      examSubjectName.includes(groupSubject))
  );
}

type RowValue = { code: string; score: number | null };

function StudentResultCard({
  student,
  exam,
  item,
  tasks,
  onSaved,
}: {
  student: Student;
  exam: Exam;
  item?: Participation;
  tasks: Task[];
  onSaved: () => Promise<void>;
}) {
  const storedScores = new Map(item?.result_data?.tasks.map((result) => [result.code, result.score]));
  const [values, setValues] = useState<RowValue[]>(
    tasks.map((task) => ({
      code: task.code,
      score: storedScores.has(task.code) ? (storedScores.get(task.code) ?? null) : null,
    })),
  );
  const [comment, setComment] = useState(item?.result_data?.overall_comment ?? '');
  const [confirming, setConfirming] = useState(false);
  const { busy, error, run } = useAction();
  const locked = item?.status === 'published' || item?.status === 'absent' || item?.status === 'cancelled';
  const hasScores = values.some((value) => value.score !== null);
  const primary = values.reduce((sum, value) => sum + (value.score ?? 0), 0);
  const finalScore = hasScores ? automaticScore(exam, primary) : null;

  useEffect(() => {
    const current = new Map(item?.result_data?.tasks.map((result) => [result.code, result.score]));
    setValues(
      tasks.map((task) => ({
        code: task.code,
        score: current.has(task.code) ? (current.get(task.code) ?? null) : null,
      })),
    );
    setComment(item?.result_data?.overall_comment ?? '');
  }, [exam.id, item?.id, item?.updated_at]);

  const payload = {
    primary_score: primary,
    test_score: finalScore,
    result_data: {
      version: 1 as const,
      tasks: values.map((value) => ({ ...value, score: value.score ?? 0, comment: '' })),
      overall_comment: comment,
    },
  };

  const submit = (publish: boolean) =>
    run(async () => {
      const saved = await api.results.quickSave({
        ...payload,
        student_id: student.id,
        exam_id: exam.id,
        slot_id: item?.slot_id ?? undefined,
      });
      if (publish) await api.results.publish(saved.id, payload);
      await onSaved();
    });

  return (
    <article className="student-result-card" aria-label={`Результат ученика ${student.full_name}`}>
      <div className="student-result-main">
        <div className="student-result-name">
          <strong>{student.full_name}</strong>
        </div>
        <div
          className="student-task-grid"
          style={{ '--task-columns': Math.ceil(tasks.length / 2) } as CSSProperties}
        >
          {tasks.map((task, index) => (
            <label className="student-task-field" key={task.code}>
              <span>{task.code}</span>
              <input
                aria-label={`Балл за задание ${task.code} — ${student.full_name}`}
                type="number"
                min={0}
                max={task.max_score}
                step={1}
                disabled={locked || busy}
                placeholder="—"
                value={values[index]?.score ?? ''}
                onChange={(event) => {
                  if (event.target.value === '') {
                    setValues(
                      values.map((value, valueIndex) =>
                        valueIndex === index ? { ...value, score: null } : value,
                      ),
                    );
                    return;
                  }
                  const parsed = Number(event.target.value);
                  const next = Number.isFinite(parsed)
                    ? Math.min(task.max_score, Math.max(0, Math.trunc(parsed)))
                    : 0;
                  setValues(
                    values.map((value, valueIndex) =>
                      valueIndex === index ? { ...value, score: next } : value,
                    ),
                  );
                }}
              />
            </label>
          ))}
        </div>
      </div>
      <div className="student-result-bottom">
        <label className="student-result-comment">
          Комментарий
          <textarea
            aria-label={`Комментарий по результатам работы — ${student.full_name}`}
            rows={2}
            disabled={locked || busy}
            placeholder="Комментарий к работе"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
          />
        </label>
        <div className="student-result-totals">
          <span>
            Первичный <strong>{hasScores ? score(primary) : '—'}</strong>
          </span>
          <span>
            {resultScoreLabel(exam)} <strong>{score(finalScore)}</strong>
          </span>
        </div>
        <div className="student-result-controls">
          <StatusBadge status={item?.status ?? 'registered'} />
          {!locked && (
            <div className="inline student-result-actions">
              <Button
                aria-label={`Сохранить результат — ${student.full_name}`}
                variant="secondary"
                icon={<Save size={15} />}
                disabled={busy}
                onClick={() => void submit(false)}
              >
                Сохранить
              </Button>
              <Button
                aria-label={`Опубликовать результат — ${student.full_name}`}
                icon={<Send size={15} />}
                disabled={busy}
                onClick={() => setConfirming(true)}
              >
                Опубликовать
              </Button>
            </div>
          )}
        </div>
      </div>
      <ErrorNotice message={error} />
      {confirming && (
        <ConfirmDialog
          title="Опубликовать результат?"
          text={`Ученик ${student.full_name} увидит баллы и комментарий. После публикации редактирование будет закрыто.`}
          confirm="Опубликовать"
          busy={busy}
          onClose={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            void submit(true);
          }}
        />
      )}
    </article>
  );
}

export function GroupExamResults({
  group,
  students,
  exams,
  participations,
  onSaved,
}: {
  group: Group;
  students: Student[];
  exams: Exam[];
  participations: Participation[];
  onSaved: () => Promise<void>;
}) {
  const available = useMemo(
    () =>
      exams
        .filter(
          (exam) =>
            exam.is_active &&
            belongsToSubject(exam, group.subject) &&
            (!group.exam_format || exam.format === group.exam_format),
        )
        .sort((left, right) => right.starts_at.localeCompare(left.starts_at)),
    [exams, group.exam_format, group.subject],
  );
  const [examId, setExamId] = useState(available[0]?.id ?? 0);
  const exam = available.find((candidate) => candidate.id === examId) ?? available[0];
  const tasks = exam?.structure_data?.tasks ?? [];

  useEffect(() => {
    if (!available.some((candidate) => candidate.id === examId)) setExamId(available[0]?.id ?? 0);
  }, [available, examId]);

  return (
    <section className="group-results-section stack" aria-label="Заполнение результатов пробника">
      <div className="group-exam-toolbar panel">
        <div>
          <span className="eyebrow">Результаты группы</span>
          <h2>Заполнение пробника</h2>
          <p className="muted">
            По названию группы определены: {group.subject || 'предмет не указан'}
            {group.exam_format ? ` · ${group.exam_format === 'ege' ? 'ЕГЭ' : 'ОГЭ'}` : ''}.
          </p>
        </div>
        {available.length > 0 && (
          <label>
            Пробник
            <select value={exam?.id ?? ''} onChange={(event) => setExamId(Number(event.target.value))}>
              {available.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {examTitle(candidate)} · {examSubject(candidate)} · {date(examDate(candidate))}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {!group.subject ? (
        <EmptyState
          title="У группы не указан предмет"
          text="Укажите предмет группы в CRM и повторите выгрузку."
        />
      ) : !exam ? (
        <EmptyState
          title="Нет пробников по предмету группы"
          text={`Создайте пробник по предмету «${group.subject}».`}
        />
      ) : !tasks.length ? (
        <EmptyState
          title="Не настроены задания"
          text={`Добавьте задания и максимальные баллы в настройках предмета «${exam.subject}».`}
        />
      ) : !students.length ? (
        <EmptyState
          title="В группе пока нет учеников"
          text="После синхронизации с CRM ученики появятся в списке."
        />
      ) : (
        <div className="student-result-list" aria-label="Результаты учеников">
          {students.map((student) => (
            <StudentResultCard
              key={student.id}
              student={student}
              exam={exam}
              tasks={tasks}
              item={participations.find(
                (participation) =>
                  participation.student_id === student.id && participation.exam_id === exam.id,
              )}
              onSaved={onSaved}
            />
          ))}
        </div>
      )}
    </section>
  );
}
