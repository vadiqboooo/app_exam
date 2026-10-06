import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Hourglass } from 'lucide-react';
import { useStudentWorkspace } from '../../layouts/StudentWorkspace';
import { EmptyState } from '../../components/EmptyState';
import { examDate, examTitle, score } from '../../lib/format';
import { HwBackdrop, HwNav } from '../../halloween/Chrome';
import { useHalloween } from '../../halloween/theme';

const shortMonth = (value: string) =>
  new Intl.DateTimeFormat('ru-RU', { month: 'short' }).format(new Date(value)).replace('.', '');
const shortDay = (value: string) =>
  new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' })
    .format(new Date(value))
    .replace('.', '');

export function MyResults() {
  const { data } = useStudentWorkspace();
  const halloween = useHalloween();
  const [subject, setSubject] = useState('');
  const results = data.results
    .flatMap((result) => {
      const exam = data.exams.find((e) => e.id === result.exam_id);
      return exam ? [{ result, exam, at: examDate(exam, result.slot_id) }] : [];
    })
    .sort((a, b) => a.at.localeCompare(b.at));
  const pending = data.participations
    .filter(
      (item) =>
        ['attended', 'submitted', 'checked'].includes(item.status) &&
        !data.results.some((result) => result.id === item.id),
    )
    .flatMap((item) => {
      const exam = data.exams.find((e) => e.id === item.exam_id);
      return exam ? [exam] : [];
    });
  const subjects = [...new Set([...results.map((r) => r.exam.subject), ...pending.map((e) => e.subject)])];
  const shown = subjects.filter((s) => !subject || s === subject);

  const page = (
    <div className="sr-page">
      <div className="sr-title">
        <h1>Мои результаты</h1>
        <small>Баллы появляются после публикации учителем</small>
      </div>
      {subjects.length > 1 && (
        <div className="sr-chips" role="group" aria-label="Предмет">
          {['', ...subjects].map((s) => (
            <button type="button" key={s || 'all'} aria-pressed={subject === s} onClick={() => setSubject(s)}>
              {s || 'Все'}
            </button>
          ))}
        </div>
      )}
      {pending
        .filter((exam) => !subject || exam.subject === subject)
        .map((exam) => (
          <div className="sr-pending" key={exam.id}>
            <Hourglass size={22} />
            <span>
              <b>{exam.subject}</b> · {examTitle(exam)} — работа на проверке
            </span>
          </div>
        ))}
      {!subjects.length && (
        <div className="panel">
          <EmptyState
            title="Ваша история результатов начинается здесь"
            text="После публикации преподавателем вы увидите баллы по заданиям и рекомендации. Пока работа проверяется, результат скрыт."
          />
        </div>
      )}
      {shown.map((name) => {
        const list = results.filter((r) => r.exam.subject === name);
        if (!list.length) return null;
        const last = list[list.length - 1];
        const prev = list[list.length - 2];
        const lastScore = last.result.test_score ?? last.result.primary_score;
        const delta =
          prev && last.result.test_score != null && prev.result.test_score != null
            ? last.result.test_score - prev.result.test_score
            : null;
        const peak = Math.max(...list.map((r) => r.result.test_score ?? r.result.primary_score ?? 0), 1);
        return (
          <section className="sr-subject" key={name}>
            <div className="sr-subject-head">
              <div>
                <span>
                  {last.exam.format === 'oge' ? 'ОГЭ' : last.exam.format === 'ege' ? 'ЕГЭ' : 'ПРОБНИК'}
                </span>
                <h2>{name}</h2>
              </div>
              <div className="sr-subject-score">
                <strong>{score(lastScore)}</strong>
                {delta != null && (
                  <small>
                    {delta >= 0 ? '+' : ''}
                    {delta} к прошлому
                  </small>
                )}
              </div>
            </div>
            {list.length > 1 && (
              <div className="sr-bars" role="img" aria-label={`Динамика: ${name}`}>
                {list.map(({ result, at }, index) => {
                  const value = result.test_score ?? result.primary_score ?? 0;
                  return (
                    <div key={result.id}>
                      <span>{shortMonth(at)}</span>
                      <i
                        className={index === list.length - 1 ? 'is-last' : ''}
                        style={{ height: `${Math.max(8, Math.round((value / peak) * 80))}px` }}
                      />
                    </div>
                  );
                })}
              </div>
            )}
            <div className="sr-rows">
              {list
                .slice()
                .reverse()
                .map(({ result, exam, at }) => (
                  <Link
                    key={result.id}
                    to={`/my-results/${result.id}${halloween ? '/ball' : ''}`}
                    className="sr-row"
                  >
                    <span>
                      <b>{examTitle(exam)}</b>
                      <small>
                        {shortDay(at)} · первичный {score(result.primary_score)}
                      </small>
                    </span>
                    <strong>{score(result.test_score ?? result.primary_score)}</strong>
                    <ChevronRight size={18} />
                  </Link>
                ))}
            </div>
          </section>
        );
      })}
    </div>
  );
  if (!halloween) return page;
  return (
    <div className="hw-results-page">
      <HwBackdrop />
      <div className="hw-results-body">{page}</div>
      <HwNav />
    </div>
  );
}
