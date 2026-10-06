import type { Exam, Participation, StudentWorkspace } from '../types';
import { examDate } from '../lib/format';

export interface TaskPoint {
  code: string;
  max: number;
  got: number;
}

export interface Part {
  name: string;
  got: number;
  max: number;
  count: number;
}

export interface Summary {
  isGrade: boolean;
  /** The headline value: the test score (EGE) or the grade (OGE). */
  value: number | null;
  maxValue: number;
  primary: number | null;
  maxPrimary: number;
  /** How much of the fear is beaten, 0–100. */
  percent: number;
  /** Change against the previous work in the same subject, in the headline units. */
  delta: number | null;
  tasks: TaskPoint[];
  parts: Part[];
  zeros: number;
}

const sum = (list: TaskPoint[], key: 'got' | 'max') => list.reduce((total, task) => total + task[key], 0);

/** The first part is the leading run of tasks that all weigh the same as the first one. */
function splitParts(tasks: TaskPoint[]): Part[] {
  if (!tasks.length) return [];
  const firstMax = tasks[0].max;
  let end = 0;
  while (end < tasks.length && tasks[end].max === firstMax) end += 1;
  if (end === tasks.length || end < 3) return [];
  const first = tasks.slice(0, end);
  const second = tasks.slice(end);
  const range = (list: TaskPoint[]) => `${list[0].code}–${list[list.length - 1].code}`;
  return [
    {
      name: `Часть 1 · задания ${range(first)}`,
      got: sum(first, 'got'),
      max: sum(first, 'max'),
      count: first.length,
    },
    {
      name: `Часть 2 · задания ${range(second)}`,
      got: sum(second, 'got'),
      max: sum(second, 'max'),
      count: second.length,
    },
  ];
}

export function summarize(exam: Exam, result: Participation, previous?: Participation): Summary {
  const structure = exam.structure_data;
  const scores = new Map(result.result_data?.tasks.map((task) => [task.code, task.score]));
  const tasks: TaskPoint[] = (structure?.tasks ?? []).map((task) => ({
    code: task.code,
    max: task.max_score,
    got: scores.get(task.code) ?? 0,
  }));
  const scale = structure?.primary_to_secondary_scale;
  const isGrade = exam.format === 'oge' || (!!scale?.length && Math.max(...scale) <= 5);
  const maxPrimary = sum(tasks, 'max');
  const primary = result.primary_score ?? (tasks.length ? sum(tasks, 'got') : null);
  const maxValue = isGrade ? 5 : scale?.length ? Math.max(...scale) : 100;
  const value = result.test_score ?? null;
  const percent = isGrade
    ? maxPrimary && primary != null
      ? (primary / maxPrimary) * 100
      : 0
    : value != null && maxValue
      ? (value / maxValue) * 100
      : 0;
  const delta = value != null && previous?.test_score != null ? value - previous.test_score : null;
  return {
    isGrade,
    value,
    maxValue,
    primary,
    maxPrimary,
    percent: Math.round(Math.min(100, Math.max(0, percent))),
    delta,
    tasks,
    parts: splitParts(tasks),
    zeros: tasks.filter((task) => task.got === 0).length,
  };
}

/** The result with its exam, the previous work in the same subject and the summary of both. */
export function lookup(data: StudentWorkspace, id: number) {
  const result = data.results.find((item) => item.id === id);
  const exam = data.exams.find((item) => item.id === result?.exam_id);
  if (!result || !exam) return null;
  const dateOf = (item: Participation) => {
    const itemExam = data.exams.find((candidate) => candidate.id === item.exam_id);
    return itemExam ? examDate(itemExam, item.slot_id) : '';
  };
  const previous = data.results
    .filter(
      (item) =>
        item.id !== result.id &&
        item.test_score != null &&
        data.exams.find((candidate) => candidate.id === item.exam_id)?.subject === exam.subject &&
        dateOf(item) < dateOf(result),
    )
    .sort((a, b) => dateOf(b).localeCompare(dateOf(a)))[0];
  return { result, exam, previous, summary: summarize(exam, result, previous) };
}

export const rank = (percent: number) =>
  percent >= 85
    ? 'Повелитель страха'
    : percent >= 60
      ? 'Укротитель страха'
      : percent >= 40
        ? 'Охотник за страхом'
        : 'Смелый новичок';

const forms = (count: number, one: string, few: string, many: string) =>
  count % 10 === 1 && count % 100 !== 11
    ? one
    : count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 12 || count % 100 > 14)
      ? few
      : many;

/** Three short lines the ball «says», built from the real result. */
export function predictions(subject: string, summary: Summary): string[] {
  const first = summary.parts[0];
  const accuracy = first ? first.got / (first.max || 1) : summary.percent / 100;
  const part =
    accuracy >= 0.85
      ? 'Первая часть — почти без ошибок.'
      : accuracy >= 0.6
        ? 'Первая часть — уверенный фундамент.'
        : 'Первую часть стоит повторить — там быстрые баллы.';
  const growth =
    summary.delta == null
      ? 'Это твой первый пробник по предмету — отличный старт.'
      : summary.delta > 0
        ? 'Я вижу рост: ты сильнее, чем на прошлом пробнике.'
        : summary.delta < 0
          ? 'В прошлый раз было чуть сильнее, но я вижу: ты вернёшь свои баллы.'
          : 'Ты держишь тот же уровень, что и на прошлом пробнике.';
  const fog =
    summary.zeros > 0
      ? `${summary.zeros} ${forms(summary.zeros, 'задание', 'задания', 'заданий')} ещё прячутся в тумане. Но ты их уже заметил — значит, победишь.`
      : 'Туман рассеялся: слабых мест почти не осталось.';
  return [`Я вижу «${subject}». ${part}`, growth, fog];
}
