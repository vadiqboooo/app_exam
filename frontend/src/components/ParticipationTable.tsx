import { useState } from 'react';
import { Search } from 'lucide-react';
import { useWorkspace } from '../layouts/Workspace';
import { api } from '../api/client';
import type { Exam, Participation, Status, Student } from '../types';
import { date, examDate, examSubject, examTitle, score, studentGroups } from '../lib/format';
import { useAction } from '../hooks/useAction';
import { DataTable } from './DataTable';
import { FilterBar } from './FilterBar';
import { StatusBadge, statusLabels } from './StatusBadge';
import { Button } from './Button';
import { ErrorNotice } from './ErrorNotice';
import { RegisterStudent } from './RegisterStudent';

const next: Record<Status, Status[]> = {
  registered: ['attended', 'absent', 'cancelled'],
  attended: ['submitted'],
  submitted: ['checked'],
  checked: ['published'],
  published: [],
  absent: ['registered'],
  cancelled: ['registered'],
};
interface Row {
  student: Student;
  exam: Exam;
  item?: Participation;
}
export function ParticipationTable({
  examId,
  studentId,
  groupId,
  roster = false,
}: {
  examId?: number;
  studentId?: number;
  groupId?: number;
  roster?: boolean;
}) {
  const { data, refresh, openResult } = useWorkspace();
  const [selectedExam, setSelectedExam] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [group, setGroup] = useState('');
  const [subject, setSubject] = useState('');
  const [day, setDay] = useState('');
  const [registered, setRegistered] = useState('');
  const [registering, setRegistering] = useState<Row>();
  const { busy, error, run } = useAction();
  const currentExam =
    examId ?? (selectedExam ? Number(selectedExam) : roster ? data.exams.at(-1)?.id : undefined);
  const selectedGroup = groupId ?? (group ? Number(group) : undefined);
  const students = data.students.filter(
    (s) =>
      (!studentId || s.id === studentId) &&
      (!selectedGroup ||
        data.memberships.some((m) => m.student_id === s.id && m.group_id === selectedGroup && !m.ended_at)),
  );
  let rows: Row[];
  if (roster && currentExam) {
    const exam = data.exams.find((e) => e.id === currentExam)!;
    rows = students
      .filter((s) => s.is_active)
      .map((student) => ({
        student,
        exam,
        item: data.participations.find((p) => p.exam_id === currentExam && p.student_id === student.id),
      }));
  } else {
    rows = data.participations
      .filter((p) => !currentExam || p.exam_id === currentExam)
      .flatMap((item) => {
        const student = students.find((s) => s.id === item.student_id),
          exam = data.exams.find((e) => e.id === item.exam_id);
        return student && exam ? [{ student, exam, item }] : [];
      });
  }
  rows = rows.filter(
    (r) =>
      r.student.full_name.toLowerCase().includes(search.toLowerCase()) &&
      (!status || r.item?.status === status) &&
      (!subject || r.exam.subject === subject) &&
      (!day || new Date(examDate(r.exam, r.item?.slot_id)).toLocaleDateString('sv-SE') === day) &&
      (!registered ||
        (registered === 'yes'
          ? r.item && r.item.status !== 'cancelled'
          : !r.item || r.item.status === 'cancelled')),
  );
  const update = (item: Participation, target: Status) => {
    if (target === 'published') {
      openResult(item.id);
      return;
    }
    void run(async () => {
      await api.participations.updateStatus(item.id, target);
      await refresh();
    });
  };
  return (
    <div className="stack">
      <ErrorNotice message={error} />
      <FilterBar>
        <div className="search-input">
          <Search size={17} />
          <input
            aria-label="Поиск по ФИО"
            placeholder="Поиск по ФИО"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {!examId && (
          <select
            aria-label="Пробник"
            value={currentExam ?? ''}
            onChange={(e) => setSelectedExam(e.target.value)}
          >
            {!roster && <option value="">Все пробники</option>}
            {data.exams.map((e) => (
              <option key={e.id} value={e.id}>
                {examTitle(e)} · {examSubject(e)} · {date(e.starts_at)}
              </option>
            ))}
          </select>
        )}
        {!groupId && (
          <select aria-label="Группа" value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="">Все группы</option>
            {data.groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.source_name}
              </option>
            ))}
          </select>
        )}
        <select aria-label="Статус участия" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Все статусы</option>
          {Object.entries(statusLabels).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        {roster && (
          <select aria-label="Запись" value={registered} onChange={(e) => setRegistered(e.target.value)}>
            <option value="">Все ученики</option>
            <option value="yes">Записаны</option>
            <option value="no">Не записаны</option>
          </select>
        )}
        {!examId && !roster && (
          <>
            <select aria-label="Предмет" value={subject} onChange={(e) => setSubject(e.target.value)}>
              <option value="">Все предметы</option>
              {[...new Set(data.exams.map((e) => e.subject))].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <input
              type="date"
              aria-label="Дата экзамена"
              value={day}
              onChange={(e) => setDay(e.target.value)}
            />
          </>
        )}
      </FilterBar>
      <DataTable
        rows={rows}
        rowKey={(r) => `${r.student.id}-${r.exam.id}`}
        label="Участники экзаменов"
        empty={roster ? 'Нет учеников для выбранных фильтров' : 'Участников пока нет'}
        columns={[
          {
            title: 'Ученик',
            render: (r) => (
              <div className="cell-person">
                <span className="avatar">{r.student.full_name[0]}</span>
                <div>
                  <strong>{r.student.full_name}</strong>
                  <small>{r.student.grade ? `${r.student.grade} класс` : 'Класс не указан'}</small>
                </div>
              </div>
            ),
          },
          {
            title: 'Группа',
            render: (r) => (
              <span className="group-names">
                {studentGroups(r.student.id, data.memberships, data.groups)
                  .map((g) => g.source_name)
                  .join(', ') || '—'}
              </span>
            ),
          },
          {
            title: 'Экзамен',
            render: (r) => (
              <div>
                <strong>{examSubject(r.exam)}</strong>
                <small>
                  {examTitle(r.exam)} · {date(examDate(r.exam, r.item?.slot_id), true)}
                </small>
                <small>{r.exam.slots.find((s) => s.id === r.item?.slot_id)?.school_name}</small>
              </div>
            ),
          },
          {
            title: 'Статус',
            render: (r) =>
              r.item ? (
                <div className="status-control">
                  <StatusBadge status={r.item.status} />
                  {next[r.item.status].length > 0 && (
                    <select
                      aria-label={`Изменить статус ${r.student.full_name}`}
                      value=""
                      disabled={busy}
                      onChange={(e) => update(r.item!, e.target.value as Status)}
                    >
                      <option value="" disabled>
                        Изменить статус
                      </option>
                      {next[r.item.status].map((s) => (
                        <option key={s} value={s} disabled={s === 'checked' && r.item!.primary_score == null}>
                          {statusLabels[s]}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              ) : (
                <span className="badge badge-cancelled">Не записан</span>
              ),
          },
          {
            title: 'Результат',
            render: (r) =>
              r.item && ['submitted', 'checked', 'published'].includes(r.item.status) ? (
                <Button variant="ghost" onClick={() => openResult(r.item!.id)}>
                  {r.item.primary_score == null
                    ? 'Внести результат'
                    : `${r.item.status === 'published' ? 'Смотреть' : 'Открыть'} · ${score(r.item.test_score ?? r.item.primary_score)}`}
                </Button>
              ) : !r.item && roster ? (
                <Button variant="secondary" disabled={busy} onClick={() => setRegistering(r)}>
                  Записать
                </Button>
              ) : (
                <span className="muted">—</span>
              ),
          },
        ]}
      />
      {registering && (
        <RegisterStudent
          exam={registering.exam}
          students={[registering.student]}
          onClose={() => setRegistering(undefined)}
          onRegistered={refresh}
        />
      )}
    </div>
  );
}
