import { createContext, useContext, useState, type ReactNode } from 'react';
import { api } from '../api/client';
import type { Workspace as WorkspaceData } from '../types';
import { useLoad } from '../hooks/useLoad';
import { ErrorNotice } from '../components/ErrorNotice';
import { Button } from '../components/Button';
import { ResultForm } from '../components/ResultForm';

async function loadWorkspace(): Promise<WorkspaceData> {
  const [students, groups, memberships, exams, participations] = await Promise.all([
    api.students.list(),
    api.groups.list(),
    api.memberships.list(),
    api.exams.list(),
    api.participations.list(),
  ]);
  return { students, groups, memberships, exams, participations };
}
const Context = createContext<{
  data: WorkspaceData;
  refresh: () => Promise<void>;
  openResult: (id: number) => void;
} | null>(null);
export function useWorkspace() {
  const context = useContext(Context);
  if (!context) throw new Error('Workspace is missing');
  return context;
}

export function Workspace({ children }: { children: ReactNode }) {
  const { data, error, loading, refresh } = useLoad(loadWorkspace);
  const [resultId, setResultId] = useState<number | null>(null);
  const item = data?.participations.find((p) => p.id === resultId);
  const student = data?.students.find((s) => s.id === item?.student_id);
  const exam = data?.exams.find((e) => e.id === item?.exam_id);
  return (
    <>
      <ErrorNotice message={error} />
      {error && (
        <Button variant="secondary" onClick={() => void refresh()}>
          Повторить загрузку
        </Button>
      )}
      {!data && loading && (
        <div className="loading" role="status">
          Загружаем учебный кабинет…
        </div>
      )}
      {data && (
        <Context.Provider value={{ data, refresh, openResult: setResultId }}>
          {children}
          {item && student && exam && (
            <ResultForm
              key={item.id}
              item={item}
              student={student}
              exam={exam}
              onClose={() => setResultId(null)}
              onSaved={refresh}
            />
          )}
        </Context.Provider>
      )}
    </>
  );
}
