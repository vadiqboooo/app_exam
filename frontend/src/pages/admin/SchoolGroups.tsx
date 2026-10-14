import { useState, type FormEvent } from 'react';
import { ChevronDown, ChevronUp, Pencil, Plus, Search, X } from 'lucide-react';
import { api } from '../../api/client';
import { useWorkspace } from '../../layouts/Workspace';
import { useAction } from '../../hooks/useAction';
import { useLoad } from '../../hooks/useLoad';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { ErrorNotice } from '../../components/ErrorNotice';
import { Modal } from '../../components/Modal';
import type { Group, GroupWrite, Student, Teacher } from '../../types';

type Format = 'all' | 'ege' | 'oge';
type StatusFilter = 'active' | 'archived' | 'all';

const formats: [Format, string][] = [
  ['all', 'Все'],
  ['ege', 'ЕГЭ'],
  ['oge', 'ОГЭ'],
];

const normalize = (value: string) => value.toLowerCase().replaceAll('ё', 'е').trim().replace(/\s+/g, ' ');
const loadTeachers = () => api.teachers.list();

function GroupForm({
  group,
  teachers,
  onClose,
  onSaved,
}: {
  group: Group;
  teachers: Teacher[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [active, setActive] = useState(group.is_active);
  const { busy, error, run } = useAction();
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const teacherId = String(form.get('teacher_id') ?? '');
    const format = String(form.get('exam_format') ?? '');
    const data: GroupWrite = {
      source_name: String(form.get('source_name') ?? '').trim(),
      subject: String(form.get('subject') ?? '').trim() || null,
      exam_format: format === 'ege' || format === 'oge' ? format : null,
      teacher_id: teacherId ? Number(teacherId) : null,
      is_active: active,
    };
    void run(async () => {
      await api.groups.update(group.id, data);
      await onSaved();
    });
  };
  return (
    <Modal title="Редактировать группу" onClose={onClose} busy={busy}>
      <form onSubmit={submit}>
        <div className="modal-body stack">
          <ErrorNotice message={error} />
          <fieldset className="stack" disabled={busy}>
            <label>
              Название группы
              <input name="source_name" defaultValue={group.source_name} required />
            </label>
            <div className="form-grid">
              <label>
                Предмет
                <input name="subject" defaultValue={group.subject ?? ''} placeholder="Физика" />
              </label>
              <label>
                Тип экзамена
                <select name="exam_format" defaultValue={group.exam_format ?? ''}>
                  <option value="">Не указан</option>
                  <option value="ege">ЕГЭ</option>
                  <option value="oge">ОГЭ</option>
                </select>
              </label>
            </div>
            <label>
              Учитель
              <select name="teacher_id" defaultValue={group.teacher_id ?? ''}>
                <option value="">Не назначен</option>
                {teachers.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="sj-active">
              <button
                type="button"
                role="switch"
                aria-checked={active}
                aria-label="Активная группа"
                className="sj-switch"
                onClick={() => setActive((value) => !value)}
              >
                <span />
              </button>
              <span className={active ? 'is-on' : undefined}>
                {active ? 'Активная группа' : 'Неактивная — будет скрыта от учителя'}
              </span>
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

export function SchoolGroups() {
  const { data, refresh } = useWorkspace();
  const { data: staff, error: staffError } = useLoad(loadTeachers);
  const action = useAction();
  const [studentQuery, setStudentQuery] = useState('');
  const [pick, setPick] = useState<Student | null>(null);
  const [removing, setRemoving] = useState<{ membershipId: number; name: string }>();
  const [note, setNote] = useState('');
  const [search, setSearch] = useState('');
  const [teacher, setTeacher] = useState('all');
  const [format, setFormat] = useState<Format>('all');
  const [status, setStatus] = useState<StatusFilter>('active');
  const [open, setOpen] = useState<number | null>(null);
  const [editing, setEditing] = useState<Group>();

  const activeCount = data.groups.filter((group) => group.is_active).length;
  const groups = data.groups.filter(
    (group) => status === 'all' || (status === 'active' ? group.is_active : !group.is_active),
  );
  const studentsById = new Map(data.students.map((s) => [s.id, s]));
  const membersOf = (groupId: number, active: boolean) =>
    data.memberships
      .filter((m) => m.group_id === groupId && (active ? !m.ended_at : true))
      .flatMap((m) => {
        const student = studentsById.get(m.student_id);
        return student ? [{ student, membershipId: m.id }] : [];
      })
      .filter(
        (item, index, items) =>
          items.findIndex((candidate) => candidate.student.id === item.student.id) === index,
      )
      .sort((a, b) => a.student.full_name.localeCompare(b.student.full_name, 'ru'));
  const clearPick = () => {
    setStudentQuery('');
    setPick(null);
  };
  const toggle = (id: number | null) => {
    setOpen(id);
    clearPick();
    setNote('');
    action.clearError();
  };
  const add = (groupId: number) =>
    void action.run(async () => {
      if (!pick) return;
      await api.memberships.add(pick.id, groupId);
      await refresh();
      clearPick();
      setNote(`${pick.full_name} добавлен(а) в группу.`);
    });
  const remove = (membershipId: number, name: string) =>
    void action.run(async () => {
      await api.memberships.remove(membershipId);
      await refresh();
      setRemoving(undefined);
      setNote(`${name} убран(а) из группы. Результаты прошлых пробников сохранены.`);
    });

  const teachers = [
    ...new Set(groups.map((g) => g.teacher_name).filter((t): t is string => Boolean(t))),
  ].sort((a, b) => a.localeCompare(b, 'ru'));
  const query = search.trim().toLowerCase();
  const rows = groups.filter(
    (g) =>
      (teacher === 'all' || g.teacher_name === teacher) &&
      (format === 'all' || g.exam_format === format) &&
      (!query || `${g.source_name} ${g.subject ?? ''}`.toLowerCase().includes(query)),
  );
  const statusTabs: [StatusFilter, string, number][] = [
    ['active', 'Активные', activeCount],
    ['archived', 'Архив', data.groups.length - activeCount],
    ['all', 'Все', data.groups.length],
  ];

  return (
    <div className="sc-section">
      <ErrorNotice message={staffError} />
      <div className="sj-pills" role="group" aria-label="Статус группы">
        {statusTabs.map(([key, label, count]) => (
          <button
            type="button"
            key={key}
            aria-pressed={status === key}
            onClick={() => {
              setStatus(key);
              setTeacher('all');
              setOpen(null);
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
            aria-label="Поиск группы"
            placeholder="Название группы или предмет"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label className="sc-select">
          Учитель
          <select aria-label="Фильтр по учителю" value={teacher} onChange={(e) => setTeacher(e.target.value)}>
            <option value="all">Все учителя</option>
            {teachers.map((name) => (
              <option key={name} value={name}>
                {name} · {groups.filter((g) => g.teacher_name === name).length}
              </option>
            ))}
          </select>
        </label>
        <div className="ad-tabs" role="group" aria-label="Тип группы">
          {formats.map(([key, label]) => (
            <button type="button" key={key} aria-pressed={format === key} onClick={() => setFormat(key)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {rows.length ? (
        <section className="ad-table" aria-label="Группы">
          <div className="sc-row sc-row-groups ad-table-head">
            <span>ГРУППА</span>
            <span>ПРЕДМЕТ</span>
            <span>ТИП</span>
            <span>УЧИТЕЛЬ</span>
            <span>РАСПИСАНИЕ</span>
            <span>УЧЕНИКОВ</span>
            <span>СТАТУС</span>
            <span />
          </div>
          {rows.map((g) => {
            const isOpen = open === g.id;
            const members = membersOf(g.id, g.is_active);
            const inGroup = new Set(members.map((m) => m.student.id));
            const words = normalize(studentQuery).split(' ').filter(Boolean);
            const suggestions =
              words.length && !pick
                ? data.students
                    .filter((s) => s.is_active && !inGroup.has(s.id))
                    .filter((s) => words.every((w) => normalize(s.full_name).includes(w)))
                    .sort((a, b) => a.full_name.localeCompare(b.full_name, 'ru'))
                : [];
            return (
              <div
                key={g.id}
                className={`sc-item sc-group${isOpen ? ' is-open' : ''}${g.is_active ? '' : ' is-archived'}`}
              >
                <button
                  type="button"
                  className="sc-row sc-row-groups sc-group-toggle"
                  aria-expanded={isOpen}
                  onClick={() => toggle(isOpen ? null : g.id)}
                >
                  <strong>{g.source_name}</strong>
                  <span>{g.subject || '—'}</span>
                  <span>
                    {g.exam_format ? (
                      <span className="sc-format">{g.exam_format === 'ege' ? 'ЕГЭ' : 'ОГЭ'}</span>
                    ) : (
                      '—'
                    )}
                  </span>
                  <span className={g.teacher_name ? undefined : 'sc-unassigned'}>
                    {g.teacher_name || 'Не назначен'}
                  </span>
                  <span>{g.schedule || '—'}</span>
                  <strong>{members.length}</strong>
                  <span>
                    <span className={`sc-student-state ${g.is_active ? 'is-active' : 'is-archived'}`}>
                      {g.is_active ? 'Активна' : 'В архиве'}
                    </span>
                  </span>
                  <span className="sc-chev">
                    {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </span>
                </button>
                {isOpen && (
                  <div className="sc-group-body">
                    <div className="sc-group-edit-row">
                      <span className="sc-group-title">
                        {g.is_active ? 'Ученики группы' : 'Ученики за всё время'} · {members.length}
                      </span>
                      <Button variant="secondary" icon={<Pencil size={15} />} onClick={() => setEditing(g)}>
                        Редактировать
                      </Button>
                    </div>
                    {g.is_active && (
                      <div className="sc-add">
                        <div className="sc-find">
                          <label>
                            Добавить ученика
                            <input
                              placeholder="Введите фамилию или имя"
                              autoComplete="off"
                              value={studentQuery}
                              onChange={(event) => {
                                setStudentQuery(event.target.value);
                                setPick(null);
                              }}
                            />
                          </label>
                          {words.length > 0 && !pick && (
                            <ul className="sc-suggest" aria-label="Найденные ученики">
                              {suggestions.slice(0, 8).map((s) => (
                                <li key={s.id}>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setPick(s);
                                      setStudentQuery(s.full_name);
                                    }}
                                  >
                                    <strong>{s.full_name}</strong>
                                    <small>{s.grade ? `${s.grade} класс` : 'Класс не указан'}</small>
                                  </button>
                                </li>
                              ))}
                              {!suggestions.length && <li className="sc-suggest-none">Никого не нашли</li>}
                            </ul>
                          )}
                        </div>
                        <button
                          type="button"
                          className="sc-add-btn"
                          disabled={!pick || action.busy}
                          onClick={() => add(g.id)}
                        >
                          <Plus size={16} /> Добавить в группу
                        </button>
                      </div>
                    )}
                    {!removing && <ErrorNotice message={action.error} />}
                    {note && (
                      <div role="status" className="sc-note">
                        {note}
                      </div>
                    )}
                    {members.length ? (
                      <div className="sc-members">
                        {members.map(({ student, membershipId }) => (
                          <div key={membershipId}>
                            <span>
                              <strong>{student.full_name}</strong>
                              <small>{student.grade ? `${student.grade} класс` : 'Класс не указан'}</small>
                            </span>
                            {g.is_active && (
                              <button
                                type="button"
                                aria-label={`Убрать из группы: ${student.full_name}`}
                                disabled={action.busy}
                                onClick={() => setRemoving({ membershipId, name: student.full_name })}
                              >
                                <X size={15} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="ad-none">В группе пока нет учеников</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </section>
      ) : (
        <div className="panel">
          <EmptyState
            title={
              status === 'archived'
                ? 'В архиве нет групп'
                : groups.length
                  ? 'Ничего не найдено'
                  : 'Группы пока не добавлены'
            }
            text={
              groups.length
                ? 'Измените поиск или фильтры.'
                : 'После импорта CRM здесь появятся учебные группы.'
            }
          />
        </div>
      )}
      {removing && (
        <ConfirmDialog
          title="Убрать ученика из группы?"
          text={`${removing.name} перестанет числиться в этой группе. Результаты прошлых пробников сохранятся.`}
          confirm="Убрать"
          danger
          busy={action.busy}
          error={action.error}
          onClose={() => {
            setRemoving(undefined);
            action.clearError();
          }}
          onConfirm={() => remove(removing.membershipId, removing.name)}
        />
      )}
      {editing && (
        <GroupForm
          group={editing}
          teachers={(staff ?? []).filter(
            (item) => item.is_active && item.roles.includes('teacher'),
          )}
          onClose={() => setEditing(undefined)}
          onSaved={async () => {
            await refresh();
            setEditing(undefined);
            setOpen(null);
          }}
        />
      )}
    </div>
  );
}
