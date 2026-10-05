import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { SubjectVariant } from '../types';
import type { EventSubject } from '../lib/useEventVariants';
import { useAction } from '../hooks/useAction';
import { Button } from './Button';
import { EmptyState } from './EmptyState';
import { ErrorNotice } from './ErrorNotice';

const day = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' });
const sizeLabel = (bytes: number) =>
  bytes >= 1048576
    ? `${(bytes / 1048576).toFixed(1).replace('.', ',')} МБ`
    : `${Math.max(1, Math.round(bytes / 1024))} КБ`;
const isPdf = (variant: SubjectVariant) => variant.filename.toLowerCase().endsWith('.pdf');
const extension = (variant: SubjectVariant) => (isPdf(variant) ? 'PDF' : 'DOC');

function printPdf(blob: Blob) {
  const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden';
  frame.onload = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    // Keep the frame until the print dialog is surely closed.
    setTimeout(() => {
      frame.remove();
      URL.revokeObjectURL(url);
    }, 60_000);
  };
  frame.src = url;
  document.body.appendChild(frame);
}

export function EventVariants({
  rows,
  loaded,
  error,
  onChange,
}: {
  rows: EventSubject[];
  loaded: boolean;
  error?: string;
  onChange: () => Promise<void>;
}) {
  const files = rows.flatMap((row) => row.variants.map((variant) => ({ row, variant })));
  const [selectedId, setSelectedId] = useState<number>();
  const selected = files.find((file) => file.variant.id === selectedId) ?? files[0];
  const [preview, setPreview] = useState<string>();
  const action = useAction();
  const ready = rows.filter((row) => row.variants.length).length;
  const selectedFile = selected?.variant;

  // PDF files are shown by the browser's own viewer; Word files cannot be previewed.
  useEffect(() => {
    setPreview(undefined);
    if (!selectedFile || !isPdf(selectedFile)) return;
    let url: string | undefined;
    let cancelled = false;
    api.subjects.variants
      .blob(selectedFile)
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
        setPreview(url);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [selectedFile]);

  if (!loaded) return <div className="ev-note">Загружаем варианты…</div>;
  if (!rows.length) return <EmptyState title="В пробнике нет предметов" />;

  const stats: [string, number, string, string][] = [
    ['Предметов', rows.length, 'в пробнике', 'violet'],
    ['С вариантами', ready, 'готовы к печати', 'green'],
    ['Не хватает', rows.length - ready, 'нужно загрузить', 'amber'],
    ['Файлов', files.length, 'PDF и Word', 'blue'],
  ];

  return (
    <>
      <ErrorNotice message={error} />
      <div className="ev-stats">
        {stats.map(([label, value, sub, tone]) => (
          <div className={`ev-stat is-${tone}`} key={label}>
            <b>{value}</b>
            <span>
              <strong>{label}</strong>
              <small>{sub}</small>
            </span>
          </div>
        ))}
      </div>
      <div className="ev-split">
        <section className="ev-table">
          <div className="ev-row ev-head">
            <span>ПРЕДМЕТ</span>
            <span>ВАРИАНТЫ</span>
            <span />
          </div>
          {rows.map(({ exam, subject, variants, others }) => (
            <div className={`ev-row ${variants.length ? '' : 'is-empty'}`} key={exam.id}>
              <div className="ev-subject">
                <strong>{exam.subject}</strong>
                <small className={subject?.responsible_name ? '' : 'is-warn'}>
                  {subject?.responsible_name
                    ? `Ответственный: ${subject.responsible_name}`
                    : 'Ответственный не назначен'}
                </small>
              </div>
              <div className="ev-files">
                {variants.map((variant) => (
                  <button
                    type="button"
                    key={variant.id}
                    aria-pressed={selected?.variant.id === variant.id}
                    onClick={() => setSelectedId(variant.id)}
                  >
                    <span className={`sb-ext sb-ext-${extension(variant).toLowerCase()}`}>
                      {extension(variant)}
                    </span>
                    {variant.name}
                  </button>
                ))}
                {!variants.length && <span className="ev-badge">Не загружены</span>}
                {exam.event_id !== null &&
                  others.map((variant) => (
                    <button
                      type="button"
                      key={variant.id}
                      className="ev-add"
                      disabled={action.busy}
                      title="Добавить вариант к этому пробнику"
                      onClick={() =>
                        void action.run(async () => {
                          await api.subjects.variants.setEvents(variant.id, [
                            ...variant.event_ids,
                            exam.event_id!,
                          ]);
                          await onChange();
                        })
                      }
                    >
                      + {variant.name}
                    </button>
                  ))}
              </div>
              <div className="ev-action">
                {subject ? (
                  <Link
                    to={`/school/subjects/${subject.id}`}
                    className={subject.responsible_id ? '' : 'is-primary'}
                  >
                    {subject.responsible_id ? 'Настройки' : 'Назначить'}
                  </Link>
                ) : null}
              </div>
            </div>
          ))}
        </section>
        <aside className="ev-preview" aria-label="Просмотр файла">
          {selected ? (
            <>
              <div className="ev-preview-head">
                <div>
                  <strong>
                    {selected.row.exam.subject} · {selected.variant.name}
                  </strong>
                  <small>
                    {selected.variant.filename} · {sizeLabel(selected.variant.size)} · загружен{' '}
                    {day.format(new Date(selected.variant.uploaded_at)).replace('.', '')}
                  </small>
                </div>
                <span className={`sb-ext sb-ext-${extension(selected.variant).toLowerCase()}`}>
                  {extension(selected.variant)}
                </span>
              </div>
              <div className="ev-sheet">
                {isPdf(selected.variant) ? (
                  preview ? (
                    <iframe title={selected.variant.name} src={preview} />
                  ) : (
                    <span>Загружаем файл…</span>
                  )
                ) : (
                  <span>Предпросмотр Word недоступен. Скачайте файл, чтобы открыть его.</span>
                )}
              </div>
              <ErrorNotice message={action.error} />
              <div className="ev-preview-actions">
                <Button
                  variant="secondary"
                  disabled={action.busy}
                  onClick={() => void action.run(() => api.subjects.variants.download(selected.variant))}
                >
                  Скачать
                </Button>
                <Button
                  disabled={action.busy}
                  onClick={() =>
                    void action.run(async () => {
                      // Browsers can print PDF only; a Word file is saved to be printed from Word.
                      if (isPdf(selected.variant))
                        printPdf(await api.subjects.variants.blob(selected.variant));
                      else await api.subjects.variants.download(selected.variant);
                    })
                  }
                >
                  {isPdf(selected.variant) ? 'Печать' : 'Скачать для печати'}
                </Button>
              </div>
            </>
          ) : (
            <EmptyState
              title="Вариантов пока нет"
              text="Ответственный учитель или администратор загружает их в настройках предмета."
            />
          )}
        </aside>
      </div>
    </>
  );
}
