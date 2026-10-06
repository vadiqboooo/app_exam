import type { Exam, Group, Membership, ParentStatus, Participation, Student, Workspace } from '../types';
import { groupExams } from './format';
import { belongsToSubject } from './groupExam';

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

export interface GroupTask {
  code: string;
  max: number;
  score: number | null;
  covered: boolean;
}
export interface GroupBlock {
  subject: string;
  group: string;
  tasks: GroupTask[];
  coveredCount: number;
  /** Points earned and available on the tasks the group has covered / not covered yet. */
  inCovered: { got: number; max: number };
  outOfCovered: { got: number; max: number };
}

/**
 * For each work of the event: the student's group on that subject and how the student did on the
 * tasks the group has already covered compared with the rest.
 */
export function groupBlocks(
  event: EventResult,
  studentId: number,
  groups: Group[],
  memberships: Membership[],
): GroupBlock[] {
  const own = groups.filter(
    (group) =>
      group.is_active &&
      memberships.some((m) => m.student_id === studentId && m.group_id === group.id && !m.ended_at),
  );
  return event.items.flatMap(({ exam, participation }) => {
    const group = own.find((candidate) => belongsToSubject(exam, candidate.subject));
    const tasks = exam.structure_data?.tasks ?? [];
    if (!group || !tasks.length) return [];
    const covered = new Set(group.coverage.find((item) => item.exam_id === exam.id)?.task_codes);
    const scores = new Map(participation.result_data?.tasks.map((task) => [task.code, task.score]));
    const rows = tasks.map((task) => ({
      code: task.code,
      max: task.max_score,
      score: scores.get(task.code) ?? null,
      covered: covered.has(task.code),
    }));
    const sum = (list: GroupTask[]) => ({
      got: list.reduce((total, task) => total + (task.score ?? 0), 0),
      max: list.reduce((total, task) => total + task.max, 0),
    });
    return [
      {
        subject: exam.subject,
        group: group.source_name,
        tasks: rows,
        coveredCount: rows.filter((task) => task.covered).length,
        inCovered: sum(rows.filter((task) => task.covered)),
        outOfCovered: sum(rows.filter((task) => !task.covered)),
      },
    ];
  });
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
