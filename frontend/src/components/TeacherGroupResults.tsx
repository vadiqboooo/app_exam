import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowLeft, ChevronDown, ChevronUp, MessageCircle, Send, X } from 'lucide-react';
import type { Exam, Group, Participation, Student, Task } from '../types';
import { api } from '../api/client';
import { date, examDate, examSubject, examTitle, score } from '../lib/format';
import { automaticScore } from '../lib/scoring';
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

const shortDate = (value: string) =>
  new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    .format(new Date(value))
    .replace(',', '')
    .replace(' г.', '');

type Filter = 'all' | 'empty' | 'checked' | 'published';
type Row = { student: Student; item?: Participation };
type TaskValue = { code: string; score: number | null; comment: string };

const isFinal = (item?: Participation) => item?.status === 'checked' || item?.status === 'published';
const isLocked = (item?: Participation) =>
  item?.status === 'published' || item?.status === 'absent' || item?.status === 'cancelled';

function ResultEditor({
  student,
  exam,
  item,
  tasks,
  onSaved,
  onNext,
}: {
  student: Student;
  exam: Exam;
  item?: Participation;
  tasks: Task[];
  onSaved: () => Promise<void>;
  onNext?: () => void;
}) {
  const initial = () => {
    const stored = new Map(item?.result_data?.tasks.map((result) => [result.code, result]));
    return tasks.map((task) => ({
      code: task.code,
      score: stored.get(task.code)?.score ?? null,
      comment: stored.get(task.code)?.comment ?? '',
    })) as TaskValue[];
  };
  const [values, setValues] = useState<TaskValue[]>(initial);
  const [commenting, setCommenting] = useState<Set<string>>(
    () => new Set(initial().filter((value) => value.comment).map((value) => value.code)),
  );
  const [overall, setOverall] = useState(item?.result_data?.overall_comment ?? '');
  const [confirming, setConfirming] = useState(false);
  const { busy, error, run } = useAction();
  const locked = isLocked(item) || busy;
  const hasScores = values.some((value) => value.score !== null);
  const primary = values.reduce((sum, value) => sum + (value.score ?? 0), 0);
  const finalScore = hasScores ? automaticScore(exam, primary) : null;

  useEffect(() => {
    setValues(initial());
    setOverall(item?.result_data?.overall_comment ?? '');
  }, [exam.id, item?.id, item?.updated_at]);

  const payload = {
    primary_score: primary,
    test_score: finalScore,
    result_data: {
      version: 1 as const,
      tasks: values.map((value) => ({ ...value, score: value.score ?? 0 })),
      overall_comment: overall,
    },
  };
  const submit = (publish: boolean, after?: () => void) =>
    run(async () => {
      const saved = await api.results.quickSave({
        ...payload,
        student_id: student.id,
        exam_id: exam.id,
        slot_id: item?.slot_id ?? undefined,
      });
      if (publish) await api.results.publish(saved.id, payload);
      await onSaved();
      after?.();
    });
  const setScore = (index: number, raw: string, max: number) =>
    setValues((current) =>
      current.map((value, i) =>
        i !== index
          ? value
          : {
              ...value,
              score: raw === '' ? null : Math.min(max, Math.max(0, Math.trunc(Number(raw)) || 0)),
            },
      ),
    );
  const commented = values.filter((value) => commenting.has(value.code));

  return (
    <div className="tg-editor">
      <ErrorNotice message={error} />
      <div className="tg-editor-label">
        Баллы по заданиям <span>· Tab — к следующему заданию</span>
      </div>
      <div className="tg-task-grid">
        {tasks.map((task, index) => {
          const value = values[index];
          const filled = value?.score !== null && value?.score !== undefined;
          return (
            <div className="tg-task" key={task.code}>
              <span className="tg-task-code">{task.code}</span>
              <input
                aria-label={`Балл за задание ${task.code} — ${student.full_name}`}
                type="number"
                min={0}
                max={task.max_score}
                step={1}
                disabled={locked}
                placeholder="—"
                className={filled ? 'is-filled' : ''}
                value={value?.score ?? ''}
                onFocus={(event) => event.currentTarget.select()}
                onChange={(event) => setScore(index, event.target.value, task.max_score)}
              />
              <span className="tg-task-max">
                из {task.max_score}
                <button
                  type="button"
                  aria-label={`Комментарий к заданию ${task.code}`}
                  aria-pressed={commenting.has(task.code)}
                  disabled={locked && !value?.comment}
                  onClick={() =>
                    setCommenting((current) => {
                      const next = new Set(current);
                      if (!next.delete(task.code)) next.add(task.code);
                      return next;
                    })
                  }
                >
                  <MessageCircle size={12} />
                </button>
              </span>
            </div>
          );
        })}
      </div>
      {commented.length > 0 && (
        <>
          <div className="tg-editor-label">
            Комментарии к заданиям <span>· ученик увидит их в разборе</span>
          </div>
          <div className="tg-comments">
            {commented.map((value) => {
              const task = tasks.find((candidate) => candidate.code === value.code);
              return (
                <div className="tg-comment" key={value.code}>
                  <span className="tg-comment-tag">
                    № <b>{value.code}</b>
                    <i>
                      {value.score ?? '–'}/{task?.max_score}
                    </i>
                  </span>
                  <textarea
                    aria-label={`Комментарий к заданию ${value.code}`}
                    rows={1}
                    disabled={locked}
                    value={value.comment}
                    onChange={(event) =>
                      setValues((current) =>
                        current.map((candidate) =>
                          candidate.code === value.code ? { ...candidate, comment: event.target.value } : candidate,
                        ),
                      )
                    }
                  />
                  <button
                    type="button"
                    className="tg-comment-remove"
                    aria-label={`Убрать комментарий к заданию ${value.code}`}
                    disabled={locked}
                    onClick={() => {
                      setValues((current) =>
                        current.map((candidate) =>
                          candidate.code === value.code ? { ...candidate, comment: '' } : candidate,
                        ),
                      );
                      setCommenting((current) => {
                        const next = new Set(current);
                        next.delete(value.code);
                        return next;
                      });
                    }}
                  >
                    <X size={16} />
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
      <div className="tg-editor-label">Общий комментарий к работе</div>
      <div className="tg-editor-footer">
        <textarea
          aria-label={`Общий комментарий — ${student.full_name}`}
          rows={2}
          disabled={locked}
          value={overall}
          onChange={(event) => setOverall(event.target.value)}
        />
        {!isLocked(item) && (
          <div className="tg-editor-actions">
            <Button variant="secondary" disabled={busy} onClick={() => void submit(false)}>
              Сохранить
            </Button>
            <Button disabled={busy} onClick={() => setConfirming(true)}>
              Сохранить и опубликовать
            </Button>
            {onNext && (
              <Button
                variant="secondary"
                className="tg-next"
                disabled={busy}
                icon={<ArrowDown size={16} />}
                onClick={() => void (hasScores ? submit(false, onNext) : onNext())}
              >
                Следующий ученик
              </Button>
            )}
          </div>
        )}
      </div>
      {confirming && (
        <ConfirmDialog
          title="Опубликовать результат?"
          text={`Ученик ${student.full_name} увидит баллы и комментарии. После публикации редактирование будет закрыто.`}
          confirm="Опубликовать"
          busy={busy}
          onClose={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            void submit(true);
          }}
        />
      )}
    </div>
  );
}

export function TeacherGroupResults({
  group,
  students,
  exams,
  participations,
  back,
  onSaved,
}: {
  group: Group;
  students: Student[];
  exams: Exam[];
  participations: Participation[];
  back: string;
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
  const [filter, setFilter] = useState<Filter>('all');
  const [openId, setOpenId] = useState<number | null>(null);
  const [publishingAll, setPublishingAll] = useState(false);
  const bulk = useAction();
  const exam = available.find((candidate) => candidate.id === examId) ?? available[0];
  const tasks = exam?.structure_data?.tasks ?? [];
  useEffect(() => {
    if (!available.some((candidate) => candidate.id === examId)) setExamId(available[0]?.id ?? 0);
  }, [available, examId]);

  const rows: Row[] = students.map((student) => ({
    student,
    item: participations.find(
      (participation) =>
        participation.student_id === student.id &&
        participation.exam_id === exam?.id &&
        participation.status !== 'cancelled',
    ),
  }));
  const enrolled = rows.filter((row) => row.item);
  const came = enrolled.filter((row) => row.item?.status !== 'absent');
  const checked = rows.filter((row) => row.item?.status === 'checked');
  const published = rows.filter((row) => row.item?.status === 'published');
  const empty = rows.filter((row) => row.item?.status !== 'absent' && !isFinal(row.item));
  const visible = rows.filter(
    (row) =>
      filter === 'all' ||
      (filter === 'empty' && row.item?.status !== 'absent' && !isFinal(row.item)) ||
      (filter === 'checked' && row.item?.status === 'checked') ||
      (filter === 'published' && row.item?.status === 'published'),
  );
  const tabs: [Filter, string, number][] = [
    ['all', 'Все', rows.length],
    ['empty', 'Не внесены', empty.length],
    ['checked', 'Проверено', checked.length],
    ['published', 'Опубликовано', published.length],
  ];
  const stats: [string, number][] = [
    ['Записаны', enrolled.length],
    ['Пришли', came.length],
    ['Баллы не внесены', empty.length],
    ['Проверено', checked.length],
    ['Опубликовано', published.length],
  ];

  const publishChecked = () =>
    bulk.run(async () => {
      for (const { item } of checked) {
        if (!item?.result_data) continue;
        await api.results.publish(item.id, {
          primary_score: item.primary_score ?? 0,
          test_score: item.test_score,
          result_data: item.result_data,
        });
      }
      await onSaved();
      setPublishingAll(false);
    });

  return (
    <div className="tg-page">
      <Link to={back} className="tg-back">
        <ArrowLeft size={16} />
        Мои группы
      </Link>
      <div className="tg-head">
        <div>
          <h1>
            {group.subject || group.source_name}
            {group.exam_format && (
              <span className="teacher-group-format">{group.exam_format === 'ege' ? 'ЕГЭ' : 'ОГЭ'}</span>
            )}
          </h1>
          <p>{[group.source_name, group.schedule, `${students.length} учеников`].filter(Boolean).join(' · ')}</p>
        </div>
        {available.length > 0 && (
          <label className="tg-exam-select">
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
        <>
          <div className="tg-stats">
            {stats.map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          <div className="tg-toolbar">
            <div className="tg-tabs" role="tablist" aria-label="Фильтр учеников">
              {tabs.map(([key, label, count]) => (
                <button
                  type="button"
                  role="tab"
                  key={key}
                  aria-selected={filter === key}
                  onClick={() => setFilter(key)}
                >
                  {label} · {count}
                </button>
              ))}
            </div>
            <Button
              icon={<Send size={17} />}
              disabled={!checked.length || bulk.busy}
              onClick={() => setPublishingAll(true)}
            >
              Опубликовать проверенные ({checked.length})
            </Button>
          </div>
          <ErrorNotice message={bulk.error} />
          <div className="tg-table" role="table" aria-label="Результаты учеников">
            <div className="tg-row tg-row-head" role="row">
              <span>Ученик</span>
              <span>Статус</span>
              <span>Первичный</span>
              <span>Тестовый</span>
              <span className="tg-right">Действие</span>
            </div>
            {visible.length === 0 && <div className="tg-none">В этой категории пока никого нет</div>}
            {visible.map(({ student, item }, index) => {
              const open = openId === student.id;
              const slot = exam.slots.find((candidate) => candidate.id === item?.slot_id);
              const sub = [
                student.grade ? `${student.grade} класс` : '',
                slot ? `${slot.school_name}, ${shortDate(slot.starts_at)}` : '',
              ]
                .filter(Boolean)
                .join(' · ');
              const nextRow = visible.slice(index + 1).find((row) => row.item?.status !== 'absent');
              return (
                <div className={`tg-item ${open ? 'is-open' : ''}`} key={student.id}>
                  <div className="tg-row" role="row">
                    <span className="tg-student">
                      <strong>{student.full_name}</strong>
                      {sub && <small>{sub}</small>}
                    </span>
                    <span>
                      {item ? <StatusBadge status={item.status} /> : <span className="badge">Нет записи</span>}
                    </span>
                    <span className="tg-primary">
                      {item?.primary_score != null ? score(item.primary_score) : '—'}
                    </span>
                    <span className="tg-test">{item?.test_score != null ? score(item.test_score) : '—'}</span>
                    <span className="tg-right">
                      {item?.status === 'absent' ? (
                        <span className="tg-nowork">Нет работы</span>
                      ) : (
                        <button
                          type="button"
                          aria-expanded={open}
                          className={`tg-open ${!open && !isFinal(item) ? 'is-primary' : ''}`}
                          onClick={() => setOpenId(open ? null : student.id)}
                        >
                          {open
                            ? 'Свернуть'
                            : isLocked(item)
                              ? 'Просмотр'
                              : isFinal(item)
                                ? 'Открыть'
                                : 'Внести баллы'}
                          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                      )}
                    </span>
                  </div>
                  {open && (
                    <ResultEditor
                      key={student.id}
                      student={student}
                      exam={exam}
                      item={item}
                      tasks={tasks}
                      onSaved={onSaved}
                      onNext={nextRow ? () => setOpenId(nextRow.student.id) : undefined}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
      {publishingAll && (
        <ConfirmDialog
          title="Опубликовать проверенные?"
          text={`Результаты ${checked.length} учеников станут видны им. После публикации редактирование будет закрыто.`}
          confirm="Опубликовать"
          busy={bulk.busy}
          onClose={() => setPublishingAll(false)}
          onConfirm={() => void publishChecked()}
        />
      )}
    </div>
  );
}
