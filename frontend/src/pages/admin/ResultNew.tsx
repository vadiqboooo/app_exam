import { useWorkspace } from '../../layouts/Workspace';
import { QuickResultForm } from '../../components/QuickResultForm';

export function ResultNew() {
  const { data, refresh } = useWorkspace();
  return (
    <QuickResultForm
      exams={data.exams}
      students={data.students}
      groups={data.groups}
      memberships={data.memberships}
      participations={data.participations}
      onSaved={refresh}
    />
  );
}
