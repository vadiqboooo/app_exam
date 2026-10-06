import { createContext, useContext, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  CalendarDays,
  Users,
  LayoutDashboard,
  School,
  BarChart3,
  BookOpen,
  LogOut,
  GraduationCap,
  HelpCircle,
} from 'lucide-react';
import { api } from '../api/client';
import type { Session } from '../types';
import { Button } from '../components/Button';
import { useHalloween } from '../halloween/theme';
import { HalloweenShell } from './HalloweenShell';

export const roleNames = {
  admin: 'Администратор',
  responsible: 'Ответственный',
  teacher: 'Учитель',
  student: 'Ученик',
};
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
const SectionTitleContext = createContext<string | null>(null);
export const useSectionTitle = () => useContext(SectionTitleContext);
const TopbarSlotContext = createContext<HTMLElement | null>(null);
/** Element in the top bar where a page can render its own title and controls. */
export const useTopbarSlot = () => useContext(TopbarSlotContext);
export function AppLayout({ session, logout }: { session: Session; logout: () => void }) {
  const { pathname } = useLocation();
  const [topbarSlot, setTopbarSlot] = useState<HTMLElement | null>(null);
  const halloween = useHalloween();
  const eventPage = pathname.startsWith('/exam-events/') || pathname.startsWith('/school');
  const myGroupsPage = pathname === '/my-groups';
  const groupsPage = pathname === '/groups' || myGroupsPage;
  const inGroups = groupsPage || pathname.startsWith('/groups/');
  const groupsTitle = session.role === 'teacher' || myGroupsPage ? 'Мои группы' : 'Группы';
  // Whoever teaches gets the teacher's tabs, whatever other roles they hold.
  const teaches = session.role === 'teacher' || !!session.teacherId;
  // «Предметы» appears only while an administrator keeps the teacher responsible for a subject.
  const [responsible, setResponsible] = useState(false);
  useEffect(() => {
    if (!teaches) return;
    api.subjects
      .mine()
      .then((subjects) => setResponsible(subjects.length > 0))
      .catch(() => setResponsible(false));
  }, [teaches, session.token]);
  const staffRoles = session.roles?.map((role) => roleNames[role]).join(' · ');
  const roleLabel =
    session.role === 'teacher' && responsible
      ? 'Учитель · ответственный'
      : (staffRoles ?? roleNames[session.role]);
  const nav =
    session.role === 'student'
      ? [
          { to: '/available', title: 'Пробники', icon: CalendarDays },
          { to: '/my-results', title: 'Результаты', icon: BarChart3 },
        ]
      : session.role === 'teacher'
        ? [
            { to: '/groups', title: 'Мои группы', icon: Users },
            { to: '/results', title: 'Результаты', icon: BarChart3 },
            ...(responsible ? [{ to: '/subjects', title: 'Предметы', icon: BookOpen }] : []),
          ]
        : [
            { to: '/', title: 'Главная', icon: LayoutDashboard },
            { to: '/exams', title: 'Пробники', icon: CalendarDays },
            { to: '/results', title: 'Результаты', icon: BarChart3 },
            ...(session.teacherId ? [{ to: '/my-groups', title: 'Мои группы', icon: Users }] : []),
            ...(session.teacherId && responsible
              ? [{ to: '/subjects', title: 'Предметы', icon: BookOpen }]
              : []),
            { to: '/school', title: 'Школа', icon: School },
          ];
  const staff = session.role === 'admin' || session.role === 'responsible';
  const section = staff
    ? nav
        .filter(({ to }) =>
          to === '/'
            ? pathname === '/'
            : to === '/school'
              ? /^\/(school|students|groups)(\/|$)/.test(pathname)
              : pathname === to || pathname.startsWith(`${to}/`),
        )
        .sort((a, b) => b.to.length - a.to.length)[0]
    : undefined;
  // A student who used the magic gets the Halloween cabinet; staff screens never change.
  if (session.role === 'student' && halloween) return <HalloweenShell session={session} logout={logout} />;
  return (
    <SectionTitleContext.Provider value={section?.title ?? null}>
      <TopbarSlotContext.Provider value={topbarSlot}>
        <div
          className={`app-shell role-${session.role} ${
            (session.role === 'teacher' &&
              (pathname === '/results' || pathname === '/results/new' || pathname.startsWith('/subjects'))) ||
            (staff &&
              (pathname === '/' ||
                pathname === '/exams' ||
                pathname === '/exams/new' ||
                pathname === '/results' ||
                pathname === '/results/new' ||
                pathname.startsWith('/school') ||
                pathname.startsWith('/subjects') ||
                pathname.startsWith('/exam-events/')))
              ? 'admin-bare'
              : ''
          }`}
        >
          <aside className="sidebar">
            <NavLink to="/" className="brand">
              <span className="brand-mark">Г</span>
              <span>
                Гарри
                <small>
                  {session.role === 'student'
                    ? 'Подготовка к ОГЭ и ЕГЭ'
                    : session.role === 'teacher'
                      ? 'Кабинет учителя'
                      : 'Администрирование'}
                </small>
              </span>
            </NavLink>
            <div className="mobile-account">
              <span className="avatar">{initials(session.name)}</span>
              <span className="mobile-account-name">
                {session.name}
                <small>{roleLabel}</small>
              </span>
              <Button variant="ghost" aria-label="Выйти" title="Выйти" onClick={logout}>
                <LogOut size={18} />
              </Button>
            </div>
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
              {eventPage ? (
                <div className="topbar-slot" ref={setTopbarSlot} />
              ) : groupsPage ? (
                <h1 className="topbar-title">{groupsTitle}</h1>
              ) : (
                <span className={inGroups || section ? 'topbar-title' : 'topbar-label'}>
                  {section ? (
                    section.title
                  ) : inGroups ? (
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
                <span className="role-pill">{staffRoles ?? roleNames[session.role]}</span>
                <span className="avatar">{initials(session.name)}</span>
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
      </TopbarSlotContext.Provider>
    </SectionTitleContext.Provider>
  );
}
