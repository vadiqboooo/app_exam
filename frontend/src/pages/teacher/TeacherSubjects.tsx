import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { api } from '../../api/client';
import { EmptyState } from '../../components/EmptyState';
import { ErrorNotice } from '../../components/ErrorNotice';
import { useLoad } from '../../hooks/useLoad';

const loadMine = () => api.subjects.mine();
const since = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' });

export function TeacherSubjects() {
  const { data, error, loading } = useLoad(loadMine);
  return (
    <div className="ad-page ts-page">
      <div className="ts-intro">
        <h1>Мои предметы</h1>
        <p>
          Предметы, за которые вы отвечаете. Ответственного назначает администратор. Вы правите задания и
          шкалу и загружаете варианты для печати.
        </p>
      </div>
      <ErrorNotice message={error} />
      {loading && !data ? (
        <div className="loading" role="status">
          Загружаем предметы…
        </div>
      ) : data?.length ? (
        <div className="ts-grid">
          {data.map((subject) => (
            <Link key={subject.id} className="ts-card" to={`/subjects/${subject.id}`}>
              <div className="ts-top">
                <span>
                  <strong>{subject.name}</strong>
                  <small>
                    {subject.responsible_since
                      ? `Назначен ${since.format(new Date(subject.responsible_since))}`
                      : 'Назначен администратором'}
                  </small>
                </span>
                <span className="sc-format">{subject.format === 'ege' ? 'ЕГЭ' : 'ОГЭ'}</span>
              </div>
              <div className="ts-facts">
                <div>
                  <span>Заданий</span>
                  <strong>{subject.tasks.length}</strong>
                </div>
                <div>
                  <span>Макс. балл</span>
                  <strong>{subject.max_primary_score}</strong>
                </div>
                <div>
                  <span>Вариантов</span>
                  <strong>{subject.variants_count}</strong>
                </div>
              </div>
              <span className="ts-open">
                Настройки и варианты <ArrowRight size={16} />
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="panel">
          <EmptyState
            title="Вам пока не назначен ни один предмет"
            text="Администратор назначает ответственного в настройках предмета."
          />
        </div>
      )}
    </div>
  );
}
