import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Clock3, MapPin, Users } from 'lucide-react';
import { examsForGroup } from '../../lib/groupExam';
import { useWorkspace } from '../../layouts/Workspace';
import { DataTable } from '../../components/DataTable';
import { EmptyState } from '../../components/EmptyState';

/** `mine` is the employee id when an administrator or responsible person looks at their own groups. */
export function Groups({ title, mine }: { title: string; mine?: number }) {
  const { data } = useWorkspace();
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const groups = data.groups.filter((g) => g.is_active && (mine === undefined || g.teacher_id === mine));
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
            <p>
              Группы из CRM, где вы преподаватель. Откройте группу, чтобы внести баллы за пробник и
              посмотреть, куда записаны ученики.
            </p>
          </div>
          <div className="teacher-group-grid">
            {groups.map((g) => {
              const memberIds = data.memberships
                .filter((m) => m.group_id === g.id && !m.ended_at)
                .map((m) => m.student_id);
              const exam = examsForGroup(data.exams, g)[0];
              const items = exam
                ? data.participations.filter(
                    (p) =>
                      p.exam_id === exam.id && memberIds.includes(p.student_id) && p.status !== 'cancelled',
                  )
                : [];
              const published = items.filter((p) => p.status === 'published').length;
              const checked = items.filter((p) => p.status === 'checked').length;
              const percent = (count: number) => (items.length ? (count / items.length) * 100 : 0);
              return (
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
                      {memberIds.length} учеников
                    </span>
                    <span>
                      <Clock3 size={16} />
                      {g.schedule || 'Расписание не указано'}
                    </span>
                  </div>
                  {exam && (
                    <>
                      <div className="teacher-group-enrolled">
                        <MapPin size={16} />
                        <span className="tgc-long">Записаны на пробник: </span>
                        <span className="tgc-short">Записаны: </span>
                        {items.length} из {memberIds.length}
                      </div>
                      <div className="tgc-progress">
                        <div className="tgc-progress-head">
                          <strong>{exam.title || 'Пробный экзамен'}</strong>
                          <span>
                            {published + checked} из {items.length} внесено
                          </span>
                        </div>
                        <div
                          className="tgc-bar"
                          role="img"
                          aria-label={`Опубликовано ${published}, проверено ${checked} из ${items.length}`}
                        >
                          <span style={{ width: `${percent(published)}%`, background: '#5c42bd' }} />
                          <span style={{ width: `${percent(checked)}%`, background: '#b7a6f0' }} />
                        </div>
                        <div className="tgc-legend">
                          <span>
                            <i style={{ background: '#5c42bd' }} />
                            Опубликовано {published}
                          </span>
                          <span>
                            <i style={{ background: '#b7a6f0' }} />
                            Проверено {checked}
                          </span>
                        </div>
                      </div>
                    </>
                  )}
                  <span className="teacher-group-open">
                    Внести результаты <ArrowRight size={16} />
                  </span>
                </Link>
              );
            })}
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
