import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, Check, GraduationCap, MessageCircle, Search, X } from 'lucide-react';
import { api } from '../api/client';
import type { Training, TrainingPart } from '../types';

type Step = { title: string; text: string; visual: ReactNode };

const Arrow = () => <span aria-hidden="true">→</span>;
const Path = ({ items }: { items: string[] }) => (
  <div className="tt-path">
    {items.map((item, index) => (
      <span key={item} className="tt-path-item">
        {index > 0 && <Arrow />}
        <span className={index === items.length - 1 ? 'is-last' : ''}>{item}</span>
      </span>
    ))}
  </div>
);
const Note = ({ children }: { children: ReactNode }) => <div className="tt-note">{children}</div>;
const Cell = ({
  n,
  value,
  of,
  kind,
  chat,
}: {
  n: number;
  value: string;
  of?: number;
  kind: 'ok' | 'zero' | 'empty';
  chat?: boolean;
}) => (
  <div className="tt-cell">
    <span className="tt-cell-n">{n}</span>
    <span className={`tt-cell-box is-${kind}`}>{value}</span>
    {of !== undefined && (
      <span className="tt-cell-of">
        из {of}
        {chat && (
          <span className="tt-chat">
            <MessageCircle size={14} />
          </span>
        )}
      </span>
    )}
  </div>
);
const Pick = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="tt-tile">
    <b>{title}</b>
    <span>{children}</span>
  </div>
);
const Field = ({ label, value }: { label: string; value: string }) => (
  <div className="tt-field">
    <span>{label}</span>
    <span className="tt-select">
      {value}
      <i aria-hidden="true">⌄</i>
    </span>
  </div>
);
const Row = ({
  name,
  sub,
  badge,
  tone,
  active,
}: {
  name: string;
  sub: string;
  badge: string;
  tone: string;
  active?: boolean;
}) => (
  <div className={`tt-candidate${active ? ' is-active' : ''}`}>
    <span>
      <b>{name}</b>
      <small>{sub}</small>
    </span>
    <span className={`tt-badge is-${tone}`}>{badge}</span>
  </div>
);

const scores = (
  <div className="tt-cells">
    <Cell n={1} value="1" of={1} kind="ok" />
    <Cell n={2} value="1" of={1} kind="ok" />
    <Cell n={3} value="0" of={1} kind="zero" />
    <Cell n={4} value="—" of={1} kind="empty" />
    <Cell n={5} value="2" of={2} kind="ok" />
    <Cell n={6} value="1" of={3} kind="ok" />
    <Cell n={7} value="—" of={1} kind="empty" />
  </div>
);

const GROUP_STEPS: Step[] = [
  {
    title: 'Зайдите в группу',
    text: 'Откройте «Мои группы» и выберите группу, за которую вносите результаты. Нажмите «Внести результаты» — откроется список учеников.',
    visual: (
      <>
        <Path items={['Мои группы', 'Карточка группы', 'Внести результаты']} />
        <div className="tt-card">
          <div className="tt-card-top">
            <span>
              <b>Математика (профиль)</b>
              <small>ЕГЭ · 11А · Пн, Чт 17:00</small>
            </span>
            <span className="tt-format">ЕГЭ</span>
          </div>
          <small>12 учеников · 10 записаны на пробник</small>
          <span className="tt-card-open">
            Внести результаты <ArrowRight size={16} />
          </span>
        </div>
      </>
    ),
  },
  {
    title: 'Укажите пройденные задания',
    text: 'Нажмите «Отметить задания» и отметьте задания, которые группа успела пройти к этому пробнику. Они подсветятся фиолетовым у каждого ученика.',
    visual: (
      <>
        <div className="tt-coverage">
          <span>
            <b>Пройденные задания</b>
            <small>
              группа прошла <em>16 из 19</em>
            </small>
          </span>
          <span className="tt-bar">
            <span style={{ width: '84%' }} />
          </span>
          <span className="tt-coverage-btn">Отметить задания</span>
        </div>
        <div className="tt-numbers">
          {Array.from({ length: 19 }, (_, index) => (
            <span key={index} className={index < 16 ? 'is-on' : ''}>
              {index + 1}
            </span>
          ))}
        </div>
        <div className="tt-legend">
          <span>
            <i className="is-on" />
            группа это разбирала
          </span>
          <span>
            <i />
            ещё не проходили
          </span>
        </div>
      </>
    ),
  },
  {
    title: 'Внесите баллы за задания',
    text: 'Нажмите «Внести баллы» у ученика и впишите балл за каждое задание.',
    visual: (
      <>
        {scores}
        <div className="tt-tiles tt-tiles-3">
          <Pick title="1, 2, 3…">Решил верно — впишите набранный балл (до максимума под полем).</Pick>
          <Pick title="0">Решал, но неправильно — ставьте ноль.</Pick>
          <Pick title="пусто">Не делал задание — поле не заполняйте.</Pick>
        </div>
      </>
    ),
  },
  {
    title: 'Комментарий к задаче',
    text: 'При необходимости нажмите значок-облачко под номером задания и коротко напишите, почему допущена ошибка. Ученик увидит комментарий в разборе.',
    visual: (
      <>
        <div className="tt-comment">
          <Cell n={3} value="0" of={1} kind="zero" chat />
          <div className="tt-comment-body">
            <small>Комментарии к заданиям · ученик увидит их в разборе</small>
            <span className="tt-comment-row">
              <span className="tt-comment-tag">
                <span>№3</span>
                <span>0/1</span>
              </span>
              <span className="tt-comment-text">
                Перепутаны формулы площади трапеции и параллелограмма — повторить §4.
              </span>
            </span>
          </div>
        </div>
        <Note>
          Комментарий нужен не всегда — только когда стоит объяснить, почему допущена ошибка. Если
          комментировать нечего, значок под номером можно не нажимать.
        </Note>
      </>
    ),
  },
  {
    title: 'Общий комментарий',
    text: 'Комментарий заполняется подробно: его читают родители. Пример того, что в нём должно быть:',
    visual: (
      <div className="tt-sample">
        <span>
          <b>Результат.</b> Анна уверенно справилась с первой частью работы: 16 заданий из 19 решены верно.
        </span>
        <span>
          <b>Что не получилось и почему.</b> №13 не решено: тему проходили, но домашнее задание по ней не было
          выполнено. №17 — тему ещё не разбирали, это нормально. В целом сложнее всего даётся внимательность в
          вычислениях.
        </span>
        <span>
          <b>Рекомендации.</b> Повторить уравнения с отбором корней, выполнять домашние задания в срок,
          сверять оформление решений с образцом.
        </span>
        <span>
          <b>Прогноз.</b> При регулярной домашней работе к следующему пробнику результат заметно вырастет.
        </span>
      </div>
    ),
  },
  {
    title: 'Сохранить или опубликовать',
    text: '',
    visual: (
      <>
        <div className="tt-buttons">
          <span>Сохранить</span>
          <span className="is-primary">Сохранить и опубликовать</span>
        </div>
        <div className="tt-tiles tt-tiles-2">
          <div className="tt-tile">
            <span className="tt-badge is-checked">Статус: Проверено</span>
            <b>Сохранить</b>
            <span>
              Работа записывается в базу. Ученик результат пока не видит — можно вернуться и поправить.
            </span>
          </div>
          <div className="tt-tile is-accent">
            <span className="tt-badge is-published">Статус: Опубликован</span>
            <b>Сохранить и опубликовать</b>
            <span>Результат записывается и сразу виден ученику: баллы, комментарии и общий комментарий.</span>
          </div>
        </div>
        <Note>
          Проверили всю группу? Кнопка «Опубликовать проверенные» в шапке списка откроет результаты всем
          сразу.
        </Note>
      </>
    ),
  },
];

const OUTSIDE_STEPS: Step[] = [
  {
    title: 'Откройте «Результаты»',
    text: 'В меню слева выберите «Результаты» и нажмите «Добавить результат» вверху справа. Так вносят баллы ученику, который не учится в вашей группе.',
    visual: (
      <>
        <Path items={['Меню: Результаты', 'Добавить результат']} />
        <div className="tt-toolbar">
          <b>Результаты</b>
          <span>
            <span className="tt-toolbar-hint">+ Добавить результат</span>
            <span className="tt-toolbar-main">Опубликовать проверенные (14)</span>
          </span>
        </div>
      </>
    ),
  },
  {
    title: 'Выберите пробник',
    text: 'Выберите пробник, предмет, а также школу, дату и время, когда ученик писал работу.',
    visual: (
      <div className="tt-form">
        <Field label="Пробник" value="Осенний пробник ЕГЭ · 10–11 октября" />
        <Field label="Предмет" value="Математика (профиль) · ЕГЭ" />
        <Field label="Школа, дата и время" value="Гарри на Ленина · сб 10 окт, 10:00" />
      </div>
    ),
  },
  {
    title: 'Найдите ученика',
    text: 'Введите фамилию или имя и выберите ученика из списка. Ищутся все ученики школы, не только ваши.',
    visual: (
      <>
        <div className="tt-search">
          <div className="tt-search-input">
            <Search size={16} />
            Мак
          </div>
          <Row
            name="Макарова Ева"
            sub="10 класс · ЕГЭ Мат. профиль · 10Б"
            badge="Без записи"
            tone="warn"
            active
          />
          <Row name="Макаров Илья" sub="11 класс · ЕГЭ Мат. профиль · 11А" badge="Записан" tone="info" />
          <Row
            name="Максимова Алёна"
            sub="11 класс · ЕГЭ Мат. профиль · 11Б"
            badge="Уже опубликован"
            tone="published"
          />
        </div>
        <Note>
          «Без записи» — запись на пробник создастся автоматически. «Уже опубликован» — этого ученика выбрать
          нельзя.
        </Note>
      </>
    ),
  },
  {
    title: 'Внесите баллы и комментарии',
    text: 'Заполните так же, как для группы. Комментарий читают родители, поэтому пишите его подробно.',
    visual: (
      <>
        <div className="tt-student">
          <b>
            Макарова Ева <span className="tt-badge is-warn">Без записи</span>
          </b>
          <small>
            Первичный: <b>10 / 32</b>
          </small>
        </div>
        {scores}
        <div className="tt-tiles tt-tiles-2">
          <Pick title="Баллы и комментарии к задачам">
            0 — решил неверно, пусто — не делал. Комментарий к задаче — по желанию.
          </Pick>
          <Pick title="Общий комментарий">
            Заполняется подробно, как в разделе про группу: его читают родители.
          </Pick>
        </div>
      </>
    ),
  },
  {
    title: 'Сохраните результат',
    text: '',
    visual: (
      <>
        <div className="tt-buttons">
          <span>Сохранить</span>
          <span className="is-soft">Сохранить и добавить ещё</span>
          <span className="is-primary">Сохранить и опубликовать</span>
        </div>
        <div className="tt-tiles tt-tiles-3">
          <Pick title="Сохранить">Записывается в базу, ученик пока не видит.</Pick>
          <Pick title="Сохранить и добавить ещё">
            Записывается в базу и сразу открывает форму для следующего ученика.
          </Pick>
          <Pick title="Сохранить и опубликовать">Результат сразу виден ученику.</Pick>
        </div>
      </>
    ),
  },
];

const PARTS: { part: TrainingPart; label: string; steps: Step[] }[] = [
  { part: 'groups', label: 'Результаты группы', steps: GROUP_STEPS },
  { part: 'outside', label: 'Ученик не из группы', steps: OUTSIDE_STEPS },
];

const passed = (training: Training, part: TrainingPart) =>
  !!(part === 'groups' ? training.groups_at : training.outside_at);

/** Sidebar button: yellow until both parts are finished, then green. */
export function TrainingButton({
  training,
  onOpen,
  compact,
}: {
  training: Training;
  onOpen: () => void;
  compact?: boolean;
}) {
  const count = Number(passed(training, 'groups')) + Number(passed(training, 'outside'));
  const state = count === 2 ? 'done' : count === 1 ? 'part' : 'none';
  if (compact)
    return (
      <button
        type="button"
        className={`training-open-m is-${state}`}
        aria-haspopup="dialog"
        aria-label={state === 'done' ? 'Обучение пройдено' : 'Обучение не пройдено'}
        onClick={onOpen}
      >
        {state === 'done' ? (
          <span className="training-check">
            <Check size={16} strokeWidth={3.2} />
          </span>
        ) : (
          <GraduationCap size={22} />
        )}
      </button>
    );
  return (
    <button type="button" className={`training-open is-${state}`} aria-haspopup="dialog" onClick={onOpen}>
      {state === 'done' ? (
        <span className="training-check">
          <Check size={14} strokeWidth={3.2} />
        </span>
      ) : (
        <GraduationCap size={22} />
      )}
      <span className="training-open-text">
        Обучение
        <small>
          {state === 'done' ? 'пройдено ✓' : state === 'part' ? 'пройдено 1 из 2' : 'не пройдено'}
        </small>
      </span>
    </button>
  );
}

export function TrainingDialog({
  training,
  onChange,
  onClose,
}: {
  training: Training;
  onChange: (next: Training) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState(0);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const node = ref.current!;
    node.showModal();
    return () => node.close();
  }, []);

  const current = PARTS[tab];
  const steps = current.steps;
  const last = step === steps.length - 1;
  const other = PARTS[1 - tab];
  const otherDone = passed(training, other.part);
  const allDone = passed(training, 'groups') && passed(training, 'outside');
  const select = (index: number) => {
    setTab(index);
    setStep(0);
  };
  async function finish() {
    setBusy(true);
    setError('');
    try {
      onChange(await api.training.finish(current.part));
      if (otherDone) onClose();
      else select(1 - tab);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось сохранить прогресс');
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={ref}
      className="modal training-dialog"
      aria-label="Обучение"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="tt-head">
        <h2>Обучение</h2>
        <span className="tt-head-side">
          {allDone && <span className="tt-done">Обучение пройдено ✓</span>}
          <button type="button" className="tt-close" aria-label="Закрыть" disabled={busy} onClick={onClose}>
            <X size={18} />
          </button>
        </span>
      </div>
      <div className="tt-tabs" role="tablist" aria-label="Разделы обучения">
        {PARTS.map(({ part, label }, index) => (
          <button
            type="button"
            key={part}
            role="tab"
            aria-selected={index === tab}
            className={passed(training, part) ? 'is-done' : ''}
            onClick={() => select(index)}
          >
            {passed(training, part) ? '✓ ' : ''}
            {label}
          </button>
        ))}
      </div>
      <div
        className="tt-steps"
        role="tablist"
        aria-label="Шаги"
        style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
      >
        <span
          className="tt-steps-line"
          style={{ left: `calc(100% / ${steps.length} / 2)`, right: `calc(100% / ${steps.length} / 2)` }}
        />
        <span
          className="tt-steps-fill"
          style={{
            left: `calc(100% / ${steps.length} / 2)`,
            width: `calc((100% - 100% / ${steps.length}) * ${step / (steps.length - 1)})`,
          }}
        />
        {steps.map((item, index) => (
          <button
            type="button"
            key={item.title}
            role="tab"
            aria-selected={index === step}
            aria-label={item.title}
            title={item.title}
            className={index === step ? 'is-current' : index < step ? 'is-past' : ''}
            onClick={() => setStep(index)}
          >
            <span className="tt-step-dot">{index < step ? '✓' : index + 1}</span>
            <span className="tt-step-label">{item.title}</span>
          </button>
        ))}
      </div>
      <section className="tt-body">
        <h3 className="tt-title">{steps[step].title}</h3>
        {steps[step].text && <p>{steps[step].text}</p>}
        <div className="tt-stage">{steps[step].visual}</div>
        {error && (
          <p className="tt-error" role="alert">
            {error}
          </p>
        )}
        <div className="tt-nav">
          <button
            type="button"
            className="tt-prev"
            style={{ visibility: step === 0 ? 'hidden' : 'visible' }}
            onClick={() => setStep(step - 1)}
          >
            ← Назад
          </button>
          {last ? (
            <button
              type="button"
              className={`tt-next${otherDone ? ' is-final' : ''}`}
              disabled={busy}
              onClick={finish}
            >
              {otherDone ? 'Завершить обучение ✓' : `Дальше: ${other.label.toLowerCase()} →`}
            </button>
          ) : (
            <button type="button" className="tt-next" onClick={() => setStep(step + 1)}>
              Дальше →
            </button>
          )}
        </div>
      </section>
    </dialog>
  );
}
