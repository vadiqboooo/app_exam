import { Link, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useWorkspace } from '../../layouts/Workspace';
import { StudentCard } from '../../components/StudentCard';
import { DataTable } from '../../components/DataTable';
import { ParticipationTable } from '../../components/ParticipationTable';
import { EmptyState } from '../../components/EmptyState';
import { date } from '../../lib/format';

export function StudentDetail() {
  const { id } = useParams();
  const back = (useLocation().state as { backTo?: string; backLabel?: string } | null) ?? {};
  const { data } = useWorkspace();
  const student = data.students.find((s) => s.id === Number(id));
  if (!student) return <EmptyState title="Ученик не найден" />;
  const memberships = data.memberships.filter((m) => m.student_id === student.id).sort((a, b) => b.id - a.id);
  return (
    <div className="stack page-stack">
      <Link to={back.backTo ?? '/school/students'} className="back-link">
        <ArrowLeft size={16} />
        {back.backLabel ?? 'Все ученики'}
      </Link>
      <StudentCard student={student} />
      <div className="section-heading">
        <h2>Группы и история обучения</h2>
      </div>
      <DataTable
        rows={memberships}
        rowKey={(m) => m.id}
        label="История групп"
        columns={[
          {
            title: 'Группа',
            render: (m) => <strong>{data.groups.find((g) => g.id === m.group_id)?.source_name}</strong>,
          },
          { title: 'Начало обучения', render: (m) => date(m.started_at) },
          {
            title: 'Завершение',
            render: (m) =>
              m.ended_at ? date(m.ended_at) : <span className="badge badge-published">Обучается</span>,
          },
        ]}
      />
      <div className="section-heading">
        <h2>История экзаменов</h2>
      </div>
      <ParticipationTable studentId={student.id} />
    </div>
  );
}
