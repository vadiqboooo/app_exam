import { Link } from 'react-router-dom';
import { ChevronRight, Plus } from 'lucide-react';
import { useWorkspace } from '../../layouts/Workspace';
import { groupExams } from '../../lib/format';
import { dateRange, shortDay, stateLabels, summarize } from '../../lib/adminEvents';

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

export function Dashboard() {
  const { data } = useWorkspace();
  const events = groupExams(data.exams)
    .map((subjects) => ({ subjects, info: summarize(subjects, data.participations) }))
    .sort((a, b) => a.info.start.localeCompare(b.info.start));
  const nearest = events.find((item) => !item.info.finished && item.info.state !== 'draft');
  const reviewed = [...events].reverse().find((item) => item.info.finished && item.info.worked > 0);
  const students = data.students.filter((student) => student.is_active);
  const all = data.participations.filter((item) => item.status !== 'cancelled');
  const submitted = all.filter((item) => item.status === 'submitted').length;
  const checked = all.filter((item) => item.status === 'checked').length;
  const published = all.filter((item) => item.status === 'published').length;
  const worked = all.filter((item) =>
    ['attended', 'submitted', 'checked', 'published'].includes(item.status),
  ).length;
  const today = new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(
    new Date(),
  );
  const todayLabel = today.charAt(0).toUpperCase() + today.slice(1);

  const fill = nearest?.subjects.map((exam) => ({
    subject: exam.subject,
    reg: all.filter((item) => item.exam_id === exam.id).length,
    cap: exam.slots.reduce((sum, slot) => sum + slot.capacity, 0),
  }));

  const teacherCards = (() => {
    if (!reviewed) return [];
    const ids = new Map(reviewed.subjects.map((exam) => [exam.id, exam]));
    const map = new Map<
      string,
      { subjects: Set<string>; groups: Set<number>; total: number; pub: number; chk: number }
    >();
    for (const item of all) {
      const exam = ids.get(item.exam_id);
      if (!exam || item.status === 'absent' || item.status === 'registered') continue;
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
    return [...map.entries()].slice(0, 4);
  })();

  const todo = [
    checked > 0 && {
      num: checked,
      title: 'Проверены, но не опубликованы',
      sub: 'Опубликуйте результаты, чтобы их увидели ученики',
      href: '/results',
      tone: 'violet',
    },
    submitted > 0 && {
      num: submitted,
      title: 'Работы ждут баллов',
      sub: 'Сданы, но баллы ещё не внесены',
      href: '/results',
      tone: 'amber',
    },
    !nearest && {
      num: 0,
      title: 'Нет ближайшего пробника',
      sub: 'Создайте пробник и откройте запись',
      href: '/exams',
      tone: 'slate',
    },
  ].filter(Boolean) as { num: number; title: string; sub: string; href: string; tone: string }[];

  return (
    <div className="ad-page">
      <div className="ad-head">
        <div>
          <h1>Главная</h1>
          <p>{todayLabel} · что происходит с пробниками сейчас</p>
        </div>
        <Link className="button button-primary" to="/exams/new">
          <Plus size={17} />
          Создать пробник
        </Link>
      </div>
      <div className="ad-stats">
        {[
          {
            label: 'Активные ученики',
            value: students.length,
            note: `${data.groups.filter((g) => g.is_active).length} групп из CRM`,
          },
          {
            label: 'Записей на ближайший пробник',
            value: nearest ? nearest.info.reg : 0,
            note: nearest?.info.first.title || 'Нет ближайшего пробника',
          },
          { label: 'Ждут проверки', value: submitted + checked, note: 'Сданные и проверенные работы' },
          {
            label: 'Опубликовано результатов',
            value: published,
            note: worked ? `из ${worked} работ` : 'Пока нет работ',
          },
        ].map((item) => (
          <div key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <small>{item.note}</small>
          </div>
        ))}
      </div>
      <div className="ad-split">
        <section className="ad-card">
          {nearest && fill ? (
            <>
              <div className="ad-card-top">
                <div>
                  <span className="ad-eyebrow">БЛИЖАЙШИЙ ПРОБНИК</span>
                  <h2>{nearest.info.first.title || 'Пробный экзамен'}</h2>
                  <small>
                    {dateRange(nearest.info.start, nearest.info.end)} · {nearest.info.schools}{' '}
                    {nearest.info.schools === 1 ? 'школа' : 'школы'} · {nearest.info.slots.length} сеансов
                    {nearest.info.first.registration_close_at
                      ? ` · запись до ${shortDay(nearest.info.first.registration_close_at)}`
                      : ''}
                  </small>
                </div>
                <span className={`ad-badge ad-badge-${nearest.info.state}`}>
                  {stateLabels[nearest.info.state]}
                </span>
              </div>
              <div className="ad-fill">
                {fill.map((item) => {
                  const ratio = item.cap ? item.reg / item.cap : 0;
                  return (
                    <div key={item.subject}>
                      <span>{item.subject}</span>
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
                      <span>
                        <b>{item.reg}</b> / {item.cap}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="ad-actions">
                <Link
                  className="button button-primary"
                  to={nearest.info.first.event_id ? `/exam-events/${nearest.info.first.event_id}` : '/exams'}
                >
                  Открыть пробник
                </Link>
              </div>
            </>
          ) : (
            <div className="ad-empty">
              <h2>Ближайших пробников нет</h2>
              <p>Начните с импорта учеников, затем создайте пробник и откройте запись.</p>
            </div>
          )}
        </section>
        <section className="ad-card">
          <h2>Требует внимания</h2>
          {todo.length ? (
            todo.map((item) => (
              <Link key={item.title} to={item.href} className="ad-todo">
                <span className={`ad-todo-num is-${item.tone}`}>{item.num || '!'}</span>
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.sub}</small>
                </span>
                <ChevronRight size={18} />
              </Link>
            ))
          ) : (
            <p className="ad-muted">Всё в порядке: работ, которые ждут действий, нет.</p>
          )}
        </section>
      </div>
      {reviewed && teacherCards.length > 0 && (
        <section className="ad-card">
          <div className="ad-card-top">
            <h2>{reviewed.info.first.title || 'Пробник'} — проверка по учителям</h2>
            <Link to="/results" className="text-link">
              Все результаты
            </Link>
          </div>
          <div className="ad-teachers">
            {teacherCards.map(([name, item]) => (
              <div key={name}>
                <strong>{name}</strong>
                <small>
                  {[...item.subjects].join(', ')} · {item.groups.size}{' '}
                  {item.groups.size === 1 ? 'группа' : 'групп'}
                </small>
                <div
                  className="ad-bar ad-bar-split"
                  role="img"
                  aria-label={`Опубликовано ${item.pub}, проверено ${item.chk} из ${item.total}`}
                >
                  <i style={{ width: `${(item.pub / item.total) * 100}%` }} />
                  <i className="is-chk" style={{ width: `${(item.chk / item.total) * 100}%` }} />
                </div>
                <small>
                  Опубликовано {item.pub} · проверено {item.chk} · без баллов{' '}
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
