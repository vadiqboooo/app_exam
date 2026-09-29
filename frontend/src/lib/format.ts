import type { Exam, Membership, Group } from '../types';

export const date = (value: string, withTime = false) =>
  new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(new Date(value));
export const score = (value: number | null | undefined) =>
  value == null ? '—' : new Intl.NumberFormat('ru-RU').format(value);
export const examTitle = (exam: Exam) => exam.title || (exam.type === 'ege' ? 'ЕГЭ' : 'Пробный экзамен');
export const examSubject = (exam: Exam) =>
  `${exam.format ? (exam.format === 'ege' ? 'ЕГЭ' : 'ОГЭ') + ' · ' : ''}${exam.subject}`;
export const examDate = (exam: Exam, slotId?: number | null) =>
  exam.slots.find((s) => s.id === slotId)?.starts_at ?? exam.starts_at;
export function groupExams(exams: Exam[]): Exam[][] {
  const groups = new Map<string, Exam[]>();
  for (const exam of exams) {
    const key = exam.event_id ? `event:${exam.event_id}` : `exam:${exam.id}`;
    groups.set(key, [...(groups.get(key) ?? []), exam]);
  }
  return [...groups.values()];
}
export function registrationState(exam: Exam) {
  const now = Date.now();
  const future = exam.event_id
    ? exam.slots.some((s) => new Date(s.starts_at).getTime() > now)
    : new Date(exam.starts_at).getTime() > now;
  if (!exam.is_active || exam.type !== 'mock' || !future) return 'closed';
  if (exam.registration_open_at && new Date(exam.registration_open_at).getTime() > now) return 'soon';
  if (exam.registration_close_at && new Date(exam.registration_close_at).getTime() <= now) return 'closed';
  return 'open';
}
export function studentGroups(id: number, memberships: Membership[], groups: Group[]) {
  const ids = new Set(memberships.filter((m) => m.student_id === id && !m.ended_at).map((m) => m.group_id));
  return groups.filter((g) => ids.has(g.id));
}
