import { useState } from 'react';
import { api } from '../api/client';
import { useAction } from '../hooks/useAction';
import { formatPhone } from '../lib/phone';
import type { Student } from '../types';
import { Button } from './Button';
import { ErrorNotice } from './ErrorNotice';
import { Modal } from './Modal';

const GRADES = [9, 10, 11];

/** Правка ученика: имя и фамилия, телефон, класс и школа. */
export function EditStudentDialog({
  student,
  schools,
  onClose,
  onSaved,
}: {
  student: Student;
  schools: string[];
  onClose: () => void;
  onSaved: (name: string) => void;
}) {
  const [first, ...rest] = student.full_name.split(' ');
  const [lastName, setLastName] = useState(first ?? '');
  const [firstName, setFirstName] = useState(rest.join(' '));
  const [phone, setPhone] = useState(student.phone ?? '');
  const [grade, setGrade] = useState(student.grade ?? 11);
  const [school, setSchool] = useState(student.school ?? '');
  const [tried, setTried] = useState(false);
  const { busy, error, run } = useAction();
  const badLast = tried && lastName.trim().length < 2;
  const badFirst = tried && firstName.trim().length < 2;

  const save = () => {
    setTried(true);
    if (lastName.trim().length < 2 || firstName.trim().length < 2) return;
    void run(async () => {
      const saved = await api.students.update(student.id, {
        last_name: lastName.trim(),
        first_name: firstName.trim(),
        phone: phone || null,
        grade,
        school: school.trim() || null,
      });
      onSaved(saved.full_name);
    });
  };

  return (
    <Modal title="Редактировать ученика" onClose={onClose} busy={busy} wide>
      <div className="modal-body as-form">
        <ErrorNotice message={error} />
        <div className="as-grid">
          <label>
            Фамилия
            <input
              value={lastName}
              autoFocus
              aria-invalid={badLast}
              onChange={(e) => setLastName(e.target.value)}
            />
            {badLast && <span role="alert">Введите фамилию</span>}
          </label>
          <label>
            Имя
            <input value={firstName} aria-invalid={badFirst} onChange={(e) => setFirstName(e.target.value)} />
            {badFirst && <span role="alert">Введите имя</span>}
          </label>
          <label>
            Телефон
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
          <label>
            Школа
            <input
              value={school}
              list="edit-student-schools"
              onChange={(e) => setSchool(e.target.value)}
            />
            <datalist id="edit-student-schools">
              {schools.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </label>
        </div>
      </div>
      <div className="modal-footer">
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Отмена
        </Button>
        <Button onClick={save} disabled={busy}>
          {busy ? 'Сохраняем…' : 'Сохранить'}
        </Button>
      </div>
    </Modal>
  );
}
