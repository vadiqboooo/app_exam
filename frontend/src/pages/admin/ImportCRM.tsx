import { useRef, useState } from 'react';
import { UploadCloud, FileSpreadsheet, CheckCircle2, ArrowRight } from 'lucide-react';
import { api } from '../../api/client';
import type { ChangeKey, ImportAnalysis, ImportPreview } from '../../types';
import { useWorkspace } from '../../layouts/Workspace';
import { useAction } from '../../hooks/useAction';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/Button';
import { ErrorNotice } from '../../components/ErrorNotice';
import { DataTable } from '../../components/DataTable';
import { ConfirmDialog } from '../../components/ConfirmDialog';

const labels: Record<ChangeKey, string> = {
  unchanged: 'Без изменений',
  new: 'Новые',
  returned: 'Вернувшиеся',
  left: 'Ушедшие',
  changed_groups: 'Сменили группы',
  new_groups: 'Новые группы',
  new_teachers: 'Новые учителя',
  updated: 'Обновлены данные',
};
export function ImportCRM() {
  const { refresh } = useWorkspace();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File>();
  const [analysis, setAnalysis] = useState<ImportAnalysis>();
  const [grades, setGrades] = useState<(number | null)[]>([]);
  const [preview, setPreview] = useState<ImportPreview>();
  const [tab, setTab] = useState<ChangeKey>('new');
  const [confirming, setConfirming] = useState(false);
  const [success, setSuccess] = useState(false);
  const { busy, error, run, clearError } = useAction();
  const selectedCount =
    analysis?.grades.reduce((total, item) => total + (grades.includes(item.grade) ? item.count : 0), 0) ?? 0;
  const gradeLabel = (grade: number | null) => (grade === null ? 'Без класса' : `${grade} класс`);
  const selectGrades = (next: (number | null)[]) => {
    setGrades(next);
    setPreview(undefined);
    setConfirming(false);
    clearError();
  };
  const reset = () => {
    setAnalysis(undefined);
    setGrades([]);
    setPreview(undefined);
    setFile(undefined);
    clearError();
    if (input.current) input.current.value = '';
  };
  const analyze = (file: File) => {
    setFile(file);
    setPreview(undefined);
    setSuccess(false);
    setAnalysis(undefined);
    setGrades([]);
    void run(async () => {
      const result = await api.import.analyze(file);
      setAnalysis(result);
      setGrades(result.grades.map((item) => item.grade));
    });
  };
  const previewSelection = () => {
    if (!file || !grades.length) return;
    setPreview(undefined);
    void run(async () => {
      const result = await api.import.preview(file, grades);
      setPreview(result);
      setTab(
        (Object.keys(labels) as ChangeKey[]).find((k) => k !== 'unchanged' && result.report[k] > 0) ??
          'unchanged',
      );
    });
  };
  return (
    <div className="stack page-stack">
      <PageHeader
        title="Импорт CRM"
        subtitle="Обновляйте учеников, группы и учителей, сохраняя всю историю обучения."
      />
      <ErrorNotice message={error} />
      {success && (
        <div className="success-notice" role="status">
          <CheckCircle2 size={20} />
          Изменения применены. Ученики, группы и учителя обновлены.
        </div>
      )}
      <div className="import-steps">
        <span className="active">
          <b>1</b>Загрузите файл
        </span>
        <ArrowRight size={16} />
        <span className={analysis ? 'active' : ''}>
          <b>2</b>Выберите классы
        </span>
        <ArrowRight size={16} />
        <span className={preview ? 'active' : ''}>
          <b>3</b>Проверьте и подтвердите
        </span>
      </div>
      {!analysis ? (
        <section className="upload-panel">
          <span className="upload-icon">
            <UploadCloud size={35} />
          </span>
          <h2>Загрузите выгрузку из CRM</h2>
          <p>
            Выберите полную выгрузку учеников в формате Excel (.xlsx).
            <br />
            После загрузки выберите классы для импорта.
          </p>
          <input
            ref={input}
            type="file"
            accept=".xlsx"
            aria-label="Файл CRM"
            hidden
            disabled={busy}
            onChange={(e) => {
              if (e.target.files?.[0]) analyze(e.target.files[0]);
            }}
          />
          <Button icon={<UploadCloud size={17} />} disabled={busy} onClick={() => input.current?.click()}>
            {busy ? 'Анализируем файл…' : 'Загрузить Excel'}
          </Button>
          {file && <span className="muted small">{file.name}</span>}
        </section>
      ) : (
        <>
          <div className="file-banner">
            <FileSpreadsheet size={27} />
            <div>
              <strong>{file?.name}</strong>
              <span>В файле: {analysis.total} учеников</span>
            </div>
            <span className="badge badge-checked">Анализ завершён</span>
          </div>
          <section className="panel grade-selection" aria-labelledby="grade-selection-title">
            <h2 id="grade-selection-title">Классы для импорта</h2>
            <p className="muted">Отметьте нужные классы. Количество указано по всем ученикам в файле.</p>
            <div className="inline">
              <Button
                variant="secondary"
                disabled={busy || !analysis.grades.length}
                onClick={() => selectGrades(analysis.grades.map((item) => item.grade))}
              >
                Выбрать все
              </Button>
              <Button variant="ghost" disabled={busy || !grades.length} onClick={() => selectGrades([])}>
                Снять выбор
              </Button>
            </div>
            <div className="grade-options">
              {analysis.grades.map(({ grade, count }) => (
                <label className="grade-option" key={grade ?? 'unknown'}>
                  <input
                    type="checkbox"
                    checked={grades.includes(grade)}
                    disabled={busy}
                    aria-label={gradeLabel(grade)}
                    onChange={(e) =>
                      selectGrades(
                        e.target.checked ? [...grades, grade] : grades.filter((value) => value !== grade),
                      )
                    }
                  />
                  <span>{gradeLabel(grade)}</span>
                  <strong>{count}</strong>
                </label>
              ))}
            </div>
            <p role="status">
              Выбрано: {selectedCount} из {analysis.total} учеников
            </p>
            {!selectedCount && <p className="muted">Выберите хотя бы один класс с учениками.</p>}
            <div className="inline">
              <Button disabled={busy || !selectedCount} onClick={previewSelection}>
                {busy ? 'Анализируем…' : 'Показать изменения'}
              </Button>
              <Button variant="secondary" disabled={busy} onClick={reset}>
                Другой файл
              </Button>
            </div>
          </section>
          {preview && (
            <>
              <div className="import-summary">
                {Object.entries(labels).map(([key, label]) => (
                  <button
                    key={key}
                    className={tab === key ? 'selected' : ''}
                    onClick={() => setTab(key as ChangeKey)}
                  >
                    <span>{label}</span>
                    <strong>{preview.report[key as ChangeKey]}</strong>
                  </button>
                ))}
              </div>
              <div className="section-heading">
                <h2>{labels[tab]}</h2>
                <span className="muted small">
                  Связей добавлено: {preview.report.memberships_added} · Закрыто:{' '}
                  {preview.report.memberships_closed}
                </span>
              </div>
              <DataTable
                rows={preview.changes[tab] ?? []}
                rowKey={(r) => `${r.full_name}-${(preview.changes[tab] ?? []).indexOf(r)}`}
                label="Изменения импорта"
                empty="В этой категории изменений нет"
                columns={[
                  {
                    title:
                      tab === 'new_groups'
                        ? 'Название группы'
                        : tab === 'new_teachers'
                          ? 'Учитель'
                          : 'Ученик',
                    render: (r) => <strong>{r.full_name}</strong>,
                  },
                  ...(tab === 'changed_groups'
                    ? [
                        { title: 'Было', render: (r: { before?: string[] }) => r.before?.join(', ') || '—' },
                        { title: 'Станет', render: (r: { after?: string[] }) => r.after?.join(', ') || '—' },
                      ]
                    : []),
                ]}
              />
              <div className="import-actions">
                <p>До подтверждения данные в базе остаются прежними.</p>
                <div className="inline">
                  <Button variant="secondary" disabled={busy} onClick={reset}>
                    Отмена
                  </Button>
                  <Button disabled={busy} onClick={() => setConfirming(true)}>
                    Применить изменения
                  </Button>
                </div>
              </div>
            </>
          )}
        </>
      )}
      <div className="info-panel">
        <strong>История учеников сохраняется</strong>
        <p>
          Импорт обновляет только выбранные классы. Ученики остальных классов остаются без изменений.
          Отсутствующие в полной выгрузке ученики выбранных классов перейдут в архив; история и результаты
          сохранятся. Загружайте полную выгрузку, а классы выбирайте здесь.
        </p>
      </div>
      {confirming && preview && file && (
        <ConfirmDialog
          title="Применить изменения CRM?"
          text={`Выбраны: ${grades.map(gradeLabel).join(', ')}. К импорту: ${preview.report.total} учеников. В архив перейдут: ${preview.report.left}. Остальные классы останутся без изменений. История и результаты сохранятся.`}
          confirm="Применить"
          busy={busy}
          onClose={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            void run(async () => {
              await api.import.apply(file, preview.confirmation, grades);
              await refresh();
              reset();
              setSuccess(true);
            });
          }}
        />
      )}
    </div>
  );
}
