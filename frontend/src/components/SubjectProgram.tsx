import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight, ChevronUp, Download, Eye, LoaderCircle, Plus, ShieldAlert, Trash2, Upload, X } from 'lucide-react';
import { api } from '../api/client';
import type { ProgramMaterial, ProgramTopicStatus, SubjectProgram as ProgramData, SubjectProgramWrite } from '../types';
import { useAction } from '../hooks/useAction';
import { Button } from './Button';
import { ErrorNotice } from './ErrorNotice';

type DraftTopic = { id?: number; title: string; status?: ProgramTopicStatus; author_name?: string | null };
type DraftSection = { id?: number; title: string; topics: DraftTopic[] };
type Preview = { id: number; filename: string; url: string; type: string };

async function previewType(blob: Blob): Promise<string | null> {
  const bytes = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  const starts = (...values: number[]) => values.every((value, index) => bytes[index] === value);
  if (starts(0x25, 0x50, 0x44, 0x46, 0x2d)) return 'application/pdf';
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (starts(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (starts(0x47, 0x49, 0x46, 0x38) && (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61) return 'image/gif';
  if (starts(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
  return null;
}

const statusNames: Record<ProgramTopicStatus, string> = {
  draft: 'Черновик',
  review: 'На проверке',
  changes: 'Нужны исправления',
  approved: 'Одобрена методистом',
};

function move<T>(items: T[], index: number, delta: number): T[] {
  const next = [...items];
  const target = index + delta;
  if (target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function TopicStatusPicker({
  title,
  status,
  canEdit,
  canReview,
  busy,
  onChange,
}: {
  title: string;
  status: ProgramTopicStatus;
  canEdit: boolean;
  canReview: boolean;
  busy: boolean;
  onChange: (status: ProgramTopicStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  if (!canEdit) return <span className={`sp-status-badge sp-status-${status}`}><i />{statusNames[status]}</span>;
  const choices: ProgramTopicStatus[] = canReview
    ? ['draft', 'review', 'changes', 'approved']
    : ['draft', 'review'];
  return (
    <div className={`sp-status-picker${open ? ' is-open' : ''}`} ref={root}>
      <button
        type="button"
        className={`sp-status-badge sp-status-${status}`}
        aria-label={`Статус темы «${title}»: ${statusNames[status]}. Изменить`}
        aria-expanded={open}
        aria-haspopup="menu"
        disabled={busy}
        onClick={() => setOpen((current) => !current)}
      >
        <i />{statusNames[status]}<ChevronDown size={14} />
      </button>
      {open && <div className="sp-status-menu" role="menu" aria-label={`Статус темы «${title}»`}>
        <strong>Статус темы</strong>
        {choices.map((choice) => (
          <button
            type="button"
            role="menuitemradio"
            aria-checked={status === choice}
            key={choice}
            className={status === choice ? 'is-current' : undefined}
            onClick={() => {
              setOpen(false);
              if (choice !== status) onChange(choice);
            }}
          >
            <span className={`sp-status-dot sp-status-${choice}`} />
            {statusNames[choice]}
            {status === choice && <CheckCircle2 size={16} />}
          </button>
        ))}
      </div>}
    </div>
  );
}

export function SubjectProgram({
  program,
  onSaved,
  editing,
  onEditingChange,
  selectedTopicId,
  onSelectTopic,
}: {
  program: ProgramData;
  onSaved: () => Promise<void>;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  selectedTopicId: number | null;
  onSelectTopic: (topicId: number | null) => void;
}) {
  const [draft, setDraft] = useState<DraftSection[] | null>(null);
  const [materials, setMaterials] = useState<ProgramMaterial[]>([]);
  const [materialError, setMaterialError] = useState('');
  const [materialBusy, setMaterialBusy] = useState(false);
  const [uploading, setUploading] = useState<{ name: string; index: number; total: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewBusyId, setPreviewBusyId] = useState<number | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [statusBusyId, setStatusBusyId] = useState<number | null>(null);
  const [statusError, setStatusError] = useState('');
  const previewRequest = useRef(0);
  const { busy, error, run } = useAction();
  const selectedSection = program.sections.find((section) => section.topics.some((topic) => topic.id === selectedTopicId));
  const selectedTopic = selectedSection?.topics.find((topic) => topic.id === selectedTopicId);

  useEffect(() => {
    if (editing) {
      onSelectTopic(null);
      setDraft(program.sections.map((section) => ({
        id: section.id,
        title: section.title,
        topics: section.topics.map((topic) => ({ id: topic.id, title: topic.title, status: topic.status, author_name: topic.author_name })),
      })));
    } else {
      setDraft(null);
    }
  }, [editing]);

  useEffect(() => {
    if (!preview) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPreview(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
      URL.revokeObjectURL(preview.url);
    };
  }, [preview]);

  useEffect(() => {
    previewRequest.current += 1;
    setPreview(null);
    setPreviewBusyId(null);
    setPreviewError('');
  }, [selectedTopicId]);

  useEffect(() => {
    setMaterials([]);
    if (selectedTopicId === null) return;
    let active = true;
    setMaterialError('');
    api.subjects.program.materials(program.subject_id, selectedTopicId)
      .then((items) => { if (active) setMaterials(items); })
      .catch((cause) => { if (active) setMaterialError(cause instanceof Error ? cause.message : 'Не удалось загрузить материалы'); });
    return () => { active = false; };
  }, [program.subject_id, selectedTopicId]);

  const uploadMaterials = async (files: File[]) => {
    if (selectedTopicId === null || !files.length || materialBusy || !program.can_edit) return;
    setMaterialBusy(true);
    setMaterialError('');
    const failures: string[] = [];
    let uploaded = 0;
    try {
      for (const [index, file] of files.entries()) {
        setUploading({ name: file.name, index: index + 1, total: files.length });
        try {
          await api.subjects.program.uploadMaterial(program.subject_id, selectedTopicId, file);
          uploaded += 1;
        } catch (cause) {
          failures.push(`${file.name}: ${cause instanceof Error ? cause.message : 'не удалось загрузить'}`);
        }
      }
      if (uploaded) {
        setMaterials(await api.subjects.program.materials(program.subject_id, selectedTopicId));
        await onSaved();
      }
    } catch (cause) {
      failures.push(cause instanceof Error ? cause.message : 'Не удалось обновить список файлов');
    } finally {
      setMaterialBusy(false);
      setUploading(null);
      if (failures.length) setMaterialError(failures.join('; '));
    }
  };

  const deleteMaterial = async (materialId: number) => {
    if (selectedTopicId === null || !window.confirm('Удалить материал?')) return;
    setMaterialBusy(true);
    setMaterialError('');
    try {
      await api.subjects.program.deleteMaterial(program.subject_id, selectedTopicId, materialId);
      setMaterials((current) => current.filter((item) => item.id !== materialId));
      if (preview?.id === materialId || previewBusyId === materialId) {
        previewRequest.current += 1;
        setPreview(null);
        setPreviewBusyId(null);
      }
      await onSaved();
    } catch (cause) {
      setMaterialError(cause instanceof Error ? cause.message : 'Не удалось удалить файл');
    } finally { setMaterialBusy(false); }
  };

  const downloadMaterial = async (material: ProgramMaterial) => {
    if (selectedTopicId === null) return;
    try {
      const blob = await api.subjects.program.downloadMaterial(program.subject_id, selectedTopicId, material.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = material.filename;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (cause) {
      setMaterialError(cause instanceof Error ? cause.message : 'Не удалось скачать файл');
    }
  };

  const openPreview = async (material: ProgramMaterial) => {
    if (selectedTopicId === null) return;
    const requestId = ++previewRequest.current;
    setPreview(null);
    setPreviewBusyId(material.id);
    setPreviewError('');
    try {
      const blob = await api.subjects.program.downloadMaterial(program.subject_id, selectedTopicId, material.id);
      if (requestId !== previewRequest.current) return;
      const type = await previewType(blob);
      if (requestId !== previewRequest.current) return;
      if (!type) throw new Error('Просмотр этого формата в браузере недоступен. Файл можно скачать.');
      setPreview({ id: material.id, filename: material.filename, type, url: URL.createObjectURL(new Blob([blob], { type })) });
    } catch (cause) {
      if (requestId === previewRequest.current)
        setPreviewError(cause instanceof Error ? cause.message : 'Не удалось открыть файл');
    } finally { if (requestId === previewRequest.current) setPreviewBusyId(null); }
  };

  const patchSection = (index: number, patch: Partial<DraftSection>) =>
    setDraft((current) => current?.map((item, i) => (i === index ? { ...item, ...patch } : item)) ?? null);
  const patchTopic = (sectionIndex: number, topicIndex: number, patch: Partial<DraftTopic>) =>
    setDraft(
      (current) =>
        current?.map((section, i) =>
          i === sectionIndex
            ? {
                ...section,
                topics: section.topics.map((topic, j) =>
                  j === topicIndex ? { ...topic, ...patch } : topic,
                ),
              }
            : section,
        ) ?? null,
    );
  const save = () =>
    void run(async () => {
      if (!draft) return;
      const payload: SubjectProgramWrite = {
        sections: draft.map((section) => ({
          id: section.id,
          title: section.title.trim(),
          topics: section.topics.map((topic) => ({ id: topic.id, title: topic.title.trim() })),
        })),
      };
      if (payload.sections.some((section) => !section.title || section.topics.some((topic) => !topic.title)))
        throw new Error('Заполните названия всех разделов и тем');
      await api.subjects.program.save(program.subject_id, payload);
      await onSaved();
      setDraft(null);
      onEditingChange(false);
    });

  const changeStatus = async (topicId: number, status: ProgramTopicStatus) => {
    setStatusBusyId(topicId);
    setStatusError('');
    try {
      await api.subjects.program.setTopicStatus(program.subject_id, topicId, status);
      await onSaved();
    } catch (cause) {
      setStatusError(cause instanceof Error ? cause.message : 'Не удалось изменить статус темы');
    } finally {
      setStatusBusyId(null);
    }
  };

  if (selectedTopic) return (
    <section className="sp-page">
      <div className="sp-lesson-heading">
        <TopicStatusPicker title={selectedTopic.title} status={selectedTopic.status} canEdit={program.can_edit} canReview={program.can_review} busy={statusBusyId !== null} onChange={(status) => void changeStatus(selectedTopic.id, status)} />
        <h2>{selectedTopic.title}</h2>
      </div>
      <ErrorNotice message={statusError} />
      <p className="sp-topic-author">Автор: {selectedTopic.author_name || 'Не указан'}</p>
      <div className="sp-lesson-workspace">
        <div className={`sp-lesson-card sp-file-panel${dragging ? ' is-dragging' : ''}`}
          onDragEnter={(event) => {
            if (!program.can_edit || !event.dataTransfer.types.includes('Files')) return;
            event.preventDefault();
            dragDepth.current += 1;
            setDragging(true);
          }}
          onDragOver={(event) => {
            if (!program.can_edit) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            dragDepth.current = Math.max(0, dragDepth.current - 1);
            if (dragDepth.current === 0) setDragging(false);
          }}
          onDrop={(event) => {
            if (!program.can_edit) return;
            event.preventDefault();
            dragDepth.current = 0;
            setDragging(false);
            void uploadMaterials(Array.from(event.dataTransfer.files));
          }}>
          <div className="sp-lesson-card-heading">
            <h3>Файлы <span className="sp-file-count">{materials.length}</span></h3>
            {program.can_edit && <label className="sp-upload">
              <Upload size={16} /> <span>Добавить</span>
              <input type="file" multiple disabled={materialBusy} onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                event.target.value = '';
                void uploadMaterials(files);
              }} />
            </label>}
          </div>
          <ErrorNotice message={materialError} />
          {uploading && <div className="sp-material sp-material-pending" role="status" aria-live="polite">
            <LoaderCircle size={19} className="sp-scan-spinner" />
            <span><strong>{uploading.name}</strong><small>Загружаем и проверяем антивирусом · {uploading.index} из {uploading.total}</small></span>
          </div>}
          {materials.length ? <div className="sp-materials">{materials.map((material) => (
            <div className={`sp-material${preview?.id === material.id ? ' is-active' : ''}`} key={material.id}>
              <button type="button" className="sp-material-open" disabled={previewBusyId === material.id} aria-label={`Просмотреть ${material.filename}`} aria-pressed={preview?.id === material.id} onClick={() => void openPreview(material)}>
                {previewBusyId === material.id ? <LoaderCircle size={17} className="sp-scan-spinner" /> : <Eye size={17} />}
                <span><strong>{material.filename}</strong><small>{(material.size / 1024).toFixed(0)} КБ</small>
                  {material.scanned_at
                    ? <small className="sp-scan-ok"><CheckCircle2 size={13} /> Проверен антивирусом</small>
                    : <small className="sp-scan-unknown"><ShieldAlert size={13} /> Проверка не подтверждена</small>}
                </span>
              </button>
              <button type="button" aria-label={`Скачать ${material.filename}`} onClick={() => void downloadMaterial(material)}><Download size={17} /></button>
              {program.can_edit && <button type="button" disabled={materialBusy} aria-label={`Удалить ${material.filename}`} onClick={() => void deleteMaterial(material.id)}><Trash2 size={17} /></button>}
            </div>
          ))}</div> : !uploading && <p className="sp-empty-row">Материалов пока нет.</p>}
          {program.can_edit && <p className="sp-drop-help">Можно перетащить сюда сразу несколько файлов</p>}
          {dragging && <div className="sp-drop-hint"><Upload size={28} /><strong>Отпустите файлы для загрузки</strong></div>}
        </div>
        <div className="sp-lesson-card sp-preview-panel" aria-label="Просмотр файла">
          {preview ? <>
            <div className="sp-preview-header"><strong>{preview.filename}</strong><button type="button" aria-label="Закрыть просмотр" onClick={() => setPreview(null)}><X size={20} /></button></div>
            {preview.type === 'application/pdf'
              ? <iframe title={preview.filename} src={preview.url} className="sp-preview-content" />
              : <div className="sp-preview-content sp-preview-image"><img src={preview.url} alt={preview.filename} /></div>}
          </> : <div className="sp-preview-empty" role="status">
            {previewBusyId !== null ? <LoaderCircle size={30} className="sp-scan-spinner" /> : <Eye size={34} />}
            <p>{previewError || (previewBusyId !== null ? 'Открываем файл…' : 'Выберите файл слева для просмотра')}</p>
          </div>}
        </div>
      </div>
    </section>
  );

  return (
    <section className="sp-page">
      <ErrorNotice message={error} />
      <ErrorNotice message={statusError} />

      {draft === null ? (
        program.sections.length ? (
          <div className="sp-sections">
            {program.sections.map((section, index) => (
              <details className="sp-section" key={section.id} open={index === 0}>
                <summary>
                  <span>
                    <small>Раздел {index + 1} · {section.topics.length} тем</small>
                    <strong>{section.title}</strong>
                  </span>
                  <ChevronDown size={19} />
                </summary>
                {section.topics.length ? (
                  <>
                    <div className="sp-topic-columns" aria-hidden="true"><span>Тема</span><span>Автор</span><span>Статус</span></div>
                    {section.topics.map((topic, topicIndex) => (
                    <div className="sp-topic" key={topic.id}>
                      <span className="sp-number">{topicIndex + 1}</span>
                      <button type="button" className="sp-topic-text sp-topic-open" onClick={() => onSelectTopic(topic.id)}>
                        <strong>{topic.title}</strong>
                      </button>
                      <span className="sp-topic-author-cell">{topic.author_name || 'Не указан'}</span>
                      <TopicStatusPicker title={topic.title} status={topic.status} canEdit={program.can_edit} canReview={program.can_review} busy={statusBusyId !== null} onChange={(status) => void changeStatus(topic.id, status)} />
                      <button type="button" className="sp-topic-chevron" aria-label={`Открыть тему «${topic.title}»`} onClick={() => onSelectTopic(topic.id)}><ChevronRight size={18} /></button>
                    </div>
                    ))}
                  </>
                ) : (
                  <p className="sp-empty-row">В этом разделе пока нет тем.</p>
                )}
              </details>
            ))}
          </div>
        ) : (
          <div className="sp-empty">
            {program.can_edit
              ? 'Программа ещё не создана. Добавьте первый раздел и темы.'
              : 'Одобренных тем по этому предмету пока нет.'}
          </div>
        )
      ) : (
        <div className="sp-edit">
          {draft.map((section, sectionIndex) => (
            <div className="sp-edit-section" key={section.id ?? `new-${sectionIndex}`}>
              <div className="sp-edit-heading">
                <label>
                  <span>Раздел {sectionIndex + 1}</span>
                  <input
                    aria-label={`Название раздела ${sectionIndex + 1}`}
                    value={section.title}
                    onChange={(event) => patchSection(sectionIndex, { title: event.target.value })}
                  />
                </label>
                <div className="sp-edit-actions">
                  <button type="button" aria-label="Поднять раздел" disabled={sectionIndex === 0} onClick={() => setDraft(move(draft, sectionIndex, -1))}><ChevronUp size={17} /></button>
                  <button type="button" aria-label="Опустить раздел" disabled={sectionIndex === draft.length - 1} onClick={() => setDraft(move(draft, sectionIndex, 1))}><ChevronDown size={17} /></button>
                  <button type="button" aria-label="Удалить раздел" onClick={() => setDraft(draft.filter((_, i) => i !== sectionIndex))}><Trash2 size={17} /></button>
                </div>
              </div>
              {section.topics.map((topic, topicIndex) => (
                <div className="sp-edit-topic" key={topic.id ?? `new-${topicIndex}`}>
                  <span className="sp-number">{topicIndex + 1}</span>
                  <label>
                    <input
                      aria-label={`Название темы ${topicIndex + 1} раздела ${sectionIndex + 1}`}
                      value={topic.title}
                      onChange={(event) => patchTopic(sectionIndex, topicIndex, { title: event.target.value })}
                    />
                    {topic.status && <small className={`sp-status sp-status-${topic.status}`}>{statusNames[topic.status]} · {topic.author_name || 'Автор не указан'}</small>}
                  </label>
                  <div className="sp-edit-actions">
                    <button type="button" aria-label="Поднять тему" disabled={topicIndex === 0} onClick={() => patchSection(sectionIndex, { topics: move(section.topics, topicIndex, -1) })}><ChevronUp size={16} /></button>
                    <button type="button" aria-label="Опустить тему" disabled={topicIndex === section.topics.length - 1} onClick={() => patchSection(sectionIndex, { topics: move(section.topics, topicIndex, 1) })}><ChevronDown size={16} /></button>
                    <button type="button" aria-label="Удалить тему" onClick={() => patchSection(sectionIndex, { topics: section.topics.filter((_, i) => i !== topicIndex) })}><Trash2 size={16} /></button>
                  </div>
                </div>
              ))}
              <button type="button" className="sp-add" onClick={() => patchSection(sectionIndex, { topics: [...section.topics, { title: '' }] })}>
                <Plus size={17} /> Добавить тему
              </button>
            </div>
          ))}
          <button type="button" className="sp-add-section" onClick={() => setDraft([...draft, { title: '', topics: [] }])}>
            <Plus size={17} /> Добавить раздел
          </button>
          <div className="sp-edit-footer">
            <Button variant="secondary" disabled={busy} onClick={() => onEditingChange(false)}>Отменить</Button>
            <Button disabled={busy} onClick={save}>{busy ? 'Сохраняем…' : 'Сохранить программу'}</Button>
          </div>
        </div>
      )}
    </section>
  );
}
