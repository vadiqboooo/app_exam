import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Exam, SubjectSetting, SubjectVariant } from '../types';

export interface EventSubject {
  exam: Exam;
  /** Subject settings the exam was created from; missing if it was renamed or deleted since. */
  subject?: SubjectSetting;
  /** Variants attached to this exam's event. */
  variants: SubjectVariant[];
  /** Other variants of the subject, not attached to this event yet. */
  others: SubjectVariant[];
}

const normalize = (value: string) => value.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').trim();

/** Printable variants of every subject of an exam event, taken from the subject settings. */
export function useEventVariants(exams: Exam[]) {
  const [rows, setRows] = useState<EventSubject[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string>();
  const key = exams.map((exam) => `${exam.id}:${exam.event_id}:${exam.format}:${exam.subject}`).join('|');

  const load = useCallback(async () => {
    try {
      const subjects = await api.subjects.list();
      const next = await Promise.all(
        exams.map(async (exam) => {
          const subject = subjects.find(
            (item) => item.format === exam.format && normalize(item.name) === normalize(exam.subject),
          );
          const all = subject?.variants_count ? await api.subjects.variants.list(subject.id) : [];
          const attached = (variant: SubjectVariant) =>
            exam.event_id !== null && variant.event_ids.includes(exam.event_id);
          return {
            exam,
            subject,
            variants: all.filter(attached),
            others: all.filter((variant) => !attached(variant)),
          };
        }),
      );
      setRows(next);
      setError(undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось загрузить варианты');
    } finally {
      setLoaded(true);
    }
  }, [key]);

  useEffect(() => {
    void load();
  }, [load]);

  return { rows, loaded, error, reload: load };
}
