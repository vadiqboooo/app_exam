import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { ImportCRM } from './ImportCRM';
import { Teachers } from './Teachers';
import { Subjects } from './Subjects';
import { Students } from './Students';
import { SchoolGroups } from './SchoolGroups';

const tabs = [
  { to: '/school/students', title: 'Ученики' },
  { to: '/school/groups', title: 'Группы' },
  { to: '/school/teachers', title: 'Учителя' },
  { to: '/school/subjects', title: 'Предметы' },
  { to: '/school/import', title: 'Импорт CRM' },
];

export function School() {
  return (
    <div className="ad-page sc-page">
      <nav className="sc-tabs" aria-label="Разделы школы">
        {tabs.map(({ to, title }) => (
          <NavLink key={to} to={to}>
            {title}
          </NavLink>
        ))}
      </nav>
      <Routes>
        <Route index element={<Navigate to="students" replace />} />
        <Route path="students" element={<Students />} />
        <Route path="groups" element={<SchoolGroups />} />
        <Route path="import" element={<ImportCRM />} />
        <Route path="teachers" element={<Teachers />} />
        <Route path="subjects" element={<Subjects />} />
        <Route path="*" element={<Navigate to="/school/students" replace />} />
      </Routes>
    </div>
  );
}
