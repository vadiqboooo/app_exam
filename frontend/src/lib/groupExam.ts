import type { Exam, Group } from '../types';

const normalize = (value: string | null | undefined) =>
  (value ?? '')
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[^а-яa-z0-9]+/g, ' ')
    .trim();

export function belongsToSubject(exam: Exam, subject: string | null) {
  const groupSubject = normalize(subject);
  const examSubjectName = normalize(exam.subject);
  return (
    !!groupSubject &&
    (groupSubject === examSubjectName ||
      groupSubject.includes(examSubjectName) ||
      examSubjectName.includes(groupSubject))
  );
}

/** Active exams of the group's subject and format, newest first. */
export const examsForGroup = (exams: Exam[], group: Group) =>
  exams
    .filter(
      (exam) =>
        exam.is_active &&
        belongsToSubject(exam, group.subject) &&
        (!group.exam_format || exam.format === group.exam_format),
    )
    .sort((left, right) => right.starts_at.localeCompare(left.starts_at));
