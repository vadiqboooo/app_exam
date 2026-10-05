import { useParams } from 'react-router-dom';
import { SubjectEditor } from '../../components/SubjectEditor';

export function SubjectEditPage() {
  const { id } = useParams();
  return (
    <SubjectEditor
      key={id}
      mode="admin"
      subjectId={id === 'new' ? 'new' : Number(id)}
      backTo="/school/subjects"
    />
  );
}
