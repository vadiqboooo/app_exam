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

export function Students() {
  const { data, refresh } = useWorkspace();
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState('');
  const [resetting, setResetting] = useState<Student>();
  const [toast, setToast] = useState('');
  const { busy, error, run } = useAction();
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const students = data.students
    .filter((student) => student.is_active)
    .map((student) => ({
      student,
      groups: studentGroups(student.id, data.memberships, data.groups),
    }));
  const groupOptions = data.groups
    .filter((item) => item.is_active)
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
            <span>КОД ВХОДА</span>
            <span>ПОСЛЕДНИЙ ВХОД</span>
            <span className="ad-right">ДЕЙСТВИЕ</span>
          </div>
          {rows.map(({ student, groups }) => {
            const state = codeState(student);
            return (
              <div className="sc-row sc-row-students sc-item" key={student.id}>
                <span className="sc-name">
                  <Link to={`/students/${student.id}`}>{student.full_name}</Link>
                </span>
                <span>{student.grade ?? '—'}</span>
                <span>{plural(groups.length, 'группа', 'группы', 'групп')}</span>
                <CodeBadge state={state} />
                <span>{lastLogin(student.last_login_at)}</span>
                <span className="sc-act">
                  <CodeAction
                    state={state}
                    busy={busy}
                    onReset={() => setResetting(student)}
                    onUnlock={() => unlock(student)}
                  />
                </span>
              </div>
            );
          })}
        </section>
      ) : (
        <div className="panel">
          <EmptyState title="Ученики не найдены" text="Измените поиск или группу." />
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
