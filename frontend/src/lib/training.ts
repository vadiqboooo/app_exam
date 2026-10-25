export type TrainingState = 'done' | 'part' | 'none';

type Progress = { training_groups_at?: string | null; training_outside_at?: string | null };

/** Both parts finished — «done»; one — «part»; neither — «none». */
export function trainingState(teacher: Progress): TrainingState {
  const passed = Number(!!teacher.training_groups_at) + Number(!!teacher.training_outside_at);
  return passed === 2 ? 'done' : passed === 1 ? 'part' : 'none';
}

export const trainingLabels: Record<TrainingState, string> = {
  done: 'Пройдено ✓',
  part: 'Пройдено 1 из 2',
  none: 'Не пройдено',
};

const day = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' });

/** The finish date of a passed guide, otherwise which part is left. */
export function trainingHint(teacher: Progress): string {
  const state = trainingState(teacher);
  if (state === 'none') return 'не начинал';
  if (state === 'part')
    return teacher.training_groups_at
      ? 'осталась часть «Ученик не из группы»'
      : 'осталась часть «Результаты группы»';
  const last = Math.max(
    new Date(teacher.training_groups_at!).getTime(),
    new Date(teacher.training_outside_at!).getTime(),
  );
  return day.format(new Date(last)).replace('.', '');
}
