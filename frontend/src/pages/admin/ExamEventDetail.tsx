import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { useWorkspace } from '../../layouts/Workspace';
import { useAction } from '../../hooks/useAction';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { ExamCard } from '../../components/ExamCard';
import { ExamForm } from '../../components/ExamForm';
import { DataTable } from '../../components/DataTable';
import { date } from '../../lib/format';

export function ExamEventDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, refresh } = useWorkspace();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deletion = useAction();
  const exams = data.exams.filter((e) => e.event_id === Number(id));
  if (!exams.length) return <EmptyState title="Пробник не найден" />;
  const slots = [...new Map(exams.flatMap((exam) => exam.slots).map((slot) => [slot.id, slot])).values()];
  return (
    <div className="stack page-stack">
      <Link className="back-link" to="/exams">
        ← Все пробники
      </Link>
      <PageHeader
        title={exams[0].title!}
        subtitle="Предметы, школы и доступные места для записи."
        action={
          <div className="inline">
            <Button variant="secondary" icon={<Pencil size={16} />} onClick={() => setEditing(true)}>
              Редактировать
            </Button>
            <Button variant="danger" icon={<Trash2 size={16} />} onClick={() => setConfirmDelete(true)}>
              Удалить
            </Button>
          </div>
        }
      />
      <h2>Школы и расписание</h2>
      <DataTable
        rows={slots}
        rowKey={(s) => s.id}
        label="Расписание пробника"
        columns={[
          {
            title: 'Школа',
            render: (s) => (
              <div>
                <strong>{s.school_name}</strong>
                <small>{s.school_address}</small>
              </div>
            ),
          },
          { title: 'Дата и время', render: (s) => date(s.starts_at, true) },
          { title: 'Всего мест', render: (s) => s.capacity },
          { title: 'Записано', render: (s) => s.booked },
          { title: 'Свободно', render: (s) => s.remaining },
        ]}
      />
      <h2>Предметы и участники</h2>
      <div className="exam-grid">
        {exams.map((exam) => (
          <ExamCard key={exam.id} exam={exam} participations={data.participations} />
        ))}
      </div>
      {editing && (
        <ExamForm
          exams={exams}
          onClose={() => setEditing(false)}
          onCreated={async () => {
            await refresh();
            setEditing(false);
          }}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog
          title="Удалить пробник?"
          text="Пробник, все записи учеников и результаты по нему будут удалены без возможности восстановления."
          confirm="Удалить пробник"
          danger
          busy={deletion.busy}
          error={deletion.error}
          onClose={() => setConfirmDelete(false)}
          onConfirm={() =>
            void deletion.run(async () => {
              await api.examEvents.delete(Number(id));
              await refresh();
              navigate('/exams');
            })
          }
        />
      )}
    </div>
  );
}
