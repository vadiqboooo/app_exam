import { useState, type FormEvent } from 'react';
import { ChevronRight, Plus, Trash2 } from 'lucide-react';
import { api } from '../../api/client';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { ErrorNotice } from '../../components/ErrorNotice';
import { Modal } from '../../components/Modal';
import { useWorkspace } from '../../layouts/Workspace';
import { useAction } from '../../hooks/useAction';
import { useLoad } from '../../hooks/useLoad';
import type { GradeRange, SubjectSetting, SubjectSettingWrite, Task } from '../../types';

const loadSubjects = () => api.subjects.list();
const formatName = (format: SubjectSetting['format']) => (format === 'ege' ? 'ЕГЭ' : 'ОГЭ');
const newTask = (index: number): Task => ({
  code: String(index + 1),
  title: `Задание ${index + 1}`,
  max_score: 1,
});

function SubjectForm({
  subject,
  onClose,
  onSaved,
  onDelete,
}: {
  subject?: SubjectSetting;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onDelete?: () => void;
}) {
  const [examFormat, setExamFormat] = useState<SubjectSetting['format']>(subject?.format ?? 'oge');
  const [tasks, setTasks] = useState<Task[]>(subject?.tasks ?? [newTask(0)]);
  const [scaleInput, setScaleInput] = useState(subject?.primary_to_secondary_scale?.join(', ') ?? '');
  const [gradeScale, setGradeScale] = useState<GradeRange[]>(
    subject?.grade_scale ?? [
      { grade: 2, min: 0, max: 0 },
      { grade: 3, min: 1, max: 1 },
      { grade: 4, min: 2, max: 2 },
      { grade: 5, min: 3, max: 3 },
    ],
  );
  const { busy, error, run } = useAction();
  const total = tasks.reduce((sum, task) => sum + (Number(task.max_score) || 0), 0);
  const updateTask = (index: number, patch: Partial<Task>) =>
    setTasks(tasks.map((task, taskIndex) => (taskIndex === index ? { ...task, ...patch } : task)));

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const data: SubjectSettingWrite = {
      name: String(form.get('name') ?? '').trim(),
      format: examFormat,
      tasks,
      primary_to_secondary_scale:
        examFormat === 'ege' && scaleInput.trim()
          ? scaleInput
              .split(',')
              .map((value) => Number(value.trim()))
              .filter((value) => Number.isFinite(value))
          : null,
      grade_scale: examFormat === 'oge' ? gradeScale : null,
      is_active: form.get('is_active') === 'on',
    };
    void run(async () => {
      if (!tasks.length) throw new Error('Добавьте хотя бы одно задание.');
      if (subject) await api.subjects.update(subject.id, data);
      else await api.subjects.create(data);
      await onSaved();
    });
  }

  return (
    <Modal title={subject ? 'Настроить предмет' : 'Добавить предмет'} onClose={onClose} wide busy={busy}>
      <form onSubmit={submit}>
        <div className="modal-body stack">
          <ErrorNotice message={error} />
          <fieldset className="stack exam-form-fields" disabled={busy}>
            <div className="form-grid">
              <label>
                Предмет
                <input name="name" defaultValue={subject?.name ?? ''} placeholder="Математика" required />
              </label>
              <label>
                Тип экзамена
                <select
                  name="format"
                  value={examFormat}
                  onChange={(event) => setExamFormat(event.target.value as SubjectSetting['format'])}
                >
                  <option value="oge">ОГЭ</option>
                  <option value="ege">ЕГЭ</option>
                </select>
              </label>
            </div>
            <label className="subject-option subject-active-option">
              <input name="is_active" type="checkbox" defaultChecked={subject?.is_active ?? true} />
              Показывать предмет при создании пробника
            </label>
            <div className="subject-task-heading">
              <div>
                <h3>Задания</h3>
                <p className="muted small">Укажите номер задания и максимальный первичный балл.</p>
              </div>
              <strong>Всего: {total} баллов</strong>
            </div>
            <div className="task-list">
              <div className="task-row task-row-heading" aria-hidden="true">
                <span>Номер</span>
                <span>Максимальный балл</span>
                <span />
              </div>
              {tasks.map((task, index) => (
                <div className="task-row" key={index}>
                  <input
                    aria-label={`Номер задания ${index + 1}`}
                    value={task.code}
                    required
                    onChange={(event) =>
                      updateTask(index, {
                        code: event.target.value,
                        title: `Задание ${event.target.value}`,
                      })
                    }
                  />
                  <input
                    aria-label={`Максимальный балл задания ${index + 1}`}
                    type="number"
                    min="0.01"
                    step="any"
                    value={task.max_score}
                    required
                    onChange={(event) => updateTask(index, { max_score: Number(event.target.value) })}
                  />
                  <Button
                    variant="ghost"
                    aria-label={`Удалить задание ${index + 1}`}
                    title="Удалить задание"
                    onClick={() => setTasks(tasks.filter((_, taskIndex) => taskIndex !== index))}
                  >
                    <Trash2 size={17} />
                  </Button>
                </div>
              ))}
            </div>
            <Button
              variant="secondary"
              icon={<Plus size={16} />}
              onClick={() => setTasks([...tasks, newTask(tasks.length)])}
            >
              Добавить задание
            </Button>
            {examFormat === 'ege' ? (
              <label>
                Шкала перевода первичного балла
                <textarea
                  rows={4}
                  value={scaleInput}
                  onChange={(event) => setScaleInput(event.target.value)}
                  placeholder="0, 7, 14, 20, …, 100"
                />
                <small className="muted">
                  Значения через запятую: первое для 0 первичных баллов, второе для 1 и далее.
                </small>
              </label>
            ) : (
              <div className="stack compact-stack">
                <div>
                  <h3>Перевод в оценку</h3>
                  <p className="muted small">Диапазоны первичных баллов для оценок от 2 до 5.</p>
                </div>
                <div className="grade-scale-grid grade-scale-heading" aria-hidden="true">
                  <span>Оценка</span>
                  <span>От</span>
                  <span>До</span>
                </div>
                {gradeScale.map((range, index) => (
                  <div className="grade-scale-grid" key={range.grade}>
                    <strong>{range.grade}</strong>
                    <input
                      type="number"
                      min="0"
                      aria-label={`Минимальный балл для оценки ${range.grade}`}
                      value={range.min}
                      onChange={(event) =>
                        setGradeScale(
                          gradeScale.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, min: Number(event.target.value) } : item,
                          ),
                        )
                      }
                    />
                    <input
                      type="number"
                      min="0"
                      aria-label={`Максимальный балл для оценки ${range.grade}`}
                      value={range.max}
                      onChange={(event) =>
                        setGradeScale(
                          gradeScale.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, max: Number(event.target.value) } : item,
                          ),
                        )
                      }
                    />
                  </div>
                ))}
              </div>
            )}
          </fieldset>
        </div>
        <div className="modal-footer">
          {onDelete && (
            <Button variant="danger" disabled={busy} onClick={onDelete}>
              Удалить предмет
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

type StatusFilter = 'all' | 'on' | 'off';
type FormatFilter = 'all' | 'ege' | 'oge';

export function Subjects() {
  const { data, error, loading, refresh } = useLoad(loadSubjects);
  const { data: workspace } = useWorkspace();
  const toggling = useAction();
  const [status, setStatus] = useState<StatusFilter>('all');
  const [format, setFormat] = useState<FormatFilter>('all');
  const [editing, setEditing] = useState<SubjectSetting | null | undefined>();
  const [deleting, setDeleting] = useState<SubjectSetting>();
  const { busy: deletingBusy, error: deleteError, run: runDelete } = useAction();
  const all = data ?? [];
  const activeCount = all.filter((subject) => subject.is_active).length;
  const subjects = all.filter(
    (subject) =>
      (status === 'all' || (status === 'on') === subject.is_active) &&
      (format === 'all' || subject.format === format),
  );
  const usedIn = (subject: SubjectSetting) =>
    new Set(
      workspace.exams
        .filter(
          (exam) =>
            exam.format === subject.format &&
            exam.subject.trim().toLowerCase() === subject.name.trim().toLowerCase(),
        )
        .map((exam) => exam.event_id ?? `exam:${exam.id}`),
    ).size;
  const saved = async () => {
    await refresh();
    setEditing(undefined);
  };
  const flip = (subject: SubjectSetting) =>
    void toggling.run(async () => {
      await api.subjects.update(subject.id, {
        name: subject.name,
        format: subject.format,
        tasks: subject.tasks,
        primary_to_secondary_scale: subject.primary_to_secondary_scale,
        grade_scale: subject.grade_scale,
        is_active: !subject.is_active,
      });
      await refresh();
    });
  const statusTabs: [StatusFilter, string, number | undefined][] = [
    ['all', 'Все', all.length],
    ['on', 'Активные', activeCount],
    ['off', 'Неактивные', all.length - activeCount],
  ];
  const formatTabs: [FormatFilter, string][] = [
    ['all', 'Все форматы'],
    ['ege', 'ЕГЭ'],
    ['oge', 'ОГЭ'],
  ];

  return (
    <div className="sc-section">
      <ErrorNotice message={error || toggling.error} />
      <div className="sj-filters">
        <div className="sj-pills" role="group" aria-label="Статус">
          {statusTabs.map(([key, label, count]) => (
            <button type="button" key={key} aria-pressed={status === key} onClick={() => setStatus(key)}>
              {label}
              <span>{count}</span>
            </button>
          ))}
        </div>
        <div className="sj-pills" role="group" aria-label="Формат">
          {formatTabs.map(([key, label]) => (
            <button type="button" key={key} aria-pressed={format === key} onClick={() => setFormat(key)}>
              {label}
            </button>
          ))}
          <Button icon={<Plus size={17} />} variant="secondary" onClick={() => setEditing(null)}>
            Добавить предмет
          </Button>
        </div>
      </div>
      {loading && !data ? (
        <div className="loading" role="status">
          Загружаем настройки…
        </div>
      ) : subjects.length ? (
        <section className="sj-table" aria-label="Предметы">
          <div className="sj-row sj-head">
            <span>ПРЕДМЕТ</span>
            <span>ФОРМАТ</span>
            <span>ЗАДАНИЙ</span>
            <span>МАКС. БАЛЛ</span>
            <span>В ПРОБНИКАХ</span>
            <span>АКТИВЕН</span>
            <span />
          </div>
          {subjects.map((subject) => {
            const used = usedIn(subject);
            return (
              <div className={`sj-row sj-item${subject.is_active ? '' : ' is-off'}`} key={subject.id}>
                <button
                  type="button"
                  className="sj-open"
                  aria-label={`Настройки: ${subject.name}`}
                  onClick={() => setEditing(subject)}
                />
                <span className="sj-name">
                  <strong>{subject.name}</strong>
                  <small>{subject.format === 'ege' ? 'Единый госэкзамен' : 'Основной госэкзамен'}</small>
                </span>
                <span>
                  <span className="sc-format">{formatName(subject.format)}</span>
                </span>
                <strong>{subject.tasks.length}</strong>
                <strong>{subject.max_primary_score}</strong>
                <span className="sj-used">{used ? `в ${used} пробн.` : 'не использован'}</span>
                <span className="sj-active">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={subject.is_active}
                    aria-label={`Активен: ${subject.name}`}
                    className="sj-switch"
                    disabled={toggling.busy}
                    onClick={() => flip(subject)}
                  >
                    <span />
                  </button>
                  <span className={subject.is_active ? 'is-on' : undefined}>
                    {subject.is_active ? 'Да' : 'Скрыт'}
                  </span>
                </span>
                <ChevronRight size={20} />
              </div>
            );
          })}
        </section>
      ) : (
        <div className="panel">
          <EmptyState
            title={all.length ? 'Ничего не найдено' : 'Предметы пока не настроены'}
            text={all.length ? 'Измените фильтры.' : 'Добавьте предмет: задания и максимальные баллы.'}
          />
        </div>
      )}
      <p className="sj-note">
        Неактивный предмет скрыт: на него нельзя записаться и его нельзя выбрать в новом пробнике. Уже
        внесённые результаты остаются.
      </p>
      {editing !== undefined && (
        <SubjectForm
          subject={editing ?? undefined}
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
      {deleting && (
        <ConfirmDialog
          title="Удалить настройки предмета?"
          text={`${deleting.name} · ${formatName(deleting.format)} исчезнет из списка настроек. Уже созданные пробники и их результаты не изменятся.`}
          confirm="Удалить"
          danger
          busy={deletingBusy}
          error={deleteError}
          onClose={() => setDeleting(undefined)}
          onConfirm={() =>
            void runDelete(async () => {
              await api.subjects.delete(deleting.id);
              await refresh();
              setDeleting(undefined);
            })
          }
        />
      )}
    </div>
  );
}
