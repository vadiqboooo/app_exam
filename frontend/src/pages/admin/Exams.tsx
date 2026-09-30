import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { useWorkspace } from '../../layouts/Workspace';
import { Button } from '../../components/Button';
import { ExamCard } from '../../components/ExamCard';
import { ExamForm } from '../../components/ExamForm';
import { EmptyState } from '../../components/EmptyState';
import { FilterBar } from '../../components/FilterBar';
import { groupExams } from '../../lib/format';

export function Exams() {
  const { data, refresh } = useWorkspace();
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const navigate = useNavigate();
  const exams = data.exams.filter(
    (e) =>
      (!type || e.format === type) &&
      `${e.subject} ${e.title ?? ''}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div className="stack page-stack">
      <FilterBar>
        <div className="search-input">
          <Search size={17} />
          <input
            aria-label="Поиск экзамена"
            placeholder="Найти по предмету или названию"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select aria-label="Тип экзаменов" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">Все экзамены</option>
          <option value="oge">ОГЭ</option>
          <option value="ege">ЕГЭ</option>
        </select>
        <Button icon={<Plus size={17} />} onClick={() => setCreating(true)}>
          Создать пробник
        </Button>
      </FilterBar>
      {exams.length ? (
        <div className="exam-list">
          {groupExams(exams).map((subjects) => (
            <ExamCard
              key={subjects[0].id}
              exam={subjects[0]}
              subjects={subjects}
              participations={data.participations}
              layout="row"
            />
          ))}
        </div>
      ) : (
        <div className="panel">
          <EmptyState
            title="Пробники пока не добавлены"
            text="Укажите название, предметы ЕГЭ и ОГЭ, школы и время записи."
          />
        </div>
      )}
      {creating && (
        <ExamForm
          onClose={() => setCreating(false)}
          onCreated={async (exam) => {
            await refresh();
            setCreating(false);
            navigate(`/exam-events/${exam.id}`);
          }}
        />
      )}
    </div>
  );
}
