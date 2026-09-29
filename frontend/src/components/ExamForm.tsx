import { useEffect, useState, type FormEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '../api/client';
import type { Exam, ExamEvent, ExamEventCreate, SubjectSetting, Task } from '../types';
import { useAction } from '../hooks/useAction';
import { Modal } from './Modal';
import { Button } from './Button';
import { ErrorNotice } from './ErrorNotice';

type Format = 'ege' | 'oge';
const formatLabel = (format: Format) => (format === 'ege' ? 'ЕГЭ' : 'ОГЭ');
type Subject = {
  key: string;
  dbId?: number;
  format: Format;
  subject: string;
  tasks: Task[];
  primaryScale?: number[] | null;
  gradeScale?: SubjectSetting['grade_scale'];
};
type TimeDraft = { id: string; dbId?: number; starts: string; capacity: string };
type SchoolDraft = {
  id: string;
  dbId?: number;
  name: string;
  address: string;
  slots: TimeDraft[];
};
const newSlot = (): TimeDraft => ({ id: crypto.randomUUID(), starts: '', capacity: '20' });
const newSchool = (): SchoolDraft => ({ id: crypto.randomUUID(), name: '', address: '', slots: [newSlot()] });
const localTime = (value: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const initialSubjects = (exams?: Exam[]): Subject[] =>
  (exams ?? []).map((exam) => ({
    key: `${exam.format}:${exam.subject}`,
    dbId: exam.id,
    format: exam.format!,
    subject: exam.subject,
    tasks: exam.structure_data?.tasks ?? [],
    primaryScale: exam.structure_data?.primary_to_secondary_scale,
    gradeScale: exam.structure_data?.grade_scale,
  }));
const initialSchools = (exams?: Exam[]): SchoolDraft[] => {
  if (!exams?.length) return [newSchool()];
  const schools = new Map<number, SchoolDraft>();
  for (const slot of exams[0].slots) {
    const school = schools.get(slot.school_id) ?? {
      id: crypto.randomUUID(),
      dbId: slot.school_id,
      name: slot.school_name,
      address: slot.school_address ?? '',
      slots: [],
    };
    school.slots.push({
      id: crypto.randomUUID(),
      dbId: slot.id,
      starts: localTime(slot.starts_at),
      capacity: String(slot.capacity),
    });
    schools.set(slot.school_id, school);
  }
  return [...schools.values()];
};

export function ExamForm({
  onClose,
  onCreated,
  exams,
}: {
  onClose: () => void;
  onCreated: (event: ExamEvent) => Promise<void>;
  exams?: Exam[];
}) {
  const editing = !!exams?.length;
  const [subjects, setSubjects] = useState<Subject[]>(() => initialSubjects(exams));
  const [schools, setSchools] = useState<SchoolDraft[]>(() => initialSchools(exams));
  const [settings, setSettings] = useState<SubjectSetting[]>([]);
  const [settingsError, setSettingsError] = useState('');
  const { busy, error, run } = useAction();
  useEffect(() => {
    let current = true;
    void api.subjects
      .list()
      .then((items) => {
        if (current) setSettings(items);
      })
      .catch((reason: Error) => {
        if (current) setSettingsError(reason.message);
      });
    return () => {
      current = false;
    };
  }, []);
  const toggleSubject = (format: Format, subject: string) => {
    const key = `${format}:${subject}`;
    if (subjects.some((s) => s.key === key)) {
      setSubjects(subjects.filter((s) => s.key !== key));
    } else {
      const setting = settings.find(
        (item) => item.format === format && item.name.toLowerCase() === subject.toLowerCase(),
      );
      setSubjects([
        ...subjects,
        {
          key,
          format,
          subject,
          tasks: setting?.tasks.map((task) => ({ ...task })) ?? [],
          primaryScale: setting?.primary_to_secondary_scale,
          gradeScale: setting?.grade_scale,
        },
      ]);
    }
  };
  const updateSchool = (id: string, patch: Partial<SchoolDraft>) =>
    setSchools(schools.map((school) => (school.id === id ? { ...school, ...patch } : school)));
  const updateSlot = (school: SchoolDraft, id: string, patch: Partial<TimeDraft>) =>
    updateSchool(school.id, { slots: school.slots.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const value = (name: string) => String(form.get(name) ?? '').trim();
    const time = (name: string) => (value(name) ? new Date(value(name)).toISOString() : null);
    void run(async () => {
      if (!subjects.length) throw new Error('Выберите хотя бы один предмет ЕГЭ или ОГЭ.');
      const payload: ExamEventCreate = {
        title: value('title'),
        registration_open_at: time('opens'),
        registration_close_at: time('closes'),
        schools: schools.map((school) => ({
          id: school.dbId,
          name: school.name.trim(),
          address: school.address.trim() || null,
          slots: school.slots.map((slot) => ({
            id: slot.dbId,
            starts_at: new Date(slot.starts).toISOString(),
            capacity: Number(slot.capacity),
          })),
        })),
        subjects: subjects.map((subject) => ({
          id: subject.dbId,
          format: subject.format,
          subject: subject.subject,
          structure_data: subject.tasks.length
            ? {
                version: 1,
                tasks: subject.tasks,
                primary_to_secondary_scale: subject.primaryScale,
                grade_scale: subject.gradeScale,
              }
            : null,
        })),
      };
      const event = editing
        ? await api.examEvents.update(exams[0].event_id!, payload)
        : await api.examEvents.create(payload);
      await onCreated(event);
    });
  }
  return (
    <Modal title={editing ? 'Редактировать пробник' : 'Создать пробник'} onClose={onClose} wide busy={busy}>
      <form onSubmit={submit}>
        <div className="modal-body stack">
          <ErrorNotice message={error} />
          <ErrorNotice message={settingsError} />
          <fieldset className="exam-form-fields stack" disabled={busy}>
            <div className="form-grid">
              <label className="full-width">
                Название
                <input
                  name="title"
                  placeholder="Например, осенний пробник"
                  defaultValue={exams?.[0].title ?? ''}
                  required
                />
              </label>
              <label>
                Начало регистрации
                <input
                  name="opens"
                  type="datetime-local"
                  defaultValue={localTime(exams?.[0].registration_open_at ?? null)}
                />
              </label>
              <label>
                Конец регистрации
                <input
                  name="closes"
                  type="datetime-local"
                  defaultValue={localTime(exams?.[0].registration_close_at ?? null)}
                />
              </label>
            </div>
            <h3>Предметы для записи</h3>
            {(['ege', 'oge'] as Format[]).map((format) => (
              <section className="stack" key={format} aria-label={`Предметы ${formatLabel(format)}`}>
                <h3>{formatLabel(format)}</h3>
                <div className="subject-options">
                  {[
                    ...new Set([
                      ...settings
                        .filter((setting) => setting.format === format && setting.is_active)
                        .map((setting) => setting.name),
                      ...subjects.filter((s) => s.format === format).map((s) => s.subject),
                    ]),
                  ].map((subject) => {
                    const setting = settings.find(
                      (item) => item.format === format && item.name.toLowerCase() === subject.toLowerCase(),
                    );
                    return (
                      <label className="subject-option" key={subject}>
                        <input
                          type="checkbox"
                          aria-label={`${formatLabel(format)} · ${subject}`}
                          checked={subjects.some((s) => s.format === format && s.subject === subject)}
                          onChange={() => toggleSubject(format, subject)}
                        />
                        <span>
                          {subject}
                          {setting && (
                            <small>
                              {setting.tasks.length} заданий · до {setting.max_primary_score} баллов
                            </small>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>
                {!settings.some((setting) => setting.format === format && setting.is_active) &&
                  !subjects.some((subject) => subject.format === format) && (
                    <p className="muted small">
                      Активных предметов нет. Сначала добавьте их в разделе «Предметы».
                    </p>
                  )}
              </section>
            ))}
            <h3>Школы и расписание</h3>
            <p className="muted small">
              Добавьте для каждой школы общие даты, время и количество мест. Ученик отдельно выберет любой
              предмет и один из свободных слотов. Время указывается в часовом поясе вашего устройства.
            </p>
            {schools.map((school, schoolIndex) => (
              <section
                className="school-editor stack"
                key={school.id}
                aria-label={`Школа ${schoolIndex + 1}`}
              >
                <div className="between">
                  <h3>Школа {schoolIndex + 1}</h3>
                  <Button
                    variant="ghost"
                    aria-label={`Удалить школу ${schoolIndex + 1}`}
                    disabled={schools.length === 1}
                    onClick={() => setSchools(schools.filter((s) => s.id !== school.id))}
                  >
                    <Trash2 size={17} />
                  </Button>
                </div>
                <div className="form-grid">
                  <label>
                    Название школы
                    <input
                      required
                      value={school.name}
                      onChange={(e) => updateSchool(school.id, { name: e.target.value })}
                      placeholder="Школа № 1"
                    />
                  </label>
                  <label>
                    Адрес школы
                    <input
                      value={school.address}
                      onChange={(e) => updateSchool(school.id, { address: e.target.value })}
                    />
                  </label>
                </div>
                {school.slots.map((slot, index) => (
                  <div className="slot-editor" key={slot.id}>
                    <label>
                      Дата и время
                      <input
                        type="datetime-local"
                        required
                        value={slot.starts}
                        onChange={(e) => updateSlot(school, slot.id, { starts: e.target.value })}
                      />
                    </label>
                    <label>
                      Количество мест
                      <input
                        type="number"
                        required
                        min="1"
                        step="1"
                        value={slot.capacity}
                        onChange={(e) => updateSlot(school, slot.id, { capacity: e.target.value })}
                      />
                    </label>
                    <Button
                      variant="ghost"
                      aria-label={`Удалить время ${index + 1}`}
                      disabled={school.slots.length === 1}
                      onClick={() =>
                        updateSchool(school.id, { slots: school.slots.filter((s) => s.id !== slot.id) })
                      }
                    >
                      <Trash2 size={17} />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="secondary"
                  icon={<Plus size={16} />}
                  onClick={() => updateSchool(school.id, { slots: [...school.slots, newSlot()] })}
                >
                  Добавить время
                </Button>
              </section>
            ))}
            <Button
              variant="secondary"
              icon={<Plus size={16} />}
              onClick={() => setSchools([...schools, newSchool()])}
            >
              Добавить школу
            </Button>
            {!!subjects.length && (
              <section className="school-editor stack">
                <h3>Структура выбранных предметов</h3>
                {subjects.map((subject) => (
                  <div className="between" key={subject.key}>
                    <span>
                      {formatLabel(subject.format)} · {subject.subject}
                    </span>
                    <strong>
                      {subject.tasks.length} заданий · до{' '}
                      {subject.tasks.reduce((sum, task) => sum + task.max_score, 0)} баллов
                    </strong>
                  </div>
                ))}
                <p className="muted small">
                  Структура копируется из настроек предмета и сохраняется вместе с пробником.
                </p>
              </section>
            )}
          </fieldset>
        </div>
        <div className="modal-footer">
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Сохраняем…' : editing ? 'Сохранить изменения' : 'Создать пробник'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
