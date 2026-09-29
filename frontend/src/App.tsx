import { useState } from 'react';
import { HashRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { loadSession, saveSession } from './api/client';
import { AppLayout } from './layouts/AppLayout';
import { Workspace } from './layouts/Workspace';
import { StudentWorkspace } from './layouts/StudentWorkspace';
import { Login } from './pages/Login';
import { Dashboard } from './pages/admin/Dashboard';
import { Exams } from './pages/admin/Exams';
import { ExamDetail } from './pages/admin/ExamDetail';
import { ExamEventDetail } from './pages/admin/ExamEventDetail';
import { Students } from './pages/admin/Students';
import { Teachers } from './pages/admin/Teachers';
import { Subjects } from './pages/admin/Subjects';
import { StudentDetail } from './pages/admin/StudentDetail';
import { Results } from './pages/admin/Results';
import { ImportCRM } from './pages/admin/ImportCRM';
import { Groups } from './pages/teacher/Groups';
import { GroupDetail } from './pages/teacher/GroupDetail';
import { AvailableExams } from './pages/student/AvailableExams';
import { MyResults } from './pages/student/MyResults';

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
                  <Route path="/exams/:id" element={<ExamDetail />} />
                  <Route path="/exam-events/:id" element={<ExamEventDetail />} />
                  <Route path="/students" element={<Students />} />
                  <Route path="/students/:id" element={<StudentDetail />} />
                  <Route path="/teachers" element={<Teachers />} />
                  <Route path="/subjects" element={<Subjects />} />
                  <Route path="/import" element={<ImportCRM />} />
                </>
              )}
              <Route path="/groups" element={<Groups title={teacher ? 'Мои группы' : 'Группы'} />} />
              <Route path="/groups/:id" element={<GroupDetail />} />
              <Route path="/results" element={<Results />} />
            </Route>
          )}
          <Route path="*" element={<Navigate to={home} replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
