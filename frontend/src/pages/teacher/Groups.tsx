import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Clock3, Users } from 'lucide-react';
import { useWorkspace } from '../../layouts/Workspace';
import { DataTable } from '../../components/DataTable';
import { EmptyState } from '../../components/EmptyState';

export function Groups({ title }: { title: string }) {
  const { data } = useWorkspace();
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const groups = data.groups.filter((g) => g.is_active);
  const requestedPage = Number(params.get('page') || 1);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage - 1 : 0;
  const state = { from: location.pathname + location.search };
  const teacher = title === 'Мои группы';
  return (
    <div className="stack page-stack">
      {teacher && groups.length ? (
        <div className="teacher-groups">
          <div className="teacher-groups-intro">
            <h1>Мои группы</h1>
            <p>Группы из CRM, где вы преподаватель. Откройте группу, чтобы внести баллы за пробник.</p>
          </div>
          <div className="teacher-group-grid">
            {groups.map((g) => (
              <Link key={g.id} className="teacher-group-card" to={`/groups/${g.id}`} state={state}>
                <div className="teacher-group-top">
                  <span>
                    <strong>{g.subject || 'Предмет не указан'}</strong>
                    <small>{g.source_name}</small>
                  </span>
                  {g.exam_format && (
                    <span className="teacher-group-format">{g.exam_format === 'ege' ? 'ЕГЭ' : 'ОГЭ'}</span>
                  )}
                </div>
                <div className="teacher-group-meta">
                  <span>
                    <Users size={16} />
                    {data.memberships.filter((m) => m.group_id === g.id && !m.ended_at).length} учеников
                  </span>
                  <span>
                    <Clock3 size={16} />
                    {g.schedule || 'Расписание не указано'}
                  </span>
                </div>
                <span className="teacher-group-open">
                  Внести результаты <ArrowRight size={16} />
                </span>
              </Link>
            ))}
          </div>
        </div>
      ) : groups.length ? (
        <DataTable
          rows={groups}
          rowKey={(g) => g.id}
          label={title}
          page={page}
          onPageChange={(next) => setParams(next ? { page: String(next + 1) } : {})}
          onRowClick={(g) => navigate(`/groups/${g.id}`, { state })}
          columns={[
            {
              title: 'Название группы',
              render: (g) => (
                <Link className="group-link" to={`/groups/${g.id}`} state={state} title={g.source_name}>
                  <strong>{g.source_name}</strong>
                  <ArrowUpRight size={16} />
                </Link>
              ),
            },
            { title: 'Предмет', render: (g) => g.subject || 'Не указан' },
            {
              title: 'Тип группы',
              render: (g) =>
                g.exam_format ? (
                  <span className="badge badge-checked">{g.exam_format === 'ege' ? 'ЕГЭ' : 'ОГЭ'}</span>
                ) : (
                  'Не указан'
                ),
            },
            { title: 'Преподаватель', render: (g) => g.teacher_name || 'Не указан' },
            { title: 'Расписание', render: (g) => g.schedule || 'Не указано' },
            {
              title: 'Учеников',
              render: (g) => data.memberships.filter((m) => m.group_id === g.id && !m.ended_at).length,
            },
          ]}
        />
      ) : (
        <div className="panel">
          <EmptyState
            title="Группы пока не добавлены"
            text="После импорта CRM здесь появятся учебные группы."
          />
        </div>
      )}
    </div>
  );
}
