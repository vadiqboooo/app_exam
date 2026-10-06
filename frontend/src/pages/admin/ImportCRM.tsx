import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, FileText, UploadCloud } from 'lucide-react';
import { api } from '../../api/client';
import type {
  GroupsStep,
  ImportRun,
  LegacyStep,
  StudentStatus,
  StudentsStep,
  TeachersStep,
} from '../../types';
import { useWorkspace } from '../../layouts/Workspace';
import { useAction } from '../../hooks/useAction';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { ErrorNotice } from '../../components/ErrorNotice';
import { BackupCheck } from './Backups';
import { plural } from '../../lib/adminEvents';
import { backupTime, fileSize } from '../../lib/backup';
import { useLoad } from '../../hooks/useLoad';

type Key = 'legacy' | 'teachers' | 'groups' | 'students';
type Tone = 'ok' | 'add' | 'warn' | 'upd';
type Previews = {
  legacy?: LegacyStep;
  teachers?: TeachersStep;
  groups?: GroupsStep;
  students?: StudentsStep;
};

const loadLegacyFiles = () => api.backups.legacyFiles();
const order: Key[] = ['legacy', 'teachers', 'groups', 'students'];
const config: Record<Key, { title: string; idle: string; upload: string; hint: string; accept: string }> = {
  legacy: {
    title: 'Прошлая версия',
    idle: 'Если раньше работали в старой версии — возьмите её копию с подключённого диска, чтобы вернуть прошлые работы',
    upload: 'Загрузить файл прошлой версии',
    hint: 'Резервная копия старой базы: пробники, работы и баллы учеников',
    accept: '.db,.sqlite,.sqlite3',
  },
  teachers: {
    title: 'Учителя',
    idle: 'Загрузите список учителей',
    upload: 'Загрузить Excel',
    hint: 'Список сотрудников из CRM: ФИО и предметы',
    accept: '.xlsx',
  },
  groups: {
    title: 'Группы',
    idle: 'Загрузите список групп',
    upload: 'Загрузить Excel',
    hint: 'Название группы, предмет, тип, учитель, расписание',
    accept: '.xlsx',
  },
  students: {
    title: 'Ученики',
    idle: 'Загрузите список учеников',
    upload: 'Загрузить Excel',
    hint: 'ФИО, класс и названия групп',
    accept: '.xlsx',
  },
};

const studentLabels: Record<StudentStatus, [string, Tone]> = {
  new: ['Новый', 'add'],
  returned: ['Вернулся', 'add'],
  left: ['Ушёл в архив', 'warn'],
  changed_groups: ['Сменил группу', 'upd'],
  updated: ['Обновлён', 'upd'],
  unchanged: ['Без изменений', 'ok'],
  unknown_group: ['Группа не найдена', 'warn'],
};

interface Row {
  a: string;
  b: string;
  c: string;
  d: string;
  tone: Tone;
}

function Chip({ text, tone = 'ok' }: { text: string; tone?: Tone }) {
  return <span className={`imp-chip imp-tone-${tone}`}>{text}</span>;
}

function Preview({
  cols,
  headers,
  rows,
  more,
}: {
  cols: string;
  headers: string[];
  rows: Row[];
  more: string;
}) {
  return (
    <div className="imp-table">
      <div className="imp-row imp-row-head" style={{ gridTemplateColumns: cols }}>
        {headers.map((header) => (
          <span key={header}>{header}</span>
        ))}
      </div>
      {rows.map((row, index) => (
        <div className="imp-row" style={{ gridTemplateColumns: cols }} key={`${row.a}-${index}`}>
          <strong>{row.a}</strong>
          <span>{row.b}</span>
          <span>{row.c}</span>
          <span>
            <span className={`imp-badge imp-tone-${row.tone}`}>{row.d}</span>
          </span>
        </div>
      ))}
      {more && <div className="imp-more">{more}</div>}
    </div>
  );
}

function StepCard({
  mark,
  title,
  sub,
  state,
  editLabel,
  onEdit,
  children,
}: {
  mark: string;
  title: string;
  sub: string;
  state: 'open' | 'done' | 'idle';
  editLabel?: string;
  onEdit?: () => void;
  children?: ReactNode;
}) {
  return (
    <section className={`imp-card imp-${state}`}>
      <div className="imp-card-head">
        <span className="imp-dot" aria-hidden="true">
          {mark}
        </span>
        <div>
          <h2>{title}</h2>
          <span>{sub}</span>
        </div>
        {state === 'done' && onEdit && (
          <button type="button" className="imp-edit" onClick={onEdit}>
            {editLabel ?? 'Изменить файл'}
          </button>
        )}
      </div>
      {state === 'open' && children && <div className="imp-card-body">{children}</div>}
    </section>
  );
}

export function ImportCRM() {
  const { refresh } = useWorkspace();
  const { busy, error, run, clearError } = useAction();
  const inputs = useRef<Partial<Record<Key, HTMLInputElement | null>>>({});
  const [cur, setCur] = useState(0);
  const [done, setDone] = useState<number[]>([]);
  const [files, setFiles] = useState<Partial<Record<Key, File>>>({});
  const [previews, setPreviews] = useState<Previews>({});
  const [skipped, setSkipped] = useState(false);
  const [result, setResult] = useState<ImportRun>();
  const [confirming, setConfirming] = useState(false);
  const [success, setSuccess] = useState('');
  const disk = useLoad(loadLegacyFiles);
  const diskChecked = useRef(false);
  const [restoreName, setRestoreName] = useState<string | null>(null);
  const [restoredFrom, setRestoredFrom] = useState('');

  const preview = (key: Key, file: File, all: Partial<Record<Key, File>>) => {
    if (key === 'legacy') return api.import.legacy(file);
    if (key === 'teachers') return api.import.teachers(file, all.groups);
    if (key === 'groups') return api.import.groups(file, all.teachers);
    return api.import.students(file, all.groups);
  };

  const upload = (key: Key, source: File | (() => Promise<File>)) => {
    clearError();
    setSuccess('');
    setResult(undefined);
    void run(async () => {
      const file = typeof source === 'function' ? await source() : source;
      const nextFiles = { ...files, [key]: file };
      const nextPreviews: Previews = { ...previews, [key]: await preview(key, file, nextFiles) };
      // Later steps depend on the earlier files (teachers resolve groups, groups resolve pupils).
      for (const later of order.slice(order.indexOf(key) + 1)) {
        const laterFile = nextFiles[later];
        if (laterFile && later !== 'legacy') {
          Object.assign(nextPreviews, { [later]: await preview(later, laterFile, nextFiles) });
        }
      }
      setFiles(nextFiles);
      setPreviews(nextPreviews);
      setDone((prev) => prev.filter((step) => step < order.indexOf(key)));
      setSkipped(false);
    });
  };

  // The previous version's database is taken from the connected disk instead of the computer.
  const fromDisk = (name: string) =>
    upload(
      'legacy',
      async () =>
        new File([await api.backups.downloadFile(name)], name.replace(/\.gz$/i, ''), {
          type: 'application/octet-stream',
        }),
    );

  const clear = (key: Key) => {
    if (key === 'legacy') setRestoredFrom('');
    setFiles((prev) => ({ ...prev, [key]: undefined }));
    setPreviews((prev) => ({ ...prev, [key]: undefined }));
    setDone((prev) => prev.filter((step) => step < order.indexOf(key)));
    setResult(undefined);
    const input = inputs.current[key];
    if (input) input.value = '';
  };

  const loadSummary = (all: Partial<Record<Key, File>>) => {
    clearError();
    void run(async () => {
      setResult(await api.import.run({ ...all, legacy: skipped ? undefined : all.legacy }));
    });
  };

  const next = (index: number) => {
    setDone((prev) => (prev.includes(index) ? prev : [...prev, index]));
    setCur(index + 1);
    if (index === 3) loadSummary(files);
  };

  const skipLegacy = () => {
    clear('legacy');
    setSkipped(true);
    setDone((prev) => (prev.includes(0) ? prev : [...prev, 0]));
    setCur(1);
  };

  // A copy of the app is the previous version too: the whole database comes back from it.
  const restoreFromCopy = () => {
    const name = restoreName;
    if (!name) return;
    setRestoreName(null);
    clearError();
    setSuccess('');
    void run(async () => {
      await api.backups.restore(name);
      await refresh();
      clear('legacy');
      setSkipped(true);
      setRestoredFrom(name);
      setDone((prev) => (prev.includes(0) ? prev : [...prev, 0]));
      setCur(1);
    });
  };

  useEffect(() => {
    if (diskChecked.current || !disk.data) return;
    diskChecked.current = true;
    const { configured, error, files: found } = disk.data;
    if (!configured || (!error && found.length === 0)) skipLegacy();
  }, [disk.data]);

  const apply = () => {
    if (!result) return;
    setConfirming(false);
    void run(async () => {
      await api.import.run({ ...files, legacy: skipped ? undefined : files.legacy }, result.confirmation);
      await refresh();
      setSuccess('Импорт применён. Учителя, группы и ученики обновлены.');
      setCur(0);
      setDone([]);
      setFiles({});
      setPreviews({});
      setSkipped(false);
      setRestoredFrom('');
      setResult(undefined);
    });
  };

  const rowsFor = (key: Key): { cols: string; headers: string[]; rows: Row[]; more: string } | undefined => {
    if (key === 'teachers' && previews.teachers) {
      const p = previews.teachers;
      return {
        cols: '2fr 2fr 1fr 1.2fr',
        headers: ['СОТРУДНИК', 'ПРЕДМЕТЫ', 'ГРУПП В CRM', 'СТАТУС'],
        rows: p.rows.map((r) => ({
          a: r.name,
          b: r.subjects,
          c: String(r.groups),
          d: r.status === 'new' ? 'Новый' : 'Без изменений',
          tone: r.status === 'new' ? 'add' : 'ok',
        })),
        more: p.total > p.rows.length ? `и ещё ${p.total - p.rows.length} сотрудников` : '',
      };
    }
    if (key === 'groups' && previews.groups) {
      const p = previews.groups;
      const labels = {
        new: ['Новая', 'add'],
        unchanged: ['Без изменений', 'ok'],
        no_teacher: ['Учитель не найден', 'warn'],
      } as const;
      return {
        cols: '2.2fr 1.6fr 1.6fr 1.4fr',
        headers: ['ГРУППА', 'ПРЕДМЕТ · ТИП', 'УЧИТЕЛЬ', 'СТАТУС'],
        rows: p.rows.map((r) => ({
          a: r.name,
          b: r.subject,
          c: r.teacher || '—',
          d: labels[r.status][0],
          tone: labels[r.status][1],
        })),
        more: p.total > p.rows.length ? `и ещё ${p.total - p.rows.length} групп` : '',
      };
    }
    if (key === 'students' && previews.students) {
      const p = previews.students;
      return {
        cols: '2fr 0.7fr 2.6fr 1.4fr',
        headers: ['УЧЕНИК', 'КЛАСС', 'ГРУППЫ ИЗ ФАЙЛА', 'СТАТУС'],
        rows: p.rows.map((r) => ({
          a: r.name,
          b: r.grade ? String(r.grade) : '—',
          c: r.groups,
          d: studentLabels[r.status][0],
          tone: studentLabels[r.status][1],
        })),
        more: p.total > p.rows.length ? `и ещё ${p.total - p.rows.length} учеников` : '',
      };
    }
    return undefined;
  };

  const chipsFor = (key: Key): { text: string; tone?: Tone }[] => {
    if (key === 'teachers' && previews.teachers) {
      const p = previews.teachers;
      return [
        { text: plural(p.total, 'сотрудник', 'сотрудника', 'сотрудников') },
        ...(p.new ? [{ text: `${p.new} новых`, tone: 'add' as const }] : []),
        { text: `${p.unchanged} без изменений` },
      ];
    }
    if (key === 'groups' && previews.groups) {
      const p = previews.groups;
      return [
        { text: plural(p.total, 'группа', 'группы', 'групп') },
        ...(p.new ? [{ text: `${p.new} новых`, tone: 'add' as const }] : []),
        { text: `учитель найден у ${p.with_teacher}` },
        ...(p.without_teacher ? [{ text: `${p.without_teacher} без учителя`, tone: 'warn' as const }] : []),
      ];
    }
    if (key === 'students' && previews.students) {
      const p = previews.students;
      return [
        { text: plural(p.total, 'ученик', 'ученика', 'учеников') },
        ...(p.new ? [{ text: `${p.new} новых`, tone: 'add' as const }] : []),
        ...(p.changed_groups ? [{ text: `${p.changed_groups} сменили группы` }] : []),
        ...(p.left ? [{ text: `${p.left} ушли` }] : []),
        ...(p.unknown_group
          ? [{ text: `${p.unknown_group} с неизвестной группой`, tone: 'warn' as const }]
          : []),
      ];
    }
    return [];
  };

  const doneSub = (key: Key): string => {
    if (key === 'legacy') {
      const p = previews.legacy;
      return restoredFrom
        ? `Восстановлено из копии ${restoredFrom}`
        : skipped || !p
          ? disk.data?.configured === false
            ? 'Пропущено — диск не подключён'
            : 'Пропущено — прошлой версии нет'
          : `${files.legacy?.name} · ${p.works} работ`;
    }
    return chipsFor(key)
      .map((chip) => chip.text)
      .join(' · ');
  };

  const stepState = (index: number): 'open' | 'done' | 'idle' =>
    cur === index ? 'open' : done.includes(index) ? 'done' : 'idle';

  const fileStep = (key: Key, index: number) => {
    const cfg = config[key];
    const file = files[key];
    const state = stepState(index);
    const locked = state === 'idle' && !done.includes(index - 1);
    const view = rowsFor(key);
    const sub =
      state === 'done'
        ? doneSub(key)
        : state === 'open'
          ? file
            ? 'Проверьте, что файл разобран верно'
            : cfg.idle
          : locked
            ? 'Сначала пройдите предыдущий шаг'
            : cfg.idle;
    return (
      <StepCard
        key={key}
        mark={state === 'done' ? '✓' : String(index + 1)}
        title={cfg.title}
        sub={sub}
        state={state}
        editLabel={key === 'legacy' ? 'Изменить' : 'Изменить файл'}
        onEdit={() => setCur(index)}
      >
        {key !== 'legacy' && (
          <input
            ref={(node) => {
              inputs.current[key] = node;
            }}
            type="file"
            accept={cfg.accept}
            hidden
            aria-label={`Файл: ${cfg.title}`}
            disabled={busy}
            onChange={(event) => {
              const picked = event.target.files?.[0];
              if (picked) upload(key, picked);
            }}
          />
        )}
        {!file ? (
          <>
            {key === 'legacy' ? (
              <>
                {disk.error ? (
                  <div className="imp-disk">
                    <p className="imp-text">Не удалось связаться с диском: {disk.error}</p>
                    <button type="button" className="imp-skip" onClick={() => void disk.refresh()}>
                      Повторить
                    </button>
                  </div>
                ) : !disk.data ? (
                  <p className="imp-text">Читаем диск…</p>
                ) : disk.data.configured ? (
                  <div className="imp-disk">
                    <strong>С подключённого диска</strong>
                    {disk.data.error ? (
                      <p className="imp-text">Не удалось прочитать диск: {disk.data.error}</p>
                    ) : disk.data.files.length === 0 ? (
                      <p className="imp-text">Копий и файлов прошлой версии на диске нет.</p>
                    ) : (
                      <p className="imp-text">
                        «Копия приложения» восстанавливает всю базу целиком (сначала на сервере сохраняется
                        страховочная копия текущей). «Старая программа» переносит прошлые работы из базы
                        прежней версии.
                      </p>
                    )}
                    {disk.data.files.map((item) => (
                      <div className="imp-disk-row" key={item.name}>
                        <span>
                          <b>{item.name}</b>
                          <small>
                            {backupTime(item.created)} · {fileSize(item.size)}
                          </small>
                        </span>
                        <div className="imp-disk-actions">
                          <span className={`imp-badge imp-tone-${item.current ? 'upd' : 'add'}`}>
                            {item.current ? 'Копия приложения' : 'Старая программа'}
                          </span>
                          <button
                            type="button"
                            className={item.current ? 'is-restore' : ''}
                            disabled={busy}
                            onClick={() => (item.current ? setRestoreName(item.name) : fromDisk(item.name))}
                          >
                            {item.current ? 'Восстановить' : 'Выбрать'}
                          </button>
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="imp-skip"
                      disabled={disk.loading}
                      onClick={() => void disk.refresh()}
                    >
                      {disk.loading ? 'Читаем диск…' : 'Обновить список'}
                    </button>
                  </div>
                ) : (
                  <div className="imp-disk">
                    <p className="imp-text">
                      Диск не подключён. Подключите его на вкладке «Резервные копии»: там же делаются копии и
                      откуда берётся прошлая версия.
                    </p>
                    <Link to="/school/backups" className="imp-skip">
                      Открыть «Резервные копии»
                    </Link>
                  </div>
                )}
                <button type="button" className="imp-skip" disabled={busy} onClick={skipLegacy}>
                  Прошлой версии нет — пропустить
                </button>
              </>
            ) : (
              <button
                type="button"
                className="imp-drop"
                disabled={busy}
                onClick={() => inputs.current[key]?.click()}
              >
                <UploadCloud size={22} />
                <strong>{busy ? 'Читаем файл…' : cfg.upload}</strong>
                <span>{cfg.hint}</span>
              </button>
            )}
          </>
        ) : (
          <>
            <div className="imp-file">
              <span>
                <FileText size={18} />
                {file.name}
              </span>
              <button type="button" disabled={busy} onClick={() => clear(key)}>
                Заменить
              </button>
            </div>
            {key === 'legacy' && previews.legacy && (
              <>
                <div className="imp-tiles">
                  <div>
                    <span>Предметов</span>
                    <strong>{previews.legacy.subjects}</strong>
                  </div>
                  <div>
                    <span>Работ с результатами</span>
                    <strong>{previews.legacy.works.toLocaleString('ru-RU')}</strong>
                  </div>
                  <div>
                    <span>Учеников с работами</span>
                    <strong>{previews.legacy.students.toLocaleString('ru-RU')}</strong>
                  </div>
                </div>
                <p className="imp-text">
                  Работы привяжутся к ученикам по ФИО, когда вы загрузите список учеников. В итоге будет
                  видно, сколько работ вернулось. Они появятся в «Результатах» как проверенные и не будут
                  опубликованы.
                </p>
              </>
            )}
            {view && (
              <>
                <div className="imp-chips">
                  {chipsFor(key).map((chip) => (
                    <Chip key={chip.text} {...chip} />
                  ))}
                </div>
                <Preview {...view} />
              </>
            )}
            <div className="imp-actions">
              <button type="button" className="imp-next" disabled={busy} onClick={() => next(index)}>
                {key === 'students' ? 'К итогу' : 'Далее'}
              </button>
            </div>
          </>
        )}
      </StepCard>
    );
  };

  const report = result?.report;
  const totals = report
    ? [
        {
          label: 'Учеников',
          value: report.students?.total ?? '—',
          note: report.students
            ? `+${report.students.new} новых · ${report.students.left} уйдут в архив · ${report.students.changed_groups} сменят группы`
            : 'файл не загружен',
        },
        {
          label: 'Сотрудников',
          value: report.teachers?.total ?? '—',
          note: report.teachers ? `+${report.teachers.new} новых` : 'файл не загружен',
        },
        {
          label: 'Групп',
          value: report.groups?.total ?? '—',
          note: report.groups ? `+${report.groups.new} новых` : 'файл не загружен',
        },
        report.legacy
          ? {
              label: 'Прошлых работ',
              value: report.legacy.works.toLocaleString('ru-RU'),
              note: `${report.legacy.linked} вернутся ученикам · ${report.legacy.unlinked} не привязаны`,
            }
          : { label: 'Прошлых работ', value: '—', note: 'прошлая версия не загружена' },
      ]
    : [];

  return (
    <div className="sc-section imp-page">
      <ErrorNotice message={error} />
      {success && (
        <div className="success-notice" role="status">
          <CheckCircle2 size={20} />
          {success}
        </div>
      )}
      <p className="imp-intro">
        Сначала прошлая версия, если она есть, — чтобы вернуть прошлые работы. Затем учителя и группы, потом
        ученики — тогда каждый ученик сразу попадёт в свои группы.
      </p>
      <div className="imp-flow">
        {order.map((key, index) => fileStep(key, index))}
        <StepCard
          mark="5"
          title="Итог импорта"
          sub={
            cur === 4
              ? 'Так будет выглядеть школа после импорта'
              : 'Появится после загрузки учителей, групп и учеников'
          }
          state={cur === 4 ? 'open' : 'idle'}
        >
          {report ? (
            <>
              <div className="imp-totals">
                {totals.map((total) => (
                  <div key={total.label}>
                    <span>{total.label}</span>
                    <strong>{total.value}</strong>
                    <small>{total.note}</small>
                  </div>
                ))}
              </div>
              {result.warnings.length > 0 && (
                <div className="imp-warnings">
                  <span>Проверьте перед применением</span>
                  {result.warnings.map((warning) => (
                    <div key={warning.n + warning.text}>
                      <b>{warning.n}</b>
                      <span>{warning.text}</span>
                    </div>
                  ))}
                </div>
              )}
              {result.backup && <BackupCheck state={result.backup} />}
              <div className="imp-final">
                <span>Ничего не изменится, пока вы не нажмёте «Применить»</span>
                <button
                  type="button"
                  className="imp-next"
                  disabled={busy}
                  onClick={() => setConfirming(true)}
                >
                  Применить импорт
                </button>
              </div>
            </>
          ) : (
            <p className="imp-text">
              {busy ? 'Считаем итог…' : 'Не удалось посчитать итог. Вернитесь к шагам.'}
            </p>
          )}
        </StepCard>
      </div>
      {restoreName && (
        <ConfirmDialog
          title="Восстановить базу из копии?"
          text={`Все текущие данные (ученики, группы, пробники, результаты) будут заменены данными из копии ${restoreName}. Перед этим на сервере сохранится страховочная копия текущей базы. Затем импорт продолжится: загрузите учителей, группы и учеников.`}
          confirm="Восстановить"
          danger
          busy={busy}
          onClose={() => setRestoreName(null)}
          onConfirm={restoreFromCopy}
        />
      )}
      {confirming && result && (
        <ConfirmDialog
          title="Применить импорт?"
          text="Данные школы обновятся: учителя, группы, ученики и результаты прошлой версии. Ученики, которых нет в файле, перейдут в архив, их история и результаты сохранятся."
          confirm="Применить"
          busy={busy}
          onClose={() => setConfirming(false)}
          onConfirm={apply}
        />
      )}
    </div>
  );
}
