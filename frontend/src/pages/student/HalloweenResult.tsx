import { useRef, useState, type PointerEvent } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { useStudentWorkspace } from '../../layouts/StudentWorkspace';
import { HwBackdrop } from '../../halloween/Chrome';
import { lookup, rank } from '../../halloween/result';
import { CARD_THEMES, ShareCard, cardToPng, type CardTheme } from '../../halloween/ShareCard';
import { examTitle } from '../../lib/format';

const SLIDES = ['Результат', 'Разбор', 'Поделиться'];
const shortDay = (value: string) =>
  new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' })
    .format(new Date(value))
    .replace('.', '');

export function HalloweenResult() {
  const { id } = useParams();
  const { data } = useStudentWorkspace();
  const [index, setIndex] = useState(0);
  const [theme, setTheme] = useState<CardTheme>('pumpkin');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const start = useRef<number | null>(null);
  const card = useRef<SVGSVGElement>(null);
  const found = lookup(data, Number(id));
  if (!found) return <Navigate to="/available" replace />;
  const { result, exam, summary } = found;
  const format = exam.format === 'oge' || summary.isGrade ? 'oge' : exam.format === 'ege' ? 'ege' : null;
  const go = (next: number) => setIndex(Math.min(SLIDES.length - 1, Math.max(0, next)));
  const down = (event: PointerEvent) => {
    start.current = event.clientX;
  };
  const up = (event: PointerEvent) => {
    if (start.current == null) return;
    const shift = event.clientX - start.current;
    start.current = null;
    if (Math.abs(shift) > 50) go(index + (shift < 0 ? 1 : -1));
  };
  const comments = (result.result_data?.tasks ?? []).filter((task) => task.comment.trim());
  const teacher = result.result_data?.overall_comment?.trim();
  const save = async () => {
    if (!card.current) return;
    setSaving(true);
    setSaveError('');
    try {
      const blob = await cardToPng(card.current);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `probnik-${exam.subject}.png`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Не удалось сохранить карточку');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="hw-result-page">
      <HwBackdrop />
      <div className="hw-result-body">
        <div className="hw-segments" aria-hidden="true">
          {SLIDES.map((name, i) => (
            <span key={name} className={i <= index ? 'is-on' : ''} />
          ))}
        </div>
        <div className="hw-ball-top">
          <Link to="/available" aria-label="Назад к пробникам">
            <ArrowLeft size={20} />
          </Link>
          <span>
            {exam.subject} · {shortDay(exam.starts_at)}
          </span>
        </div>
        <div className="hw-slides" onPointerDown={down} onPointerUp={up}>
          <section key={index} className="hw-slide" aria-label={SLIDES[index]}>
            {index === 0 && (
              <>
                <span className="hw-eyebrow">
                  {format === 'oge' ? 'ОГЭ' : format === 'ege' ? 'ЕГЭ' : 'ПРОБНИК'} · {examTitle(exam)}
                </span>
                <div className="hw-ring" style={{ ['--p' as string]: summary.percent }}>
                  <strong>{summary.value ?? '—'}</strong>
                  <small>{summary.isGrade ? 'оценка' : `из ${summary.maxValue}`}</small>
                </div>
                <div className="hw-rank">{rank(summary.percent)}</div>
                {summary.delta != null && (
                  <p className="hw-delta">
                    {summary.delta >= 0 ? '+' : ''}
                    {summary.delta} к прошлому пробнику
                  </p>
                )}
                <div className="hw-meter">
                  <span>
                    {summary.isGrade ? 'Набрано баллов' : 'Побеждено страха'}
                    <b>
                      {summary.isGrade
                        ? `${summary.primary ?? 0} из ${summary.maxPrimary}`
                        : `${summary.percent}%`}
                    </b>
                  </span>
                  <i style={{ width: `${summary.percent}%` }} />
                </div>
                <div className="hw-mini">
                  <div>
                    <b>{summary.primary ?? '—'}</b>
                    <small>первичный из {summary.maxPrimary}</small>
                  </div>
                  <div>
                    <b>{summary.tasks.length - summary.zeros}</b>
                    <small>из {summary.tasks.length} заданий взято</small>
                  </div>
                  <div>
                    <b>{summary.zeros}</b>
                    <small>в тумане</small>
                  </div>
                </div>
              </>
            )}
            {index === 1 && (
              <>
                <h2 className="hw-display">
                  Карта <span>заданий</span>
                </h2>
                <div className="hw-tasks">
                  {summary.tasks.map((task) => (
                    <div
                      key={task.code}
                      className={`hw-task ${task.got >= task.max ? 'is-full' : task.got <= 0 ? 'is-zero' : 'is-part'}`}
                    >
                      <span>№{task.code}</span>
                      <b>
                        {task.got}/{task.max}
                      </b>
                    </div>
                  ))}
                </div>
                {summary.parts.map((part) => (
                  <div className="hw-meter" key={part.name}>
                    <span>
                      {part.name}
                      <b>
                        {part.got} из {part.max}
                      </b>
                    </span>
                    <i style={{ width: `${Math.round((part.got / (part.max || 1)) * 100)}%` }} />
                  </div>
                ))}
                {comments.length > 0 && (
                  <div className="hw-notes">
                    <h3>Над чем поколдовать</h3>
                    {comments.map((task) => (
                      <p key={task.code} className="preserve-text">
                        <b>Задание {task.code}.</b> {task.comment}
                      </p>
                    ))}
                  </div>
                )}
                {teacher && (
                  <div className="hw-teacher">
                    <b>
                      {result.checked_by
                        ? `Преподаватель · ${result.checked_by}`
                        : 'Комментарий преподавателя'}
                    </b>
                    <p className="preserve-text">{teacher}</p>
                  </div>
                )}
              </>
            )}
            {index === 2 && (
              <>
                <h2 className="hw-display">
                  Покажи <span>друзьям</span>
                </h2>
                <div className="hw-card-wrap">
                  <ShareCard
                    ref={card}
                    theme={theme}
                    summary={summary}
                    subject={exam.subject}
                    format={format}
                  />
                </div>
                <div className="hw-themes" role="group" aria-label="Тема карточки">
                  {(Object.keys(CARD_THEMES) as CardTheme[]).map((key) => (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={theme === key}
                      onClick={() => setTheme(key)}
                    >
                      {CARD_THEMES[key].name}
                    </button>
                  ))}
                </div>
                <button type="button" className="hw-save" onClick={save} disabled={saving}>
                  <Download size={18} />
                  {saving ? 'Собираем…' : 'Сохранить карточку'}
                </button>
                {saveError && <p className="hw-save-error">{saveError}</p>}
              </>
            )}
          </section>
        </div>
        <div className="hw-slide-nav">
          <button type="button" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Назад">
            <ChevronLeft size={22} />
          </button>
          <span>
            {index + 1} / {SLIDES.length}
          </span>
          <button
            type="button"
            onClick={() => go(index + 1)}
            disabled={index === SLIDES.length - 1}
            aria-label="Дальше"
          >
            <ChevronRight size={22} />
          </button>
        </div>
      </div>
    </div>
  );
}
