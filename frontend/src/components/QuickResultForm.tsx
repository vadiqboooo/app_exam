import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Save, Search } from 'lucide-react';
import { api } from '../api/client';
import type { Exam, Participation, Student } from '../types';
import { date, examDate, examSubject, examTitle, score } from '../lib/format';
import { automaticScore, resultScoreLabel } from '../lib/scoring';
import { useAction } from '../hooks/useAction';
import { Button } from './Button';
import { ErrorNotice } from './ErrorNotice';
import { Modal } from './Modal';
import { TaskScoreGrid, type TaskScoreValue } from './TaskScoreGrid';

const scoreValues = (exam?: Exam, item?: Participation): TaskScoreValue[] =>
  (exam?.structure_data?.tasks ?? []).map((task) => ({
    code: task.code,
    score: String(item?.result_data?.tasks.find((result) => result.code === task.code)?.score ?? 0),
    comment: item?.result_data?.tasks.find((result) => result.code === task.code)?.comment ?? '',
  }));

export function QuickResultForm({
  exams,
  students,
  participations,
  onClose,
  onSaved,
}: {
  exams: Exam[];
  students: Student[];
  participations: Participation[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [examId, setExamId] = useState('');
  const [studentId, setStudentId] = useState('');
  const [slotId, setSlotId] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [values, setValues] = useState<TaskScoreValue[]>([]);
  const [primary, setPrimary] = useState('');
  const [testScore, setTestScore] = useState('');
  const [comment, setComment] = useState('');
  const { busy, error, run } = useAction();
  const exam = exams.find((item) => item.id === Number(examId));
  const existing = participations.find(
    (item) => item.exam_id === Number(examId) && item.student_id === Number(studentId),
  );
  const tasks = exam?.structure_data?.tasks ?? [];
  const total = tasks.length
    ? values.reduce((sum, item) => sum + Number(item.score || 0), 0)
    : Number(primary || 0);
  const calculated = exam ? automaticScore(exam, total) : null;
  const filteredStudents = useMemo(
    () =>
      students.filter(
        (student) =>
          student.is_active && student.full_name.toLowerCase().includes(studentSearch.trim().toLowerCase()),
      ),
    [studentSearch, students],
  );

  useEffect(() => {
    setStudentId('');
    setSlotId('');
    setValues(scoreValues(exam));
    setPrimary('');
    setTestScore('');
    setComment('');
  }, [examId]);

  useEffect(() => {
    setValues(scoreValues(exam, existing));
    setPrimary(existing?.primary_score == null ? '' : String(existing.primary_score));
    setTestScore(existing?.test_score == null ? '' : String(existing.test_score));
    setComment(existing?.result_data?.overall_comment ?? '');
    setSlotId(existing?.slot_id == null ? '' : String(existing.slot_id));
  }, [studentId]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!exam || !studentId) return;
    void run(async () => {
      await api.results.quickSave({
        student_id: Number(studentId),
        exam_id: exam.id,
        slot_id: slotId ? Number(slotId) : undefined,
        primary_score: total,
        test_score: calculated ?? (testScore === '' ? null : Number(testScore)),
        result_data: tasks.length
          ? {
              version: 1,
              tasks: values.map((item) => ({ ...item, score: Number(item.score) })),
              overall_comment: comment,
            }
          : null,
      });
      await onSaved();
      onClose();
    });
  }

  return (
    <Modal title="Добавить результат экзамена" onClose={onClose} wide busy={busy}>
      <form onSubmit={submit}>
        <div className="modal-body stack">
          <ErrorNotice message={error} />
          <div className="form-grid">
            <label className="full-width">
              Экзамен
              <select
                aria-label="Экзамен"
                required
                value={examId}
                onChange={(event) => setExamId(event.target.value)}
              >
                <option value="">Выберите экзамен</option>
                {[...exams]
                  .filter((item) => item.is_active)
                  .sort((left, right) => right.starts_at.localeCompare(left.starts_at))
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {examTitle(item)} · {examSubject(item)} · {date(item.starts_at)}
                    </option>
                  ))}
              </select>
            </label>
            {exam && (
              <>
                <label className="full-width">
                  Найти ученика
                  <span className="search-input quick-result-search">
                    <Search size={17} />
                    <input
                      aria-label="Поиск ученика"
                      placeholder="Введите фамилию или имя"
                      value={studentSearch}
                      onChange={(event) => setStudentSearch(event.target.value)}
                    />
                  </span>
                </label>
                <label className="full-width">
                  Ученик
                  <select
                    aria-label="Ученик"
                    required
                    value={studentId}
                    onChange={(event) => setStudentId(event.target.value)}
                  >
                    <option value="">Выберите ученика</option>
                    {filteredStudents.map((student) => (
                      <option key={student.id} value={student.id}>
                        {student.full_name}
                        {student.grade ? ` · ${student.grade} класс` : ''}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            {exam && exam.slots.length > 0 && (
              <label className="full-width">
                Школа, дата и время
                <select
                  aria-label="Школа, дата и время"
                  required
                  value={slotId}
                  onChange={(event) => setSlotId(event.target.value)}
                >
                  <option value="">Выберите место и время</option>
                  {exam.slots.map((slot) => (
                    <option key={slot.id} value={slot.id}>
                      {slot.school_name} · {date(slot.starts_at, true)}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {exam && studentId && (
            <>
              {existing?.status === 'published' && (
                <div className="info-panel">
                  <strong>Результат уже опубликован.</strong>
                  <p>Откройте его из списка для просмотра.</p>
                </div>
              )}
              {tasks.length ? (
                <div className="stack compact-stack">
                  <div className="section-heading compact-heading">
                    <div>
                      <h3>Баллы по заданиям</h3>
                      <p>Как в прежнем приложении: номер сверху, балл — сразу под ним.</p>
                    </div>
                  </div>
                  <TaskScoreGrid tasks={tasks} values={values} onChange={setValues} />
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
                    onChange={(event) => setPrimary(event.target.value)}
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
                    value={calculated ?? testScore}
                    disabled={calculated != null}
                    onChange={(event) => setTestScore(event.target.value)}
                  />
                </label>
              </div>
              <label>
                Комментарий к работе
                <textarea
                  rows={3}
                  placeholder="Добавьте примечание для ученика"
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                />
              </label>
              <p className="muted small">
                {existing
                  ? `Текущая запись: ${date(examDate(exam, existing.slot_id), true)}. Результат будет обновлён.`
                  : 'Если записи ещё нет, она будет создана автоматически со статусом «Проверено».'}
              </p>
            </>
          )}
        </div>
        <div className="modal-footer">
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            Отмена
          </Button>
          <Button
            type="submit"
            icon={<Save size={16} />}
            disabled={busy || !exam || !studentId || existing?.status === 'published'}
          >
            {busy ? 'Сохраняем…' : existing ? 'Сохранить изменения' : 'Добавить результат'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
