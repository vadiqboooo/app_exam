import { createPortal } from 'react-dom';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { useTopbarSlot } from '../../layouts/AppLayout';
import { ImportCRM } from './ImportCRM';
import { Teachers } from './Teachers';
import { Subjects } from './Subjects';
import { Students } from './Students';
import { Groups } from '../teacher/Groups';

const tabs = [
  { to: '/school/students', title: 'Ученики' },
  { to: '/school/groups', title: 'Группы' },
  { to: '/school/import', title: 'Импорт CRM' },
  { to: '/school/teachers', title: 'Преподаватели' },
  { to: '/school/subjects', title: 'Предметы' },
];

export function School() {
  const topbarSlot = useTopbarSlot();
  return (
    <div className="stack page-stack">
      {topbarSlot &&
        createPortal(
          <div className="school-header">
            <h1 className="topbar-title">Школа</h1>
            <nav className="role-tabs school-tabs" aria-label="Разделы школы">
              {tabs.map(({ to, title }) => (
                <NavLink key={to} to={to}>
                  {title}
                </NavLink>
              ))}
            </nav>
          </div>,
          topbarSlot,
        )}
      <Routes>
        <Route index element={<Navigate to="students" replace />} />
        <Route path="students" element={<Students />} />
        <Route path="groups" element={<Groups title="Группы" />} />
        <Route path="import" element={<ImportCRM />} />
        <Route path="teachers" element={<Teachers />} />
        <Route path="subjects" element={<Subjects />} />
        <Route path="*" element={<Navigate to="/school/students" replace />} />
      </Routes>
    </div>
  );
}
