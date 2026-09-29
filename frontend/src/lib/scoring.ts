import type { Exam } from '../types';

export function automaticScore(exam: Exam, primaryScore: number): number | null {
  const structure = exam.structure_data;
  const scale = structure?.primary_to_secondary_scale;
  if (scale?.length) {
    const index = Math.min(Math.max(Math.trunc(primaryScore), 0), scale.length - 1);
    return scale[index];
  }

  const gradeScale = structure?.grade_scale;
  if (gradeScale?.length) {
    const ordered = [...gradeScale].sort((left, right) => left.min - right.min);
    return (
      ordered.find((range) => primaryScore >= range.min && primaryScore <= range.max)?.grade ??
      (primaryScore < ordered[0].min ? ordered[0].grade : ordered.at(-1)!.grade)
    );
  }

  return exam.format === 'ege' ? Math.min(100, Math.round(primaryScore * 3.7)) : null;
}

export function resultScoreLabel(exam: Exam): string {
  const scale = exam.structure_data?.primary_to_secondary_scale;
  const isGrade = exam.format === 'oge' || (!!scale?.length && Math.max(...scale) <= 5);
  return isGrade ? 'Оценка' : 'Тестовый балл';
}
