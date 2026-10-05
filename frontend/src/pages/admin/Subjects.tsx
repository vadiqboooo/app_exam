import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight, Plus } from 'lucide-react';
import { api } from '../../api/client';
import { EmptyState } from '../../components/EmptyState';
import { ErrorNotice } from '../../components/ErrorNotice';
import { useAction } from '../../hooks/useAction';
import { useLoad } from '../../hooks/useLoad';
import type { SubjectSetting } from '../../types';

const loadSubjects = () => api.subjects.list();
const formatName = (format: SubjectSetting['format']) => (format === 'ege' ? 'ЕГЭ' : 'ОГЭ');
/** «Анна Сергеевна» → «Анна С.» */
const shortName = (name: string) => {
  const [first, second] = name.split(/\s+/);
  return second ? `${first} ${second[0]}.` : first;
};

type StatusFilter = 'all' | 'on' | 'off';
type FormatFilter = 'all' | 'ege' | 'oge';

export function Subjects() {
  const { data, error, loading, refresh } = useLoad(loadSubjects);
  const navigate = useNavigate();
  const toggling = useAction();
  const [status, setStatus] = useState<StatusFilter>('all');
  const [format, setFormat] = useState<FormatFilter>('all');
  const all = data ?? [];
  const activeCount = all.filter((subject) => subject.is_active).length;
  const subjects = all.filter(
    (subject) =>
      (status === 'all' || (status === 'on') === subject.is_active) &&
      (format === 'all' || subject.format === format),
  );
  const flip = (subject: SubjectSetting) =>
    void toggling.run(async () => {
      // The responsible teacher and the duration are not sent, so they keep their value.
      await api.subjects.update(subject.id, {
        name: subject.name,
        format: subject.format,
        tasks: subject.tasks,
        primary_to_secondary_scale: subject.primary_to_secondary_scale,
        grade_scale: subject.grade_scale,
        is_active: !subject.is_active,
      });
      await refresh();
    });
  const statusTabs: [StatusFilter, string, number | undefined][] = [
    ['all', 'Все', all.length],
    ['on', 'Активные', activeCount],
    ['off', 'Неактивные', all.length - activeCount],
  ];
  const formatTabs: [FormatFilter, string][] = [
    ['all', 'Все форматы'],
    ['ege', 'ЕГЭ'],
    ['oge', 'ОГЭ'],
  ];

  return (
    <div className="sc-section">
      <ErrorNotice message={error || toggling.error} />
      <div className="sj-filters">
        <div className="sj-pills" role="group" aria-label="Статус">
          {statusTabs.map(([key, label, count]) => (
            <button type="button" key={key} aria-pressed={status === key} onClick={() => setStatus(key)}>
              {label}
              <span>{count}</span>
            </button>
          ))}
        </div>
        <div className="sj-pills" role="group" aria-label="Формат">
          {formatTabs.map(([key, label]) => (
            <button type="button" key={key} aria-pressed={format === key} onClick={() => setFormat(key)}>
              {label}
            </button>
          ))}
          <Link className="button button-secondary" to="/school/subjects/new">
            <Plus size={17} />
            Добавить предмет
          </Link>
        </div>
      </div>
      {loading && !data ? (
        <div className="loading" role="status">
          Загружаем настройки…
        </div>
      ) : subjects.length ? (
        <section className="sj-table" aria-label="Предметы">
          <div className="sj-row sj-head">
            <span>ПРЕДМЕТ</span>
            <span>ФОРМАТ</span>
            <span>ЗАДАНИЙ</span>
            <span>МАКС. БАЛЛ</span>
            <span>ОТВЕТСТВЕННЫЙ</span>
            <span>АКТИВЕН</span>
            <span />
          </div>
          {subjects.map((subject) => (
            <div className={`sj-row sj-item${subject.is_active ? '' : ' is-off'}`} key={subject.id}>
              <button
                type="button"
                className="sj-open"
                aria-label={`Настройки: ${subject.name}`}
                onClick={() => navigate(`/school/subjects/${subject.id}`)}
              />
              <span className="sj-name">
                <strong>{subject.name}</strong>
                <small>{subject.format === 'ege' ? 'Единый госэкзамен' : 'Основной госэкзамен'}</small>
              </span>
              <span>
                <span className="sc-format">{formatName(subject.format)}</span>
              </span>
              <strong>{subject.tasks.length}</strong>
              <strong>{subject.max_primary_score}</strong>
              <span className={`sj-resp${subject.responsible_name ? '' : ' is-none'}`}>
                {subject.responsible_name ? shortName(subject.responsible_name) : 'Не назначен'}
              </span>
              <span className="sj-active">
                <button
                  type="button"
                  role="switch"
                  aria-checked={subject.is_active}
                  aria-label={`Активен: ${subject.name}`}
                  className="sj-switch"
                  disabled={toggling.busy}
                  onClick={() => flip(subject)}
                >
                  <span />
                </button>
                <span className={subject.is_active ? 'is-on' : undefined}>
                  {subject.is_active ? 'Да' : 'Скрыт'}
                </span>
              </span>
              <ChevronRight size={20} />
            </div>
          ))}
        </section>
      ) : (
        <div className="panel">
          <EmptyState
            title={all.length ? 'Ничего не найдено' : 'Предметы пока не настроены'}
            text={all.length ? 'Измените фильтры.' : 'Добавьте предмет: задания и максимальные баллы.'}
          />
        </div>
      )}
      <p className="sj-note">
        Неактивный предмет скрыт: на него нельзя записаться и его нельзя выбрать в новом пробнике. Уже
        внесённые результаты остаются.
      </p>
    </div>
  );
}
