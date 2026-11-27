import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronRight,
  ClipboardCheck,
  ExternalLink,
  FileText,
  GraduationCap,
  MonitorPlay,
  Plus,
  Save,
  Trash2,
} from 'lucide-react';
import { api } from '../../api/client';
import type { Training, TrainingQuestionWrite, TrainingTopic, TrainingTopicWrite } from '../../types';
import { TrainingDialog } from '../../components/TeacherTraining';
import { TrainingVideoPlayer } from './TrainingVideoPlayer';
import './TrainingPage.css';

const blank = (position: number): TrainingTopicWrite => ({
  title: '',
  description: '',
  position,
  video_url: null,
  material_text: '',
  published: false,
  pass_percent: 80,
  questions: [],
});
const questionBlank = (): TrainingQuestionWrite => ({
  prompt: '',
  kind: 'single',
  options: ['', ''],
  answer: [0],
});
const formatDate = (value: string) =>
  new Date(value).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
const directVideo = (url: string) => /\.(mp4|webm|ogg)(\?|$)/i.test(url);
const percent = (value: number) => `${Math.min(100, Math.max(0, value))}%`;
const playbackTime = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

export function TrainingPage({ admin }: { admin: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();
  const selectedId = Number(location.pathname.match(/^\/training\/(\d+)$/)?.[1] || 0);
  const [topics, setTopics] = useState<TrainingTopic[]>([]);
  const [probnikTraining, setProbnikTraining] = useState<Training | null>(null);
  const [legacyPart, setLegacyPart] = useState<0 | 1 | null>(null);
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [form, setForm] = useState<TrainingTopicWrite>(blank(1));
  const [questionDraft, setQuestionDraft] = useState<TrainingQuestionWrite[] | null>(null);
  const [activeQuestion, setActiveQuestion] = useState<number | null>(null);
  const [step, setStep] = useState<'video' | 'material' | 'test'>('video');
  const [answers, setAnswers] = useState<Record<number, number[] | string>>({});
  const [lastScore, setLastScore] = useState<{ score: number; total: number } | null>(null);
  const [liveVideo, setLiveVideo] = useState<{ topicId: number; percent: number } | null>(null);
  const videoSaveQueue = useRef<Promise<void>>(Promise.resolve());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [deletingVideo, setDeletingVideo] = useState(false);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [videoUploadState, setVideoUploadState] = useState<{ stage: string; percent: number | null } | null>(null);
  const [videoUploadSeconds, setVideoUploadSeconds] = useState(0);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      const nextTopics = admin ? await api.training.adminTopics() : await api.training.topics();
      setTopics(nextTopics);
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось загрузить обучение');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, [admin]);
  useEffect(() => {
    if (admin) return;
    api.training.get().then(setProbnikTraining).catch(() => setProbnikTraining(null));
  }, [admin]);

  const topic = topics.find((item) => item.id === selectedId);
  const videoPercent = topic ? Math.max(topic.progress.video_percent, liveVideo?.topicId === topic.id ? liveVideo.percent : 0) : 0;
  const published = topics.filter((item) => item.published);
  const completeCount = published.filter((item) => item.progress.passed).length;
  const legacyDone = Number(!!probnikTraining?.groups_at) + Number(!!probnikTraining?.outside_at);
  const courseDone = completeCount + legacyDone;
  const courseTotal = topics.length + (probnikTraining ? 2 : 0);
  const activeSteps = topic
    ? [
        ...(topic.video_url
          ? [
              {
                key: 'video' as const,
                title: 'Видео',
                icon: MonitorPlay,
                done: videoPercent >= 90,
                detail: `${videoPercent}% просмотрено`,
              },
            ]
          : []),
        ...(topic.material_text
          ? [
              {
                key: 'material' as const,
                title: 'Материалы',
                icon: FileText,
                done: topic.progress.material_read,
                detail: topic.progress.material_read ? 'Прочитано' : 'Не прочитано',
              },
            ]
          : []),
        ...(topic.questions.length
          ? [
              {
                key: 'test' as const,
                title: 'Тест',
                icon: ClipboardCheck,
                done:
                  topic.progress.best_score !== null &&
                  topic.progress.best_score * 100 >= topic.pass_percent * topic.questions.length,
                detail:
                  topic.progress.best_score === null
                    ? `${topic.questions.length} вопросов`
                    : `${topic.progress.best_score} из ${topic.questions.length}`,
              },
            ]
          : []),
      ]
    : [];
  const currentStep = activeSteps.some((item) => item.key === step) ? step : activeSteps[0]?.key;

  function changeQuestion(index: number, patch: Partial<TrainingQuestionWrite>) {
    setQuestionDraft((previous) =>
      previous?.map((item, i) => (i === index ? { ...item, ...patch } : item)) ?? null,
    );
  }
  function editTopic(item?: TrainingTopic) {
    setQuestionDraft(null);
    setEditing(item?.id ?? 'new');
    setForm(
      item
        ? {
            title: item.title,
            description: item.description,
            position: item.position,
            video_url: item.video_url,
            material_text: item.material_text,
            published: item.published,
            pass_percent: item.pass_percent,
            questions: item.questions.map((q) => ({
              prompt: q.prompt,
              kind: q.kind,
              options: [...q.options],
              answer: q.answer ?? [],
            })),
          }
        : blank(topics.length + 1),
    );
    setError('');
  }
  async function saveTopic() {
    setBusy(true);
    try {
      const payload = {
        ...form,
        title: form.title.trim(),
        video_url: form.video_url?.trim() || null,
        questions: form.questions.map((q) => ({
          ...q,
          prompt: q.prompt.trim(),
          options: q.options.map((o) => o.trim()),
        })),
      };
      if (editing === 'new') await api.training.createTopic(payload);
      else if (editing !== null) await api.training.updateTopic(editing, payload);
      setEditing(null);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось сохранить тему');
    } finally {
      setBusy(false);
    }
  }
  async function removeTopic() {
    if (typeof editing !== 'number' || !window.confirm('Удалить тему и весь прогресс по ней?')) return;
    setBusy(true);
    try {
      await api.training.deleteTopic(editing);
      setEditing(null);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось удалить тему');
    } finally {
      setBusy(false);
    }
  }
  async function uploadVideo(file: File) {
    if (typeof editing !== 'number') return;
    setUploadingVideo(true);
    setVideoUploadState({ stage: 'Загрузка файла', percent: 0 });
    setVideoUploadSeconds(0);
    setError('');
    const uploadId = crypto.randomUUID().replaceAll('-', '');
    let poller: ReturnType<typeof setInterval> | undefined;
    const timer = setInterval(() => setVideoUploadSeconds((value) => value + 1), 1000);
    try {
      const result = await api.training.uploadVideo(
        editing, file, uploadId,
        (percent) => setVideoUploadState({ stage: 'Загрузка файла', percent }),
        () => {
          setVideoUploadState({ stage: 'Проверка файла', percent: null });
          poller = setInterval(() => {
            void api.training.videoJob(uploadId).then((job) => setVideoUploadState(job)).catch(() => undefined);
          }, 1000);
        },
      );
      setForm((previous) => ({ ...previous, video_url: result.video_url }));
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось загрузить видео');
    } finally {
      clearInterval(timer);
      if (poller) clearInterval(poller);
      setUploadingVideo(false);
      setVideoUploadState(null);
    }
  }
  async function removeVideo() {
    if (!form.video_url || !window.confirm('Удалить видео из темы?')) return;
    if (typeof editing !== 'number') {
      setForm((previous) => ({ ...previous, video_url: null }));
      return;
    }
    setDeletingVideo(true);
    setError('');
    try {
      const topic = await api.training.deleteVideo(editing);
      setForm((previous) => ({ ...previous, video_url: null, published: topic.published }));
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось удалить видео');
    } finally {
      setDeletingVideo(false);
    }
  }
  async function updateProgress(patch: { video_percent?: number; video_position_seconds?: number; material_read?: boolean }) {
    if (!topic) return;
    try {
      const next = await api.training.saveProgress(topic.id, patch);
      setTopics((previous) => previous.map((item) => (item.id === next.id ? next : item)));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось сохранить прогресс');
    }
  }
  function queueVideoProgress(percent: number, seconds: number) {
    videoSaveQueue.current = videoSaveQueue.current.then(() => updateProgress({
      video_percent: percent,
      video_position_seconds: seconds,
    }));
  }
  async function submit() {
    if (!topic) return;
    setBusy(true);
    try {
      const result = await api.training.submit(topic.id, answers);
      setLastScore({ score: result.score, total: result.total });
      setTopics((previous) => previous.map((item) => (item.id === result.topic.id ? result.topic : item)));
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось проверить ответы');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="training-page">
      {error && (
        <div className="training-error" role="alert">
          {error}
        </div>
      )}
      {loading ? (
        <p className="training-empty">Загружаем обучение…</p>
      ) : admin ? (
        <>
          {editing === null ? (
            <section className="training-card training-topic-list">
              <div className="training-card-title">
                <h2>Темы курса</h2>
                <span>{topics.length + 2}</span>
              </div>
              <div className="training-topic-static">
                <span className="training-number">1</span>
                <span><strong>Заполнение пробников: результаты группы</strong><small>Встроенная тема · без редактирования</small></span>
              </div>
              <div className="training-topic-static">
                <span className="training-number">2</span>
                <span><strong>Заполнение пробников: ученик не из группы</strong><small>Встроенная тема · без редактирования</small></span>
              </div>
              {topics.map((item) => (
                <button
                  key={item.id}
                  className={editing === item.id ? 'selected' : ''}
                  onClick={() => editTopic(item)}
                >
                  <span className="training-number">{item.position + 2}</span>
                  <span>
                    <strong>{item.title}</strong>
                    <small>
                      {item.published ? 'Опубликована' : 'Черновик'} · {item.questions.length} вопросов
                    </small>
                  </span>
                  <ChevronRight size={17} />
                </button>
              ))}
              <button className="training-add-topic" onClick={() => editTopic()}>
                <Plus size={17} /> Добавить новую тему
              </button>
            </section>
          ) : (
            <div className="training-admin-edit">
              <section className="training-card training-editor">
                <div className="training-card-title training-editor-heading">
                  <button className="training-back" onClick={() => setEditing(null)}>
                    <ArrowLeft size={17} /> К темам обучения
                  </button>
                  <h2>{editing === 'new' ? 'Новая тема' : 'Редактирование темы'}</h2>
                </div>
                <div className="training-editor-fields">
                  <label>
                    Название
                    <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                  </label>
                  <label>
                    Описание
                    <input
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                    />
                  </label>
                  <div className="training-field-row">
                    <label>
                      Порядок
                      <input
                        type="number"
                        min={0}
                        value={form.position}
                        onChange={(e) => setForm({ ...form, position: Number(e.target.value) })}
                      />
                    </label>
                    <label>
                      Зачёт теста, %
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={form.pass_percent}
                        onChange={(e) => setForm({ ...form, pass_percent: Number(e.target.value) })}
                      />
                    </label>
                  </div>
                  <div className="training-video-upload">
                    <strong>Видео на платформе</strong>
                    <label className="training-video-file-input">
                      <input
                        ref={videoInputRef}
                        type="file"
                        accept=".mp4,.mov,.webm,.mkv,video/*"
                        disabled={typeof editing !== 'number' || uploadingVideo}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) void uploadVideo(file);
                          event.target.value = '';
                        }}
                      />
                    </label>
                    <div className="training-video-upload-actions">
                      <button className="training-secondary" type="button" disabled={typeof editing !== 'number' || uploadingVideo || deletingVideo} onClick={() => videoInputRef.current?.click()}>
                        {form.video_url ? 'Заменить видео' : 'Загрузить видео'}
                      </button>
                      {form.video_url && (
                        <button className="training-danger" type="button" disabled={uploadingVideo || deletingVideo} onClick={() => void removeVideo()}>
                          <Trash2 size={15} /> {deletingVideo ? 'Удаляем…' : 'Удалить видео'}
                        </button>
                      )}
                    </div>
                    {uploadingVideo && videoUploadState ? (
                      <div className="training-video-upload-progress" role="status" aria-live="polite">
                        <span>{videoUploadState.stage}{videoUploadState.percent !== null ? ` · ${videoUploadState.percent}%` : '…'}</span>
                        <div className={`training-progress-bar${videoUploadState.percent === null ? ' is-indeterminate' : ''}`}>
                          <i style={{ width: `${videoUploadState.percent ?? 35}%` }} />
                        </div>
                        <small>Прошло {Math.floor(videoUploadSeconds / 60)}:{String(videoUploadSeconds % 60).padStart(2, '0')}</small>
                      </div>
                    ) : (
                      <small>{editing === 'new' ? 'Сначала сохраните новую тему, затем загрузите видео.' : 'MP4, MOV, WebM или MKV · до 300 МБ. После загрузки видео нарезается на фрагменты.'}</small>
                    )}
                    {form.video_url?.endsWith('.m3u8') && <TrainingVideoPlayer src={form.video_url} onPlayback={() => undefined} onSave={() => undefined} onExit={() => undefined} onEnded={() => undefined} />}
                  </div>
                  <label>
                    Материал для прочтения
                    <textarea
                      rows={8}
                      placeholder="Текст инструкции…"
                      value={form.material_text}
                      onChange={(e) => setForm({ ...form, material_text: e.target.value })}
                    />
                  </label>
                  <div className="training-test-summary">
                    <div>
                      <h3>Тест</h3>
                      <p>{form.questions.length ? `В тесте ${form.questions.length} вопросов` : 'Тест пока не добавлен'}</p>
                    </div>
                    <button
                      className="training-secondary"
                      onClick={() => {
                        setQuestionDraft(form.questions.map((q) => ({ ...q, options: [...q.options], answer: Array.isArray(q.answer) ? [...q.answer] : q.answer })));
                        setActiveQuestion(form.questions.length ? 0 : null);
                      }}
                    >
                      {form.questions.length ? 'Изменить тест' : 'Добавить тест'}
                    </button>
                  </div>
                  <label className="training-confirm">
                    <input
                      type="checkbox"
                      checked={form.published}
                      onChange={(e) => setForm({ ...form, published: e.target.checked })}
                    />{' '}
                    Опубликовать для преподавателей
                  </label>
                  <div className="training-editor-actions">
                    <button
                      className="training-primary"
                      disabled={busy || uploadingVideo || deletingVideo || !form.title.trim()}
                      onClick={() => void saveTopic()}
                    >
                      <Save size={16} /> Сохранить
                    </button>
                    {typeof editing === 'number' && (
                      <button className="training-danger" disabled={busy} onClick={() => void removeTopic()}>
                        <Trash2 size={16} /> Удалить тему
                      </button>
                    )}
                  </div>
                </div>
              </section>
            </div>
          )}
          {questionDraft !== null && (
            <div className="training-test-overlay" role="presentation" onMouseDown={(event) => {
              if (event.target === event.currentTarget) setQuestionDraft(null);
            }}>
              <div className="training-test-dialog" role="dialog" aria-modal="true" aria-label="Редактирование теста">
                <div className="training-test-dialog-head">
                  <div>
                    <h2>Редактирование теста</h2>
                    <p>Выберите правильные ответы для каждого вопроса</p>
                  </div>
                  <button className="training-icon" aria-label="Закрыть редактор теста" onClick={() => setQuestionDraft(null)}>×</button>
                </div>
                <div className="training-test-dialog-body">
                  {questionDraft.map((q, index) => (
                    <div className={`training-question-editor${activeQuestion === index ? ' is-active' : ' is-preview'}`} key={index}>
                      {activeQuestion === index ? (
                      <>
                      <div className="training-question-head">
                        <strong>Вопрос {index + 1}</strong>
                        <button
                          className="training-icon"
                          aria-label={`Удалить вопрос ${index + 1}`}
                          onClick={() => {
                            setQuestionDraft(questionDraft.filter((_, i) => i !== index));
                            setActiveQuestion(questionDraft.length === 1 ? null : Math.max(0, index - 1));
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <label>
                        Формулировка
                        <input
                          value={q.prompt}
                          onChange={(e) => changeQuestion(index, { prompt: e.target.value })}
                        />
                      </label>
                      <label>
                        Тип ответа
                        <select
                          value={q.kind}
                          onChange={(e) => {
                            const kind = e.target.value as TrainingQuestionWrite['kind'];
                            changeQuestion(index, {
                              kind,
                              options: kind === 'text' ? [] : ['', ''],
                              answer: kind === 'text' ? '' : [0],
                            });
                          }}
                        >
                          <option value="single">Один вариант</option>
                          <option value="multiple">Несколько вариантов</option>
                          <option value="text">Вписать ответ</option>
                        </select>
                      </label>
                      {q.kind === 'text' ? (
                        <label>
                          Правильный ответ
                          <input
                            value={typeof q.answer === 'string' ? q.answer : ''}
                            onChange={(e) => changeQuestion(index, { answer: e.target.value })}
                          />
                        </label>
                      ) : (
                        <div className="training-options">
                          <small>Отметьте правильный ответ{q.kind === 'multiple' ? ' или ответы' : ''}</small>
                          {q.options.map((option, optionIndex) => (
                            <div key={optionIndex}>
                              <input
                                type={q.kind === 'single' ? 'radio' : 'checkbox'}
                                name={`correct-${index}`}
                                checked={Array.isArray(q.answer) && q.answer.includes(optionIndex)}
                                onChange={() => {
                                  const selected = Array.isArray(q.answer) ? q.answer : [];
                                  changeQuestion(index, {
                                    answer:
                                      q.kind === 'single'
                                        ? [optionIndex]
                                        : selected.includes(optionIndex)
                                          ? selected.filter((i) => i !== optionIndex)
                                          : [...selected, optionIndex],
                                  });
                                }}
                              />
                              <input
                                aria-label={`Вариант ${optionIndex + 1}`}
                                value={option}
                                onChange={(e) =>
                                  changeQuestion(index, {
                                    options: q.options.map((old, i) =>
                                      i === optionIndex ? e.target.value : old,
                                    ),
                                  })
                                }
                              />
                              <button
                                className="training-icon"
                                aria-label="Удалить вариант"
                                onClick={() => {
                                  const options = q.options.filter((_, i) => i !== optionIndex);
                                  const answer = Array.isArray(q.answer)
                                    ? q.answer
                                        .filter((i) => i !== optionIndex)
                                        .map((i) => (i > optionIndex ? i - 1 : i))
                                    : [];
                                  changeQuestion(index, { options, answer });
                                }}
                              >
                                ×
                              </button>
                            </div>
                          ))}
                          <button
                            className="training-link"
                            onClick={() => changeQuestion(index, { options: [...q.options, ''] })}
                          >
                            + Добавить вариант
                          </button>
                        </div>
                      )}
                      </>
                      ) : (
                        <button className="training-question-preview" onClick={() => setActiveQuestion(index)}>
                          <strong>{q.prompt || `Вопрос ${index + 1}`}</strong>
                          {q.kind === 'text' ? (
                            <span className="training-preview-answer">Текстовый ответ</span>
                          ) : q.options.map((option, optionIndex) => (
                            <span className="training-preview-option" key={optionIndex}>
                              <span className={q.kind === 'single' ? 'training-preview-radio' : 'training-preview-checkbox'} />
                              {option || `Вариант ${optionIndex + 1}`}
                            </span>
                          ))}
                        </button>
                      )}
                    </div>
                  ))}
                  <button className="training-add-question" onClick={() => {
                    setQuestionDraft([...questionDraft, questionBlank()]);
                    setActiveQuestion(questionDraft.length);
                  }}><Plus size={17} /> Добавить вопрос</button>
                </div>
                <div className="training-test-dialog-actions">
                  <button className="training-secondary" onClick={() => setQuestionDraft(null)}>Отмена</button>
                  <button className="training-primary" onClick={() => {
                    setForm((previous) => ({ ...previous, questions: questionDraft }));
                    setQuestionDraft(null);
                  }}>Готово</button>
                </div>
              </div>
            </div>
          )}
        </>
      ) : topic ? (
        <>
          <div className="training-heading training-topic-heading">
            <div>
              <div className="training-topic-title-row">
                <button
                  className="training-back"
                  onClick={() => {
                    navigate('/training');
                    setAnswers({});
                    setLastScore(null);
                  }}
                >
                  <ArrowLeft size={17} /> К темам
                </button>
                <h1>{topic.title}</h1>
              </div>
              <p>{topic.description}</p>
            </div>
            <span className={`training-status ${topic.progress.passed ? 'done' : ''}`}>
              {topic.progress.passed ? 'Тема пройдена' : 'В процессе'}
            </span>
          </div>
          <div className="training-lesson-grid">
            <section className="training-card training-work">
              {currentStep === 'video' && topic.video_url && (
                <div className="training-work-body">
                  <h2>
                    <MonitorPlay size={22} /> Видеоинструкция
                  </h2>
                  {directVideo(topic.video_url) || topic.video_url.endsWith('.m3u8') ? (
                    <TrainingVideoPlayer
                      src={topic.video_url}
                      resumeSeconds={topic.progress.video_position_seconds}
                      onPlayback={(percent) => setLiveVideo((previous) =>
                        previous?.topicId === topic.id && previous.percent === percent ? previous : { topicId: topic.id, percent }
                      )}
                      onSave={(percent, seconds) => queueVideoProgress(percent, seconds)}
                      onExit={(percent, seconds) => api.training.saveVideoPositionOnExit(topic.id, percent, seconds)}
                      onEnded={() => {
                        setLiveVideo({ topicId: topic.id, percent: 100 });
                        queueVideoProgress(100, 0);
                      }}
                    />
                  ) : (
                    <div className="training-external">
                      <MonitorPlay size={42} />
                      <p>Видео откроется в отдельной вкладке</p>
                      <a href={topic.video_url} target="_blank" rel="noreferrer">
                        Открыть видео <ExternalLink size={16} />
                      </a>
                      <button
                        className="training-secondary"
                        onClick={() => void updateProgress({ video_percent: 100 })}
                      >
                        Я посмотрел(а) видео
                      </button>
                    </div>
                  )}
                  <div className="training-video-viewing-progress">
                    <span>Просмотрено {videoPercent}% · для зачёта нужно 90%</span>
                    <div className="training-progress-bar"><i style={{ width: `${videoPercent}%` }} /></div>
                    {topic.progress.video_position_seconds > 0 && (
                      <small>Место просмотра сохранено: {playbackTime(topic.progress.video_position_seconds)}</small>
                    )}
                  </div>
                </div>
              )}
              {currentStep === 'material' && (
                <div className="training-work-body">
                  <h2>
                    <FileText size={22} /> Материал для прочтения
                  </h2>
                  <article className="training-reading">
                    {topic.material_text.split('\n').map((line, i) => (
                      <p key={i}>{line || '\u00a0'}</p>
                    ))}
                  </article>
                  <label className="training-confirm">
                    <input
                      type="checkbox"
                      checked={topic.progress.material_read}
                      onChange={(e) => void updateProgress({ material_read: e.target.checked })}
                    />{' '}
                    Я прочитал(а) материал
                  </label>
                </div>
              )}
              {currentStep === 'test' && (
                <div className="training-work-body">
                  <h2>
                    <ClipboardCheck size={22} /> Тест по теме
                  </h2>
                  <p>
                    Вопросов: {topic.questions.length}. Для зачёта нужно {topic.pass_percent}% правильных
                    ответов.
                  </p>
                  {lastScore && (
                    <div className="training-test-result">
                      Результат: {lastScore.score} из {lastScore.total}.{' '}
                      {lastScore.score * 100 >= topic.pass_percent * lastScore.total
                        ? 'Тест зачтён.'
                        : 'Можно попробовать ещё раз.'}
                    </div>
                  )}
                  <div className="training-teacher-questions">
                  {topic.questions.map((q, index) => (
                    <div className="training-test-question" role="group" aria-labelledby={`training-question-${q.id}`} key={q.id}>
                      <div className="training-test-question-head">
                        <h3 id={`training-question-${q.id}`}>{q.prompt} <span aria-hidden="true">*</span></h3>
                        <small>1 балл</small>
                      </div>
                      {q.kind === 'text' ? (
                        <input
                          type="text"
                          value={typeof answers[q.id] === 'string' ? (answers[q.id] as string) : ''}
                          onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                          placeholder="Введите ответ"
                        />
                      ) : (
                        q.options.map((option, optionIndex) => (
                          <label key={optionIndex}>
                            <input
                              type={q.kind === 'single' ? 'radio' : 'checkbox'}
                              name={`question-${q.id}`}
                              checked={
                                Array.isArray(answers[q.id]) &&
                                (answers[q.id] as number[]).includes(optionIndex)
                              }
                              onChange={() => {
                                const old = Array.isArray(answers[q.id]) ? (answers[q.id] as number[]) : [];
                                setAnswers({
                                  ...answers,
                                  [q.id]:
                                    q.kind === 'single'
                                      ? [optionIndex]
                                      : old.includes(optionIndex)
                                        ? old.filter((i) => i !== optionIndex)
                                        : [...old, optionIndex],
                                });
                              }}
                            />
                            <span>{option}</span>
                          </label>
                        ))
                      )}
                    </div>
                  ))}
                  </div>
                  <button
                    className="training-primary"
                    disabled={
                      busy ||
                      topic.questions.some((q) =>
                        q.kind === 'text'
                          ? !String(answers[q.id] ?? '').trim()
                          : !Array.isArray(answers[q.id]) || !(answers[q.id] as number[]).length,
                      )
                    }
                    onClick={() => void submit()}
                  >
                    Проверить ответы
                  </button>
                  {topic.attempts.length > 0 && (
                    <div className="training-attempts">
                      <h3>История попыток</h3>
                      {topic.attempts.map((attempt) => (
                        <p key={attempt.id}>
                          {formatDate(attempt.created_at)} · {attempt.score} из {attempt.total}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>
            <aside className="training-card training-journey">
              <h2>
                Прогресс темы{' '}
                <small>
                  {activeSteps.filter((item) => item.done).length} из {activeSteps.length}
                </small>
              </h2>
              <div className="training-progress-bar">
                <i
                  style={{
                    width: percent(
                      activeSteps.length
                        ? (activeSteps.filter((item) => item.done).length / activeSteps.length) * 100
                        : 0,
                    ),
                  }}
                />
              </div>
              {activeSteps.map((item) => (
                <button
                  key={item.key}
                  className={currentStep === item.key ? 'active' : ''}
                  onClick={() => setStep(item.key)}
                >
                  <span className="training-step-icon">
                    {item.done ? <Check size={17} /> : <item.icon size={17} />}
                  </span>
                  <span>
                    <strong>{item.title}</strong>
                    <small>{item.detail}</small>
                  </span>
                  <ChevronRight size={15} />
                </button>
              ))}
              <p className="training-journey-note">
                Для завершения темы{' '}
                {[
                  topic.video_url ? 'посмотрите 90% видео' : null,
                  topic.material_text ? 'подтвердите чтение' : null,
                  topic.questions.length ? 'сдайте тест' : null,
                ]
                  .filter(Boolean)
                  .join(', ')}
                .
              </p>
            </aside>
          </div>
        </>
      ) : (
        <>
          <div className="training-heading training-course-heading">
            <h1>Обучение</h1>
            <div className="training-heading-progress">
              <span>Прогресс обучения · {courseDone} из {courseTotal} тем</span>
            <div className="training-progress-bar">
              <i style={{ width: percent(courseTotal ? (courseDone / courseTotal) * 100 : 0) }} />
            </div>
            </div>
          </div>
          <section className="training-card training-course-list">
            <h2>Темы курса</h2>
            {probnikTraining && (
              <>
                <button onClick={() => setLegacyPart(0)}>
                  <span className="training-number">1</span>
                  <span><strong>Заполнение пробников: результаты группы</strong><small>Как внести и проверить результаты учеников своей группы</small></span>
                  <span className={`training-status${probnikTraining.groups_at ? ' done' : ''}`}>
                    {probnikTraining.groups_at ? 'Пройдено' : 'Не начато'}
                  </span>
                  <ChevronRight size={17} />
                </button>
                <button onClick={() => setLegacyPart(1)}>
                  <span className="training-number">2</span>
                  <span><strong>Заполнение пробников: ученик не из группы</strong><small>Как внести результат ученика вне своей группы</small></span>
                  <span className={`training-status${probnikTraining.outside_at ? ' done' : ''}`}>
                    {probnikTraining.outside_at ? 'Пройдено' : 'Не начато'}
                  </span>
                  <ChevronRight size={17} />
                </button>
              </>
            )}
            {topics.map((item, index) => (
              <button
                key={item.id}
                onClick={() => {
                  navigate(`/training/${item.id}`);
                  setStep('video');
                  setAnswers({});
                  setLastScore(null);
                }}
              >
                <span className="training-number">{index + 1 + (probnikTraining ? 2 : 0)}</span>
                <span>
                  <strong>{item.title}</strong>
                  <small>
                    {item.description || (item.progress.passed ? 'Тема пройдена' : 'Видео, материал и тест')}
                  </small>
                </span>
                <span className={`training-status ${item.progress.passed ? 'done' : ''}`}>
                  {item.progress.passed
                    ? 'Пройдено'
                    : item.attempts.length || item.progress.video_percent || item.progress.material_read
                      ? 'В процессе'
                      : 'Не начато'}
                </span>
                <ChevronRight size={17} />
              </button>
            ))}
            {!topics.length && !probnikTraining && <p className="training-empty">Темы обучения пока не опубликованы.</p>}
          </section>
        </>
      )}
      {!admin && legacyPart !== null && probnikTraining && (
        <TrainingDialog
          key={legacyPart}
          initialTab={legacyPart}
          training={probnikTraining}
          onChange={(next) => {
            setProbnikTraining(next);
            window.dispatchEvent(new Event('training-progress-updated'));
          }}
          onClose={() => setLegacyPart(null)}
        />
      )}
    </div>
  );
}
