import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Upload } from 'lucide-react';
import { useWorkspace } from '../../layouts/Workspace';
import { studentGroups } from '../../lib/format';
import { FilterBar } from '../../components/FilterBar';
import { DataTable } from '../../components/DataTable';

export function Students() {
  const { data } = useWorkspace();
  const [active, setActive] = useState('active');
  const [search, setSearch] = useState('');
  const rows = data.students.filter(
    (s) =>
      (active === 'all' || s.is_active === (active === 'active')) &&
      s.full_name.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div className="stack page-stack">
      <FilterBar>
        <div className="search-input">
          <Search size={17} />
          <input
            aria-label="Поиск ученика"
            placeholder="Поиск по фамилии или имени"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="segmented" role="group" aria-label="Активность учеников">
          {[
            ['active', 'Активные'],
            ['archive', 'Архив'],
            ['all', 'Все'],
          ].map(([value, title]) => (
            <button className={active === value ? 'active' : ''} key={value} onClick={() => setActive(value)}>
              {title}
            </button>
          ))}
        </div>
        <Link to="/school/import" className="button button-secondary">
          <Upload size={17} />
          Импорт учеников
        </Link>
      </FilterBar>
      <DataTable
        rows={rows}
        rowKey={(s) => s.id}
        label="Ученики"
        empty="Ученики не найдены"
        columns={[
          {
            title: 'ФИО',
            render: (s) => (
              <Link className="cell-person" to={`/students/${s.id}`}>
                <span className="avatar">{s.full_name[0]}</span>
                <strong>{s.full_name}</strong>
              </Link>
            ),
          },
          { title: 'Класс', render: (s) => (s.grade ? `${s.grade} класс` : '—') },
          {
            title: 'Статус',
            render: (s) => (
              <span className={`badge ${s.is_active ? 'badge-published' : 'badge-cancelled'}`}>
                {s.is_active ? 'Активен' : 'В архиве'}
              </span>
            ),
          },
          {
            title: 'Активные группы',
            render: (s) => (
              <div className="tag-list">
                {studentGroups(s.id, data.memberships, data.groups).map((g) => (
                  <span className="tag" key={g.id}>
                    {g.source_name}
                  </span>
                ))}
                {!studentGroups(s.id, data.memberships, data.groups).length && (
                  <span className="muted">Нет активных групп</span>
                )}
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
