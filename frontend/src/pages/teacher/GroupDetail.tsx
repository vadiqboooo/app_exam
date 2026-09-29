import { Link, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useWorkspace } from '../../layouts/Workspace';
import { PageHeader } from '../../components/PageHeader';
import { DataTable } from '../../components/DataTable';
import { EmptyState } from '../../components/EmptyState';
import { GroupExamResults } from '../../components/GroupExamResults';

export function GroupDetail() {
  const { id } = useParams();
  const location = useLocation();
  const { data, refresh } = useWorkspace();
  const group = data.groups.find((g) => g.id === Number(id));
  const from = location.state?.from;
  const back = typeof from === 'string' && /^\/groups(?:\?|$)/.test(from) ? from : '/groups';
  const students = data.students.filter(
    (s) =>
      s.is_active &&
      data.memberships.some((m) => m.student_id === s.id && m.group_id === group?.id && !m.ended_at),
  );
  return (
    <div className="stack page-stack">
      <Link to={back} className="back-link">
        <ArrowLeft size={16} />
        Назад к группам
      </Link>
      {group ? (
        <>
          <PageHeader title={group.source_name} />
          <dl className="group-details panel">
            <div>
              <dt>Предмет</dt>
              <dd>{group.subject || 'Не указан'}</dd>
            </div>
            <div>
              <dt>Тип группы</dt>
              <dd>{group.exam_format ? (group.exam_format === 'ege' ? 'ЕГЭ' : 'ОГЭ') : 'Не указан'}</dd>
            </div>
            <div>
              <dt>Преподаватель</dt>
              <dd>{group.teacher_name || 'Не указан'}</dd>
            </div>
            <div>
              <dt>Расписание</dt>
              <dd>{group.schedule || 'Не указано'}</dd>
            </div>
            <div>
              <dt>Учеников</dt>
              <dd>{students.length}</dd>
            </div>
          </dl>
          {data.exams.length ? (
            <GroupExamResults
              key={group.id}
              group={group}
              students={students}
              exams={data.exams}
              participations={data.participations}
              onSaved={refresh}
            />
          ) : (
            <>
              <h2>Ученики группы</h2>
              <p className="muted">Пробники пока не созданы. Здесь появятся запись и результаты учеников.</p>
              <DataTable
                rows={students}
                rowKey={(s) => s.id}
                label="Ученики группы"
                empty="В группе пока нет учеников"
                columns={[
                  { title: 'Ученик', render: (s) => <strong>{s.full_name}</strong> },
                  { title: 'Класс', render: (s) => s.grade || 'Не указан' },
                ]}
              />
            </>
          )}
        </>
      ) : (
        <EmptyState title="Группа не найдена" text="Вернитесь к списку и выберите другую группу." />
      )}
    </div>
  );
}
