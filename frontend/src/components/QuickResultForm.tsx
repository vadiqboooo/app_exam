import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Search } from 'lucide-react';
import { api } from '../api/client';
import type { Exam, Group, Membership, Participation, Student } from '../types';
import { date, examSubject, examTitle, groupExams, score, studentGroups } from '../lib/format';
import { automaticScore, resultScoreLabel } from '../lib/scoring';
import { useAction } from '../hooks/useAction';
import { Button } from './Button';
import { ErrorNotice } from './ErrorNotice';
import { statusLabels } from './StatusBadge';
import { Toast } from './CodeCell';
import { TaskScoreGrid, type TaskScoreValue } from './TaskScoreGrid';

const normalize = (value: string) => value.toLowerCase().replaceAll('ё', 'е').trim().replace(/\s+/g, ' ');

const scoreValues = (exam?: Exam, item?: Participation): TaskScoreValue[] =>
  (exam?.structure_data?.tasks ?? []).map((task) => ({
    code: task.code,
    score: String(item?.result_data?.tasks.find((result) => result.code === task.code)?.score ?? 0),
    comment: item?.result_data?.tasks.find((result) => result.code === task.code)?.comment ?? '',
  }));

type Mode = 'save' | 'more' | 'publish';

export function QuickResultForm({
  exams,
  students,
  groups,
  memberships,
  participations,
  onSaved,
}: {
  exams: Exam[];
  students: Student[];
  groups: Group[];
  memberships: Membership[];
  participations: Participation[];
  onSaved: () => Promise<void>;
}) {
  const navigate = useNavigate();
  const [eventKey, setEventKey] = useState('');
  const [examId, setExamId] = useState('');
  const [studentId, setStudentId] = useState('');
  const [slotId, setSlotId] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [values, setValues] = useState<TaskScoreValue[]>([]);
  const [primary, setPrimary] = useState('');
  const [testScore, setTestScore] = useState('');
  const [comment, setComment] = useState('');
  const [toast, setToast] = useState('');
  const { busy, error, run } = useAction();

  const events = useMemo(
    () =>
      groupExams(exams.filter((item) => item.is_active)).sort((left, right) =>
        right[0].starts_at.localeCompare(left[0].starts_at),
      ),
    [exams],
  );
  const eventGroup = eventKey === '' ? undefined : events[Number(eventKey)];
  const pickEvent = (key: string) => {
    setEventKey(key);
    const group = key === '' ? undefined : events[Number(key)];
    setExamId(group?.length === 1 ? String(group[0].id) : '');
  };
  const exam = exams.find((item) => item.id === Number(examId));
  const student = students.find((item) => item.id === Number(studentId));
  const existing = participations.find(
    (item) => item.exam_id === Number(examId) && item.student_id === Number(studentId),
  );
  const slot = exam?.slots.find((item) => item.id === Number(slotId));
  const tasks = exam?.structure_data?.tasks ?? [];
  const total = tasks.length
    ? values.reduce((sum, item) => sum + Number(item.score || 0), 0)
    : Number(primary || 0);
  const maxTotal = tasks.reduce((sum, task) => sum + task.max_score, 0);
  const calculated = exam ? automaticScore(exam, total) : null;

  const stateOf = (candidate: Student) => {
    const item = participations.find((p) => p.exam_id === Number(examId) && p.student_id === candidate.id);
    if (!item) return { kind: 'none', label: 'Без записи', locked: false };
    if (item.status === 'published') return { kind: 'pub', label: 'Уже опубликован', locked: true };
    if (item.status === 'absent' || item.status === 'cancelled')
      return { kind: 'muted', label: statusLabels[item.status], locked: true };
    return { kind: 'reg', label: 'Записан', locked: false };
  };
  const detailsOf = (candidate: Student) => {
    const group = studentGroups(candidate.id, memberships, groups)[0];
    return {
      group,
      sub: [candidate.grade ? `${candidate.grade} класс` : null, group?.source_name ?? 'Без группы']
        .filter(Boolean)
        .join(' · '),
    };
  };
  const matches = useMemo(() => {
    const words = normalize(studentSearch).split(' ').filter(Boolean);
    if (!words.length) return [];
    return students
      .filter((item) => item.is_active && words.every((w) => normalize(item.full_name).includes(w)))
      .sort((a, b) => a.full_name.localeCompare(b.full_name, 'ru'))
      .slice(0, 30);
  }, [studentSearch, students]);

  useEffect(() => {
    setStudentId('');
    setStudentSearch('');
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

  const locked =
    existing?.status === 'published' || existing?.status === 'absent' || existing?.status === 'cancelled';
  const ready = Boolean(exam && student && !locked && (!exam.slots.length || slotId));

  function save(mode: Mode) {
    if (!exam || !student || !ready) return;
    void run(async () => {
      const saved = await api.results.quickSave({
        student_id: student.id,
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
      if (mode === 'publish') {
        await api.results.publish(saved.id, {
          primary_score: saved.primary_score,
          test_score: saved.test_score,
          result_data: saved.result_data,
        });
      }
      await onSaved();
      if (mode === 'more') {
        setStudentId('');
        setStudentSearch('');
        setToast(`${student.full_name}: результат сохранён`);
        setTimeout(() => setToast(''), 4000);
      } else {
        navigate('/results');
      }
    });
  }
  const submit = (event: FormEvent) => {
    event.preventDefault();
    save('save');
  };

  const slotLabel = slot ? `${slot.school_name}, ${date(slot.starts_at, true)}` : '';
  const info = student ? detailsOf(student) : undefined;
  const status = student ? stateOf(student) : undefined;

  return (
    <div className="ad-page rn-page">
      <div className="rn-top">
        <Link className="ad-square-back" to="/results" aria-label="Назад к результатам">
          <ArrowLeft size={20} />
        </Link>
        <h1>Добавить результат</h1>
      </div>
      <div className="rn-grid">
        <section className="rn-side" aria-label="Пробник и ученик">
          <div className="rn-selects">
            <label>
              Пробник
              <select aria-label="Пробник" value={eventKey} onChange={(e) => pickEvent(e.target.value)}>
                <option value="">Выберите пробник</option>
                {events.map((group, index) => (
                  <option key={index} value={index}>
                    {examTitle(group[0])} · {date(group[0].starts_at)}
                  </option>
                ))}
              </select>
            </label>
            {eventGroup && (
              <label>
                Предмет
                <select aria-label="Предмет" value={examId} onChange={(e) => setExamId(e.target.value)}>
                  <option value="">Выберите предмет</option>
                  {eventGroup.map((item) => (
                    <option key={item.id} value={item.id}>
                      {examSubject(item)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {exam && exam.slots.length > 0 && (
              <label>
                Школа, дата и время
                <select
                  aria-label="Школа, дата и время"
                  value={slotId}
                  onChange={(e) => setSlotId(e.target.value)}
                >
                  <option value="">Выберите место и время</option>
                  {exam.slots.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.school_name} · {date(item.starts_at, true)}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {exam ? (
            <>
              <div className="rn-find">
                <span>Ученик</span>
                <label className="rn-search">
                  <Search size={18} />
                  <input
                    aria-label="Найти ученика"
                    placeholder="Фамилия или имя"
                    autoComplete="off"
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                  />
                </label>
              </div>
              <div className="rn-list">
                {matches.map((item) => {
                  const state = stateOf(item);
                  return (
                    <button
                      type="button"
                      key={item.id}
                      className="rn-student"
                      aria-pressed={item.id === Number(studentId)}
                      disabled={state.locked}
                      onClick={() => setStudentId(String(item.id))}
                    >
                      <span>
                        <strong>{item.full_name}</strong>
                        <small>{detailsOf(item).sub}</small>
                      </span>
                      <span className={`rn-badge rn-badge-${state.kind}`}>{state.label}</span>
                    </button>
                  );
                })}
                {studentSearch.trim() && !matches.length && <p className="rn-hint">Никого не нашли</p>}
                {!studentSearch.trim() && <p className="rn-hint">Введите фамилию или имя ученика</p>}
              </div>
            </>
          ) : (
            <p className="rn-hint">Выберите пробник и предмет, чтобы найти ученика</p>
          )}
        </section>
        <form className="rn-main" aria-label="Внесение результата" onSubmit={submit}>
          {exam && student && status && info ? (
            <>
              <div className="rn-head">
                <div>
                  <div className="rn-title">
                    <h2>{student.full_name}</h2>
                    <span className={`rn-badge rn-badge-${status.kind}`}>{status.label}</span>
                  </div>
                  <span>
                    {[
                      student.grade ? `${student.grade} класс` : null,
                      info.group
                        ? `группа «${info.group.source_name}»${info.group.teacher_name ? `, учитель ${info.group.teacher_name}` : ''}`
                        : 'без группы',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                  <span>{[examTitle(exam), exam.subject, slotLabel].filter(Boolean).join(' · ')}</span>
                </div>
                <div className="rn-tiles">
                  <div>
                    <span>Первичный</span>
                    <strong>
                      {score(total)}
                      {maxTotal > 0 && <small> / {maxTotal}</small>}
                    </strong>
                  </div>
                  <div className="rn-tile-test">
                    <span>{resultScoreLabel(exam)}</span>
                    {calculated != null ? (
                      <strong>{score(calculated)}</strong>
                    ) : (
                      <input
                        type="number"
                        min="0"
                        step="any"
                        aria-label={resultScoreLabel(exam)}
                        placeholder="—"
                        value={testScore}
                        onChange={(e) => setTestScore(e.target.value)}
                      />
                    )}
                  </div>
                </div>
              </div>
              <ErrorNotice message={error} />
              {status.kind === 'none' && (
                <div className="rn-note">
                  Ученик не был записан на этот пробник. Запись создастся автоматически, а учитель группы
                  увидит, что результат внёс администратор.
                </div>
              )}
              {tasks.length ? (
                <div className="rn-block">
                  <span className="qr-label">Баллы по заданиям</span>
                  <TaskScoreGrid tasks={tasks} values={values} onChange={setValues} withComments />
                </div>
              ) : (
                <label className="rn-block qr-label">
                  Первичный балл
                  <input
                    className="rn-plain"
                    type="number"
                    min="0"
                    step="any"
                    required
                    value={primary}
                    onChange={(e) => setPrimary(e.target.value)}
                  />
                </label>
              )}
              <label className="rn-block qr-label">
                Общий комментарий к работе
                <textarea
                  rows={3}
                  placeholder="Что получилось, над чем поработать"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
              </label>
              <div className="rn-footer">
                <span>
                  Первичный балл {score(total)}
                  {maxTotal > 0 ? ` из ${maxTotal}` : ''} · «Сохранить» — ученик пока не видит результат
                </span>
                <div>
                  <Button type="submit" variant="secondary" disabled={busy || !ready}>
                    {busy ? 'Сохраняем…' : 'Сохранить'}
                  </Button>
                  <button
                    type="button"
                    className="rn-more"
                    disabled={busy || !ready}
                    onClick={() => save('more')}
                  >
                    Сохранить и добавить ещё
                  </button>
                  <Button type="button" disabled={busy || !ready} onClick={() => save('publish')}>
                    Сохранить и опубликовать
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <p className="rn-empty">
              {exam
                ? 'Найдите ученика слева и выберите его, чтобы внести баллы.'
                : 'Выберите пробник и предмет слева.'}
            </p>
          )}
        </form>
      </div>
      <Toast message={toast} />
    </div>
  );
}
