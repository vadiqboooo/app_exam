import { useState, type FormEvent } from 'react';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { api } from '../../api/client';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DataTable } from '../../components/DataTable';
import { ErrorNotice } from '../../components/ErrorNotice';
import { FilterBar } from '../../components/FilterBar';
import { Modal } from '../../components/Modal';
import { PageHeader } from '../../components/PageHeader';
import { useAction } from '../../hooks/useAction';
import { useLoad } from '../../hooks/useLoad';
import { useWorkspace } from '../../layouts/Workspace';
import type { Group, Teacher, TeacherWrite } from '../../types';

const loadTeachers = () => api.teachers.list();

function TeacherForm({
  teacher,
  groups,
  onClose,
  onSaved,
}: {
  teacher?: Teacher;
  groups: Group[];
  onClose: () => void;
  onSaved: () => Promise<void>;
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
      title={teacher ? 'Редактировать учителя' : 'Добавить учителя'}
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

export function Teachers() {
  const { data, error, loading, refresh } = useLoad(loadTeachers);
  const { data: workspace, refresh: refreshWorkspace } = useWorkspace();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Teacher | null | undefined>();
  const [deleting, setDeleting] = useState<Teacher>();
  const { busy: deletingBusy, error: deleteError, run: runDelete } = useAction();
  const teachers = (data ?? []).filter((teacher) =>
    teacher.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const groupNames = (teacher: Teacher) =>
    teacher.group_ids
      .map((id) => workspace.groups.find((group) => group.id === id)?.source_name)
      .filter(Boolean)
      .join(', ');
  const saved = async () => {
    await Promise.all([refresh(), refreshWorkspace()]);
    setEditing(undefined);
  };
  return (
    <div className="stack page-stack">
      <PageHeader
        title="Учителя"
        subtitle="Управляйте входом учителей и назначайте им учебные группы."
        action={
          <Button icon={<Plus size={17} />} onClick={() => setEditing(null)}>
            Добавить учителя
          </Button>
        }
      />
      <ErrorNotice message={error} />
      <FilterBar>
        <div className="search-input">
          <Search size={17} />
          <input
            aria-label="Поиск учителя"
            placeholder="Найти по имени или отчеству"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <span className="filter-count">Всего: {teachers.length}</span>
      </FilterBar>
      {loading && !data ? (
        <div className="loading" role="status">Загружаем учителей…</div>
      ) : (
        <DataTable
          rows={teachers}
          rowKey={(teacher) => teacher.id}
          label="Учителя"
          empty="Учителя пока не добавлены"
          columns={[
            { title: 'Учитель', render: (teacher) => <strong>{teacher.name}</strong> },
            {
              title: 'Группы',
              render: (teacher) => groupNames(teacher) || <span className="muted">Не назначены</span>,
            },
            { title: 'Количество групп', render: (teacher) => teacher.group_ids.length },
            {
              title: 'Действия',
              render: (teacher) => (
                <div className="inline table-actions">
                  <Button
                    variant="ghost"
                    aria-label={`Редактировать ${teacher.name}`}
                    title="Редактировать"
                    onClick={() => setEditing(teacher)}
                  >
                    <Pencil size={16} />
                  </Button>
                  <Button
                    variant="ghost"
                    aria-label={`Удалить ${teacher.name}`}
                    title="Удалить"
                    onClick={() => setDeleting(teacher)}
                  >
                    <Trash2 size={16} />
                  </Button>
                </div>
              ),
            },
          ]}
        />
      )}
      {editing !== undefined && (
        <TeacherForm
          teacher={editing ?? undefined}
          groups={workspace.groups}
          onClose={() => setEditing(undefined)}
          onSaved={saved}
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
    </div>
  );
}
