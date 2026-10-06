import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, MessageSquareText } from 'lucide-react';
import { useStudentWorkspace } from '../../layouts/StudentWorkspace';
import { EmptyState } from '../../components/EmptyState';
import { date, examDate, examTitle, score } from '../../lib/format';
import { resultScoreLabel } from '../../lib/scoring';
import { useHalloween } from '../../halloween/theme';
import { HalloweenResult } from './HalloweenResult';

export function ResultDetail() {
  const halloween = useHalloween();
  if (halloween) return <HalloweenResult />;
  return <DefaultResult />;
}

function DefaultResult() {
  const { id } = useParams();
  const { data } = useStudentWorkspace();
  const result = data.results.find((item) => item.id === Number(id));
  const exam = data.exams.find((item) => item.id === result?.exam_id);
  if (!result || !exam)
    return (
      <div className="stack page-stack">
        <Link to="/my-results" className="sr-back" aria-label="Назад к результатам">
          <ArrowLeft size={20} />
        </Link>
        <EmptyState title="Результат не найден" text="Вернитесь к списку и выберите другую работу." />
      </div>
    );

  const structure = exam.structure_data;
  const taskMax = new Map(structure?.tasks.map((task) => [task.code, task.max_score]));
  const tasks = result.result_data?.tasks ?? [];
  const maxPrimary = structure?.tasks.reduce((sum, task) => sum + task.max_score, 0) ?? 0;
  const scale = structure?.primary_to_secondary_scale;
  const maxTest = scale?.length ? Math.max(...scale) : exam.format === 'ege' ? 100 : null;
  const slot = exam.slots.find((item) => item.id === result.slot_id);
  const dateOf = (item: typeof result) => {
    const itemExam = data.exams.find((candidate) => candidate.id === item.exam_id);
    return itemExam ? examDate(itemExam, item.slot_id) : '';
  };
  const previous = data.results
    .filter(
      (item) =>
        item.id !== result.id &&
        item.test_score != null &&
        data.exams.find((candidate) => candidate.id === item.exam_id)?.subject === exam.subject &&
        dateOf(item) < dateOf(result),
    )
    .sort((a, b) => dateOf(b).localeCompare(dateOf(a)))[0];
  const delta =
    result.test_score != null && previous?.test_score != null
      ? result.test_score - previous.test_score
      : null;
  const commented = tasks.filter((task) => task.comment.trim());
  const kind = (code: string, value: number) => {
    const max = taskMax.get(code) ?? value;
    return value >= max ? 'full' : value <= 0 ? 'zero' : 'part';
  };

  return (
    <div className="sr-page">
      <div className="sr-top">
        <Link to="/my-results" className="sr-back" aria-label="Назад к результатам">
          <ArrowLeft size={20} />
        </Link>
        <span>Результат</span>
      </div>
      <div className="sr-title">
        <span>
          {exam.format === 'ege' ? 'ЕГЭ' : exam.format === 'oge' ? 'ОГЭ' : 'Пробник'} · {examTitle(exam)}
        </span>
        <h1>{exam.subject}</h1>
        <small>{[date(examDate(exam, result.slot_id)), slot?.school_name].filter(Boolean).join(' · ')}</small>
      </div>
      <div className="sr-scores">
        <div className="sr-score sr-score-main">
          <span>{resultScoreLabel(exam)}</span>
          <strong>
            {score(result.test_score)}
            {maxTest && <em> / {maxTest}</em>}
          </strong>
          {delta != null && (
            <i>
              {delta >= 0 ? '+' : ''}
              {delta} к прошлому
            </i>
          )}
        </div>
        <div className="sr-score">
          <span>Первичный балл</span>
          <strong>
            {score(result.primary_score)}
            {maxPrimary > 0 && <em> / {maxPrimary}</em>}
          </strong>
        </div>
      </div>
      {tasks.length > 0 && (
        <section className="sr-card">
          <h2>Баллы по заданиям</h2>
          <div className="sr-tasks">
            {tasks.map((task) => (
              <div key={task.code} className={`sr-task is-${kind(task.code, task.score)}`}>
                <span>№{task.code}</span>
                <strong>
                  {score(task.score)}/{score(taskMax.get(task.code))}
                </strong>
              </div>
            ))}
          </div>
          <div className="sr-legend">
            <span>
              <i className="is-full" />
              Полный балл
            </span>
            <span>
              <i className="is-part" />
              Частично
            </span>
            <span>
              <i className="is-zero" />0 баллов
            </span>
          </div>
        </section>
      )}
      {commented.length > 0 && (
        <section className="sr-comments">
          <h2>Разбор учителя</h2>
          {commented.map((task) => (
            <div className="sr-comment" key={task.code}>
              <div>
                <strong>Задание {task.code}</strong>
                <span>
                  {score(task.score)} / {score(taskMax.get(task.code))}
                </span>
              </div>
              <p className="preserve-text">{task.comment}</p>
            </div>
          ))}
        </section>
      )}
      {result.result_data?.overall_comment && (
        <section className="sr-teacher">
          <div>
            <span className="sr-teacher-icon">
              <MessageSquareText size={18} />
            </span>
            <strong>Комментарий преподавателя</strong>
          </div>
          <p className="preserve-text">{result.result_data.overall_comment}</p>
        </section>
      )}
    </div>
  );
}
