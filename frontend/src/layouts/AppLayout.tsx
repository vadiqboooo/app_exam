import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  BookOpen,
  CalendarDays,
  Users,
  LayoutDashboard,
  Upload,
  BarChart3,
  LogOut,
  GraduationCap,
  HelpCircle,
} from 'lucide-react';
import type { Session } from '../types';
import { Button } from '../components/Button';

export const roleNames = {
  admin: 'Администратор',
  responsible: 'Ответственный',
  teacher: 'Учитель',
  student: 'Ученик',
};
export function AppLayout({ session, logout }: { session: Session; logout: () => void }) {
  const { pathname } = useLocation();
  const groupsPage = pathname === '/groups';
  const inGroups = groupsPage || pathname.startsWith('/groups/');
  const groupsTitle = session.role === 'teacher' ? 'Мои группы' : 'Группы';
  const nav =
    session.role === 'student'
      ? [
          { to: '/available', title: 'Главная', icon: CalendarDays },
          { to: '/my-results', title: 'Мои результаты', icon: BarChart3 },
        ]
      : session.role === 'teacher'
        ? [
            { to: '/groups', title: 'Мои группы', icon: Users },
            { to: '/results', title: 'Экзамены и результаты', icon: BarChart3 },
          ]
        : [
            { to: '/', title: 'Главная', icon: LayoutDashboard },
            { to: '/exams', title: 'Пробники', icon: CalendarDays },
            { to: '/students', title: 'Ученики', icon: Users },
            { to: '/teachers', title: 'Учителя', icon: GraduationCap },
            { to: '/subjects', title: 'Предметы', icon: BookOpen },
            { to: '/groups', title: groupsTitle, icon: GraduationCap },
            { to: '/results', title: 'Экзамены и результаты', icon: BarChart3 },
            { to: '/import', title: 'Импорт CRM', icon: Upload },
          ];
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <NavLink to="/" className="brand">
          <span className="brand-mark">
            <BookOpen size={24} />
          </span>
          <span>
            Пробник<small>Учебный кабинет</small>
          </span>
        </NavLink>
        <span className="nav-caption">РАБОЧЕЕ ПРОСТРАНСТВО</span>
        <nav aria-label="Основная навигация">
          {nav.map(({ to, title, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'}>
              <Icon size={19} />
              <span>{title}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-note">
          <HelpCircle size={20} />
          <strong>Шаг за шагом к результату</strong>
          <p>Пробники помогают увидеть прогресс и подготовиться к экзамену.</p>
        </div>
        <div className="sidebar-bottom">
          <span className="connection-dot" />
          Пробник · тестовая версия
        </div>
      </aside>
      <div className="main-shell">
        <header className={`topbar ${inGroups ? 'topbar-groups' : ''}`}>
          {groupsPage ? (
            <h1 className="topbar-title">{groupsTitle}</h1>
          ) : (
            <span className={inGroups ? 'topbar-title' : 'topbar-label'}>
              {inGroups ? (
                groupsTitle
              ) : session.role === 'student' ? (
                <>
                  <CalendarDays size={18} />
                  Расписание пробных экзаменов
                </>
              ) : (
                <>
                  <GraduationCap size={18} />
                  Пробники
                </>
              )}
            </span>
          )}
          <div className="account">
            <span className="role-pill">{roleNames[session.role]}</span>
            <span className="avatar">{session.name.slice(0, 1).toUpperCase()}</span>
            <span className="account-name">{session.name}</span>
            <Button variant="ghost" aria-label="Выйти" title="Выйти" onClick={logout}>
              <LogOut size={18} />
            </Button>
          </div>
        </header>
        <main>
          <Outlet />
        </main>
        <footer className="app-footer">
          Пробник <span>Учиться. Практиковаться. Расти.</span>
        </footer>
      </div>
    </div>
  );
}
