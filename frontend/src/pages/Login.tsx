import { useState, type FormEvent } from 'react';
import { BookOpen, ArrowRight, Check, GraduationCap } from 'lucide-react';
import { api, saveSession, setApiToken } from '../api/client';
import type { Role, Session } from '../types';
import { useAction } from '../hooks/useAction';
import { Button } from '../components/Button';
import { ErrorNotice } from '../components/ErrorNotice';
import { roleNames } from '../layouts/AppLayout';

export function Login({ onLogin }: { onLogin: (session: Session) => void }) {
  const [role, setRole] = useState<Role>('student');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const { busy, error, run, clearError } = useAction();
  function submit(e: FormEvent) {
    e.preventDefault();
    void run(async () => {
      let session: Session;
      if (role === 'student') {
        setApiToken('');
        const result = await api.student.login(lastName, firstName);
        session = { role, name: result.student.full_name, token: result.token, studentId: result.student.id };
      } else if (role === 'teacher') {
        setApiToken('');
        const result = await api.teacher.login(firstName, middleName);
        session = {
          role,
          name: result.teacher.name,
          token: result.token,
          teacherId: result.teacher.id,
        };
      } else {
        setApiToken(key.trim());
        await api.session();
        session = { role, name: name.trim() || roleNames[role], token: key.trim() };
      }
      saveSession(session);
      onLogin(session);
    });
  }
  return (
    <div className="login-page">
      <section className="login-story">
        <div className="brand">
          <span className="brand-mark">
            <BookOpen size={25} />
          </span>
          <span>
            Пробник<small>Учебный кабинет</small>
          </span>
        </div>
        <div className="login-intro">
          <span className="eyebrow">СПОКОЙНО К ВАЖНОМУ</span>
          <h1>
            Каждый пробник —<br />
            шаг к уверенности.
          </h1>
          <p>Записывайтесь на экзамены, следите за результатами и понимайте, что уже получается.</p>
          <div className="login-illustration">
            <span className="illustration-icon">
              <GraduationCap size={44} strokeWidth={1.5} />
            </span>
            <div>
              <span className="eyebrow">ВАШ ПУТЬ К РЕЗУЛЬТАТУ</span>
              <div className="journey">
                <span>
                  <Check size={15} />
                  Практика
                </span>
                <i />
                <span>
                  <Check size={15} />
                  Обратная связь
                </span>
                <i />
                <span className="journey-last">Прогресс</span>
              </div>
            </div>
          </div>
        </div>
        <p className="login-footnote">Всё для подготовки — в одном кабинете.</p>
      </section>
      <section className="login-form-area">
        <div className="login-form-card">
          <span className="eyebrow">РАДЫ ВАС ВИДЕТЬ</span>
          <h2>Войти в кабинет</h2>
          <p className="muted">Выберите, как вы будете работать с сервисом.</p>
          <div className="role-tabs" role="group" aria-label="Роль">
            {(['student', 'teacher', 'admin'] as Role[]).map((r) => (
              <button
                type="button"
                key={r}
                className={role === r || (r === 'admin' && role === 'responsible') ? 'active' : ''}
                disabled={busy}
                onClick={() => {
                  setRole(r);
                  clearError();
                }}
              >
                {r === 'admin' ? 'Сотрудник' : roleNames[r]}
              </button>
            ))}
          </div>
          <form onSubmit={submit} className="stack">
            <ErrorNotice message={error} />
            {role === 'student' ? (
              <>
                <label>
                  Фамилия
                  <input
                    autoComplete="family-name"
                    placeholder="Иванов"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                </label>
                <label>
                  Имя
                  <input
                    autoComplete="given-name"
                    placeholder="Алексей"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                </label>
              </>
            ) : role === 'teacher' ? (
              <>
                <label>
                  Имя
                  <input
                    autoComplete="given-name"
                    placeholder="Екатерина"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                </label>
                <label>
                  Отчество
                  <input
                    autoComplete="additional-name"
                    placeholder="Сергеевна"
                    required
                    value={middleName}
                    onChange={(e) => setMiddleName(e.target.value)}
                  />
                </label>
              </>
            ) : (
              <>
                <label>
                  Роль сотрудника
                  <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
                    <option value="admin">Администратор</option>
                    <option value="responsible">Ответственный</option>
                  </select>
                </label>
                <label>
                  Ваше имя
                  <input
                    placeholder="Как к вам обращаться"
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <label>
                  Ключ доступа
                  <input
                    type="password"
                    autoComplete="current-password"
                    placeholder="Ключ от администратора"
                    required
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                  />
                </label>
              </>
            )}
            <Button type="submit" disabled={busy} icon={<ArrowRight size={18} />} className="login-submit">
              {busy ? 'Входим…' : 'Войти'}
            </Button>
          </form>
          <p className="login-help">
            {role === 'student'
              ? 'Тестовый вход по фамилии и имени из списка учеников. Если войти не получается, обратитесь к администратору.'
              : role === 'teacher'
                ? 'Введите имя и отчество так, как они указаны в названии группы в CRM.'
                : 'Сотрудники используют общий ключ доступа. Выбранная роль определяет интерфейс кабинета.'}
          </p>
        </div>
      </section>
    </div>
  );
}
