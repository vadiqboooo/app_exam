import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, UploadCloud, X } from 'lucide-react';
import { api } from '../api/client';
import type { Exam, GradeRange, SubjectSetting, SubjectVariant, Task, Teacher } from '../types';
import { useAction } from '../hooks/useAction';
import { dateRange, plural } from '../lib/adminEvents';
import { groupExams } from '../lib/format';
import { Button } from './Button';
import { ConfirmDialog } from './ConfirmDialog';
import { ErrorNotice } from './ErrorNotice';

type Mode = 'admin' | 'teacher';
interface Row {
  key: number;
  code: string;
  max: string;
}

const defaultGrades: GradeRange[] = [
  { grade: 2, min: 0, max: 0 },
  { grade: 3, min: 1, max: 1 },
  { grade: 4, min: 2, max: 2 },
  { grade: 5, min: 3, max: 3 },
];
// The same fallback the server uses for an EGE subject without a configured scale.
const fallbackScore = (primary: number) => Math.min(100, Math.round(primary * 3.7));
const day = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' });
const sizeLabel = (bytes: number) =>
  bytes >= 1048576
    ? `${(bytes / 1048576).toFixed(1).replace('.', ',')} МБ`
    : `${Math.max(1, Math.round(bytes / 1024))} КБ`;
const extension = (filename: string) => (filename.toLowerCase().endsWith('.pdf') ? 'PDF' : 'DOC');

function Switch({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="sb-switch"
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}

const normalize = (value: string) => value.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').trim();

/** Mock exam events still ahead that include this subject: the variants are printed for them. */
function upcomingEvents(exams: Exam[], subject: SubjectSetting) {
  const now = Date.now();
  const mine = exams.filter(
    (exam) =>
      exam.is_active &&
      exam.type === 'mock' &&
      exam.event_id !== null &&
      exam.format === subject.format &&
      normalize(exam.subject) === normalize(subject.name),
  );
  return groupExams(mine)
    .map((group) => {
      const times = group
        .flatMap((exam) => (exam.slots.length ? exam.slots.map((slot) => slot.starts_at) : [exam.starts_at]))
        .sort();
      return {
        id: group[0].event_id!,
        title: group[0].title || 'Пробный экзамен',
        start: times[0],
        end: times.at(-1)!,
      };
    })
    .filter((event) => new Date(event.end).getTime() > now)
    .sort((a, b) => a.start.localeCompare(b.start));
}

function Variants({ subject }: { subject: SubjectSetting }) {
  const [variants, setVariants] = useState<SubjectVariant[]>([]);
  const [events, setEvents] = useState<ReturnType<typeof upcomingEvents>>();
  // Events a new upload is attached to; every upcoming event is preselected.
  const [chosen, setChosen] = useState<number[]>([]);
  useEffect(() => {
    api.exams
      .list()
      .then((exams) => {
        const found = upcomingEvents(exams, subject);
        setEvents(found);
        setChosen(found.map((event) => event.id));
      })
      .catch(() => setEvents(undefined));
  }, [subject]);
  const [dragging, setDragging] = useState(false);
  const [replacing, setReplacing] = useState<SubjectVariant>();
  const picker = useRef<HTMLInputElement>(null);
  const replacer = useRef<HTMLInputElement>(null);
  const { busy, error, run, clearError } = useAction();
  const reload = async () => setVariants(await api.subjects.variants.list(subject.id));
  useEffect(() => {
    void api.subjects.variants.list(subject.id).then(setVariants);
  }, [subject.id]);

  const add = (files: FileList | File[]) => {
    const list = [...files];
    if (!list.length) return;
    void run(async () => {
      const tooBig = list.find((file) => file.size > 20 * 1024 * 1024);
      if (tooBig) throw new Error(`«${tooBig.name}»: файл больше 20 МБ`);
      await api.subjects.variants.upload(subject.id, list, chosen);
      await reload();
    });
  };
  const toggleEvent = (variant: SubjectVariant, eventId: number) =>
    void run(async () => {
      const next = variant.event_ids.includes(eventId)
        ? variant.event_ids.filter((id) => id !== eventId)
        : [...variant.event_ids, eventId];
      await api.subjects.variants.setEvents(variant.id, next);
      await reload();
    });

  return (
    <section className="sb-card">
      <div className="sb-head">
        <div>
          <h2>Варианты для печати</h2>
          <span>PDF или Word. Администратор и учителя печатают их для учеников на сеансе пробника.</span>
        </div>
        <div className="sb-pill">
          {plural(variants.length, 'вариант', 'варианта', 'вариантов')} · PDF и Word
        </div>
      </div>
      {events && (
        <div className={events.length ? 'sb-events' : 'sb-events is-empty'}>
          <b>
            {events.length
              ? 'Новые файлы добавить к пробникам'
              : 'Пока нет предстоящих пробников по этому предмету'}
          </b>
          {events.length > 0 ? (
            events.map((event) => (
              <button
                type="button"
                key={event.id}
                aria-pressed={chosen.includes(event.id)}
                onClick={() =>
                  setChosen(
                    chosen.includes(event.id)
                      ? chosen.filter((id) => id !== event.id)
                      : [...chosen, event.id],
                  )
                }
              >
                {event.title} · {dateRange(event.start, event.end)}
              </button>
            ))
          ) : (
            <span>Загруженные варианты дождутся, пока администратор создаст пробник с этим предметом.</span>
          )}
        </div>
      )}
      <ErrorNotice message={error} />
      {variants.length > 0 && (
        <div className="sb-variants">
          {variants.map((variant) => (
            <div className="sb-variant" key={variant.id}>
              <span className={`sb-ext sb-ext-${extension(variant.filename).toLowerCase()}`}>
                {extension(variant.filename)}
              </span>
              <input
                aria-label="Название варианта"
                defaultValue={variant.name}
                key={`${variant.id}-${variant.name}`}
                onBlur={(event) => {
                  const name = event.target.value.trim();
                  if (name && name !== variant.name)
                    void run(async () => {
                      await api.subjects.variants.rename(variant.id, name);
                      await reload();
                    });
                  else event.target.value = variant.name;
                }}
              />
              <span className="sb-file">
                <span>{variant.filename}</span>
                <small>{sizeLabel(variant.size)}</small>
              </span>
              <span className="sb-date">{day.format(new Date(variant.uploaded_at)).replace('.', '')}</span>
              <span className="sb-actions">
                <button type="button" onClick={() => void run(() => api.subjects.variants.download(variant))}>
                  Скачать
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setReplacing(variant);
                    replacer.current?.click();
                  }}
                >
                  Заменить
                </button>
                <button
                  type="button"
                  className="sb-remove"
                  aria-label={`Удалить вариант ${variant.name}`}
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await api.subjects.variants.remove(variant.id);
                      await reload();
                    })
                  }
                >
                  <X size={17} />
                </button>
              </span>
              {events && events.length > 0 && (
                <div className="sb-variant-events">
                  <span>Пробники:</span>
                  {events.map((event) => (
                    <button
                      type="button"
                      key={event.id}
                      aria-pressed={variant.event_ids.includes(event.id)}
                      disabled={busy}
                      onClick={() => toggleEvent(variant, event.id)}
                    >
                      {event.title} · {dateRange(event.start, event.end)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <input
        ref={replacer}
        type="file"
        hidden
        accept=".pdf,.doc,.docx"
        aria-label="Новый файл варианта"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file && replacing)
            void run(async () => {
              if (file.size > 20 * 1024 * 1024) throw new Error(`«${file.name}»: файл больше 20 МБ`);
              await api.subjects.variants.replace(replacing.id, file);
              await reload();
            });
        }}
      />
      <input
        ref={picker}
        type="file"
        hidden
        multiple
        accept=".pdf,.doc,.docx"
        aria-label="Файлы вариантов"
        onChange={(event) => {
          if (event.target.files) add(event.target.files);
          event.target.value = '';
        }}
      />
      <button
        type="button"
        className={`sb-drop${dragging ? ' is-over' : ''}`}
        disabled={busy}
        onClick={() => {
          clearError();
          picker.current?.click();
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          add(event.dataTransfer.files);
        }}
      >
        <span className="sb-drop-icon">
          <UploadCloud size={22} />
        </span>
        <span>
          <strong>{busy ? 'Загружаем…' : 'Перетащите файл сюда или нажмите, чтобы выбрать'}</strong>
          <small>PDF, DOC, DOCX · до 20 МБ · можно несколько файлов</small>
        </span>
      </button>
    </section>
  );
}

export function SubjectEditor({
  mode,
  subjectId,
  backTo,
}: {
  mode: Mode;
  subjectId: number | 'new';
  backTo: string;
}) {
  const navigate = useNavigate();
  const [subject, setSubject] = useState<SubjectSetting>();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loadError, setLoadError] = useState('');
  const [name, setName] = useState('');
  const [format, setFormat] = useState<'ege' | 'oge'>('ege');
  const [active, setActive] = useState(true);
  const [duration, setDuration] = useState('');
  const [responsible, setResponsible] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [scale, setScale] = useState<number[] | null>(null);
  const [grades, setGrades] = useState<GradeRange[]>(defaultGrades);
  const [deleting, setDeleting] = useState(false);
  const next = useRef(1);
  const { busy, error, run } = useAction();
  const deletion = useAction();

  const fill = (item: SubjectSetting) => {
    setSubject(item);
    setName(item.name);
    setFormat(item.format);
    setActive(item.is_active);
    setDuration(item.duration_minutes == null ? '' : String(item.duration_minutes));
    setResponsible(item.responsible_id == null ? '' : String(item.responsible_id));
    setRows(
      item.tasks.map((task) => ({ key: next.current++, code: task.code, max: String(task.max_score) })),
    );
    setScale(item.primary_to_secondary_scale);
    setGrades(item.grade_scale ?? defaultGrades);
  };

  useEffect(() => {
    let current = true;
    const load = async () => {
      if (mode === 'admin') setTeachers(await api.teachers.list());
      if (subjectId === 'new') {
        setRows([{ key: next.current++, code: '1', max: '1' }]);
        return;
      }
      const list = mode === 'admin' ? await api.subjects.list() : await api.subjects.mine();
      const found = list.find((item) => item.id === subjectId);
      if (!found) throw new Error('Предмет не найден или не назначен вам');
      if (current) fill(found);
    };
    load().catch((e: Error) => current && setLoadError(e.message));
    return () => {
      current = false;
    };
  }, [mode, subjectId]);

  const total = rows.reduce((sum, row) => sum + (Number(row.max) || 0), 0);
  const cells = Math.max(0, Math.floor(total)) + 1;
  const scaleValue = (index: number) =>
    scale ? (scale[index] ?? scale[scale.length - 1] ?? 0) : fallbackScore(index);
  const setCell = (index: number, value: number) => {
    const base = Array.from({ length: cells }, (_, i) => scaleValue(i));
    base[index] = Math.max(0, Math.min(100, Math.round(value) || 0));
    setScale(base);
  };
  const patchRow = (key: number, patch: Partial<Row>) =>
    setRows(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  const addRow = () => setRows([...rows, { key: next.current++, code: String(rows.length + 1), max: '1' }]);
  const addSubRow = () => {
    const last = rows[rows.length - 1];
    const match = last ? last.code.match(/^(\d+)(?:\.(\d+))?$/) : null;
    const code = match ? `${match[1]}.${(Number(match[2]) || 1) + 1}` : last ? `${last.code}.2` : '1';
    setRows([...rows, { key: next.current++, code, max: '1' }]);
  };

  const tasks = (): Task[] => {
    if (!rows.length) throw new Error('Добавьте хотя бы одно задание');
    const codes = new Set<string>();
    return rows.map((row) => {
      const code = row.code.trim();
      const max = Number(row.max);
      if (!code) throw new Error('У каждого задания должен быть номер');
      if (codes.has(code)) throw new Error(`Номер задания «${code}» повторяется`);
      if (!(max > 0)) throw new Error(`Задание «${code}»: максимальный балл должен быть больше нуля`);
      codes.add(code);
      return { code, title: `Задание ${code}`, max_score: max };
    });
  };

  const save = () =>
    void run(async () => {
      const content = {
        tasks: tasks(),
        primary_to_secondary_scale:
          format === 'ege' && scale ? Array.from({ length: cells }, (_, index) => scaleValue(index)) : null,
        grade_scale: format === 'oge' ? grades : null,
      };
      if (mode === 'teacher') {
        if (subject) await api.subjects.updateContent(subject.id, content);
      } else {
        if (!name.trim()) throw new Error('Укажите название предмета');
        const data = {
          ...content,
          name: name.trim(),
          format,
          is_active: active,
          duration_minutes: duration.trim() ? Number(duration) : null,
          responsible_id: responsible ? Number(responsible) : null,
        };
        if (subject) await api.subjects.update(subject.id, data);
        else await api.subjects.create(data);
      }
      navigate(backTo);
    });

  if (loadError)
    return (
      <div className="ad-page">
        <Link className="ad-back" to={backTo}>
          <ArrowLeft size={16} />
          Предметы
        </Link>
        <ErrorNotice message={loadError} />
      </div>
    );
  if (subjectId !== 'new' && !subject)
    return (
      <div className="loading" role="status">
        Загружаем предмет…
      </div>
    );

  const teacherName = teachers.find((item) => String(item.id) === responsible)?.name;
  const title = subject ? name || subject.name : 'Новый предмет';

  return (
    <div className="ad-page sb-page">
      <div className="sb-top">
        <div className="sb-title">
          <Link className="sb-back" to={backTo}>
            <ArrowLeft size={18} />
            Предметы
          </Link>
          <h1>{title}</h1>
          <span className="sc-format">{format === 'ege' ? 'ЕГЭ' : 'ОГЭ'}</span>
          {mode === 'teacher' && <span className="sb-mine">Вы ответственный</span>}
        </div>
        <div className="sb-save">
          <Button variant="secondary" disabled={busy} onClick={() => navigate(backTo)}>
            Отменить
          </Button>
          <Button disabled={busy} onClick={save}>
            {busy ? 'Сохраняем…' : 'Сохранить'}
          </Button>
        </div>
      </div>
      <ErrorNotice message={error} />

      {mode === 'admin' && (
        <>
          <section className="sb-card">
            <div className="sb-head">
              <div>
                <h2>Предмет активен</h2>
                <span>
                  {active
                    ? 'Предмет доступен для записи и выбора в новых пробниках.'
                    : 'Предмет скрыт: на него нельзя записаться и нельзя выбрать в новом пробнике. Результаты сохранены.'}
                </span>
              </div>
              <Switch checked={active} label="Предмет активен" onChange={setActive} />
            </div>
          </section>
          <section className="sb-card">
            <h2>Основное</h2>
            <div className="sb-basic">
              <label>
                Название
                <input value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label>
                Формат
                <select
                  value={format}
                  onChange={(e) => {
                    setFormat(e.target.value as 'ege' | 'oge');
                    setScale(null);
                  }}
                >
                  <option value="ege">ЕГЭ</option>
                  <option value="oge">ОГЭ</option>
                </select>
              </label>
              <label>
                Длительность, мин
                <input
                  type="number"
                  min="1"
                  max="1000"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                />
              </label>
            </div>
          </section>
          <section className="sb-card">
            <div className="sb-head">
              <div>
                <h2>Ответственный преподаватель</h2>
                <span>
                  Отвечает за предмет: правит задания и шкалу, загружает варианты для печати. Администратор
                  тоже может всё это менять.
                </span>
              </div>
            </div>
            <div className="sb-resp">
              <label>
                Преподаватель
                <select value={responsible} onChange={(e) => setResponsible(e.target.value)}>
                  <option value="">Не назначен</option>
                  {teachers.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className={`sb-note${teacherName ? '' : ' is-warn'}`}>
                {teacherName
                  ? `${teacherName} увидит этот предмет в кабинете во вкладке «Предметы».`
                  : 'Ответственный не назначен — настройки и варианты вносит администратор.'}
              </div>
            </div>
            <div className="sb-info">
              Загружено вариантов для печати: <b>{subject?.variants_count ?? 0}</b> · загружает ответственный
              преподаватель
            </div>
          </section>
        </>
      )}

      {mode === 'teacher' && subject && <Variants subject={subject} />}

      <section className="sb-card">
        <div className="sb-head">
          <div>
            <h2>Задания</h2>
            <span>Номер — любой текст: 1, 13.1, П1, К2. Он показывается ученику и учителю как есть.</span>
          </div>
          <div className="sb-pill">
            {plural(rows.length, 'задание', 'задания', 'заданий')} · максимум {total} баллов
          </div>
        </div>
        <div className="sb-tasks">
          {[0, 1].map((column) => (
            <div className="sb-task sb-task-head" key={column}>
              <span>№</span>
              <span>НОМЕР</span>
              <span>МАКС. БАЛЛ</span>
              <span />
              <span />
            </div>
          ))}
          {rows.map((row, index) => (
            <div className="sb-task" key={row.key}>
              <span className="sb-index">{index + 1}</span>
              <input
                aria-label={`Номер задания ${index + 1}`}
                value={row.code}
                onChange={(e) => patchRow(row.key, { code: e.target.value })}
              />
              <input
                type="number"
                min="1"
                aria-label={`Максимум за задание ${row.code}`}
                value={row.max}
                onChange={(e) => patchRow(row.key, { max: e.target.value })}
              />
              <span />
              <button
                type="button"
                className="sb-remove"
                aria-label={`Удалить задание ${row.code}`}
                onClick={() => setRows(rows.filter((item) => item.key !== row.key))}
              >
                <X size={17} />
              </button>
            </div>
          ))}
        </div>
        <div className="sb-row-actions">
          <Button variant="secondary" icon={<Plus size={17} />} onClick={addRow}>
            Добавить задание
          </Button>
          <Button variant="secondary" icon={<Plus size={17} />} onClick={addSubRow}>
            Добавить подпункт к последнему
          </Button>
        </div>
      </section>

      <section className="sb-card">
        {format === 'ege' ? (
          <>
            <div className="sb-head sb-head-inline">
              <h2>Перевод первичного балла в тестовый</h2>
              <span>
                {scale
                  ? 'Можно поправить каждое значение'
                  : 'Шкала не настроена: используется стандартный пересчёт. Измените любое значение, чтобы задать свою.'}
              </span>
            </div>
            <div className="sb-scale">
              {Array.from({ length: cells }, (_, index) => (
                <label key={index}>
                  <span>{index}</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    aria-label={`Тестовый балл за ${index} первичных`}
                    value={scaleValue(index)}
                    onChange={(e) => setCell(index, Number(e.target.value))}
                  />
                </label>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="sb-head sb-head-inline">
              <h2>Перевод в оценку</h2>
              <span>Диапазоны первичных баллов для оценок от 2 до 5</span>
            </div>
            <div className="sb-grades">
              {grades.map((range, index) => (
                <div key={range.grade}>
                  <strong>Оценка {range.grade}</strong>
                  {(['min', 'max'] as const).map((edge) => (
                    <label key={edge}>
                      {edge === 'min' ? 'От' : 'До'}
                      <input
                        type="number"
                        min="0"
                        aria-label={`${edge === 'min' ? 'Минимальный' : 'Максимальный'} балл для оценки ${range.grade}`}
                        value={range[edge]}
                        onChange={(e) =>
                          setGrades(
                            grades.map((item, i) =>
                              i === index ? { ...item, [edge]: Number(e.target.value) } : item,
                            ),
                          )
                        }
                      />
                    </label>
                  ))}
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {mode === 'admin' && subject && (
        <section className="sb-danger">
          <span>
            Удаление убирает только настройки и варианты. Созданные пробники и результаты не меняются.
          </span>
          <Button variant="danger" onClick={() => setDeleting(true)}>
            Удалить предмет
          </Button>
        </section>
      )}
      {deleting && subject && (
        <ConfirmDialog
          title="Удалить настройки предмета?"
          text={`${subject.name} · ${subject.format === 'ege' ? 'ЕГЭ' : 'ОГЭ'} исчезнет из списка настроек вместе с загруженными вариантами. Уже созданные пробники и их результаты не изменятся.`}
          confirm="Удалить"
          danger
          busy={deletion.busy}
          error={deletion.error}
          onClose={() => setDeleting(false)}
          onConfirm={() =>
            void deletion.run(async () => {
              await api.subjects.delete(subject.id);
              navigate(backTo);
            })
          }
        />
      )}
    </div>
  );
}
