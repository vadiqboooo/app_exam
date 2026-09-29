import { Link } from 'react-router-dom';
import { ArrowRight, CalendarDays, ClipboardCheck, Users, TrendingUp, Upload, Plus } from 'lucide-react';
import { useWorkspace } from '../../layouts/Workspace';
import { PageHeader } from '../../components/PageHeader';
import { StatCard } from '../../components/StatCard';
import { ExamCard } from '../../components/ExamCard';
import { EmptyState } from '../../components/EmptyState';
import { groupExams } from '../../lib/format';

export function Dashboard() {
  const { data } = useWorkspace();
  const pending = data.participations.filter((p) => p.status === 'submitted').length;
  const upcoming = groupExams(
    data.exams.filter((e) => e.is_active && new Date(e.ends_at ?? e.starts_at).getTime() > Date.now()),
  );
  return (
    <div className="stack page-stack">
      <PageHeader
        title="Главная"
        subtitle="Всё, что нужно для организации пробных экзаменов."
        action={
          <Link className="button button-secondary" to="/import">
            <Upload size={16} />
            Импорт CRM
          </Link>
        }
      />
      <section className="welcome-panel">
        <div>
          <span className="eyebrow">УЧЕБНЫЙ ПРОЦЕСС ПОД КОНТРОЛЕМ</span>
          <h2>
            От первой записи
            <br />
            до уверенного результата
          </h2>
          <p>
            Планируйте пробники, следите за явкой
            <br className="desktop-only" /> и помогайте ученикам двигаться вперёд.
          </p>
          <Link to="/exams" className="button button-primary">
            Перейти к пробникам <ArrowRight size={17} />
          </Link>
        </div>
        <div className="welcome-art" aria-hidden="true">
          <div className="art-card">
            <span className="art-card-icon">
              <ClipboardCheck size={29} />
            </span>
            <span>Подготовка к экзамену</span>
            <strong>Каждый шаг важен</strong>
            <div className="art-progress">
              <i />
            </div>
            <div className="art-steps">
              <span>Практика</span>
              <span>Результат</span>
            </div>
          </div>
          <span className="art-float">
            <TrendingUp size={22} />
            Движемся вперёд
          </span>
        </div>
      </section>
      <div className="stats-grid">
        <StatCard
          title="Активные ученики"
          value={data.students.filter((s) => s.is_active).length}
          icon={<Users size={19} />}
          hint="В текущей базе"
        />
        <StatCard
          title="Ближайшие пробники"
          value={upcoming.length}
          icon={<CalendarDays size={19} />}
          hint="Запланировано впереди"
        />
        <StatCard
          title="Ожидают проверки"
          value={pending}
          icon={<ClipboardCheck size={19} />}
          hint="Сданные работы"
        />
        <StatCard
          title="Опубликовано"
          value={data.participations.filter((p) => p.status === 'published').length}
          icon={<TrendingUp size={19} />}
          hint="Результаты доступны ученикам"
        />
      </div>
      <div className="section-heading">
        <div>
          <h2>Ближайшие экзамены</h2>
          <p>Регистрация и ход подготовки</p>
        </div>
        <Link to="/exams" className="text-link">
          Все пробники <ArrowRight size={16} />
        </Link>
      </div>
      {upcoming.length ? (
        <div className="exam-grid">
          {upcoming.slice(0, 3).map((subjects) => (
            <ExamCard
              key={subjects[0].id}
              exam={subjects[0]}
              subjects={subjects}
              participations={data.participations}
            />
          ))}
        </div>
      ) : (
        <div className="panel">
          <EmptyState
            title="Всё готово к первому пробнику"
            text="Начните с импорта учеников, затем создайте экзамен и откройте запись."
            action={
              <Link className="button button-primary" to="/exams">
                <Plus size={17} />
                Создать пробник
              </Link>
            }
          />
        </div>
      )}
      {pending > 0 && (
        <Link to="/results" className="notice-link">
          <span>
            <ClipboardCheck size={21} />
            Есть работы, которые ждут вашей проверки
          </span>
          <ArrowRight size={19} />
        </Link>
      )}
    </div>
  );
}
