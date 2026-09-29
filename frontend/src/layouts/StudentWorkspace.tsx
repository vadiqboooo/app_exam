import { createContext, useContext, type ReactNode } from 'react';
import { api } from '../api/client';
import type { StudentWorkspace as Data } from '../types';
import { useLoad } from '../hooks/useLoad';
import { ErrorNotice } from '../components/ErrorNotice';
import { Button } from '../components/Button';

async function loadStudent(): Promise<Data> {
  const [student, exams, participations, results] = await Promise.all([
    api.student.me(),
    api.student.exams(),
    api.student.participations(),
    api.student.results(),
  ]);
  return { student, exams, participations, results };
}
const Context = createContext<{ data: Data; refresh: () => Promise<void> } | null>(null);
export function useStudentWorkspace() {
  const value = useContext(Context);
  if (!value) throw new Error('Student workspace is missing');
  return value;
}
export function StudentWorkspace({ children }: { children: ReactNode }) {
  const { data, loading, error, refresh } = useLoad(loadStudent);
  return (
    <>
      <ErrorNotice message={error} />
      {error && (
        <Button variant="secondary" onClick={() => void refresh()}>
          Повторить загрузку
        </Button>
      )}
      {loading && !data && (
        <div className="loading" role="status">
          Загружаем ваш кабинет…
        </div>
      )}
      {data && <Context.Provider value={{ data, refresh }}>{children}</Context.Provider>}
    </>
  );
}
