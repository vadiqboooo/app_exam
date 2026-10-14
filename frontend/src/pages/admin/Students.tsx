import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { api } from '../../api/client';
import { useAction } from '../../hooks/useAction';
import { useWorkspace } from '../../layouts/Workspace';
import { studentGroups } from '../../lib/format';
import { codeState, lastLogin } from '../../lib/accessCode';
import { plural } from '../../lib/adminEvents';
import { CodeAction, CodeBadge, Toast } from '../../components/CodeCell';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import type { Student } from '../../types';

type StatusFilter = 'active' | 'archived' | 'all';

export function Students() {
  const { data, refresh } = useWorkspace();
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

  const activeCount = data.students.filter((student) => student.is_active).length;
  const allStudents = data.students.map((student) => {
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
    ['archived', 'Архив', data.students.length - activeCount],
    ['all', 'Все', data.students.length],
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

  return (
    <div className="sc-section">
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
