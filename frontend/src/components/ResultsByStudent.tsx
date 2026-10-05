import { useState } from 'react';
import { api } from '../api/client';
import type { ParentStatus } from '../types';
import { useAction } from '../hooks/useAction';
import { buildStudentResults, previousScore, type EventResult } from '../lib/studentResults';
import { score } from '../lib/format';
import { plural } from '../lib/adminEvents';
import { ErrorNotice } from './ErrorNotice';

type Person = ReturnType<typeof buildStudentResults>[number];

const longDate = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' });
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('');
const quick = ['Хорошая динамика', 'Повторить тему', 'Следить за временем', 'Аккуратнее с оформлением'];
const steps: [ParentStatus, string][] = [
  ['none', 'Не отправлено'],
  ['sent', 'Отправлено'],
  ['got', 'Родитель получил'],
];
const next: Record<ParentStatus, { label: string; to: ParentStatus | null }> = {
  none: { label: 'Отметить: результаты переданы родителю', to: 'sent' },
  sent: { label: 'Отметить: родитель получил', to: 'got' },
  got: { label: 'Готово', to: null },
};
const notes: Record<ParentStatus, string> = {
  none: 'Родитель ещё не знает о результате. Приложение само ничего не отправляет: передайте результаты и комментарий, затем отметьте это.',
  sent: 'Результаты переданы. Когда родитель подтвердит, что получил, нажмите «Отметить».',
  got: 'Родитель получил результаты и комментарий.',
};

function Feedback({
  person,
  event,
  index,
  onSaved,
}: {
  person: Person;
  event: EventResult;
  index: number;
  onSaved: () => Promise<void>;
}) {
  const [text, setText] = useState(event.comment);
  const [saved, setSaved] = useState(false);
  const { busy, error, run } = useAction();
  const ids = event.items.map(({ participation }) => participation.id);
  const save = (data: Parameters<typeof api.results.saveFeedback>[1], mark = false) =>
    void run(async () => {
      await api.results.saveFeedback(ids, data);
      await onSaved();
      setSaved(mark);
    });
  const status = event.parentStatus;
  const at = steps.findIndex(([key]) => key === status);

  return (
    <article className="rbs-article">
      <div className="rbs-section">
        <span className="rbs-label">1 · Результаты · {event.title}</span>
        <div className="rbs-tiles">
          {event.items.map(({ exam, participation }) => {
            const before = previousScore(person.events, index, exam.subject);
            const delta =
              before == null || participation.test_score == null ? null : participation.test_score - before;
            return (
              <div className="rbs-tile" key={participation.id}>
                <span>{exam.subject}</span>
                <b>
                  <strong>{score(participation.test_score)}</strong>
                  <em className={delta === null ? '' : delta >= 0 ? 'is-up' : 'is-down'}>
                    {delta === null ? 'первый раз' : `${delta > 0 ? '+' : ''}${delta} к прошлому`}
                  </em>
                </b>
                <small>первичные баллы: {score(participation.primary_score)}</small>
              </div>
            );
          })}
        </div>
      </div>
      <div className="rbs-section">
        <span className="rbs-label">2 · Что сказать ученику и родителю</span>
        <textarea
          rows={4}
          aria-label="Комментарий к пробнику"
          placeholder="Напишите пару предложений: что получилось и над чем поработать"
          value={text}
          disabled={busy}
          onChange={(e) => {
            setText(e.target.value);
            setSaved(false);
          }}
          onBlur={() => text.trim() !== event.comment && save({ feedback: text }, true)}
        />
        <div className="rbs-quick">
          <span>Быстро добавить:</span>
          {quick.map((phrase) => (
            <button
              type="button"
              key={phrase}
              disabled={busy}
              onClick={() => {
                const joined = `${text ? `${text.trimEnd()} ` : ''}${phrase}.`;
                setText(joined);
                save({ feedback: joined }, true);
              }}
            >
              + {phrase}
            </button>
          ))}
          <small>{saved ? 'Сохранено · только что' : event.comment ? 'Сохранено' : 'Пока пусто'}</small>
        </div>
      </div>
      <div className={`rbs-parent is-${status}`}>
        <span className="rbs-label">3 · Родителю</span>
        <div className="rbs-parent-row">
          <ol>
            {steps.map(([key, label], i) => (
              <li key={key} className={i <= at ? 'is-done' : ''} data-step={key} aria-current={i === at}>
                <span>{status === 'got' || i < at ? '✓' : i + 1}</span>
                {label}
              </li>
            ))}
          </ol>
          <div>
            {status !== 'none' && (
              <button
                type="button"
                className="rbs-undo"
                disabled={busy}
                onClick={() => save({ parent_status: status === 'got' ? 'sent' : 'none' })}
              >
                Отменить
              </button>
            )}
            <button
              type="button"
              className="rbs-act"
              disabled={busy || status === 'got'}
              onClick={() => next[status].to && save({ parent_status: next[status].to })}
            >
              {next[status].label}
            </button>
          </div>
        </div>
        <span className="rbs-note">{notes[status]}</span>
      </div>
      <ErrorNotice message={error} />
    </article>
  );
}

export function ResultsByStudent({
  people,
  onlyPending,
  onOnlyPending,
  onSaved,
}: {
  people: Person[];
  onlyPending: boolean;
  onOnlyPending: (value: boolean) => void;
  onSaved: () => Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState<number>();
  const [eventKeys, setEventKeys] = useState<Record<number, string>>({});
  const shown = onlyPending ? people.filter((person) => person.pending) : people;
  const person = shown.find((item) => item.student.id === selectedId) ?? shown[0];
  const index = person
    ? Math.max(
        0,
        person.events.findIndex((e) => e.key === eventKeys[person.student.id]),
      )
    : 0;
  const event = person?.events[index];

  return (
    <div className="rbs">
      <section className="rbs-list" aria-label="Ученики">
        <div className="rbs-filter">
          {(
            [
              [false, 'Все'],
              [true, 'Родитель не получил'],
            ] as const
          ).map(([value, label]) => (
            <button
              type="button"
              key={label}
              aria-pressed={onlyPending === value}
              onClick={() => onOnlyPending(value)}
            >
              {label}
            </button>
          ))}
        </div>
        {shown.length ? (
          shown.map((item) => (
            <button
              type="button"
              key={item.student.id}
              className="rbs-student"
              aria-pressed={item.student.id === person?.student.id}
              onClick={() => setSelectedId(item.student.id)}
            >
              <span className="rbs-ava">{initials(item.student.full_name)}</span>
              <span className="rbs-student-text">
                <strong>{item.student.full_name}</strong>
                <small>
                  {item.student.grade ? `${item.student.grade} кл. · ` : ''}
                  {plural(item.events.length, 'пробник', 'пробника', 'пробников')}
                </small>
              </span>
              {item.pending && <i title="Родитель ещё не получил результаты" />}
            </button>
          ))
        ) : (
          <p className="rbs-empty">Здесь никого нет. Снимите фильтр или измените поиск.</p>
        )}
      </section>
      {person && event ? (
        <section className="rbs-detail" aria-label="Обратная связь по ученику">
          <div className="rbs-who">
            <span className="rbs-ava is-big">{initials(person.student.full_name)}</span>
            <div>
              <strong>{person.student.full_name}</strong>
              <span>{person.student.grade ? `${person.student.grade} класс` : 'Класс не указан'}</span>
            </div>
          </div>
          <div className="rbs-events" role="tablist" aria-label="Пробники ученика">
            {person.events.map((item) => (
              <button
                type="button"
                role="tab"
                key={item.key}
                aria-selected={item.key === event.key}
                onClick={() => setEventKeys({ ...eventKeys, [person.student.id]: item.key })}
              >
                <i className={`is-${item.parentStatus}`} />
                <span>
                  <strong>{item.title}</strong>
                  <small>{longDate.format(new Date(item.start))}</small>
                </span>
              </button>
            ))}
          </div>
          <Feedback
            key={`${person.student.id}:${event.key}`}
            person={person}
            event={event}
            index={index}
            onSaved={onSaved}
          />
        </section>
      ) : (
        <div className="rbs-empty is-wide">
          По запросу никого не нашли. Проверьте фамилию или очистите поиск.
        </div>
      )}
    </div>
  );
}
