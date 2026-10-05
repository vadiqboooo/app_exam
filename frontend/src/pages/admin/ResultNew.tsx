import { useWorkspace } from '../../layouts/Workspace';
import { QuickResultForm } from '../../components/QuickResultForm';

export function ResultNew() {
  const { data, refresh } = useWorkspace();
  return <QuickResultForm exams={data.exams} participations={data.participations} onSaved={refresh} />;
}
