import { GraduationCap } from 'lucide-react';
import type { Student } from '../types';

export function StudentCard({ student }: { student: Student }) {
  return (
    <div className="student-card">
      <span className="avatar avatar-large">
        <GraduationCap size={28} />
      </span>
      <div>
        <h2>{student.full_name}</h2>
        <div className="inline">
          <span className="muted">{student.grade ? `${student.grade} класс` : 'Класс не указан'}</span>
          <span className={`badge ${student.is_active ? 'badge-published' : 'badge-cancelled'}`}>
            {student.is_active ? 'Активен' : 'В архиве'}
          </span>
        </div>
      </div>
    </div>
  );
}
