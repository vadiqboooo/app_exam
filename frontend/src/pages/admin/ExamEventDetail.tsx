import { useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Eye, Pencil, Search, Settings, Trash2, Users } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { useWorkspace } from '../../layouts/Workspace';
import { useTopbarSlot } from '../../layouts/AppLayout';
import { useAction } from '../../hooks/useAction';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { ExamCard } from '../../components/ExamCard';
import { ExamForm } from '../../components/ExamForm';
import { DataTable } from '../../components/DataTable';
import { FilterBar } from '../../components/FilterBar';
import { StatusBadge } from '../../components/StatusBadge';
import { date, examSubject } from '../../lib/format';

const shortDate = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
const dayKey = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
const dayTitle = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', weekday: 'short' });
const shortTime = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });

export function ExamEventDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, refresh } = useWorkspace();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tab, setTab] = useState<'registered' | 'settings'>('registered');
  const [search, setSearch] = useState('');
  const [subject, setSubject] = useState('');
  const [school, setSchool] = useState('');
  const [slotId, setSlotId] = useState<number | null>(null);
  const deletion = useAction();
  const openStudent = (studentId: number) =>
    navigate(`/students/${studentId}`, {
      state: { backTo: `/exam-events/${id}`, backLabel: 'К списку пробника' },
    });
  const topbarSlot = useTopbarSlot();
  const exams = data.exams.filter((e) => e.event_id === Number(id));
  if (!exams.length) return <EmptyState title="Пробник не найден" />;
  const slots = [...new Map(exams.flatMap((exam) => exam.slots).map((slot) => [slot.id, slot])).values()];
  const students = new Map(data.students.map((student) => [student.id, student]));
  const registrations = data.participations
    .filter((p) => p.status !== 'cancelled')
    .flatMap((participation) => {
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
  const rows = registrations
    .filter(
      (row) =>
        (!subject || row.exam.id === Number(subject)) &&
        (!school || row.slot?.school_id === Number(school)) &&
        (slotId === null || row.slot?.id === slotId) &&
        (row.student?.full_name ?? '').toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) => (a.student?.full_name ?? '').localeCompare(b.student?.full_name ?? '', 'ru'));
  const schools = [...new Map(slots.map((slot) => [slot.school_id, slot.school_name])).entries()];
  const days = [
    ...slots
      .filter((slot) => !school || slot.school_id === Number(school))
      .sort(
        (a, b) => a.starts_at.localeCompare(b.starts_at) || a.school_name.localeCompare(b.school_name, 'ru'),
      )
      .reduce((map, slot) => {
        const key = dayKey.format(new Date(slot.starts_at));
        map.set(key, [...(map.get(key) ?? []), slot]);
        return map;
      }, new Map<string, typeof slots>())
      .values(),
  ];
  return (
    <div className="stack page-stack">
      {topbarSlot &&
        createPortal(
          <div className="event-header">
            <div className="event-header-title">
              <Link className="event-back" to="/exams" aria-label="Все пробники" title="Все пробники">
                <ArrowLeft size={20} />
              </Link>
              <h1>{exams[0].title}</h1>
            </div>
            <Button
              variant="secondary"
              icon={tab === 'settings' ? <Users size={16} /> : <Settings size={16} />}
              onClick={() => setTab(tab === 'settings' ? 'registered' : 'settings')}
            >
              {tab === 'settings' ? `Записавшиеся (${registrations.length})` : 'Настройки'}
            </Button>
          </div>,
          topbarSlot,
        )}
      {tab === 'registered' ? (
        <>
          <FilterBar>
            <div className="search-input">
              <Search size={17} />
              <input
                aria-label="Поиск ученика"
                placeholder="Найти ученика"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              aria-label="Школа"
              value={school}
              onChange={(e) => {
                setSchool(e.target.value);
                setSlotId(null);
              }}
            >
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
          </FilterBar>
          {days.length > 0 && (
            <div className="slot-days" aria-label="Загрузка по дням и времени">
              {days.map((daySlots) => (
                <section className="slot-day" key={daySlots[0].starts_at.slice(0, 10)}>
                  <h3>{dayTitle.format(new Date(daySlots[0].starts_at))}</h3>
                  {daySlots.map((slot) => {
                    const ratio = slot.capacity ? slot.booked / slot.capacity : 0;
                    return (
                      <button
                        type="button"
                        key={slot.id}
                        className={`slot-row ${slotId === slot.id ? 'active' : ''}`}
                        aria-pressed={slotId === slot.id}
                        onClick={() => setSlotId(slotId === slot.id ? null : slot.id)}
                      >
                        <span className="slot-row-head">
                          <span>
                            {shortTime.format(new Date(slot.starts_at))}
                            {!school && schools.length > 1 && <small>{slot.school_name}</small>}
                          </span>
                          <strong>
                            {slot.booked}
                            <small>/{slot.capacity}</small>
                          </strong>
                        </span>
                        <span className="slot-bar">
                          <span
                            className={ratio >= 1 ? 'full' : ratio >= 0.8 ? 'high' : ''}
                            style={{ width: `${Math.min(ratio, 1) * 100}%` }}
                          />
                        </span>
                      </button>
                    );
                  })}
                </section>
              ))}
            </div>
          )}
          <div className="registrations-table">
            <DataTable
              rows={rows}
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
      ) : (
        <>
          <div className="inline">
            <Button variant="secondary" icon={<Pencil size={16} />} onClick={() => setEditing(true)}>
              Редактировать
            </Button>
            <Button variant="danger" icon={<Trash2 size={16} />} onClick={() => setConfirmDelete(true)}>
              Удалить
            </Button>
          </div>
          <h2>Школы и расписание</h2>
          <DataTable
            rows={slots}
            rowKey={(s) => s.id}
            label="Расписание пробника"
            columns={[
              {
                title: 'Школа',
                render: (s) => (
                  <div>
                    <strong>{s.school_name}</strong>
                    <small>{s.school_address}</small>
                  </div>
                ),
              },
              { title: 'Дата и время', render: (s) => date(s.starts_at, true) },
              { title: 'Всего мест', render: (s) => s.capacity },
              { title: 'Записано', render: (s) => s.booked },
              { title: 'Свободно', render: (s) => s.remaining },
            ]}
          />
          <h2>Предметы</h2>
          <div className="exam-grid">
            {exams.map((exam) => (
              <ExamCard key={exam.id} exam={exam} participations={data.participations} />
            ))}
          </div>
        </>
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
      {confirmDelete && (
        <ConfirmDialog
          title="Удалить пробник?"
          text="Пробник, все записи учеников и результаты по нему будут удалены без возможности восстановления."
          confirm="Удалить пробник"
          danger
          busy={deletion.busy}
          error={deletion.error}
          onClose={() => setConfirmDelete(false)}
          onConfirm={() =>
            void deletion.run(async () => {
              await api.examEvents.delete(Number(id));
              await refresh();
              navigate('/exams');
            })
          }
        />
      )}
    </div>
  );
}
