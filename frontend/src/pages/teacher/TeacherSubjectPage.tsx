import { useParams } from 'react-router-dom';
import { SubjectEditor } from '../../components/SubjectEditor';

export function TeacherSubjectPage() {
  const { id } = useParams();
  return <SubjectEditor key={id} mode="teacher" subjectId={Number(id)} backTo="/subjects" />;
}
