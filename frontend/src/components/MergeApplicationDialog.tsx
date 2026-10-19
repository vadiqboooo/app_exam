import { useState } from 'react';
import type { Student, StudentApplication } from '../types';
import { Button } from './Button';
import { ErrorNotice } from './ErrorNotice';
import { Modal } from './Modal';

/** Объединить заявку с уже существующим учеником, чтобы не плодить дубли. */
export function MergeApplicationDialog({
  application,
  students,
  busy,
  error,
  onClose,
  onMerge,
}: {
  application: StudentApplication;
  students: Student[];
  busy: boolean;
  error: string;
  onClose: () => void;
  onMerge: (target: Student) => void;
}) {
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<Student>();
  const words = search.toLowerCase().replace(/ё/g, 'е').split(/\s+/).filter(Boolean);
  const found = words.length
    ? students
        .filter((student) => {
          const name = student.full_name.toLowerCase().replace(/ё/g, 'е');
          return words.every((word) => name.includes(word));
        })
        .slice(0, 8)
    : [];

  return (
    <Modal title="Объединить с учеником" onClose={onClose} busy={busy}>
      <div className="modal-body as-form">
        <ErrorNotice message={error} />
        <p>
          Заявка <b>{application.full_name}</b> будет присоединена к выбранному ученику: он получит пароль и записи
          на пробники из заявки, а сама заявка исчезнет.
        </p>
        <input
          type="search"
          className="as-search"
          aria-label="Поиск ученика"
          placeholder="Фамилия или имя существующего ученика"
          autoFocus
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPicked(undefined);
          }}
        />
        <div className="as-chips" role="group" aria-label="Ученики">
          {words.length > 0 && found.length === 0 && <span className="as-none">Ученики не найдены</span>}
          {found.map((student) => (
            <button
              type="button"
              key={student.id}
              aria-pressed={picked?.id === student.id}
              onClick={() => setPicked(student)}
            >
              {picked?.id === student.id ? '✓ ' : ''}
              {student.full_name}
              {student.grade ? ` · ${student.grade} кл.` : ''}
              {student.is_active ? '' : ' · архив'}
            </button>
          ))}
        </div>
      </div>
      <div className="modal-footer">
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Отмена
        </Button>
        <Button onClick={() => picked && onMerge(picked)} disabled={busy || !picked}>
          {busy ? 'Объединяем…' : 'Объединить'}
        </Button>
      </div>
    </Modal>
  );
}
