import { useState } from 'react';
import { api } from '../api/client';
import { useAction } from '../hooks/useAction';
import { formatPhone } from '../lib/phone';
import type { Group } from '../types';
import { Button } from './Button';
import { ErrorNotice } from './ErrorNotice';
import { Modal } from './Modal';

const GRADES = [9, 10, 11];

const codeOptions = [
  [false, 'Ученик придумает сам', 'При первом входе введёт фамилию и придумает код из 6 цифр'],
  [true, 'Выдать код сейчас', 'Код покажем после сохранения — его нужно сообщить ученику'],
] as const;

/** Форма «Новый ученик»: администратор добавляет ученика вручную. */
export function AddStudentDialog({
  groups,
  onClose,
  onAdded,
}: {
  groups: Group[];
  onClose: () => void;
  onAdded: (name: string, code: string | null) => void;
}) {
  const [lastName, setLastName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [phone, setPhone] = useState('');
  const [grade, setGrade] = useState(11);
  const [picked, setPicked] = useState<number[]>([]);
  const [giveCode, setGiveCode] = useState(false);
  const [tried, setTried] = useState(false);
  const { busy, error, run } = useAction();
  const [groupSearch, setGroupSearch] = useState('');
  // Chosen groups stay on screen even when the search no longer matches them.
  const shownGroups = groups.filter(
    (group) =>
      picked.includes(group.id) || group.source_name.toLowerCase().includes(groupSearch.trim().toLowerCase()),
  );
  const badLast = tried && lastName.trim().length < 2;
  const badFirst = tried && firstName.trim().length < 2;

  const save = () => {
    setTried(true);
    if (lastName.trim().length < 2 || firstName.trim().length < 2) return;
    void run(async () => {
      const result = await api.students.create({
        last_name: lastName.trim(),
        first_name: firstName.trim(),
        phone: phone || undefined,
        grade,
        group_ids: picked,
        give_code: giveCode,
      });
      onAdded(result.student.full_name, result.code);
    });
  };
  const toggle = (id: number) =>
    setPicked(picked.includes(id) ? picked.filter((item) => item !== id) : [...picked, id]);

  return (
    <Modal title="Новый ученик" onClose={onClose} busy={busy} wide>
      <div className="modal-body as-form">
        <ErrorNotice message={error} />
        <div className="as-grid">
          <label>
            Фамилия
            <input
              value={lastName}
              placeholder="Иванов"
              autoFocus
              aria-invalid={badLast}
              onChange={(e) => setLastName(e.target.value)}
            />
            {badLast && <span role="alert">Введите фамилию</span>}
          </label>
          <label>
            Имя
            <input
              value={firstName}
              placeholder="Алексей"
              aria-invalid={badFirst}
              onChange={(e) => setFirstName(e.target.value)}
            />
            {badFirst && <span role="alert">Введите имя</span>}
          </label>
          <label>
            <span>
              Телефон <small>(необязательно)</small>
            </span>
            <input
              type="tel"
              value={phone}
              placeholder="+7 (___) ___-__-__"
              onChange={(e) => setPhone(formatPhone(e.target.value))}
            />
          </label>
          <label>
            Класс
            <select value={grade} onChange={(e) => setGrade(Number(e.target.value))}>
              {GRADES.map((item) => (
                <option key={item} value={item}>
                  {item} класс
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="as-block">
          <span>
            Группы{picked.length > 0 && <small className="as-picked"> · выбрано {picked.length}</small>}
          </span>
          <input
            type="search"
            className="as-search"
            aria-label="Поиск группы"
            placeholder="Найти группу по названию"
            value={groupSearch}
            onChange={(e) => setGroupSearch(e.target.value)}
          />
          <div className="as-chips" role="group" aria-label="Группы">
            {shownGroups.length === 0 && <span className="as-none">Группы не найдены</span>}
            {shownGroups.map((group) => (
              <button
                type="button"
                key={group.id}
                aria-pressed={picked.includes(group.id)}
                onClick={() => toggle(group.id)}
              >
                {picked.includes(group.id) ? '✓ ' : ''}
                {group.source_name}
              </button>
            ))}
          </div>
        </div>
        <div className="as-block">
          <span>Код входа</span>
          <div className="as-codes" role="radiogroup" aria-label="Код входа">
            {codeOptions.map(([value, title, text]) => (
              <button
                type="button"
                role="radio"
                key={title}
                aria-checked={giveCode === value}
                onClick={() => setGiveCode(value)}
              >
                <strong>{title}</strong>
                <span>{text}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="modal-footer">
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Отмена
        </Button>
        <Button onClick={save} disabled={busy}>
          {busy ? 'Сохраняем…' : 'Добавить ученика'}
        </Button>
      </div>
    </Modal>
  );
}
