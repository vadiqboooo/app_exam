import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, FileText, UploadCloud, X } from 'lucide-react';
import { api } from '../../api/client';
import type { ImportRun, LegacyStep, RosterStep, StudentStatus } from '../../types';
import { useWorkspace } from '../../layouts/Workspace';
import { useAction } from '../../hooks/useAction';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { ErrorNotice } from '../../components/ErrorNotice';
import { BackupCheck } from './Backups';
import { plural } from '../../lib/adminEvents';
import { backupTime, fileSize } from '../../lib/backup';
import { useLoad } from '../../hooks/useLoad';

type Tone = 'ok' | 'add' | 'warn' | 'upd';

const studentLabels: Record<StudentStatus, [string, Tone]> = {
  new: ['Новый', 'add'],
  returned: ['Вернулся', 'add'],
  left: ['Ушёл в архив', 'warn'],
  changed_groups: ['Сменил группы', 'upd'],
  updated: ['Обновлён', 'upd'],
  unchanged: ['Без изменений', 'ok'],
  unknown_group: ['Группа не найдена', 'warn'],
};

function Chip({ text, tone = 'ok' }: { text: string; tone?: Tone }) {
  return <span className={`imp-chip imp-tone-${tone}`}>{text}</span>;
}

function StepCard({
  mark,
  title,
  sub,
  state,
  onEdit,
  children,
}: {
  mark: string;
  title: string;
  sub: string;
  state: 'open' | 'done' | 'idle';
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
            Изменить
          </button>
        )}
      </div>
      {state === 'open' && children && <div className="imp-card-body">{children}</div>}
    </section>
  );
}

function PreviewTable({
  headers,
  rows,
  more,
}: {
  headers: string[];
  rows: { cells: string[]; status: string; tone: Tone }[];
  more?: string;
}) {
  const columns = headers.map((_, index) => (index === 0 ? '2fr' : '1.4fr')).join(' ');
  return (
    <div className="imp-table">
      <div className="imp-row imp-row-head" style={{ gridTemplateColumns: columns }}>
        {headers.map((header) => (
          <span key={header}>{header}</span>
        ))}
      </div>
      {rows.map((row, index) => (
        <div className="imp-row" style={{ gridTemplateColumns: columns }} key={`${row.cells[0]}-${index}`}>
          {row.cells.map((cell, cellIndex) =>
            cellIndex === row.cells.length - 1 ? (
              <span key={cellIndex}>
                <span className={`imp-badge imp-tone-${row.tone}`}>{row.status}</span>
              </span>
            ) : cellIndex === 0 ? (
              <strong key={cellIndex}>{cell}</strong>
            ) : (
              <span key={cellIndex}>{cell}</span>
            ),
          )}
        </div>
      ))}
      {more && <div className="imp-more">{more}</div>}
    </div>
  );
}

const loadLegacyFiles = () => api.backups.legacyFiles();

export function ImportCRM() {
  const { data, refresh } = useWorkspace();
  const knownSchools = [
    ...new Set(data.students.map((student) => student.school).filter((name): name is string => !!name)),
  ].sort((a, b) => a.localeCompare(b, 'ru'));
  const { busy, error, run, clearError } = useAction();
  const rosterInput = useRef<HTMLInputElement | null>(null);
  const [stage, setStage] = useState(0);
  const [legacySkipped, setLegacySkipped] = useState(false);
  const [legacyFile, setLegacyFile] = useState<File>();
  const [legacyPreview, setLegacyPreview] = useState<LegacyStep>();
  const [rosterFiles, setRosterFiles] = useState<File[]>([]);
  // The school of each group file, in the order of the files.
  const [schools, setSchools] = useState<string[]>([]);
  const [rosterPreview, setRosterPreview] = useState<RosterStep>();
  const [result, setResult] = useState<ImportRun>();
  const [confirming, setConfirming] = useState(false);
  const [success, setSuccess] = useState('');
  const [restoreName, setRestoreName] = useState<string | null>(null);
  const [restoredFrom, setRestoredFrom] = useState('');
  const disk = useLoad(loadLegacyFiles);
  const diskChecked = useRef(false);

  const skipLegacy = () => {
    setLegacySkipped(true);
    setLegacyFile(undefined);
    setLegacyPreview(undefined);
    setStage(1);
    setResult(undefined);
  };

  useEffect(() => {
    if (diskChecked.current || !disk.data) return;
    diskChecked.current = true;
    if (!disk.data.configured || (!disk.data.error && disk.data.files.length === 0)) skipLegacy();
  }, [disk.data]);

  const chooseLegacy = (name: string) => {
    clearError();
    void run(async () => {
      const file = new File([await api.backups.downloadFile(name)], name.replace(/\.gz$/i, ''), {
        type: 'application/octet-stream',
      });
      setLegacyFile(file);
      setLegacyPreview(await api.import.legacy(file));
      setLegacySkipped(false);
      setRestoredFrom('');
      setResult(undefined);
    });
  };

  const restoreFromCopy = () => {
    const name = restoreName;
    if (!name) return;
    setRestoreName(null);
    clearError();
    void run(async () => {
      await api.backups.restore(name);
      await refresh();
      setRestoredFrom(name);
      skipLegacy();
    });
  };

  const chooseRosters = (picked: File[]) => {
    if (!picked.length) return;
    clearError();
    setSuccess('');
    setResult(undefined);
    setRosterFiles(picked);
    setSchools(picked.map(() => ''));
    setRosterPreview(undefined);
  };

  const setSchool = (index: number, value: string) => {
    setSchools(schools.map((item, itemIndex) => (itemIndex === index ? value : item)));
    setRosterPreview(undefined);
    setResult(undefined);
  };

  const checkRosters = () => {
    clearError();
    void run(async () => {
      setRosterPreview(await api.import.rosters(rosterFiles, schools.map((item) => item.trim())));
    });
  };

  const removeRoster = (index: number) => {
    const next = rosterFiles.filter((_, itemIndex) => itemIndex !== index);
    setResult(undefined);
    setRosterPreview(undefined);
    setRosterFiles(next);
    setSchools(schools.filter((_, itemIndex) => itemIndex !== index));
    if (!next.length && rosterInput.current) rosterInput.current.value = '';
  };

  const showSummary = () => {
    clearError();
    void run(async () => {
      const next = await api.import.run({
        rosters: rosterFiles,
        schools: schools.map((item) => item.trim()),
        legacy: legacySkipped ? undefined : legacyFile,
      });
      setResult(next);
      setStage(2);
    });
  };

  const apply = () => {
    if (!result) return;
    setConfirming(false);
    void run(async () => {
      await api.import.run(
        {
          rosters: rosterFiles,
          schools: schools.map((item) => item.trim()),
          legacy: legacySkipped ? undefined : legacyFile,
        },
        result.confirmation,
      );
      await refresh();
      setSuccess('Импорт применён. Учителя, группы и ученики обновлены.');
      setStage(1);
      setRosterFiles([]);
      setSchools([]);
      setRosterPreview(undefined);
      setResult(undefined);
      if (rosterInput.current) rosterInput.current.value = '';
    });
  };

  const groupRows = rosterPreview?.groups.rows.map((row) => {
    const labels = {
      new: ['Новая', 'add'],
      unchanged: ['Без изменений', 'ok'],
      no_teacher: ['Учитель не найден', 'warn'],
    } as const;
    return {
      cells: [row.name, row.subject, row.teacher || '—', ''],
      status: labels[row.status][0],
      tone: labels[row.status][1],
    };
  });
  const studentRows = rosterPreview?.students.rows.map((row) => ({
    cells: [row.name, row.grade ? String(row.grade) : '—', row.groups, ''],
    status: studentLabels[row.status][0],
    tone: studentLabels[row.status][1],
  }));
  const report = result?.report;

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
        Загрузите один или несколько файлов групп из разных школ. В каждом файле нужны колонки «Название»,
        «Клиенты» и «Отв. педагог». Предмет и тип экзамена определятся из названия группы.
      </p>
      <div className="imp-flow">
        <StepCard
          mark={stage > 0 ? '✓' : '1'}
          title="Прошлая версия"
          sub={
            restoredFrom
              ? `Восстановлено из копии ${restoredFrom}`
              : legacySkipped
                ? 'Пропущено — прошлой версии нет'
                : legacyFile && legacyPreview
                  ? `${legacyFile.name} · ${legacyPreview.works} работ`
                  : 'Необязательно: верните работы из старой версии'
          }
          state={stage === 0 ? 'open' : 'done'}
          onEdit={() => setStage(0)}
        >
          {disk.error ? (
            <div className="imp-disk">
              <p className="imp-text">Не удалось связаться с диском: {disk.error}</p>
            </div>
          ) : !disk.data ? (
            <p className="imp-text">Читаем диск…</p>
          ) : disk.data.configured ? (
            <div className="imp-disk">
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
                      disabled={busy}
                      onClick={() => (item.current ? setRestoreName(item.name) : chooseLegacy(item.name))}
                    >
                      {item.current ? 'Восстановить' : 'Выбрать'}
                    </button>
                  </div>
                </div>
              ))}
              <button type="button" className="imp-skip" onClick={() => void disk.refresh()}>
                Обновить список
              </button>
            </div>
          ) : (
            <p className="imp-text">
              Диск не подключён. <Link to="/school/backups">Открыть резервные копии</Link>
            </p>
          )}
          <div className="imp-actions">
            <button type="button" className="imp-skip" disabled={busy} onClick={skipLegacy}>
              Пропустить
            </button>
            {legacyFile && (
              <button type="button" className="imp-next" disabled={busy} onClick={() => setStage(1)}>
                Далее
              </button>
            )}
          </div>
        </StepCard>

        <StepCard
          mark={stage > 1 ? '✓' : '2'}
          title="Группы и ученики"
          sub={
            stage > 1 && rosterPreview
              ? `${plural(rosterPreview.files, 'файл', 'файла', 'файлов')} · ${plural(rosterPreview.groups.total, 'группа', 'группы', 'групп')} · ${plural(rosterPreview.students.total, 'ученик', 'ученика', 'учеников')}`
              : stage === 1
                ? 'Выберите сразу все актуальные файлы школ'
                : 'Сначала пройдите предыдущий шаг'
          }
          state={stage === 1 ? 'open' : stage > 1 ? 'done' : 'idle'}
          onEdit={() => setStage(1)}
        >
          <input
            ref={rosterInput}
            type="file"
            accept=".xlsx"
            multiple
            hidden
            aria-label="Файлы групп"
            disabled={busy}
            onChange={(event) => chooseRosters(Array.from(event.target.files ?? []))}
          />
          {!rosterFiles.length ? (
            <button
              type="button"
              className="imp-drop"
              disabled={busy}
              onClick={() => rosterInput.current?.click()}
            >
              <UploadCloud size={22} />
              <strong>{busy ? 'Читаем файлы…' : 'Загрузить Excel-файлы'}</strong>
              <span>Можно выбрать несколько .xlsx из разных школ одновременно</span>
            </button>
          ) : (
            <>
              <div className="imp-disk">
                <datalist id="known-schools">
                  {knownSchools.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
                {rosterFiles.map((file, index) => (
                  <div className="imp-disk-row" key={`${file.name}-${file.lastModified}`}>
                    <span>
                      <b>
                        <FileText size={16} /> {file.name}
                      </b>
                      <small>{fileSize(file.size)}</small>
                    </span>
                    <label className="imp-school">
                      Школа
                      <input
                        list="known-schools"
                        placeholder="Например, Школа №12"
                        value={schools[index] ?? ''}
                        disabled={busy}
                        onChange={(event) => setSchool(index, event.target.value)}
                      />
                    </label>
                    <button
                      type="button"
                      className="imp-edit"
                      disabled={busy}
                      onClick={() => removeRoster(index)}
                      aria-label={`Убрать ${file.name}`}
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="imp-skip"
                  disabled={busy}
                  onClick={() => rosterInput.current?.click()}
                >
                  Выбрать другие файлы
                </button>
              </div>
              {rosterPreview && (
                <>
                  <div className="imp-chips">
                    <Chip text={plural(rosterPreview.files, 'файл', 'файла', 'файлов')} />
                    <Chip text={plural(rosterPreview.teachers.total, 'учитель', 'учителя', 'учителей')} />
                    <Chip text={plural(rosterPreview.groups.total, 'группа', 'группы', 'групп')} />
                    <Chip text={plural(rosterPreview.students.total, 'ученик', 'ученика', 'учеников')} />
                    {rosterPreview.groups.without_teacher > 0 && (
                      <Chip text={`${rosterPreview.groups.without_teacher} без учителя`} tone="warn" />
                    )}
                  </div>
                  <h3>Группы</h3>
                  <PreviewTable
                    headers={['ГРУППА', 'ПРЕДМЕТ · ТИП', 'УЧИТЕЛЬ', 'СТАТУС']}
                    rows={groupRows ?? []}
                    more={
                      rosterPreview.groups.total > (groupRows?.length ?? 0)
                        ? `и ещё ${rosterPreview.groups.total - (groupRows?.length ?? 0)} групп`
                        : ''
                    }
                  />
                  <h3>Ученики</h3>
                  <PreviewTable
                    headers={['УЧЕНИК', 'КЛАСС', 'ГРУППЫ', 'СТАТУС']}
                    rows={studentRows ?? []}
                    more={
                      rosterPreview.students.total > (studentRows?.length ?? 0)
                        ? `и ещё ${rosterPreview.students.total - (studentRows?.length ?? 0)} учеников`
                        : ''
                    }
                  />
                </>
              )}
              <div className="imp-actions">
                {rosterPreview ? (
                  <button type="button" className="imp-next" disabled={busy} onClick={showSummary}>
                    К итогу
                  </button>
                ) : (
                  <button
                    type="button"
                    className="imp-next"
                    disabled={busy || schools.length !== rosterFiles.length || schools.some((s) => !s.trim())}
                    onClick={checkRosters}
                  >
                    {busy ? 'Читаем файлы…' : 'Проверить файлы'}
                  </button>
                )}
                {!rosterPreview && schools.some((s) => !s.trim()) && (
                  <small>Укажите школу для каждого файла</small>
                )}
              </div>
            </>
          )}
        </StepCard>

        <StepCard
          mark="3"
          title="Итог импорта"
          sub={stage === 2 ? 'Так будет выглядеть база после импорта' : 'Появится после проверки файлов'}
          state={stage === 2 ? 'open' : 'idle'}
        >
          {report ? (
            <>
              <div className="imp-totals">
                <div>
                  <span>Учеников</span>
                  <strong>{report.students?.total ?? '—'}</strong>
                  <small>
                    {report.students
                      ? `+${report.students.new} новых · ${report.students.left} уйдут в архив`
                      : '—'}
                  </small>
                </div>
                <div>
                  <span>Учителей</span>
                  <strong>{report.teachers?.total ?? '—'}</strong>
                  <small>
                    {report.teachers
                      ? `+${report.teachers.new} новых · ${report.teachers.archived} уйдут в архив`
                      : '—'}
                  </small>
                </div>
                <div>
                  <span>Групп</span>
                  <strong>{report.groups?.total ?? '—'}</strong>
                  <small>{report.groups ? `+${report.groups.new} новых` : '—'}</small>
                </div>
                <div>
                  <span>Прошлых работ</span>
                  <strong>{report.legacy?.works ?? '—'}</strong>
                  <small>{report.legacy ? `${report.legacy.linked} привязаны` : 'не загружены'}</small>
                </div>
              </div>
              {result?.warnings.length ? (
                <div className="imp-warnings">
                  <span>Проверьте перед применением</span>
                  {result.warnings.map((warning) => (
                    <div key={warning.n + warning.text}>
                      <b>{warning.n}</b>
                      <span>{warning.text}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              {result?.backup && <BackupCheck state={result.backup} />}
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
              {busy ? 'Считаем итог…' : 'Не удалось посчитать итог. Вернитесь к файлам.'}
            </p>
          )}
        </StepCard>
      </div>

      {restoreName && (
        <ConfirmDialog
          title="Восстановить базу из копии?"
          text={`Текущая база будет заменена данными из копии ${restoreName}. Перед восстановлением сохранится страховочная копия.`}
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
          text="Учителя, группы и ученики обновятся по выбранным файлам. Те, кого нет ни в одном файле, перейдут в архив; история и результаты сохранятся."
          confirm="Применить"
          busy={busy}
          onClose={() => setConfirming(false)}
          onConfirm={apply}
        />
      )}
    </div>
  );
}
