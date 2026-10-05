import { Link } from 'react-router-dom';
import { ChevronRight, Plus } from 'lucide-react';
import { loadSession } from '../../api/client';
import { useWorkspace } from '../../layouts/Workspace';
import { codeState } from '../../lib/accessCode';
import { groupExams } from '../../lib/format';
import { dateRange, plural, shortDay, stateLabels, summarize } from '../../lib/adminEvents';
import { useEventVariants } from '../../lib/useEventVariants';

const normalize = (value: string | null | undefined) =>
  (value ?? '')
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[^а-яa-z0-9]+/g, ' ')
    .trim();
const sameSubject = (left: string | null, right: string) => {
  const a = normalize(left);
  const b = normalize(right);
  return !!a && !!b && (a === b || a.includes(b) || b.includes(a));
};
const greeting = () => {
  const hour = new Date().getHours();
  return hour < 5 ? 'Доброй ночи' : hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер';
};
const list = (items: string[]) =>
  items.length > 2 ? `${items.slice(0, 2).join(', ')} и ещё ${items.length - 2}` : items.join(', ');

type Tone = 'amber' | 'violet' | 'slate';

export function Dashboard() {
  const { data } = useWorkspace();
  const events = groupExams(data.exams)
    .map((subjects) => ({ subjects, info: summarize(subjects, data.participations) }))
    .sort((a, b) => a.info.start.localeCompare(b.info.start));
  const nearest = events.find((item) => !item.info.finished && item.info.state !== 'draft');
  const reviewed = [...events].reverse().find((item) => item.info.finished && item.info.worked > 0);
  const preparation = useEventVariants(nearest?.subjects ?? []);
  const all = data.participations.filter((item) => item.status !== 'cancelled');
  const submitted = all.filter((item) => item.status === 'submitted').length;
  const checked = all.filter((item) => item.status === 'checked').length;
  const blocked = data.students.filter(
    (student) => student.is_active && codeState(student) === 'lock',
  ).length;
  const now = new Date();
  const today = new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(
    now,
  );
  const todayLabel = today.charAt(0).toUpperCase() + today.slice(1);
  const daysLeft = nearest
    ? Math.ceil((new Date(nearest.info.start).getTime() - now.getTime()) / 86_400_000)
    : 0;
  const countdown = !nearest
    ? 'ближайших пробников нет'
    : daysLeft > 0
      ? `до ближайшего пробника ${plural(daysLeft, 'день', 'дня', 'дней')}`
      : 'ближайший пробник уже идёт';
  const name = loadSession()?.name;

  const fill = nearest?.subjects.map((exam) => ({
    subject: exam.subject,
    reg: all.filter((item) => item.exam_id === exam.id).length,
    cap: exam.slots.reduce((sum, slot) => sum + slot.capacity, 0),
  }));

  const eventHref = nearest?.info.first.event_id ? `/exam-events/${nearest.info.first.event_id}` : '/exams';
  const prepared = preparation.loaded && !preparation.error;
  const withoutVariants = preparation.rows
    .filter((row) => !row.variants.length)
    .map((row) => row.exam.subject);
  const withoutResponsible = preparation.rows
    .filter((row) => !row.subject?.responsible_id)
    .map((row) => row.exam.subject);
  const subjectCount = nearest?.subjects.length ?? 0;
  const ofSubjects = `из ${plural(subjectCount, 'предмета', 'предметов', 'предметов')}`;
  const share = (missing: number) =>
    prepared && subjectCount ? ((subjectCount - missing) / subjectCount) * 100 : 0;
  const steps = nearest
    ? [
        {
          label: 'Запись',
          value: nearest.info.reg,
          of: `из ${nearest.info.capacity} мест`,
          pct: nearest.info.capacity ? (nearest.info.reg / nearest.info.capacity) * 100 : 0,
          ok: true,
          state: nearest.info.state === 'open' ? 'Идёт' : nearest.info.state === 'soon' ? 'Скоро' : 'Закрыта',
          note:
            nearest.info.state === 'open' && nearest.info.first.registration_close_at
              ? `Закрывается ${shortDay(nearest.info.first.registration_close_at)}`
              : stateLabels[nearest.info.state],
          href: eventHref,
        },
        {
          label: 'Варианты',
          value: prepared ? subjectCount - withoutVariants.length : '—',
          of: ofSubjects,
          pct: share(withoutVariants.length),
          ok: !prepared || withoutVariants.length === 0,
          state: !prepared ? '…' : withoutVariants.length ? 'Не хватает' : 'Готово',
          note: !prepared
            ? 'Загружаем'
            : withoutVariants.length
              ? `Нет: ${list(withoutVariants)}`
              : 'Файлы загружены по всем предметам',
          href: `${eventHref}?tab=variants`,
        },
        {
          label: 'Сеансы',
          value: nearest.info.slots.length,
          of: 'сеансов назначено',
          pct: nearest.info.slots.length ? 100 : 0,
          ok: nearest.info.slots.length > 0,
          state: nearest.info.slots.length ? 'Готово' : 'Нет сеансов',
          note: `${plural(nearest.info.schools, 'школа', 'школы', 'школ')} · ${dateRange(nearest.info.start, nearest.info.end)}`,
          href: eventHref,
        },
        {
          label: 'Проверяющие',
          value: prepared ? subjectCount - withoutResponsible.length : '—',
          of: ofSubjects,
          pct: share(withoutResponsible.length),
          ok: !prepared || withoutResponsible.length === 0,
          state: !prepared ? '…' : withoutResponsible.length ? 'Не хватает' : 'Готово',
          note: !prepared
            ? 'Загружаем'
            : withoutResponsible.length
              ? `${list(withoutResponsible)} — без ответственного`
              : 'У каждого предмета есть ответственный',
          href: '/school/subjects',
        },
      ]
    : [];

  const todo = [
    !nearest && {
      num: '!',
      title: 'Нет ближайшего пробника',
      sub: 'Создайте пробник и откройте запись',
      cta: 'Создать',
      href: '/exams/new',
      tone: 'slate',
      hot: false,
    },
    prepared &&
      withoutVariants.length > 0 && {
        num: withoutVariants.length,
        title: `Нет вариантов к пробнику «${nearest?.info.first.title || 'Пробный экзамен'}»`,
        sub: `${list(withoutVariants)} — загрузите файлы или попросите ответственных`,
        cta: 'Открыть',
        href: `${eventHref}?tab=variants`,
        tone: 'amber',
        hot: true,
      },
    prepared &&
      withoutResponsible.length > 0 && {
        num: withoutResponsible.length,
        title: 'У предметов нет ответственного',
        sub: `${list(withoutResponsible)} — назначьте учителя в настройках предмета`,
        cta: 'Назначить',
        href: '/school/subjects',
        tone: 'amber',
        hot: true,
      },
    checked > 0 && {
      num: checked,
      title: 'Проверены, но не опубликованы',
      sub: 'Опубликуйте результаты, чтобы их увидели ученики',
      cta: 'Опубликовать',
      href: '/results',
      tone: 'violet',
      hot: false,
    },
    submitted > 0 && {
      num: submitted,
      title: 'Работы ждут баллов',
      sub: 'Сданы, но баллы ещё не внесены',
      cta: 'К работам',
      href: '/results',
      tone: 'amber',
      hot: true,
    },
    blocked > 0 && {
      num: blocked,
      title: 'Ученикам приостановлен вход',
      sub: '5 неверных попыток — разблокируйте или сбросьте код',
      cta: 'Разобраться',
      href: '/school/students',
      tone: 'amber',
      hot: true,
    },
  ].filter(Boolean) as {
    num: number | string;
    title: string;
    sub: string;
    cta: string;
    href: string;
    tone: Tone;
    hot: boolean;
  }[];

  const review = (() => {
    if (!reviewed) return undefined;
    const ids = new Map(reviewed.subjects.map((exam) => [exam.id, exam]));
    const map = new Map<
      string,
      { subjects: Set<string>; groups: Set<number>; total: number; pub: number; chk: number }
    >();
    let total = 0;
    let pub = 0;
    let chk = 0;
    for (const item of all) {
      const exam = ids.get(item.exam_id);
      if (!exam || item.status === 'absent' || item.status === 'registered') continue;
      total += 1;
      if (item.status === 'published') pub += 1;
      if (item.status === 'checked') chk += 1;
      const group = data.groups.find(
        (candidate) =>
          candidate.teacher_name &&
          sameSubject(candidate.subject, exam.subject) &&
          data.memberships.some(
            (membership) =>
              membership.student_id === item.student_id &&
              membership.group_id === candidate.id &&
              !membership.ended_at,
          ),
      );
      if (!group?.teacher_name) continue;
      const entry = map.get(group.teacher_name) ?? {
        subjects: new Set<string>(),
        groups: new Set<number>(),
        total: 0,
        pub: 0,
        chk: 0,
      };
      entry.subjects.add(exam.subject);
      entry.groups.add(group.id);
      entry.total += 1;
      if (item.status === 'published') entry.pub += 1;
      if (item.status === 'checked') entry.chk += 1;
      map.set(group.teacher_name, entry);
    }
    return { total, pub, chk, teachers: [...map.entries()].slice(0, 6) };
  })();
  const percent = (count: number, total: number) => (total ? (count / total) * 100 : 0);

  return (
    <div className="ad-page db-page">
      <div className="ad-head">
        <div>
          <h1>{name ? `${greeting()}, ${name}` : 'Главная'}</h1>
          <p>
            {todayLabel} · {countdown}
          </p>
        </div>
        <Link className="button button-primary" to="/exams/new">
          <Plus size={17} />
          Создать пробник
        </Link>
      </div>

      {nearest ? (
        <section className="db-card">
          <div className="db-card-top">
            <div>
              <span className="ad-eyebrow">БЛИЖАЙШИЙ ПРОБНИК</span>
              <div className="db-title">
                <h2>{nearest.info.first.title || 'Пробный экзамен'}</h2>
                <span className={`ad-badge ad-badge-${nearest.info.state}`}>
                  {stateLabels[nearest.info.state]}
                </span>
              </div>
              <small>
                {dateRange(nearest.info.start, nearest.info.end)} ·{' '}
                {plural(nearest.info.schools, 'школа', 'школы', 'школ')} ·{' '}
                {plural(nearest.info.slots.length, 'сеанс', 'сеанса', 'сеансов')}
                {nearest.info.first.registration_close_at
                  ? ` · запись до ${shortDay(nearest.info.first.registration_close_at)}`
                  : ''}
              </small>
            </div>
            <Link className="button button-secondary" to={eventHref}>
              Открыть пробник
            </Link>
          </div>
          <div className="db-steps">
            {steps.map((step) => (
              <Link key={step.label} to={step.href} className={step.ok ? 'db-step' : 'db-step is-warn'}>
                <span className="db-step-top">
                  <b>{step.label}</b>
                  <i className={step.ok ? 'is-ok' : 'is-warn'}>{step.state}</i>
                </span>
                <span className="db-step-value">
                  <strong>{step.value}</strong>
                  <small>{step.of}</small>
                </span>
                <span className="db-meter">
                  <span
                    className={step.ok ? '' : 'is-warn'}
                    style={{ width: `${Math.min(step.pct, 100)}%` }}
                  />
                </span>
                <small>{step.note}</small>
              </Link>
            ))}
          </div>
        </section>
      ) : (
        <section className="db-card ad-empty">
          <h2>Ближайших пробников нет</h2>
          <p>Начните с импорта учеников, затем создайте пробник и откройте запись.</p>
        </section>
      )}

      <div className="db-split">
        <section className="db-card">
          <div className="db-card-head">
            <h2>Что нужно сделать</h2>
            <span>{todo.length ? `требуют действий: ${todo.length}` : ''}</span>
          </div>
          {todo.length ? (
            todo.map((item) => (
              <Link key={item.title} to={item.href} className={item.hot ? 'db-todo is-hot' : 'db-todo'}>
                <span className={`db-todo-num is-${item.tone}`}>{item.num}</span>
                <span className="db-todo-text">
                  <strong>{item.title}</strong>
                  <small>{item.sub}</small>
                </span>
                <span className="db-todo-cta">
                  {item.cta}
                  <ChevronRight size={16} />
                </span>
              </Link>
            ))
          ) : (
            <p className="ad-muted">Всё в порядке: дел, которые ждут вас, нет.</p>
          )}
        </section>
        <section className="db-card">
          <div className="db-card-head">
            <h2>Запись по предметам</h2>
            <span>записано / мест</span>
          </div>
          {fill?.length ? (
            fill.map((item) => {
              const ratio = item.cap ? item.reg / item.cap : 0;
              return (
                <div className="db-fill" key={item.subject}>
                  <div>
                    <strong>{item.subject}</strong>
                    <span>
                      <b>{item.reg}</b> / {item.cap}
                    </span>
                  </div>
                  <div
                    role="img"
                    aria-label={`${item.subject}: ${item.reg} из ${item.cap}`}
                    className="ad-bar"
                  >
                    <i
                      className={ratio > 0.85 ? 'is-high' : ''}
                      style={{ width: `${Math.min(ratio, 1) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })
          ) : (
            <p className="ad-muted">Когда появится ближайший пробник, здесь будет заполнение по предметам.</p>
          )}
        </section>
      </div>

      {reviewed && review && review.teachers.length > 0 && (
        <section className="db-card">
          <div className="db-card-head">
            <h2>Проверка пробника «{reviewed.info.first.title || 'Пробный экзамен'}»</h2>
            <Link to="/results" className="text-link">
              Все результаты
            </Link>
          </div>
          <div className="db-review">
            <div className="db-review-total">
              <strong>{review.pub}</strong>
              <span>из {review.total} опубликовано</span>
            </div>
            <div
              className="ad-bar ad-bar-split"
              role="img"
              aria-label={`Опубликовано ${review.pub} из ${review.total}`}
            >
              <i style={{ width: `${percent(review.pub, review.total)}%` }} />
              <i className="is-chk" style={{ width: `${percent(review.chk, review.total)}%` }} />
            </div>
            <div className="db-legend">
              <span>
                <i />
                опубликовано
              </span>
              <span>
                <i className="is-chk" />
                проверено
              </span>
              <span>
                <i className="is-none" />
                без баллов
              </span>
            </div>
          </div>
          <div className="db-teachers">
            {review.teachers.map(([teacher, item]) => (
              <div key={teacher}>
                <strong>{teacher}</strong>
                <small>
                  {[...item.subjects].join(', ')} · {plural(item.groups.size, 'группа', 'группы', 'групп')}
                </small>
                <div
                  className="ad-bar ad-bar-split"
                  role="img"
                  aria-label={`Опубликовано ${item.pub}, проверено ${item.chk} из ${item.total}`}
                >
                  <i style={{ width: `${percent(item.pub, item.total)}%` }} />
                  <i className="is-chk" style={{ width: `${percent(item.chk, item.total)}%` }} />
                </div>
                <small>
                  опубликовано {item.pub} · проверено {item.chk} · без баллов{' '}
                  {item.total - item.pub - item.chk}
                </small>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
