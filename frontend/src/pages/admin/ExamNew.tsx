import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, X } from 'lucide-react';
import { api } from '../../api/client';
import type { ExamEventCreate, SubjectSetting } from '../../types';
import { useWorkspace } from '../../layouts/Workspace';
import { useAction } from '../../hooks/useAction';
import { ErrorNotice } from '../../components/ErrorNotice';

type SessionDraft = { id: string; date: string; time: string; cap: string };
type SchoolDraft = { id: string; name: string; address: string; sessions: SessionDraft[] };

const uid = () => crypto.randomUUID();
const newSession = (): SessionDraft => ({ id: uid(), date: '', time: '10:00', cap: '20' });
const newSchool = (): SchoolDraft => ({ id: uid(), name: '', address: '', sessions: [newSession()] });
const formatLabel = (format: string) => (format === 'ege' ? 'ЕГЭ' : 'ОГЭ');
const subjectKey = (s: Pick<SubjectSetting, 'format' | 'name'>) => `${s.format}:${s.name}`;
const plural = (n: number, a: string, b: string, c: string) => {
  const m = n % 10;
  const h = n % 100;
  return `${n} ${m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 12 || h > 14) ? b : c}`;
};

function Step({
  n,
  open,
  done,
  title,
  summary,
  onOpen,
  children,
}: {
  n: number;
  open: boolean;
  done: boolean;
  title: string;
  summary: ReactNode;
  onOpen: () => void;
  children: ReactNode;
}) {
  const collapsed = done && !open;
  return (
    <section className={`nx-step ${open ? 'is-open' : ''}`}>
      <div className="nx-step-head">
        <span className={`nx-dot ${collapsed ? 'is-done' : open ? 'is-open' : ''}`}>
          {collapsed ? <Check size={16} /> : n}
        </span>
        {collapsed ? (
          <>
            <div className="nx-summary">
              <small>{title}</small>
              {summary}
            </div>
            <button type="button" className="nx-edit" onClick={onOpen}>
              Изменить
            </button>
          </>
        ) : (
          <h2 className={open ? '' : 'is-idle'}>{title}</h2>
        )}
      </div>
      {open && <div className="nx-body">{children}</div>}
    </section>
  );
}

export function ExamNew() {
  const { refresh } = useWorkspace();
  const navigate = useNavigate();
  const { busy, error, run } = useAction();
  const [settings, setSettings] = useState<SubjectSetting[]>([]);
  const [settingsError, setSettingsError] = useState('');
  const [cur, setCur] = useState(1);
  const [done, setDone] = useState<number[]>([]);
  const [title, setTitle] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [schools, setSchools] = useState<SchoolDraft[]>([newSchool()]);
  const [opens, setOpens] = useState('');
  const [closes, setCloses] = useState('');

  useEffect(() => {
    let current = true;
    void api.subjects
      .list()
      .then((items) => {
        if (current) setSettings(items.filter((item) => item.is_active));
      })
      .catch((reason: Error) => {
        if (current) setSettingsError(reason.message);
      });
    return () => {
      current = false;
    };
  }, []);

  const finish = (n: number) => {
    const next = done.includes(n) ? done : [...done, n];
    setDone(next);
    setCur([1, 2, 3, 4, 5].find((k) => k > n && !next.includes(k)) ?? 0);
  };
  const updateSchool = (id: string, patch: Partial<SchoolDraft>) =>
    setSchools((list) => list.map((school) => (school.id === id ? { ...school, ...patch } : school)));
  const updateSession = (school: SchoolDraft, id: string, patch: Partial<SessionDraft>) =>
    updateSchool(school.id, {
      sessions: school.sessions.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    });

  const pickedSettings = settings.filter((item) => picked.includes(subjectKey(item)));
  const filledSchools = schools.filter((school) => school.name.trim());
  const sessionsOf = (school: SchoolDraft) =>
    school.sessions.filter((item) => item.date && item.time && Number(item.cap) > 0);
  const sessionCount = filledSchools.reduce((sum, school) => sum + sessionsOf(school).length, 0);
  const places = filledSchools.reduce(
    (sum, school) => sum + sessionsOf(school).reduce((acc, item) => acc + Number(item.cap), 0),
    0,
  );
  const datesOk = !opens || !closes || new Date(opens) <= new Date(closes);
  const ready = [1, 2, 3, 4, 5].every((n) => done.includes(n));
  const dayFmt = (value: string) =>
    new Date(value).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });

  function save(draft: boolean) {
    void run(async () => {
      const payload: ExamEventCreate = {
        title: title.trim(),
        draft,
        registration_open_at: opens ? new Date(opens).toISOString() : null,
        registration_close_at: closes ? new Date(closes).toISOString() : null,
        schools: filledSchools
          .filter((school) => !draft || sessionsOf(school).length)
          .map((school) => ({
            name: school.name.trim(),
            address: school.address.trim() || null,
            slots: sessionsOf(school).map((item) => ({
              starts_at: new Date(`${item.date}T${item.time}`).toISOString(),
              capacity: Number(item.cap),
            })),
          })),
        subjects: pickedSettings.map((item) => ({
          format: item.format,
          subject: item.name,
          structure_data: item.tasks.length
            ? {
                version: 1,
                tasks: item.tasks.map((task) => ({ ...task })),
                primary_to_secondary_scale: item.primary_to_secondary_scale,
                grade_scale: item.grade_scale,
              }
            : null,
        })),
      };
      const event = await api.examEvents.create(payload);
      await refresh();
      navigate(`/exam-events/${event.id}`);
    });
  }

  const next = (n: number, label = 'Далее', blocked = false) => (
    <div className="nx-actions">
      <button type="button" className="nx-primary" disabled={blocked} onClick={() => finish(n)}>
        {label}
      </button>
    </div>
  );

  return (
    <div className="ad-page nx-page">
      <Link className="ad-back" to="/exams">
        <ArrowLeft size={16} />
        Все пробники
      </Link>
      <div className="ad-head">
        <div>
          <h1>Новый пробник</h1>
          <p>Пять шагов. Заполненный шаг сворачивается — нажмите «Изменить», чтобы вернуться.</p>
        </div>
      </div>
      <div className="nx-flow">
        <ErrorNotice message={settingsError} />
        <ErrorNotice message={error} />

        <Step
          n={1}
          title="Название"
          open={cur === 1}
          done={done.includes(1)}
          onOpen={() => setCur(1)}
          summary={<strong className="nx-big">{title}</strong>}
        >
          <label className="nx-field">
            Как пробник увидят ученики
            <input
              value={title}
              autoFocus
              placeholder="Например, Декабрьский пробник"
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && title.trim() && finish(1)}
            />
          </label>
          {next(1, 'Далее', !title.trim())}
        </Step>

        <Step
          n={2}
          title="Предметы"
          open={cur === 2}
          done={done.includes(2)}
          onOpen={() => setCur(2)}
          summary={
            <>
              <strong>Доступно {plural(picked.length, 'предмет', 'предмета', 'предметов')}</strong>
              <span className="nx-line">
                {pickedSettings.map((item) => `${item.name} · ${formatLabel(item.format)}`).join(', ')}
              </span>
            </>
          }
        >
          {!settings.length && !settingsError && (
            <p className="ad-muted">
              Активных предметов нет. Сначала добавьте их в разделе «Школа → Предметы».
            </p>
          )}
          {(['ege', 'oge'] as const).map((format) => {
            const items = settings.filter((item) => item.format === format);
            return (
              !!items.length && (
                <div
                  className="nx-group"
                  key={format}
                  role="group"
                  aria-label={`Предметы ${formatLabel(format)}`}
                >
                  <span className="ad-eyebrow">{formatLabel(format)}</span>
                  <div className="nx-chips">
                    {items.map((item) => {
                      const key = subjectKey(item);
                      const on = picked.includes(key);
                      return (
                        <button
                          type="button"
                          key={key}
                          aria-pressed={on}
                          className="nx-chip"
                          onClick={() => setPicked(on ? picked.filter((x) => x !== key) : [...picked, key])}
                        >
                          {on && <Check size={14} />}
                          {item.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )
            );
          })}
          {next(2, 'Готово', !picked.length)}
        </Step>

        <Step
          n={3}
          title="Школы"
          open={cur === 3}
          done={done.includes(3)}
          onOpen={() => setCur(3)}
          summary={
            <>
              <strong>{plural(filledSchools.length, 'школа', 'школы', 'школ')}</strong>
              <span className="nx-line">{filledSchools.map((school) => school.name).join(', ')}</span>
            </>
          }
        >
          <div className="nx-schools">
            {schools.map((school, index) => (
              <div className="nx-school" key={school.id}>
                <label className="nx-field">
                  Название школы
                  <input
                    value={school.name}
                    placeholder={`Школа ${index + 1}`}
                    onChange={(e) => updateSchool(school.id, { name: e.target.value })}
                  />
                </label>
                <label className="nx-field">
                  Адрес
                  <input
                    value={school.address}
                    placeholder="Улица, дом"
                    onChange={(e) => updateSchool(school.id, { address: e.target.value })}
                  />
                </label>
                <button
                  type="button"
                  className="nx-icon"
                  aria-label={`Удалить школу ${index + 1}`}
                  disabled={schools.length === 1}
                  onClick={() => setSchools(schools.filter((item) => item.id !== school.id))}
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="nx-add" onClick={() => setSchools([...schools, newSchool()])}>
            + Добавить школу
          </button>
          {next(3, 'Готово', !filledSchools.length)}
        </Step>

        <Step
          n={4}
          title="Даты записи"
          open={cur === 4}
          done={done.includes(4)}
          onOpen={() => setCur(4)}
          summary={
            <strong>
              {opens || closes
                ? `${opens ? dayFmt(opens) : '…'} — ${closes ? dayFmt(closes) : '…'}`
                : 'Без ограничений по времени'}
            </strong>
          }
        >
          <div className="nx-two">
            <label className="nx-field">
              Запись открывается
              <input type="datetime-local" value={opens} onChange={(e) => setOpens(e.target.value)} />
            </label>
            <label className="nx-field">
              Запись закрывается
              <input type="datetime-local" value={closes} onChange={(e) => setCloses(e.target.value)} />
            </label>
          </div>
          <p className="ad-muted">
            {datesOk
              ? 'Можно оставить пустым — запись будет открыта сразу и без даты закрытия.'
              : 'Запись не может закрываться раньше, чем открывается.'}
          </p>
          {next(4, 'Далее', !datesOk)}
        </Step>

        <Step
          n={5}
          title="Сеансы"
          open={cur === 5}
          done={done.includes(5)}
          onOpen={() => setCur(5)}
          summary={
            <strong>
              {plural(sessionCount, 'сеанс', 'сеанса', 'сеансов')} ·{' '}
              {plural(places, 'место', 'места', 'мест')}
            </strong>
          }
        >
          {filledSchools.map((school) => (
            <div className="nx-sessions" key={school.id}>
              <div className="nx-sessions-head">
                <strong>{school.name}</strong>
                <span className="ad-muted">{school.address}</span>
              </div>
              <div className="nx-row nx-row-head">
                <span>ДАТА</span>
                <span>ВРЕМЯ</span>
                <span>МЕСТ</span>
                <span />
              </div>
              {school.sessions.map((item) => (
                <div className="nx-row" key={item.id}>
                  <input
                    type="date"
                    aria-label="Дата"
                    value={item.date}
                    onChange={(e) => updateSession(school, item.id, { date: e.target.value })}
                  />
                  <input
                    type="time"
                    aria-label="Время"
                    value={item.time}
                    onChange={(e) => updateSession(school, item.id, { time: e.target.value })}
                  />
                  <input
                    type="number"
                    min="1"
                    step="1"
                    aria-label="Мест"
                    value={item.cap}
                    onChange={(e) => updateSession(school, item.id, { cap: e.target.value })}
                  />
                  <button
                    type="button"
                    className="nx-icon"
                    aria-label="Удалить сеанс"
                    disabled={school.sessions.length === 1}
                    onClick={() =>
                      updateSchool(school.id, { sessions: school.sessions.filter((s) => s.id !== item.id) })
                    }
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="nx-add"
                onClick={() => {
                  const last = school.sessions[school.sessions.length - 1];
                  updateSchool(school.id, {
                    sessions: [
                      ...school.sessions,
                      { ...newSession(), date: last?.date ?? '', cap: last?.cap ?? '20' },
                    ],
                  });
                }}
              >
                + Сеанс
              </button>
            </div>
          ))}
          {next(5, 'Готово', !sessionCount || filledSchools.some((school) => !sessionsOf(school).length))}
        </Step>

        <div className="nx-foot">
          <span>
            {ready ? 'Всё заполнено — можно создавать' : 'Заполните все шаги, чтобы создать пробник'}
          </span>
          <div className="nx-foot-actions">
            <button
              type="button"
              className="nx-secondary"
              disabled={busy || !title.trim() || !picked.length}
              title={!title.trim() || !picked.length ? 'Нужны название и хотя бы один предмет' : undefined}
              onClick={() => save(true)}
            >
              Сохранить черновик
            </button>
            <button
              type="button"
              className="nx-primary"
              disabled={!ready || busy}
              onClick={() => save(false)}
            >
              {busy ? 'Сохраняем…' : 'Создать пробник'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
