import { useState } from 'react';
import { ChevronDown, ChevronUp, Plus, Search, X } from 'lucide-react';
import { api } from '../../api/client';
import { useWorkspace } from '../../layouts/Workspace';
import { useAction } from '../../hooks/useAction';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { ErrorNotice } from '../../components/ErrorNotice';
import type { Student } from '../../types';

type Format = 'all' | 'ege' | 'oge';

const formats: [Format, string][] = [
  ['all', 'Все'],
  ['ege', 'ЕГЭ'],
  ['oge', 'ОГЭ'],
];

const normalize = (value: string) => value.toLowerCase().replaceAll('ё', 'е').trim().replace(/\s+/g, ' ');

export function SchoolGroups() {
  const { data, refresh } = useWorkspace();
  const action = useAction();
  const [studentQuery, setStudentQuery] = useState('');
  const [pick, setPick] = useState<Student | null>(null);
  const [removing, setRemoving] = useState<{ membershipId: number; name: string }>();
  const [note, setNote] = useState('');
  const [search, setSearch] = useState('');
  const [teacher, setTeacher] = useState('all');
  const [format, setFormat] = useState<Format>('all');
  const [open, setOpen] = useState<number | null>(null);

  const groups = data.groups.filter((g) => g.is_active);
  const studentsById = new Map(data.students.map((s) => [s.id, s]));
  const membersOf = (groupId: number) =>
    data.memberships
      .filter((m) => m.group_id === groupId && !m.ended_at)
      .flatMap((m) => {
        const student = studentsById.get(m.student_id);
        return student ? [{ student, membershipId: m.id }] : [];
      })
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

  return (
    <div className="sc-section">
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
            <span />
          </div>
          {rows.map((g) => {
            const isOpen = open === g.id;
            const members = membersOf(g.id);
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
              <div key={g.id} className={`sc-item sc-group${isOpen ? ' is-open' : ''}`}>
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
                  <span className="sc-chev">
                    {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </span>
                </button>
                {isOpen && (
                  <div className="sc-group-body">
                    <span className="sc-group-title">Ученики группы · {members.length}</span>
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
                            <button
                              type="button"
                              aria-label={`Убрать из группы: ${student.full_name}`}
                              disabled={action.busy}
                              onClick={() => setRemoving({ membershipId, name: student.full_name })}
                            >
                              <X size={15} />
                            </button>
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
            title={groups.length ? 'Ничего не найдено' : 'Группы пока не добавлены'}
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
    </div>
  );
}
