import { useState } from 'react';
import { ArrowLeft, Eye, Search } from 'lucide-react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import { useWorkspace } from '../../layouts/Workspace';
import { useAction } from '../../hooks/useAction';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { ErrorNotice } from '../../components/ErrorNotice';
import { ExamForm } from '../../components/ExamForm';
import { DataTable } from '../../components/DataTable';
import { StatusBadge } from '../../components/StatusBadge';
import { EventVariants } from '../../components/EventVariants';
import { useEventVariants } from '../../lib/useEventVariants';
import { examSubject } from '../../lib/format';
import { plural, summarize } from '../../lib/adminEvents';
import type { ExamEventCreate, Status } from '../../types';

const shortDate = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
const shortTime = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });
const slotLabel = (value: string) =>
  `${new Intl.DateTimeFormat('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' })
    .format(new Date(value))
    .replace(/\./g, '')}, ${shortTime.format(new Date(value))}`;

const longDay = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' });
const longRange = (start: string, end: string) => {
  const a = new Date(start);
  const b = new Date(end);
  if (a.toDateString() === b.toDateString()) return longDay.format(a);
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear())
    return `${a.getDate()}–${longDay.format(b)}`;
  return `${longDay.format(a)} – ${longDay.format(b)}`;
};

const normalize = (value: string | null | undefined) =>
  (value ?? '')
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[^а-яa-z0-9]+/g, ' ')
    .trim();
const sameSubject = (left: string | null, right: string) => {
  const a = normalize(left);
  const b = normalize(right);
  return !!a && !!b && (a === b || a.includes(b) || b.includes(a));
};

const attendance: [Status, string][] = [
  ['registered', 'Записан'],
  ['attended', 'Пришёл'],
  ['submitted', 'Сдал'],
  ['absent', 'Не пришёл'],
];
const editable = (status: Status) => attendance.some(([key]) => key === status);

type Tab = 'sessions' | 'people' | 'variants';

export function ExamEventDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, refresh } = useWorkspace();
  const [editing, setEditing] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [params] = useSearchParams();
  const [tab, setTab] = useState<Tab>(params.get('tab') === 'variants' ? 'variants' : 'sessions');
  const [search, setSearch] = useState('');
  const [peopleSearch, setPeopleSearch] = useState('');
  const [subject, setSubject] = useState('');
  const [school, setSchool] = useState('');
  const [slotId, setSlotId] = useState<number | null>(null);
  const closing = useAction();
  const marking = useAction();
  const openStudent = (studentId: number) =>
    navigate(`/students/${studentId}`, {
      state: { backTo: `/exam-events/${id}`, backLabel: 'К списку пробника' },
    });
  const exams = data.exams.filter((e) => e.event_id === Number(id));
  const eventVariants = useEventVariants(exams);
  if (!exams.length) return <EmptyState title="Пробник не найден" />;
  const info = summarize(exams, data.participations);
  const slots = [...info.slots].sort(
    (a, b) => a.school_name.localeCompare(b.school_name, 'ru') || a.starts_at.localeCompare(b.starts_at),
  );
  const activeSlot = slots.find((slot) => slot.id === slotId) ?? slots[0];
  const students = new Map(data.students.map((student) => [student.id, student]));
  const registrations = info.regs.flatMap((participation) => {
    const exam = exams.find((e) => e.id === participation.exam_id);
    if (!exam) return [];
    return [
      {
        participation,
        exam,
        student: students.get(participation.student_id),
        slot: exam.slots.find((slot) => slot.id === participation.slot_id),
      },
    ];
  });
  const groupOf = (studentId: number, examSubjectName: string) => {
    const groups = data.groups.filter((group) =>
      data.memberships.some(
        (membership) =>
          membership.student_id === studentId && membership.group_id === group.id && !membership.ended_at,
      ),
    );
    const group = groups.find((candidate) => sameSubject(candidate.subject, examSubjectName)) ?? groups[0];
    return group ? group.display_name || group.source_name : 'Без группы';
  };
  const sessionRows = registrations
    .filter(
      (row) =>
        row.slot?.id === activeSlot?.id &&
        (row.student?.full_name ?? '').toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) => (a.student?.full_name ?? '').localeCompare(b.student?.full_name ?? '', 'ru'));
  const peopleRows = registrations
    .filter(
      (row) =>
        (!subject || row.exam.id === Number(subject)) &&
        (!school || row.slot?.school_id === Number(school)) &&
        (row.student?.full_name ?? '').toLowerCase().includes(peopleSearch.toLowerCase()),
    )
    .sort((a, b) => (a.student?.full_name ?? '').localeCompare(b.student?.full_name ?? '', 'ru'));
  const schools = [...new Map(slots.map((slot) => [slot.school_id, slot.school_name])).entries()];

  const mark = (participationId: number, status: Status) =>
    void marking.run(async () => {
      await api.participations.updateStatus(participationId, status);
      await refresh();
    });
  const allSubmitted = () =>
    void marking.run(async () => {
      for (const row of sessionRows.filter((item) => item.participation.status === 'attended'))
        await api.participations.updateStatus(row.participation.id, 'submitted');
      await refresh();
    });
  const registrationOpen = info.state === 'open' || info.state === 'soon';
  const closeRegistration = () =>
    void closing.run(async () => {
      const payload: ExamEventCreate = {
        title: exams[0].title ?? '',
        draft: false,
        registration_open_at:
          exams[0].registration_open_at && new Date(exams[0].registration_open_at) < new Date()
            ? exams[0].registration_open_at
            : null,
        registration_close_at: new Date().toISOString(),
        schools: [...new Map(slots.map((slot) => [slot.school_id, slot])).values()].map((first) => ({
          id: first.school_id,
          name: first.school_name,
          address: first.school_address,
          slots: slots
            .filter((slot) => slot.school_id === first.school_id)
            .map((slot) => ({ id: slot.id, starts_at: slot.starts_at, capacity: slot.capacity })),
        })),
        subjects: exams.map((exam) => ({
          id: exam.id,
          format: exam.format!,
          subject: exam.subject,
          structure_data: null,
        })),
      };
      await api.examEvents.update(Number(id), payload);
      await refresh();
    });
  const exportLists = () => {
    const header = ['Ученик', 'Класс', 'Предмет', 'Школа', 'Дата', 'Время', 'Статус'];
    const lines = registrations.map((row) => [
      row.student?.full_name ?? '',
      row.student?.grade ?? '',
      row.exam.subject,
      row.slot?.school_name ?? '',
      shortDate.format(new Date(row.slot?.starts_at ?? row.exam.starts_at)),
      shortTime.format(new Date(row.slot?.starts_at ?? row.exam.starts_at)),
      row.participation.status,
    ]);
    const csv = [header, ...lines]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
      .join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${exams[0].title || 'probnik'}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const tabs: [Tab, string][] = [
    ['sessions', 'Сеансы и явка'],
    ['people', `Участники · ${registrations.length}`],
    ['variants', 'Варианты'],
  ];
  const withVariants = eventVariants.rows.filter((row) => row.variants.length).length;
  return (
    <div className="ad-page">
      <div className="ad-head ad-event-head">
        <div className="ad-event-title-row">
          <Link to="/exams" className="ad-square-back" aria-label="Назад к пробникам">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1>{exams[0].title}</h1>
            <p>
              {longRange(info.start, info.end)} ·{' '}
              {info.state === 'draft'
                ? 'черновик'
                : exams[0].registration_close_at
                  ? `запись ${registrationOpen ? 'открыта' : 'закрыта'} до ${longDay.format(new Date(exams[0].registration_close_at))}`
                  : info.state === 'open'
                    ? 'запись открыта'
                    : 'запись закрыта'}{' '}
              · {plural(exams.length, 'предмет', 'предмета', 'предметов')}
            </p>
          </div>
        </div>
        <div className="ad-head-actions">
          <Button variant="secondary" onClick={() => setEditing(true)}>
            Изменить
          </Button>
          {info.state === 'open' && (
            <Button variant="secondary" disabled={closing.busy} onClick={() => setConfirmClose(true)}>
              Закрыть запись
            </Button>
          )}
          <Button onClick={exportLists} disabled={!registrations.length}>
            Выгрузить списки
          </Button>
        </div>
      </div>
      <ErrorNotice message={closing.error} />
      <div className="ad-tabline" role="tablist" aria-label="Разделы пробника">
        {tabs.map(([key, label]) => (
          <button type="button" role="tab" key={key} aria-selected={tab === key} onClick={() => setTab(key)}>
            {label}
            {key === 'variants' && eventVariants.loaded && (
              <span className={`ad-tab-badge ${withVariants === exams.length ? 'is-done' : ''}`}>
                {withVariants} из {exams.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'sessions' && (
        <>
          {slots.length > 0 ? (
            <div className="ad-slots">
              {slots.map((slot) => {
                const full = slot.remaining <= 0;
                const ratio = slot.capacity ? slot.booked / slot.capacity : 0;
                return (
                  <button
                    type="button"
                    key={slot.id}
                    aria-pressed={activeSlot?.id === slot.id}
                    onClick={() => setSlotId(slot.id)}
                  >
                    <span className="ad-slot-top">
                      <span>{slot.school_name}</span>
                      <span className={full ? 'is-full' : ''}>
                        {full ? 'Мест нет' : `свободно ${slot.remaining}`}
                      </span>
                    </span>
                    <strong>{slotLabel(slot.starts_at)}</strong>
                    <span className="ad-bar" role="img" aria-label={`${slot.booked} из ${slot.capacity}`}>
                      <i
                        className={full ? 'is-high' : ''}
                        style={{ width: `${Math.min(ratio, 1) * 100}%` }}
                      />
                    </span>
                    <small>
                      {slot.booked} из {slot.capacity} записаны
                    </small>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="panel">
              <EmptyState title="У пробника нет сеансов" text="Добавьте школы и время через «Изменить»." />
            </div>
          )}
          {activeSlot && (
            <section className="ad-table">
              <div className="ad-attend-top">
                <div>
                  <h2>
                    Явка · {activeSlot.school_name}, {slotLabel(activeSlot.starts_at)}
                  </h2>
                  <small>Отметьте, кто пришёл и сдал работу. Потом учитель внесёт баллы.</small>
                </div>
                <div className="ad-head-actions">
                  <label className="ad-search ad-search-small">
                    <Search size={16} />
                    <input
                      aria-label="Поиск в списке"
                      placeholder="Фамилия"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                  <Button
                    variant="secondary"
                    disabled={
                      marking.busy || !sessionRows.some((row) => row.participation.status === 'attended')
                    }
                    onClick={allSubmitted}
                  >
                    Все пришедшие сдали
                  </Button>
                </div>
              </div>
              <ErrorNotice message={marking.error} />
              <div className="ad-attend-row ad-table-head">
                <span>УЧЕНИК</span>
                <span>ПРЕДМЕТ</span>
                <span>ГРУППА</span>
                <span className="ad-right">ЯВКА</span>
              </div>
              {sessionRows.length === 0 && <div className="ad-none">На этот сеанс никто не записан</div>}
              {sessionRows.map((row) => (
                <div className="ad-attend-row" key={row.participation.id}>
                  <span className="ad-person">
                    <button type="button" onClick={() => row.student && openStudent(row.student.id)}>
                      {row.student?.full_name ?? '—'}
                    </button>
                    {row.student?.grade != null && <small>{row.student.grade} класс</small>}
                  </span>
                  <span>{row.exam.subject}</span>
                  <span className="ad-muted">
                    {row.student ? groupOf(row.student.id, row.exam.subject) : '—'}
                  </span>
                  <span
                    className="ad-radios ad-right"
                    role="radiogroup"
                    aria-label={`Явка: ${row.student?.full_name}`}
                  >
                    {editable(row.participation.status) ? (
                      attendance.map(([key, label]) => (
                        <button
                          type="button"
                          role="radio"
                          key={key}
                          className={`is-${key}`}
                          aria-checked={row.participation.status === key}
                          disabled={marking.busy}
                          onClick={() => row.participation.status !== key && mark(row.participation.id, key)}
                        >
                          {label}
                        </button>
                      ))
                    ) : (
                      <StatusBadge status={row.participation.status} />
                    )}
                  </span>
                </div>
              ))}
            </section>
          )}
        </>
      )}

      {tab === 'people' && (
        <>
          <div className="ad-filters">
            <label className="ad-search">
              <Search size={16} />
              <input
                aria-label="Поиск ученика"
                placeholder="Найти ученика"
                value={peopleSearch}
                onChange={(e) => setPeopleSearch(e.target.value)}
              />
            </label>
            <select aria-label="Школа" value={school} onChange={(e) => setSchool(e.target.value)}>
              <option value="">Все школы</option>
              {schools.map(([schoolId, name]) => (
                <option key={schoolId} value={schoolId}>
                  {name}
                </option>
              ))}
            </select>
            <select aria-label="Предмет" value={subject} onChange={(e) => setSubject(e.target.value)}>
              <option value="">Все предметы</option>
              {exams.map((exam) => (
                <option key={exam.id} value={exam.id}>
                  {examSubject(exam)}
                </option>
              ))}
            </select>
          </div>
          <div className="registrations-table">
            <DataTable
              rows={peopleRows}
              rowKey={(row) => row.participation.id}
              label="Записавшиеся ученики"
              empty="Пока никто не записался"
              onRowClick={(row) => row.student && openStudent(row.student.id)}
              columns={[
                {
                  title: 'Ученик',
                  render: (row) => (
                    <div>
                      <strong>{row.student?.full_name ?? '—'}</strong>
                      {row.student?.grade != null && <small>{row.student.grade} класс</small>}
                    </div>
                  ),
                },
                { title: 'Предмет', render: (row) => examSubject(row.exam) },
                { title: 'Школа', render: (row) => row.slot?.school_name ?? '—' },
                {
                  title: 'Дата',
                  render: (row) => shortDate.format(new Date(row.slot?.starts_at ?? row.exam.starts_at)),
                },
                {
                  title: 'Время',
                  render: (row) => shortTime.format(new Date(row.slot?.starts_at ?? row.exam.starts_at)),
                },
                { title: 'Статус', render: (row) => <StatusBadge status={row.participation.status} /> },
                {
                  title: 'Действие',
                  render: (row) =>
                    row.student && (
                      <button
                        type="button"
                        className="row-action"
                        aria-label={`Открыть ученика ${row.student.full_name}`}
                        title="Открыть ученика"
                        onClick={() => openStudent(row.student!.id)}
                      >
                        <Eye size={17} />
                      </button>
                    ),
                },
              ]}
            />
          </div>
        </>
      )}

      {tab === 'variants' && (
        <EventVariants
          rows={eventVariants.rows}
          loaded={eventVariants.loaded}
          error={eventVariants.error}
          onChange={eventVariants.reload}
        />
      )}

      {editing && (
        <ExamForm
          exams={exams}
          onClose={() => setEditing(false)}
          onCreated={async () => {
            await refresh();
            setEditing(false);
          }}
        />
      )}
      {confirmClose && (
        <ConfirmDialog
          title="Закрыть запись?"
          text="Ученики больше не смогут записываться на этот пробник. Уже записанные останутся."
          confirm="Закрыть запись"
          busy={closing.busy}
          error={closing.error}
          onClose={() => setConfirmClose(false)}
          onConfirm={() => {
            setConfirmClose(false);
            closeRegistration();
          }}
        />
      )}
    </div>
  );
}
