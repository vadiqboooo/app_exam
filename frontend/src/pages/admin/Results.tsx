import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { api } from '../../api/client';
import { useWorkspace } from '../../layouts/Workspace';
import { useAction } from '../../hooks/useAction';
import { Button } from '../../components/Button';
import { Toast } from '../../components/CodeCell';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { statusLabels } from '../../components/StatusBadge';
import { groupExams, score, studentGroups } from '../../lib/format';
import { plural, shortDay } from '../../lib/adminEvents';

const worked = ['attended', 'submitted', 'checked', 'published'];

export function Results() {
  const { data, refresh, openResult } = useWorkspace();
  const publishing = useAction();
  const [confirming, setConfirming] = useState(false);
  const [toast, setToast] = useState('');
  const [subject, setSubject] = useState('');
  const [status, setStatus] = useState('');
  const [off, setOff] = useState<Set<number>>(new Set());
  const [picked, setPicked] = useState<string>();

  const events = groupExams(data.exams)
    .map((exams) => ({ exams, start: exams.map((e) => e.starts_at).sort()[0] }))
    .sort((a, b) => b.start.localeCompare(a.start));
  const eventOf = new Map(data.exams.map((e) => [e.id, events.findIndex((ev) => ev.exams.includes(e))]));
  const live = data.participations.filter((p) => p.status !== 'cancelled');
  const latest = events.findIndex((_, i) => live.some((p) => eventOf.get(p.exam_id) === i));
  const event = picked ?? (latest >= 0 ? String(latest) : 'all');
  const eventTitle = (i: number) => events[i].exams[0].title || 'Пробный экзамен';
  const eventLabel = (i: number) => `${eventTitle(i)} · ${shortDay(events[i].start)}`;

  const studentsById = new Map(data.students.map((s) => [s.id, s]));
  const examsById = new Map(data.exams.map((e) => [e.id, e]));
  const inEvent = live.filter((p) => event === 'all' || eventOf.get(p.exam_id) === Number(event));
  const subjects = [
    ...new Set(inEvent.map((p) => examsById.get(p.exam_id)?.subject).filter((s): s is string => !!s)),
  ];
  const rows = inEvent.flatMap((item) => {
    const student = studentsById.get(item.student_id);
    const exam = examsById.get(item.exam_id);
    if (!student || !exam) return [];
    if (subject && exam.subject !== subject) return [];
    if (status && item.status !== status) return [];
    return [{ item, student, exam }];
  });
  rows.sort((a, b) => a.student.full_name.localeCompare(b.student.full_name, 'ru'));

  const checkedRows = rows.filter((r) => r.item.status === 'checked');
  const selected = checkedRows.filter((r) => !off.has(r.item.id));
  const allSelected = checkedRows.length > 0 && selected.length === checkedRows.length;
  const toggleAll = () =>
    setOff((prev) => {
      const next = new Set(prev);
      for (const r of checkedRows) {
        if (allSelected) next.add(r.item.id);
        else next.delete(r.item.id);
      }
      return next;
    });
  const toggleOne = (id: number) =>
    setOff((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const missing = inEvent.filter((p) => worked.includes(p.status) && p.primary_score == null).length;
  const stats = [
    {
      label: 'Всего работ',
      value: inEvent.length,
      note: event === 'all' ? 'Все пробники' : eventTitle(Number(event)),
    },
    {
      label: 'Баллы внесены',
      value: inEvent.filter((p) => p.primary_score != null).length,
      note: missing ? `осталось ${missing}` : 'всё внесено',
    },
    {
      label: 'Проверено, не опубликовано',
      value: inEvent.filter((p) => p.status === 'checked').length,
      note: 'можно опубликовать разом',
    },
    {
      label: 'Опубликовано',
      value: inEvent.filter((p) => p.status === 'published').length,
      note: 'ученики видят результат',
    },
  ];

  const publish = () =>
    void publishing.run(async () => {
      const failed: string[] = [];
      let done = 0;
      for (const { item, student } of selected) {
        try {
          await api.results.publish(item.id, {
            primary_score: item.primary_score,
            test_score: item.test_score,
            result_data: item.result_data,
          });
          done += 1;
        } catch {
          failed.push(student.full_name);
        }
      }
      await refresh();
      setConfirming(false);
      setOff(new Set());
      setToast(
        failed.length
          ? `Опубликовано ${done}, не удалось: ${failed.join(', ')}`
          : `Опубликовано: ${plural(done, 'результат', 'результата', 'результатов')}`,
      );
      setTimeout(() => setToast(''), 5000);
    });

  return (
    <div className="rs-page">
      <div className="rs-top">
        <div className="rs-head">
          <h1>Результаты</h1>
          <div className="ad-head-actions">
            <Link className="button button-secondary" to="/results/new">
              <Plus size={17} />
              Добавить результат
            </Link>
            <Button disabled={!selected.length} onClick={() => setConfirming(true)}>
              Опубликовать проверенные ({selected.length})
            </Button>
          </div>
        </div>
        <div className="rs-filters">
          <label>
            Пробник
            <select
              value={event}
              onChange={(e) => {
                setPicked(e.target.value);
                setSubject('');
                setOff(new Set());
              }}
            >
              <option value="all">Все пробники</option>
              {events.map((_, i) => (
                <option key={i} value={i}>
                  {eventLabel(i)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Предмет
            <select value={subject} onChange={(e) => setSubject(e.target.value)}>
              <option value="">Все предметы</option>
              {subjects.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Статус
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Все статусы</option>
              {Object.entries(statusLabels)
                .filter(([key]) => key !== 'cancelled')
                .map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <div className="ad-stats rs-stats">
          {stats.map((s) => (
            <div key={s.label}>
              <span>{s.label}</span>
              <strong>{s.value}</strong>
              <small>{s.note}</small>
            </div>
          ))}
        </div>
      </div>
      <div className="rs-body">
        {rows.length ? (
          <section className="rs-table" aria-label="Работы учеников">
            <div className="rs-row rs-table-head">
              <input
                type="checkbox"
                aria-label="Выбрать все проверенные"
                checked={allSelected}
                disabled={!checkedRows.length}
                onChange={toggleAll}
              />
              <span>УЧЕНИК</span>
              <span>ПРЕДМЕТ</span>
              <span>ГРУППА</span>
              <span>СТАТУС</span>
              <span>ПЕРВ.</span>
              <span>ТЕСТ.</span>
              <span>ПРОВЕРИЛ</span>
            </div>
            <div className="rs-scroll">
              {rows.map(({ item, student, exam }) => {
                const canOpen = ['submitted', 'checked', 'published'].includes(item.status);
                const groups = studentGroups(student.id, data.memberships, data.groups);
                return (
                  <div className="rs-row rs-item" key={item.id}>
                    <input
                      type="checkbox"
                      aria-label={`Выбрать ${student.full_name}`}
                      checked={item.status === 'checked' && !off.has(item.id)}
                      disabled={item.status !== 'checked'}
                      onChange={() => toggleOne(item.id)}
                    />
                    {canOpen ? (
                      <button type="button" className="rs-name" onClick={() => openResult(item.id)}>
                        {student.full_name}
                      </button>
                    ) : (
                      <strong>{student.full_name}</strong>
                    )}
                    <span>{exam.subject}</span>
                    <span className="rs-group">
                      {groups.map((g) => g.source_name).join(', ') || 'Без группы'}
                    </span>
                    <span>
                      <span className={`rs-badge rs-badge-${item.status}`}>{statusLabels[item.status]}</span>
                    </span>
                    <strong>{score(item.primary_score)}</strong>
                    <strong className="rs-test">{score(item.test_score)}</strong>
                    <span className="rs-group">{item.checked_by || '—'}</span>
                  </div>
                );
              })}
            </div>
          </section>
        ) : (
          <div className="panel">
            <EmptyState title="Работ не найдено" text="Измените фильтры или добавьте результат вручную." />
          </div>
        )}
      </div>
      {confirming && (
        <ConfirmDialog
          title="Опубликовать результаты?"
          text={`Выбрано работ: ${selected.length}. Ученики увидят результаты, после публикации редактирование будет закрыто.`}
          confirm="Опубликовать"
          busy={publishing.busy}
          error={publishing.error}
          onClose={() => {
            setConfirming(false);
            publishing.clearError();
          }}
          onConfirm={publish}
        />
      )}
      <Toast message={toast} />
    </div>
  );
}
