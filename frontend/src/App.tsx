import { useState } from 'react';
import { HashRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { loadSession, saveSession } from './api/client';
import { AppLayout } from './layouts/AppLayout';
import { Workspace } from './layouts/Workspace';
import { StudentWorkspace } from './layouts/StudentWorkspace';
import { Login } from './pages/Login';
import { Dashboard } from './pages/admin/Dashboard';
import { Exams } from './pages/admin/Exams';
import { ExamNew } from './pages/admin/ExamNew';
import { ExamDetail } from './pages/admin/ExamDetail';
import { ExamEventDetail } from './pages/admin/ExamEventDetail';
import { School } from './pages/admin/School';
import { ResultNew } from './pages/admin/ResultNew';
import { TeacherSubjects } from './pages/teacher/TeacherSubjects';
import { TeacherSubjectPage } from './pages/teacher/TeacherSubjectPage';
import { StudentDetail } from './pages/admin/StudentDetail';
import { Results } from './pages/admin/Results';
import { Groups } from './pages/teacher/Groups';
import { GroupDetail } from './pages/teacher/GroupDetail';
import { AvailableExams } from './pages/student/AvailableExams';
import { MyResults } from './pages/student/MyResults';
import { ResultDetail } from './pages/student/ResultDetail';

export default function App() {
  const [session, setSession] = useState(loadSession);
  if (!session)
    return (
      <Login
        onLogin={(session) => {
          location.hash = '';
          setSession(session);
        }}
      />
    );
  const student = session.role === 'student',
    teacher = session.role === 'teacher';
  const home = student ? '/available' : teacher ? '/groups' : '/';
  return (
    <HashRouter>
      <Routes>
        <Route
          element={
            <AppLayout
              session={session}
              logout={() => {
                saveSession(null);
                location.hash = '';
                setSession(null);
              }}
            />
          }
        >
          {student ? (
            <Route
              element={
                <StudentWorkspace>
                  <Outlet />
                </StudentWorkspace>
              }
            >
              <Route path="/available" element={<AvailableExams />} />
              <Route path="/my-results" element={<MyResults />} />
              <Route path="/my-results/:id" element={<ResultDetail />} />
            </Route>
          ) : (
            <Route
              element={
                <Workspace>
                  <Outlet />
                </Workspace>
              }
            >
              {!teacher && (
                <>
                  <Route index element={<Dashboard />} />
                  <Route path="/exams" element={<Exams />} />
                  <Route path="/exams/new" element={<ExamNew />} />
                  <Route path="/exams/:id" element={<ExamDetail />} />
                  <Route path="/exam-events/:id" element={<ExamEventDetail />} />
                  <Route path="/students/:id" element={<StudentDetail />} />
                  <Route path="/school/*" element={<School />} />
                </>
              )}
              <Route path="/groups" element={<Groups title={teacher ? 'Мои группы' : 'Группы'} />} />
              <Route path="/groups/:id" element={<GroupDetail />} />
              {(teacher || session.teacherId) && (
                <>
                  <Route path="/subjects" element={<TeacherSubjects />} />
                  <Route path="/subjects/:id" element={<TeacherSubjectPage />} />
                </>
              )}
              {!teacher && session.teacherId && (
                <Route path="/my-groups" element={<Groups title="Мои группы" mine={session.teacherId} />} />
              )}
              <Route path="/results" element={<Results />} />
              <Route path="/results/new" element={<ResultNew />} />
            </Route>
          )}
          <Route path="*" element={<Navigate to={home} replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
