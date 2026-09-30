import { useState } from 'react';
import { Plus } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { ParticipationTable } from '../../components/ParticipationTable';
import { Button } from '../../components/Button';
import { QuickResultForm } from '../../components/QuickResultForm';
import { StatCard } from '../../components/StatCard';
import { useWorkspace } from '../../layouts/Workspace';

export function Results() {
  const { data, refresh } = useWorkspace();
  const [adding, setAdding] = useState(false);
  const completed = data.participations.filter((item) => item.primary_score != null);
  return (
    <div className="stack page-stack">
      <PageHeader
        title="Экзамены и результаты"
        action={
          <Button icon={<Plus size={17} />} onClick={() => setAdding(true)}>
            Добавить результат
          </Button>
        }
      />
      <div className="stats-grid">
        <StatCard title="Всего записей" value={data.participations.length} />
        <StatCard title="Результаты внесены" value={completed.length} />
        <StatCard
          title="Ждут проверки"
          value={
            data.participations.filter((item) => item.status === 'submitted' && item.primary_score == null)
              .length
          }
        />
        <StatCard
          title="Опубликовано"
          value={data.participations.filter((item) => item.status === 'published').length}
        />
      </div>
      <div className="section-heading">
        <div>
          <h2>Работы учеников</h2>
          <p>Регистрация и статусы сохранены, но результат теперь можно внести сразу.</p>
        </div>
      </div>
      <ParticipationTable />
      {adding && (
        <QuickResultForm
          exams={data.exams}
          students={data.students}
          participations={data.participations}
          onClose={() => setAdding(false)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}
