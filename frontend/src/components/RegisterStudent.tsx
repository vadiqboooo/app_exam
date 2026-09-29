import { useState } from 'react';
import { api } from '../api/client';
import type { Exam, Student } from '../types';
import { useAction } from '../hooks/useAction';
import { examSubject } from '../lib/format';
import { Modal } from './Modal';
import { Button } from './Button';
import { ErrorNotice } from './ErrorNotice';
import { SlotPicker } from './SlotPicker';

export function RegisterStudent({
  exam,
  students,
  onClose,
  onRegistered,
}: {
  exam: Exam;
  students: Student[];
  onClose: () => void;
  onRegistered: () => Promise<void>;
}) {
  const [studentId, setStudentId] = useState(students.length === 1 ? String(students[0].id) : '');
  const [slotId, setSlotId] = useState('');
  const { busy, error, run } = useAction();
  return (
    <Modal title="Записать ученика" busy={busy} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            try {
              await api.participations.register(
                Number(studentId),
                exam.id,
                slotId ? Number(slotId) : undefined,
              );
            } finally {
              await onRegistered();
            }
            onClose();
          });
        }}
      >
        <div className="modal-body stack">
          <ErrorNotice message={error} />
          <p>
            {exam.title} · {examSubject(exam)}
          </p>
          <label>
            Ученик
            <select required disabled={busy} value={studentId} onChange={(e) => setStudentId(e.target.value)}>
              <option value="">Выберите ученика</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name}
                </option>
              ))}
            </select>
          </label>
          {exam.event_id && (
            <SlotPicker slots={exam.slots} value={slotId} onChange={setSlotId} disabled={busy} />
          )}
          {!students.length && <p className="muted">Все активные ученики уже есть в списке участников.</p>}
        </div>
        <div className="modal-footer">
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" disabled={busy || !studentId || (!!exam.event_id && !slotId)}>
            Записать
          </Button>
        </div>
      </form>
    </Modal>
  );
}
