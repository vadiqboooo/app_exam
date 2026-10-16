import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Phone, Plus, Search } from 'lucide-react';
import { api } from '../../api/client';
import { useAction } from '../../hooks/useAction';
import { useWorkspace } from '../../layouts/Workspace';
import { studentGroups } from '../../lib/format';
import { codeState, lastLogin } from '../../lib/accessCode';
import { plural } from '../../lib/adminEvents';
import { CodeAction, CodeBadge, Toast } from '../../components/CodeCell';
import { AddStudentDialog } from '../../components/AddStudentDialog';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import type { Student, StudentApplication } from '../../types';

type StatusFilter = 'active' | 'archived' | 'all';
type View = 'all' | 'new';

const GRADES = [9, 10, 11];
const requestedFormat = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

export function Students() {
  const { data, refresh } = useWorkspace();
  const [view, setView] = useState<View>(
    new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('tab') === 'new' ? 'new' : 'all',
  );
  const [applications, setApplications] = useState<StudentApplication[]>([]);
  const [grades, setGrades] = useState<Record<number, number>>({});
  const [groupFor, setGroupFor] = useState<Record<number, number>>({});
  const [rejecting, setRejecting] = useState<StudentApplication>();
  const [adding, setAdding] = useState(false);
  const [schoolFilter, setSchoolFilter] = useState('');
  const loadApplications = useCallback(
    () =>
      api.students
        .applications()
        .then(setApplications)
        .catch(() => setApplications([])),
    [],
  );
  useEffect(() => {
    void loadApplications();
  }, [loadApplications]);
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState('');
  const [status, setStatus] = useState<StatusFilter>('active');
  const [resetting, setResetting] = useState<Student>();
  const [toast, setToast] = useState('');
  const { busy, error, run } = useAction();
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  // Applicants who are still waiting for a call live on the «Новые заявки» tab only.
  const roster = data.students.filter((student) => !student.is_pending);
  const activeCount = roster.filter((student) => student.is_active).length;
  const allStudents = roster.map((student) => {
    const groups = student.is_active
      ? studentGroups(student.id, data.memberships, data.groups)
      : data.groups.filter((item) =>
          data.memberships.some(
            (membership) => membership.student_id === student.id && membership.group_id === item.id,
          ),
        );
    return { student, groups };
  });
  const students = allStudents.filter(
    ({ student }) => status === 'all' || (status === 'active' ? student.is_active : !student.is_active),
  );
  const schoolNames = [
    ...new Set(roster.map((student) => student.school).filter((name): name is string => !!name)),
  ].sort((a, b) => a.localeCompare(b, 'ru'));
  const groupOptions = data.groups
    .filter((item) => students.some((row) => row.groups.some((groupItem) => groupItem.id === item.id)))
    .map((item) => ({
      item,
      count: students.filter((row) => row.groups.some((g) => g.id === item.id)).length,
    }))
    .sort((a, b) => a.item.source_name.localeCompare(b.item.source_name, 'ru'));
  const rows = students.filter(
    (row) =>
      (!group || row.groups.some((g) => g.id === Number(group))) &&
      row.student.full_name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const statusTabs: [StatusFilter, string, number][] = [
    ['active', 'Активные', activeCount],
    ['archived', 'Архив', roster.length - activeCount],
    ['all', 'Все', roster.length],
  ];

  const unlock = (student: Student) =>
    void run(async () => {
      await api.students.unlock(student.id);
      await refresh();
      setToast(`${student.full_name}: вход снова доступен со старым кодом`);
    });
  const reset = (student: Student) =>
    void run(async () => {
      await api.students.resetCode(student.id);
      await refresh();
      setResetting(undefined);
      setToast(`Код сброшен — ${student.full_name} придумает новый при входе`);
    });

  const approve = (application: StudentApplication) =>
    void run(async () => {
      await api.students.approveApplication(
        application.id,
        grades[application.id] ?? 11,
        groupFor[application.id] || undefined,
      );
      await Promise.all([refresh(), loadApplications()]);
      setToast(`${application.full_name} подтверждён. Ученик может войти по фамилии и своему паролю`);
    });
  const reject = (application: StudentApplication) =>
    void run(async () => {
      await api.students.rejectApplication(application.id);
      await loadApplications();
      setRejecting(undefined);
      setToast(`Заявка ${application.full_name} отклонена`);
    });
  const activeGroups = data.groups
    .filter((item) => item.is_active)
    .sort((a, b) => a.source_name.localeCompare(b.source_name, 'ru'));
  const waiting = applications.length;
  const newLabel = plural(waiting, 'новая заявка', 'новые заявки', 'новых заявок');

  return (
    <div className="sc-section">
      <div className="sc-top">
        <div className="sj-pills" role="group" aria-label="Раздел">
          <button type="button" aria-pressed={view === 'all'} onClick={() => setView('all')}>
            Все ученики
            <span>{activeCount}</span>
          </button>
          <button type="button" aria-pressed={view === 'new'} onClick={() => setView('new')}>
            Новые заявки
            {waiting > 0 && <span className="sc-count-alert">{waiting}</span>}
          </button>
        </div>
        <Button icon={<Plus size={18} />} onClick={() => setAdding(true)}>
          Добавить ученика
        </Button>
      </div>
      {waiting > 0 && view === 'all' && (
        <div className="sc-banner" role="status">
          <span className="sc-banner-count">{waiting}</span>
          <span>
            <b>{newLabel}.</b> Позвоните и подтвердите запись.
          </span>
          <button type="button" onClick={() => setView('new')}>
            Посмотреть заявки
          </button>
        </div>
      )}
      {view === 'new' && (
        <section className="ad-table" aria-label="Заявки на регистрацию">
          <div className="sc-apps-head">
            <h2>Заявки на регистрацию</h2>
            <span>
              Эти люди сами зарегистрировались и придумали пароль. Позвоните, назначьте класс и группу и
              подтвердите.
            </span>
          </div>
          <div className="sc-row sc-row-apps ad-table-head">
            <span>ЗАЯВКА</span>
            <span>ТЕЛЕФОН</span>
            <span>ПОДАНА</span>
            <span>КУДА ЗАПИСАЛСЯ</span>
            <span>КЛАСС</span>
            <span>ГРУППА</span>
            <span className="ad-right">ДЕЙСТВИЕ</span>
          </div>
          {applications.map((item) => (
            <div className="sc-row sc-row-apps sc-item" key={item.id}>
              <span className="sc-name">
                {item.full_name}
                <small>регистрация на сайте</small>
              </span>
              <span>
                {item.phone ? (
                  <a className="sc-tel" href={`tel:${item.phone.replace(/[^+\d]/g, '')}`}>
                    <Phone size={15} />
                    {item.phone}
                  </a>
                ) : (
                  '—'
                )}
              </span>
              <span>{item.requested_at ? requestedFormat.format(new Date(item.requested_at)) : '—'}</span>
              <span className="sc-bookings">
                {item.bookings.length ? (
                  item.bookings.map((booking, index) => (
                    <span key={index}>
                      <b>{booking.subject}</b>
                      <small>
                        {requestedFormat.format(new Date(booking.starts_at))}
                        {booking.school_name ? ` · ${booking.school_name}` : ''}
                      </small>
                    </span>
                  ))
                ) : (
                  <small>Пока никуда не записался</small>
                )}
              </span>
              <select
                aria-label={`Класс: ${item.full_name}`}
                value={grades[item.id] ?? 11}
                onChange={(e) => setGrades({ ...grades, [item.id]: Number(e.target.value) })}
              >
                {GRADES.map((grade) => (
                  <option key={grade} value={grade}>
                    {grade} класс
                  </option>
                ))}
              </select>
              <select
                aria-label={`Группа: ${item.full_name}`}
                value={groupFor[item.id] ?? ''}
                onChange={(e) => setGroupFor({ ...groupFor, [item.id]: Number(e.target.value) })}
              >
                <option value="">Без группы</option>
                {activeGroups.map((groupItem) => (
                  <option key={groupItem.id} value={groupItem.id}>
                    {groupItem.source_name}
                  </option>
                ))}
              </select>
              <span className="sc-act sc-act-pair">
                <button
                  type="button"
                  className="sc-action"
                  disabled={busy}
                  onClick={() => setRejecting(item)}
                >
                  Отклонить
                </button>
                <button
                  type="button"
                  className="sc-action sc-action-primary"
                  disabled={busy}
                  onClick={() => approve(item)}
                >
                  Подтвердить
                </button>
              </span>
            </div>
          ))}
          {!waiting && <div className="sc-apps-empty">Новых заявок нет. Всё разобрано.</div>}
        </section>
      )}
      {view === 'all' && (
        <>
          <div className="sj-pills" role="group" aria-label="Статус ученика">
            {statusTabs.map(([key, label, count]) => (
              <button
                type="button"
                key={key}
                aria-pressed={status === key}
                onClick={() => {
                  setStatus(key);
                  setGroup('');
                }}
              >
                {label}
                <span>{count}</span>
              </button>
            ))}
          </div>
          <div className="sc-filters">
            <label className="sc-search">
              <Search size={18} />
              <input
                aria-label="Поиск"
                placeholder="Фамилия или имя"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            {schoolNames.length > 0 && (
              <label className="sc-select">
                Школа
                <select
                  aria-label="Фильтр по школе"
                  value={schoolFilter}
                  onChange={(e) => setSchoolFilter(e.target.value)}
                >
                  <option value="">Все школы</option>
                  {schoolNames.map((name) => (
                    <option key={name} value={name}>
                      {name} · {students.filter((row) => row.student.school === name).length}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="sc-select">
              Группа
              <select aria-label="Фильтр по группе" value={group} onChange={(e) => setGroup(e.target.value)}>
                <option value="">Все группы</option>
                {groupOptions.map(({ item, count }) => (
                  <option key={item.id} value={item.id}>
                    {item.source_name} · {count}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {rows.length ? (
            <section className="ad-table" aria-label="Ученики">
              <div className="sc-row sc-row-students ad-table-head">
                <span>УЧЕНИК</span>
                <span>КЛАСС</span>
                <span>ГРУПП</span>
                <span>СТАТУС</span>
                <span>КОД ВХОДА</span>
                <span>ПОСЛЕДНИЙ ВХОД</span>
                <span className="ad-right">ДЕЙСТВИЕ</span>
              </div>
              {rows.map(({ student, groups }) => {
                const state = codeState(student);
                return (
                  <div
                    className={`sc-row sc-row-students sc-item${student.is_active ? '' : ' is-archived'}`}
                    key={student.id}
                  >
                    <span className="sc-name">
                      <Link to={`/students/${student.id}`}>{student.full_name}</Link>
                      {student.school && <small>{student.school}</small>}
                    </span>
                    <span>{student.grade ?? '—'}</span>
                    <span>{plural(groups.length, 'группа', 'группы', 'групп')}</span>
                    <span>
                      <span className={`sc-student-state ${student.is_active ? 'is-active' : 'is-archived'}`}>
                        {student.is_active ? 'Активен' : 'В архиве'}
                      </span>
                    </span>
                    {student.is_active ? <CodeBadge state={state} /> : <span>—</span>}
                    <span>{lastLogin(student.last_login_at)}</span>
                    <span className="sc-act">
                      {student.is_active ? (
                        <CodeAction
                          state={state}
                          busy={busy}
                          onReset={() => setResetting(student)}
                          onUnlock={() => unlock(student)}
                        />
                      ) : (
                        '—'
                      )}
                    </span>
                  </div>
                );
              })}
            </section>
          ) : (
            <div className="panel">
              <EmptyState
                title={status === 'archived' ? 'В архиве никого нет' : 'Ученики не найдены'}
                text="Измените поиск, группу или статус."
              />
            </div>
          )}
        </>
      )}
      {adding && (
        <AddStudentDialog
          groups={activeGroups}
          onClose={() => setAdding(false)}
          onAdded={(name, code) => {
            setAdding(false);
            setView('all');
            setStatus('active');
            void refresh();
            setToast(
              code
                ? `${name} добавлен. Код ${code.slice(0, 3)} ${code.slice(3)} — сообщите ученику`
                : `${name} добавлен. Код придумает при первом входе`,
            );
          }}
        />
      )}
      {rejecting && (
        <ConfirmDialog
          title="Отклонить заявку?"
          text={`Заявка ${rejecting.full_name} будет удалена. Человек не сможет войти, пока не зарегистрируется заново.`}
          confirm="Отклонить"
          busy={busy}
          error={error}
          onClose={() => setRejecting(undefined)}
          onConfirm={() => reject(rejecting)}
        />
      )}
      {resetting && (
        <ConfirmDialog
          title="Сбросить код?"
          text={`${resetting.full_name} больше не сможет войти со старым кодом. При следующем входе ученик введёт фамилию и придумает новый код из 6 цифр.`}
          confirm="Сбросить код"
          busy={busy}
          error={error}
          onClose={() => setResetting(undefined)}
          onConfirm={() => reset(resetting)}
        />
      )}
      <Toast message={toast} />
    </div>
  );
}
