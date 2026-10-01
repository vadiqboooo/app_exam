import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Plus, Search } from 'lucide-react';
import { useWorkspace } from '../../layouts/Workspace';
import { EmptyState } from '../../components/EmptyState';
import { groupExams } from '../../lib/format';
import { dateRangeYear, plural, shortDay, stateLabels, summarize } from '../../lib/adminEvents';

type Filter = 'all' | 'current' | 'done' | 'draft';

export function Exams() {
  const { data } = useWorkspace();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const events = groupExams(data.exams)
    .map((subjects) => ({ subjects, info: summarize(subjects, data.participations) }))
    .sort((a, b) => b.info.start.localeCompare(a.info.start));
  const kind = (item: (typeof events)[number]): Filter =>
    item.info.state === 'draft' ? 'draft' : item.info.finished ? 'done' : 'current';
  const counts = {
    all: events.length,
    current: events.filter((item) => kind(item) === 'current').length,
    done: events.filter((item) => kind(item) === 'done').length,
    draft: events.filter((item) => kind(item) === 'draft').length,
  };
  const shown = events.filter(
    (item) =>
      (filter === 'all' || kind(item) === filter) &&
      `${item.info.first.title ?? ''} ${item.subjects.map((exam) => exam.subject).join(' ')}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const tabs: [Filter, string][] = [
    ['all', 'Все'],
    ['current', 'Текущие'],
    ['done', 'Завершённые'],
    ['draft', 'Черновики'],
  ];

  return (
    <div className="ad-page">
      <div className="ad-head">
        <div>
          <h1>Пробники</h1>
          <p>Все пробники школы: запись, проведение и проверка</p>
        </div>
        <Link className="button button-primary" to="/exams/new">
          <Plus size={17} />
          Создать пробник
        </Link>
      </div>
      <div className="ad-filters">
        <div className="ad-tabs" role="group" aria-label="Фильтр">
          {tabs.map(([key, label]) => (
            <button type="button" key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>
              {label} · {counts[key]}
            </button>
          ))}
        </div>
        <label className="ad-search">
          <Search size={16} />
          <input
            aria-label="Поиск пробника"
            placeholder="Название пробника"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      {shown.length ? (
        <section className="ad-table" aria-label="Список пробников">
          <div className="ad-events-row ad-table-head">
            <span>ПРОБНИК</span>
            <span>ДАТЫ</span>
            <span>ПРЕДМЕТЫ</span>
            <span>ЗАПИСАНО</span>
            <span>СВОБОДНО</span>
            <span>РЕЗУЛЬТАТЫ</span>
            <span>СТАТУС</span>
            <span />
          </div>
          {shown.map(({ subjects, info }) => {
            const first = info.first;
            const draft = info.state === 'draft';
            return (
              <Link
                key={first.id}
                className="ad-events-row ad-events-item"
                to={first.event_id ? `/exam-events/${first.event_id}` : `/exams/${first.id}`}
              >
                <span className="ad-event-title">
                  <span>
                    <strong>{first.title || 'Пробный экзамен'}</strong>
                    {first.format && <em>{first.format === 'ege' ? 'ЕГЭ' : 'ОГЭ'}</em>}
                  </span>
                  <small>
                    {plural(info.schools, 'школа', 'школы', 'школ')} ·{' '}
                    {plural(info.slots.length, 'сеанс', 'сеанса', 'сеансов')}
                  </small>
                </span>
                <span className="ad-event-dates">
                  <strong>{info.slots.length ? dateRangeYear(info.start, info.end) : '—'}</strong>
                  <small>
                    {draft
                      ? 'даты не заданы'
                      : info.finished
                        ? 'завершён'
                        : first.registration_close_at
                          ? `запись до ${shortDay(first.registration_close_at)}`
                          : ''}
                  </small>
                </span>
                <span className="ad-event-subjects">
                  {plural(subjects.length, 'предмет', 'предмета', 'предметов')}
                </span>
                <strong>{draft ? '—' : info.reg}</strong>
                <strong>{info.finished ? '—' : info.free}</strong>
                <span>{info.worked > 0 ? `${info.published} из ${info.worked}` : '—'}</span>
                <span>
                  <span className={`ad-badge ad-badge-${info.state}`}>{stateLabels[info.state]}</span>
                </span>
                <ChevronRight size={18} />
              </Link>
            );
          })}
        </section>
      ) : (
        <div className="panel">
          <EmptyState
            title="Пробники не найдены"
            text="Измените фильтр или создайте пробник: название, предметы, школы и время записи."
          />
        </div>
      )}
    </div>
  );
}
