import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, UserPlus } from 'lucide-react';
import { useWorkspace } from '../../layouts/Workspace';
import { date, examTitle, examSubject } from '../../lib/format';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/Button';
import { ParticipationTable } from '../../components/ParticipationTable';
import { StatCard } from '../../components/StatCard';
import { RegisterStudent } from '../../components/RegisterStudent';
import { EmptyState } from '../../components/EmptyState';

export function ExamDetail() {
  const { id } = useParams();
  const { data, refresh } = useWorkspace();
  const exam = data.exams.find((e) => e.id === Number(id));
  const [adding, setAdding] = useState(false);
  if (!exam) return <EmptyState title="Экзамен не найден" />;
  const rows = data.participations.filter((p) => p.exam_id === exam.id);
  const available = data.students.filter((s) => s.is_active && !rows.some((p) => p.student_id === s.id));
  return (
    <div className="stack page-stack">
      <Link className="back-link" to={exam.event_id ? `/exam-events/${exam.event_id}` : '/exams'}>
        <ArrowLeft size={16} />
        Все пробники
      </Link>
      <PageHeader
        title={examSubject(exam)}
        subtitle={`${examTitle(exam)} · ${date(exam.starts_at, true)}`}
        action={
          <Button icon={<UserPlus size={17} />} onClick={() => setAdding(true)}>
            Записать ученика
          </Button>
        }
      />
      <div className="stats-grid">
        <StatCard title="Записано" value={rows.filter((p) => p.status !== 'cancelled').length} />
        <StatCard
          title="Пришло"
          value={
            rows.filter((p) => ['attended', 'submitted', 'checked', 'published'].includes(p.status)).length
          }
        />
        <StatCard
          title="Сдано работ"
          value={rows.filter((p) => ['submitted', 'checked', 'published'].includes(p.status)).length}
        />
        <StatCard
          title="Проверено"
          value={rows.filter((p) => ['checked', 'published'].includes(p.status)).length}
        />
      </div>
      <div className="section-heading">
        <div>
          <h2>Участники экзамена</h2>
          <p>Отмечайте явку, приём работ и готовность результатов.</p>
        </div>
      </div>
      <ParticipationTable examId={exam.id} />
      {adding && (
        <RegisterStudent
          exam={exam}
          students={available}
          onClose={() => setAdding(false)}
          onRegistered={refresh}
        />
      )}
    </div>
  );
}
