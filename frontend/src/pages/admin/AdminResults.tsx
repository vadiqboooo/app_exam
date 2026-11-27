import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Check, Filter, Plus, Search, X } from 'lucide-react';
import { api } from '../../api/client';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { ErrorNotice } from '../../components/ErrorNotice';
import { ReopenResultButton } from '../../components/ReopenResultButton';
import { statusLabels } from '../../components/StatusBadge';
import { useAction } from '../../hooks/useAction';
import { useWorkspace } from '../../layouts/Workspace';
import { groupExams, score } from '../../lib/format';
import { shortDay } from '../../lib/adminEvents';
import type { Exam, Participation, Status, Student } from '../../types';
import './AdminResults.css';

type WorkType = 'ОГЭ' | 'ЕГЭ' | '10 класс';
type ResultRow = { item: Participation; student: Student; exam: Exam; type: WorkType };
type Tab = 'students' | 'works' | 'statistics';
type Issue = 'missing' | 'submitted' | 'checked' | '';
const typeOf = (exam: Exam, student: Student): WorkType =>
  student.grade === 10 ? '10 класс' : exam.format === 'oge' ? 'ОГЭ' : 'ЕГЭ';
const ended = (exam: Exam) => new Date(exam.ends_at ?? exam.starts_at).getTime() < Date.now();
const normalize = (value: string) => value.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');

export function AdminResults() {
  const { data, refresh, openResult } = useWorkspace();
  const publishing = useAction();
  const [tab, setTab] = useState<Tab>('works');
  const [search, setSearch] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [issuesOpen, setIssuesOpen] = useState(false);
  const [type, setType] = useState<WorkType | ''>('');
  const [subject, setSubject] = useState('');
  const [reviewer, setReviewer] = useState('');
  const [status, setStatus] = useState<Status | ''>('');
  const [issue, setIssue] = useState<Issue>('');
  const [selected, setSelected] = useState<number[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<number | null>(null);
  const [statsType, setStatsType] = useState<WorkType>('ОГЭ');
  const [statsEvent, setStatsEvent] = useState('');

  const students = new Map(data.students.map((student) => [student.id, student]));
  const exams = new Map(data.exams.map((exam) => [exam.id, exam]));
  const allRows: ResultRow[] = data.participations.flatMap((item) => {
    if (item.status === 'cancelled') return [];
    const student = students.get(item.student_id);
    const exam = exams.get(item.exam_id);
    return student && exam ? [{ item, student, exam, type: typeOf(exam, student) }] : [];
  });
  const missing = allRows.filter(
    ({ item, exam }) => ended(exam) && ['registered', 'attended', 'absent'].includes(item.status),
  );
  const submitted = allRows.filter(({ item }) => item.status === 'submitted');
  const checked = allRows.filter(({ item }) => item.status === 'checked');
  const issues = missing.length + submitted.length + checked.length;
  const subjects = [...new Set(allRows.map((row) => row.exam.subject))].sort((a, b) =>
    a.localeCompare(b, 'ru'),
  );
  const reviewers = [
    ...new Set(allRows.map((row) => row.item.checked_by).filter((name): name is string => !!name)),
  ].sort((a, b) => a.localeCompare(b, 'ru'));
  const filtered = allRows
    .filter((row) => {
      const haystack = normalize(`${row.student.full_name} ${row.exam.subject} ${row.item.checked_by ?? ''}`);
      return (
        (!search.trim() || haystack.includes(normalize(search.trim()))) &&
        (!type || row.type === type) &&
        (!subject || row.exam.subject === subject) &&
        (!reviewer || row.item.checked_by === reviewer) &&
        (!status || row.item.status === status) &&
        (!issue || (issue === 'missing' ? missing.includes(row) : row.item.status === issue))
      );
    })
    .sort((a, b) => a.student.full_name.localeCompare(b.student.full_name, 'ru'));
  const activeFilters =
    Number(!!type) + Number(!!subject) + Number(!!reviewer) + Number(!!status) + Number(!!issue);
  const resetFilters = () => {
    setType('');
    setSubject('');
    setReviewer('');
    setStatus('');
    setIssue('');
    setSearch('');
  };
  const chooseIssue = (next: Issue) => {
    setIssue(next);
    setTab('works');
    setIssuesOpen(false);
    setFiltersOpen(false);
  };
  const checkedVisible = filtered.filter((row) => row.item.status === 'checked').map((row) => row.item.id);
  const allCheckedSelected = checkedVisible.length > 0 && checkedVisible.every((id) => selected.includes(id));
  const publish = () =>
    void publishing.run(async () => {
      for (const id of selected) {
        const item = data.participations.find((entry) => entry.id === id);
        if (!item || item.status !== 'checked') continue;
        await api.results.publish(id, {
          primary_score: item.primary_score ?? 0,
          test_score: item.test_score,
          result_data: item.result_data,
        });
      }
      setSelected([]);
      setConfirming(false);
      await refresh();
    });

  const studentRows = allRows
    .filter(
      (row) =>
        !studentSearch.trim() ||
        normalize(`${row.student.full_name} ${row.item.checked_by ?? ''}`).includes(
          normalize(studentSearch.trim()),
        ),
    )
    .sort((a, b) => a.student.full_name.localeCompare(b.student.full_name, 'ru'));
  const focusedStudent = studentRows.find((row) => row.item.id === selectedStudent) ?? studentRows[0];
  const studentList = [...new Map(studentRows.map((row) => [row.student.id, row])).values()];
  const personalWorks = studentRows.filter((row) => row.student.id === focusedStudent?.student.id);
  const eventGroups = groupExams(data.exams).sort((a, b) => b[0].starts_at.localeCompare(a[0].starts_at));
  const eventOptions = eventGroups.map((group, index) => ({
    key: String(index),
    title: group[0].title || 'Пробный экзамен',
    exams: new Set(group.map((exam) => exam.id)),
    date: shortDay(group[0].starts_at),
  }));
  const statsRows = allRows.filter(
    (row) =>
      row.type === statsType &&
      (!statsEvent || eventOptions.find((option) => option.key === statsEvent)?.exams.has(row.exam.id)),
  );
  const graded = statsRows.filter(
    (row) => row.item.primary_score != null && ['checked', 'published'].includes(row.item.status),
  );
  // Only OGE subjects with a configured grade scale have a reliable pass threshold in the database.
  const threshold = (exam: Exam) =>
    exam.format === 'oge'
      ? exam.structure_data?.grade_scale
          ?.filter((range) => range.grade >= 3)
          .map((range) => range.min)
          .sort((a, b) => a - b)[0]
      : undefined;
  const withThreshold = graded.filter((row) => threshold(row.exam) !== undefined);
  const passed = withThreshold.filter((row) => row.item.primary_score! >= threshold(row.exam)!).length;
  const statSubjects = [...new Set(statsRows.map((row) => row.exam.subject))].sort((a, b) =>
    a.localeCompare(b, 'ru'),
  );

  return (
    <div className="adm-results">
      <header className="adm-results-nav">
        <div className="adm-results-tabs" role="tablist" aria-label="Разделы результатов">
          {(
            [
              ['students', 'Ученики'],
              ['works', 'Работы'],
              ['statistics', 'Статистика'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="adm-results-tools">
          <div className={`adm-issues ${issues ? 'has-issues' : 'is-clear'}`}>
            <button
              type="button"
              aria-label={issues ? `Требуют внимания: ${issues}` : 'Проблем нет'}
              aria-expanded={issuesOpen}
              title="Проблемы с работами"
              onClick={() => setIssuesOpen(!issuesOpen)}
            >
              <AlertTriangle size={19} />
            </button>
            {issuesOpen && (
              <div className="adm-issues-card">
                <strong>{issues ? 'Требуют внимания' : 'Проблем нет'}</strong>
                {issues ? (
                  <>
                    <button type="button" onClick={() => chooseIssue('missing')}>
                      Не сдали работу <b>{missing.length}</b>
                    </button>
                    <button type="button" onClick={() => chooseIssue('submitted')}>
                      Ждут проверки <b>{submitted.length}</b>
                    </button>
                    <button type="button" onClick={() => chooseIssue('checked')}>
                      Не опубликованы <b>{checked.length}</b>
                    </button>
                  </>
                ) : (
                  <p>Все работы сданы, проверены и опубликованы.</p>
                )}
              </div>
            )}
          </div>
          {tab === 'works' && (
            <>
              <Link
                className="adm-tool-button"
                to="/results/new"
                aria-label="Добавить результат"
                title="Добавить результат"
              >
                <Plus size={19} />
              </Link>
              <button
                type="button"
                className={`adm-tool-button ${activeFilters ? 'is-active' : ''}`}
                aria-label="Фильтры"
                title="Фильтры"
                onClick={() => setFiltersOpen(true)}
              >
                <Filter size={18} />
                {activeFilters > 0 && <span className="adm-filter-count">{activeFilters}</span>}
              </button>
              <label className="adm-work-search">
                <Search size={17} />
                <input
                  type="search"
                  placeholder="Ученик, преподаватель или предмет"
                  aria-label="Поиск работ"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
            </>
          )}
        </div>
      </header>

      {tab === 'works' && (
        <section className="adm-work-table" aria-label="Работы учеников">
          {(activeFilters > 0 || search.trim() || selected.length > 0) && (
            <div className="adm-table-actions">
              {(activeFilters > 0 || search.trim()) && (
                <button type="button" onClick={resetFilters}>
                  Сбросить фильтры
                </button>
              )}
              {selected.length > 0 && (
                <button type="button" onClick={() => setConfirming(true)}>
                  Опубликовать проверенные ({selected.length})
                </button>
              )}
            </div>
          )}
          <div className="adm-work-head adm-work-row">
            <label>
              <input
                type="checkbox"
                aria-label="Выбрать все проверенные"
                checked={allCheckedSelected}
                disabled={!checkedVisible.length}
                onChange={(event) => setSelected(event.target.checked ? checkedVisible : [])}
              />
            </label>
            <span>УЧЕНИК</span>
            <span>ПРЕДМЕТ</span>
            <span>ТИП</span>
            <span>СТАТУС</span>
            <span>ПЕРВ.</span>
            <span>ТЕСТ.</span>
            <span>ПРОВЕРИЛ</span>
          </div>
          {filtered.map(({ item, student, exam, type: workType }) => (
            <div className="adm-work-row adm-work-item" key={item.id}>
              <label>
                <input
                  type="checkbox"
                  aria-label={`Выбрать работу: ${student.full_name}`}
                  disabled={item.status !== 'checked'}
                  checked={selected.includes(item.id)}
                  onChange={(event) =>
                    setSelected((current) =>
                      event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id),
                    )
                  }
                />
              </label>
              <button type="button" className="adm-work-student" onClick={() => openResult(item.id)}>
                <strong>{student.full_name}</strong>
                <small>
                  {student.grade ? `${student.grade} класс` : 'Класс не указан'} ·{' '}
                  {exam.title || 'Пробный экзамен'}
                </small>
              </button>
              <span>{exam.subject}</span>
              <span>
                <b className="adm-type-badge">{workType}</b>
              </span>
              <span>
                <b className={`adm-status adm-status-${item.status}`}>
                  {item.status === 'registered' && ended(exam)
                    ? 'Не сдал работу'
                    : item.status === 'submitted'
                      ? 'Сдано, ждёт проверки'
                      : statusLabels[item.status]}
                </b>
              </span>
              <span>{score(item.primary_score)}</span>
              <strong>{score(item.test_score)}</strong>
              <span className="adm-work-reviewer">{item.checked_by || '—'}</span>
            </div>
          ))}
          {!filtered.length && (
            <EmptyState title="Работ не найдено" text="Измените фильтры или поисковый запрос." />
          )}
        </section>
      )}

      {tab === 'students' && (
        <section className="adm-students-view">
          <div className="adm-students-filters">
            <label>
              <Search size={17} />
              <input
                type="search"
                placeholder="Найти ученика или преподавателя"
                aria-label="Поиск по ученикам"
                value={studentSearch}
                onChange={(event) => setStudentSearch(event.target.value)}
              />
            </label>
            <span>{studentList.length} учеников</span>
          </div>
          <div className="adm-students-layout">
            <div className="adm-students-list">
              {studentList.map((row) => (
                <button
                  type="button"
                  key={row.item.id}
                  className={focusedStudent?.student.id === row.student.id ? 'is-selected' : ''}
                  onClick={() => setSelectedStudent(row.item.id)}
                >
                  <span className="adm-student-avatar">
                    {row.student.full_name
                      .split(' ')
                      .slice(0, 2)
                      .map((part) => part[0])
                      .join('')}
                  </span>
                  <span>
                    <strong>{row.student.full_name}</strong>
                    <small>
                      {row.student.grade} кл. · {studentRows.filter((work) => work.student.id === row.student.id).length} работ
                    </small>
                  </span>
                  <i className={`adm-student-dot adm-status-${row.item.status}`} />
                </button>
              ))}
              {!studentRows.length && <p className="adm-empty-note">Ученики не найдены</p>}
            </div>
            {focusedStudent && (
              <div className="adm-student-detail">
                <div className="adm-detail-head">
                  <span className="adm-student-avatar">
                    {focusedStudent.student.full_name
                      .split(' ')
                      .slice(0, 2)
                      .map((part) => part[0])
                      .join('')}
                  </span>
                  <div>
                    <h2>{focusedStudent.student.full_name}</h2>
                    <p>
                      {focusedStudent.student.grade} класс · {focusedStudent.exam.subject} ·{' '}
                      {focusedStudent.type}
                    </p>
                  </div>
                  <b className={`adm-status adm-status-${focusedStudent.item.status}`}>
                    {statusLabels[focusedStudent.item.status]}
                  </b>
                </div>
                <div className="adm-personal-works" aria-label="Работы ученика">
                  {personalWorks.map((row) => (
                    <button
                      type="button"
                      key={row.item.id}
                      className={focusedStudent.item.id === row.item.id ? 'is-selected' : ''}
                      onClick={() => setSelectedStudent(row.item.id)}
                    >
                      {row.exam.subject} · {row.type} · {shortDay(row.exam.starts_at)}
                    </button>
                  ))}
                </div>
                <div className="adm-detail-meta">
                  {focusedStudent.exam.title || 'Пробный экзамен'} · {shortDay(focusedStudent.exam.starts_at)}{' '}
                  · {focusedStudent.student.school || 'Школа не указана'}
                </div>
                <div className="adm-score-cards">
                  <div>
                    <span>Первичный балл</span>
                    <strong>{score(focusedStudent.item.primary_score)}</strong>
                  </div>
                  <div>
                    <span>Тестовый балл</span>
                    <strong>{score(focusedStudent.item.test_score)}</strong>
                  </div>
                </div>
                <h3>Баллы по заданиям</h3>
                {focusedStudent.item.result_data?.tasks.length ? (
                  <div className="adm-task-grid">
                    {focusedStudent.item.result_data.tasks.map((task) => (
                      <div key={task.code}>
                        <small>{task.code}</small>
                        <strong>{task.score}</strong>
                        {task.comment && <span title={task.comment}>◌</span>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="adm-empty-note">Баллы по заданиям ещё не внесены.</p>
                )}
                <div className="adm-teacher-comment">
                  <h3>Комментарий преподавателя</h3>
                  <p>{focusedStudent.item.result_data?.overall_comment || 'Комментарий не добавлен'}</p>
                  <small>Проверил: {focusedStudent.item.checked_by || '—'}</small>
                </div>
                <div className="adm-detail-actions">
                  <button
                    type="button"
                    className="adm-detail-edit"
                    onClick={() => openResult(focusedStudent.item.id)}
                  >
                    Открыть работу
                  </button>
                  {focusedStudent.item.status === 'published' && (
                    <ReopenResultButton
                      id={focusedStudent.item.id}
                      studentName={focusedStudent.student.full_name}
                      subject={focusedStudent.exam.subject}
                      onReopened={refresh}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {tab === 'statistics' && (
        <section className="adm-statistics-view">
          <div className="adm-statistics-toolbar">
            <div className="adm-format-tabs" role="group" aria-label="Тип экзамена">
              {(['ОГЭ', 'ЕГЭ', '10 класс'] as WorkType[]).map((format) => (
                <button
                  type="button"
                  key={format}
                  aria-pressed={statsType === format}
                  onClick={() => {
                    setStatsType(format);
                    setStatsEvent('');
                  }}
                >
                  {format}
                </button>
              ))}
            </div>
            <label>
              Пробник
              <select value={statsEvent} onChange={(event) => setStatsEvent(event.target.value)}>
                <option value="">Все пробники</option>
                {eventOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.title} · {option.date}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="adm-stat-cards">
            <div>
              <span>Всего работ</span>
              <strong>{statsRows.length}</strong>
            </div>
            <div>
              <span>Опубликовано</span>
              <strong>{statsRows.filter((row) => row.item.status === 'published').length}</strong>
            </div>
            <div>
              <span>Сдали</span>
              <strong>
                {withThreshold.length ? `${Math.round((passed / withThreshold.length) * 100)}%` : '—'}
              </strong>
              <small>
                {withThreshold.length ? `${passed} из ${withThreshold.length} проверенных` : 'Порог не задан'}
              </small>
            </div>
            <div>
              <span>Не сдали по баллам</span>
              <strong>
                {withThreshold.length
                  ? `${Math.round(((withThreshold.length - passed) / withThreshold.length) * 100)}%`
                  : '—'}
              </strong>
              <small>
                {withThreshold.length
                  ? `${withThreshold.length - passed} из ${withThreshold.length} проверенных`
                  : 'Порог не задан'}
              </small>
            </div>
          </div>
          <h2>Предметы · {statsType}</h2>
          <div className="adm-subject-stats">
            {statSubjects.map((name) => {
              const own = statsRows.filter((row) => row.exam.subject === name);
              const comparable = own.filter(
                (row) =>
                  row.item.primary_score != null &&
                  ['checked', 'published'].includes(row.item.status) &&
                  threshold(row.exam) !== undefined,
              );
              const success = comparable.filter(
                (row) => row.item.primary_score! >= threshold(row.exam)!,
              ).length;
              return (
                <button
                  type="button"
                  key={name}
                  onClick={() => {
                    setTab('works');
                    setType(statsType);
                    setSubject(name);
                    setIssue('');
                  }}
                >
                  <strong>
                    {name}
                    <span>{statsType}</span>
                  </strong>
                  <div className="adm-pass-bar">
                    <i style={{ width: `${comparable.length ? (success / comparable.length) * 100 : 0}%` }} />
                  </div>
                  <p>
                    {comparable.length ? (
                      <>
                        <b>{Math.round((success / comparable.length) * 100)}% сдали</b>
                        <em>
                          {Math.round(((comparable.length - success) / comparable.length) * 100)}% не сдали
                        </em>
                      </>
                    ) : (
                      'Порог не задан'
                    )}
                  </p>
                  <small>
                    {own.length} работ ·{' '}
                    {own.filter((row) => ['checked', 'published'].includes(row.item.status)).length} проверено
                  </small>
                </button>
              );
            })}
            {!statSubjects.length && (
              <div className="adm-empty-note">Для выбранного типа работ пока нет.</div>
            )}
          </div>
        </section>
      )}

      {filtersOpen && (
        <div
          className="adm-filter-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setFiltersOpen(false);
          }}
        >
          <aside className="adm-filter-drawer" aria-label="Фильтры работ">
            <div className="adm-filter-head">
              <div>
                <h2>Фильтры</h2>
                <p>Выберите параметры работ</p>
              </div>
              <button type="button" aria-label="Закрыть фильтры" onClick={() => setFiltersOpen(false)}>
                <X size={19} />
              </button>
            </div>
            <div className="adm-filter-fields">
              <label>
                Тип
                <select value={type} onChange={(event) => setType(event.target.value as WorkType | '')}>
                  <option value="">Все типы</option>
                  <option>ОГЭ</option>
                  <option>ЕГЭ</option>
                  <option>10 класс</option>
                </select>
              </label>
              <label>
                Предмет
                <select value={subject} onChange={(event) => setSubject(event.target.value)}>
                  <option value="">Все предметы</option>
                  {subjects.map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              </label>
              <label>
                Преподаватель, который проверил
                <select value={reviewer} onChange={(event) => setReviewer(event.target.value)}>
                  <option value="">Все преподаватели</option>
                  {reviewers.map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              </label>
              <label>
                Статус
                <select value={status} onChange={(event) => setStatus(event.target.value as Status | '')}>
                  <option value="">Все статусы</option>
                  {Object.entries(statusLabels)
                    .filter(([key]) => key !== 'cancelled')
                    .map(([key, label]) => (
                      <option value={key} key={key}>
                        {label}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <div className="adm-filter-footer">
              <button type="button" onClick={resetFilters}>
                Сбросить
              </button>
              <button type="button" onClick={() => setFiltersOpen(false)}>
                Показать {filtered.length} работ
              </button>
            </div>
          </aside>
        </div>
      )}
      {confirming && (
        <ConfirmDialog
          title="Опубликовать результаты?"
          text={`Выбрано работ: ${selected.length}. Ученики увидят результаты после публикации.`}
          confirm="Опубликовать"
          busy={publishing.busy}
          error={publishing.error}
          onClose={() => setConfirming(false)}
          onConfirm={publish}
        />
      )}
      <ErrorNotice message={publishing.error} />
    </div>
  );
}
