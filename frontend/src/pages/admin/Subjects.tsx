import { useState, type FormEvent } from 'react';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { api } from '../../api/client';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DataTable } from '../../components/DataTable';
import { ErrorNotice } from '../../components/ErrorNotice';
import { FilterBar } from '../../components/FilterBar';
import { Modal } from '../../components/Modal';
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
}: {
  subject?: SubjectSetting;
  onClose: () => void;
  onSaved: () => Promise<void>;
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

export function Subjects() {
  const { data, error, loading, refresh } = useLoad(loadSubjects);
  const [search, setSearch] = useState('');
  const [format, setFormat] = useState<'all' | 'ege' | 'oge'>('all');
  const [editing, setEditing] = useState<SubjectSetting | null | undefined>();
  const [deleting, setDeleting] = useState<SubjectSetting>();
  const { busy: deletingBusy, error: deleteError, run: runDelete } = useAction();
  const query = search.trim().toLowerCase();
  const subjects = (data ?? []).filter(
    (subject) =>
      (format === 'all' || subject.format === format) && subject.name.toLowerCase().includes(query),
  );
  const saved = async () => {
    await refresh();
    setEditing(undefined);
  };

  return (
    <div className="stack page-stack">
      <ErrorNotice message={error} />
      <FilterBar>
        <div className="search-input">
          <Search size={17} />
          <input
            aria-label="Поиск предмета"
            placeholder="Найти предмет"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <select
          aria-label="Тип экзамена"
          value={format}
          onChange={(event) => setFormat(event.target.value as typeof format)}
        >
          <option value="all">Все экзамены</option>
          <option value="oge">ОГЭ</option>
          <option value="ege">ЕГЭ</option>
        </select>
        <Button icon={<Plus size={17} />} onClick={() => setEditing(null)}>
          Добавить предмет
        </Button>
      </FilterBar>
      {loading && !data ? (
        <div className="loading" role="status">
          Загружаем настройки…
        </div>
      ) : (
        <DataTable
          rows={subjects}
          rowKey={(subject) => subject.id}
          label="Настройки предметов"
          empty="Предметы пока не настроены"
          columns={[
            { title: 'Предмет', render: (subject) => <strong>{subject.name}</strong> },
            {
              title: 'Экзамен',
              render: (subject) => <span className="badge badge-checked">{formatName(subject.format)}</span>,
            },
            { title: 'Заданий', render: (subject) => subject.tasks.length },
            { title: 'Максимум баллов', render: (subject) => subject.max_primary_score },
            {
              title: 'Статус',
              render: (subject) => (
                <span className={`badge ${subject.is_active ? 'badge-published' : 'badge-cancelled'}`}>
                  {subject.is_active ? 'Активен' : 'Скрыт'}
                </span>
              ),
            },
            {
              title: 'Действия',
              render: (subject) => (
                <div className="inline table-actions">
                  <Button
                    variant="ghost"
                    aria-label={`Настроить ${subject.name}`}
                    title="Настроить"
                    onClick={() => setEditing(subject)}
                  >
                    <Pencil size={16} />
                  </Button>
                  <Button
                    variant="ghost"
                    aria-label={`Удалить ${subject.name}`}
                    title="Удалить"
                    onClick={() => setDeleting(subject)}
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
        <SubjectForm subject={editing ?? undefined} onClose={() => setEditing(undefined)} onSaved={saved} />
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
