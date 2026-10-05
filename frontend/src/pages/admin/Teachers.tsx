import { useEffect, useState, type FormEvent } from 'react';
import { Plus, Search } from 'lucide-react';
import { api, loadSession } from '../../api/client';
import { Button } from '../../components/Button';
import { CodeAction, CodeBadge, Toast } from '../../components/CodeCell';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { ErrorNotice } from '../../components/ErrorNotice';
import { Modal } from '../../components/Modal';
import { useAction } from '../../hooks/useAction';
import { useLoad } from '../../hooks/useLoad';
import { useWorkspace } from '../../layouts/Workspace';
import { codeState, lastLogin, type CodeState } from '../../lib/accessCode';
import { plural } from '../../lib/adminEvents';
import type { Group, StaffRole, Teacher, TeacherWrite } from '../../types';

const loadTeachers = () => api.teachers.list();
const roleChips: [StaffRole, string][] = [
  ['admin', 'Администратор'],
  ['teacher', 'Учитель'],
  ['responsible', 'Ответственный'],
];

function TeacherForm({
  teacher,
  groups,
  onClose,
  onSaved,
  onDelete,
}: {
  teacher?: Teacher;
  groups: Group[];
  onClose: () => void;
  onSaved: () => Promise<void>;
  onDelete?: () => void;
}) {
  const [groupIds, setGroupIds] = useState<number[]>(teacher?.group_ids ?? []);
  const [groupSearch, setGroupSearch] = useState('');
  const { busy, error, run } = useAction();
  const visibleGroups = groups.filter((group) =>
    group.source_name.toLowerCase().includes(groupSearch.trim().toLowerCase()),
  );
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const data: TeacherWrite = {
      first_name: String(form.get('first_name') ?? '').trim(),
      middle_name: String(form.get('middle_name') ?? '').trim(),
      group_ids: groupIds,
    };
    void run(async () => {
      if (teacher) await api.teachers.update(teacher.id, data);
      else await api.teachers.create(data);
      await onSaved();
    });
  }
  return (
    <Modal
      title={teacher ? 'Редактировать сотрудника' : 'Добавить сотрудника'}
      onClose={onClose}
      wide
      busy={busy}
    >
      <form onSubmit={submit}>
        <div className="modal-body stack">
          <ErrorNotice message={error} />
          <fieldset className="stack" disabled={busy}>
            <div className="form-grid">
              <label>
                Имя
                <input
                  name="first_name"
                  autoComplete="given-name"
                  defaultValue={teacher?.first_name ?? ''}
                  placeholder="Екатерина"
                  required
                />
              </label>
              <label>
                Отчество
                <input
                  name="middle_name"
                  autoComplete="additional-name"
                  defaultValue={teacher?.middle_name ?? ''}
                  placeholder="Сергеевна"
                  required
                />
              </label>
            </div>
            <div className="teacher-groups-heading">
              <div>
                <h3>Группы учителя</h3>
                <p className="muted small">Выбранная группа будет переназначена этому учителю.</p>
              </div>
              <div className="search-input teacher-group-search">
                <Search size={16} />
                <input
                  aria-label="Поиск группы"
                  placeholder="Найти группу"
                  value={groupSearch}
                  onChange={(event) => setGroupSearch(event.target.value)}
                />
              </div>
            </div>
            <div className="teacher-group-options">
              {visibleGroups.map((group) => (
                <label className="teacher-group-option" key={group.id}>
                  <input
                    type="checkbox"
                    checked={groupIds.includes(group.id)}
                    onChange={(event) =>
                      setGroupIds(
                        event.target.checked
                          ? [...groupIds, group.id]
                          : groupIds.filter((id) => id !== group.id),
                      )
                    }
                  />
                  <span>
                    <strong>{group.source_name}</strong>
                    <small>
                      {group.teacher_name && group.teacher_id !== teacher?.id
                        ? `Сейчас: ${group.teacher_name}`
                        : group.subject || 'Предмет не указан'}
                    </small>
                  </span>
                </label>
              ))}
              {!visibleGroups.length && <p className="muted">Группы не найдены.</p>}
            </div>
          </fieldset>
        </div>
        <div className="modal-footer">
          {onDelete && (
            <Button variant="danger" disabled={busy} onClick={onDelete}>
              Удалить учителя
            </Button>
          )}
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Сохраняем…' : 'Сохранить'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

type Filter = 'all' | CodeState;
const filters: [Filter, string][] = [
  ['all', 'Все'],
  ['set', 'Код создан'],
  ['first', 'Не входили'],
  ['reset', 'Сброшен'],
  ['lock', 'Приостановлен'],
];

export function Teachers() {
  const { data, error, loading, refresh } = useLoad(loadTeachers);
  const { data: workspace, refresh: refreshWorkspace } = useWorkspace();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<Teacher | null | undefined>();
  const [deleting, setDeleting] = useState<Teacher>();
  const [resetting, setResetting] = useState<Teacher>();
  const [dropping, setDropping] = useState<Teacher>();
  const [toast, setToast] = useState('');
  const me = loadSession()?.staffId;
  const { busy: deletingBusy, error: deleteError, run: runDelete } = useAction();
  const codes = useAction();
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const all = (data ?? []).map((teacher) => ({ teacher, state: codeState(teacher) }));
  const count = (state: CodeState) => all.filter((row) => row.state === state).length;
  const rows = all.filter(
    (row) =>
      (filter === 'all' || row.state === filter) &&
      row.teacher.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const saved = async () => {
    await Promise.all([refresh(), refreshWorkspace()]);
    setEditing(undefined);
  };
  const unlock = (teacher: Teacher) =>
    void codes.run(async () => {
      await api.teachers.unlock(teacher.id);
      await refresh();
      setToast(`${teacher.name}: вход снова доступен со старым кодом`);
    });
  const toggleRole = (teacher: Teacher, role: StaffRole, confirmed = false) => {
    const label = roleChips.find(([key]) => key === role)![1];
    const had = teacher.roles.includes(role);
    const roles = had ? teacher.roles.filter((item) => item !== role) : [...teacher.roles, role];
    if (!roles.length) return;
    // Taking the teacher role away also frees the groups, so ask first.
    if (had && role === 'teacher' && teacher.group_ids.length && !confirmed) {
      setDropping(teacher);
      return;
    }
    void codes.run(async () => {
      await api.teachers.setRoles(teacher.id, roles);
      await Promise.all([refresh(), refreshWorkspace()]);
      setDropping(undefined);
      setToast(`${teacher.name}: ${had ? `роль «${label}» снята` : `добавлена роль «${label}»`}`);
    });
  };
  const reset = (teacher: Teacher) =>
    void codes.run(async () => {
      await api.teachers.resetCode(teacher.id);
      await refresh();
      setResetting(undefined);
      setToast(`Код сброшен — ${teacher.name} придумает новый при входе`);
    });

  return (
    <div className="sc-section">
      <ErrorNotice message={error} />
      <div className="sc-filters">
        <label className="sc-search">
          <Search size={18} />
          <input
            aria-label="Поиск"
            placeholder="Фамилия или имя"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <div className="ad-tabs" role="group" aria-label="Статус кода">
          {filters.map(([key, label]) => (
            <button type="button" key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>
              {label}
              {key === 'all' ? '' : ` · ${count(key)}`}
            </button>
          ))}
        </div>
        <Button icon={<Plus size={17} />} onClick={() => setEditing(null)}>
          Добавить сотрудника
        </Button>
      </div>
      {loading && !data ? (
        <div className="loading" role="status">
          Загружаем учителей…
        </div>
      ) : rows.length ? (
        <section className="ad-table" aria-label="Учителя">
          <div className="sc-row sc-row-staff ad-table-head">
            <span>СОТРУДНИК</span>
            <span>
              РОЛИ · <small>можно несколько</small>
            </span>
            <span>ГРУППЫ</span>
            <span>КОД ВХОДА</span>
            <span>ПОСЛЕДНИЙ ВХОД</span>
            <span className="ad-right">ДЕЙСТВИЕ</span>
          </div>
          {rows.map(({ teacher, state }) => (
            <div className="sc-row sc-row-staff sc-item" key={teacher.id}>
              <span className="sc-name">
                <button type="button" onClick={() => setEditing(teacher)} title="Редактировать сотрудника">
                  {teacher.name}
                </button>
                {teacher.id === me && <small>это вы</small>}
              </span>
              <span className="sc-roles">
                {roleChips.map(([role, label]) => (
                  <button
                    type="button"
                    key={role}
                    role="switch"
                    aria-checked={teacher.roles.includes(role)}
                    className={`is-${role}`}
                    disabled={codes.busy}
                    onClick={() => toggleRole(teacher, role)}
                  >
                    {label}
                  </button>
                ))}
              </span>
              <span className="sc-groups">
                {teacher.roles.includes('teacher') && teacher.group_ids.length
                  ? plural(teacher.group_ids.length, 'группа', 'группы', 'групп')
                  : '—'}
              </span>
              <CodeBadge state={state} />
              <span>{lastLogin(teacher.last_login_at)}</span>
              <span className="sc-act">
                <CodeAction
                  state={state}
                  busy={codes.busy}
                  onReset={() => setResetting(teacher)}
                  onUnlock={() => unlock(teacher)}
                />
              </span>
            </div>
          ))}
        </section>
      ) : (
        <div className="panel">
          <EmptyState
            title="Сотрудники не найдены"
            text="Измените поиск или фильтр. Сотрудники появляются при импорте из CRM или через «Добавить сотрудника»."
          />
        </div>
      )}
      {editing !== undefined && (
        <TeacherForm
          teacher={editing ?? undefined}
          groups={workspace.groups}
          onClose={() => setEditing(undefined)}
          onSaved={saved}
          onDelete={
            editing
              ? () => {
                  setDeleting(editing);
                  setEditing(undefined);
                }
              : undefined
          }
        />
      )}
      {resetting && (
        <ConfirmDialog
          title="Сбросить код?"
          text={`${resetting.name} больше не сможет войти со старым кодом. При следующем входе сотрудник введёт имя и отчество и придумает новый код из 6 цифр.`}
          confirm="Сбросить код"
          busy={codes.busy}
          error={codes.error}
          onClose={() => setResetting(undefined)}
          onConfirm={() => reset(resetting)}
        />
      )}
      {dropping && (
        <ConfirmDialog
          title="Снять роль «Учитель»?"
          text={`${dropping.name} перестанет быть учителем. Групп, которые останутся без учителя: ${dropping.group_ids.length}. Предметы, за которые сотрудник отвечал, тоже освободятся.`}
          confirm="Снять роль"
          danger
          busy={codes.busy}
          error={codes.error}
          onClose={() => setDropping(undefined)}
          onConfirm={() => toggleRole(dropping, 'teacher', true)}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="Удалить учителя?"
          text={`${deleting.name} больше не сможет войти. Назначенные группы останутся без учителя.`}
          confirm="Удалить"
          danger
          busy={deletingBusy}
          error={deleteError}
          onClose={() => setDeleting(undefined)}
          onConfirm={() =>
            void runDelete(async () => {
              await api.teachers.delete(deleting.id);
              await Promise.all([refresh(), refreshWorkspace()]);
              setDeleting(undefined);
            })
          }
        />
      )}
      <Toast message={toast} />
    </div>
  );
}
