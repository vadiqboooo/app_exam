import type { Exam, ParentStatus, Participation, Student, Workspace } from '../types';
import { groupExams } from './format';

export interface EventResult {
  key: string;
  title: string;
  start: string;
  items: { participation: Participation; exam: Exam }[];
  /** The least advanced delivery status among the works of this event. */
  parentStatus: ParentStatus;
  comment: string;
}

export interface StudentResults {
  student: Student;
  /** Newest first. */
  events: EventResult[];
  /** At least one event the parent has not confirmed yet. */
  pending: boolean;
}

const order: ParentStatus[] = ['none', 'sent', 'got'];
const normalize = (value: string) => value.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').trim();
const hasResult = (item: Participation) =>
  item.status !== 'cancelled' &&
  item.status !== 'absent' &&
  (item.status === 'checked' || item.status === 'published' || item.primary_score != null);

/** Every student with at least one scored work, grouped by exam event. */
export function buildStudentResults(data: Workspace): StudentResults[] {
  const examInfo = new Map<number, { key: string; title: string; start: string }>();
  for (const group of groupExams(data.exams)) {
    const times = group
      .flatMap((exam) => (exam.slots.length ? exam.slots.map((slot) => slot.starts_at) : [exam.starts_at]))
      .sort();
    const key = group[0].event_id ? `event:${group[0].event_id}` : `exam:${group[0].id}`;
    for (const exam of group)
      examInfo.set(exam.id, { key, title: group[0].title || 'Пробный экзамен', start: times[0] });
  }
  const exams = new Map(data.exams.map((exam) => [exam.id, exam]));
  const byStudent = new Map<number, Map<string, EventResult>>();
  for (const participation of data.participations) {
    const exam = exams.get(participation.exam_id);
    const info = examInfo.get(participation.exam_id);
    if (!exam || !info || !hasResult(participation)) continue;
    const events = byStudent.get(participation.student_id) ?? new Map<string, EventResult>();
    const event = events.get(info.key) ?? {
      key: info.key,
      title: info.title,
      start: info.start,
      items: [],
      parentStatus: 'got' as ParentStatus,
      comment: '',
    };
    event.items.push({ participation, exam });
    if (order.indexOf(participation.parent_status) < order.indexOf(event.parentStatus))
      event.parentStatus = participation.parent_status;
    if (!event.comment && participation.feedback) event.comment = participation.feedback;
    events.set(info.key, event);
    byStudent.set(participation.student_id, events);
  }
  return data.students
    .flatMap((student) => {
      const events = [...(byStudent.get(student.id)?.values() ?? [])].sort((a, b) =>
        b.start.localeCompare(a.start),
      );
      for (const event of events)
        event.items.sort((a, b) => a.exam.subject.localeCompare(b.exam.subject, 'ru'));
      return events.length
        ? [{ student, events, pending: events.some((event) => event.parentStatus !== 'got') }]
        : [];
    })
    .sort((a, b) => a.student.full_name.localeCompare(b.student.full_name, 'ru'));
}

/** Test score of the same subject in the nearest earlier event, to show the change. */
export function previousScore(events: EventResult[], index: number, subject: string): number | null {
  const key = normalize(subject);
  for (const earlier of events.slice(index + 1)) {
    const found = earlier.items.find(
      ({ exam, participation }) => normalize(exam.subject) === key && participation.test_score != null,
    );
    if (found) return found.participation.test_score;
  }
  return null;
}
