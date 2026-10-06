import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { api, saveSession, setApiToken } from '../api/client';
import type { Role, Session } from '../types';
import { useAction } from '../hooks/useAction';
import { Button } from '../components/Button';
import { ErrorNotice } from '../components/ErrorNotice';
import { CodeInput } from '../components/CodeInput';
import { roleNames } from '../layouts/AppLayout';
import { LoginChoice } from '../halloween/LoginChoice';
import { CREDIT } from '../halloween/Art';
import { useHalloween } from '../halloween/theme';

type Door = 'choose' | 'student' | 'staff';
// name: имя; code: вход с личным кодом; create: первый вход, придумывание кода.
type Step = 'name' | 'code' | 'create';

const staffRoles: { role: Role; title: string; text: string }[] = [
  { role: 'teacher', title: 'Учитель', text: 'Свои группы, проверка работ и баллы учеников' },
  { role: 'responsible', title: 'Ответственный', text: 'Пробники, запись, публикация результатов' },
  { role: 'admin', title: 'Администратор', text: 'Всё выше + импорт CRM, предметы, доступы' },
];

function Brand({ suffix }: { suffix?: string }) {
  return (
    <div className="lg-brand">
      <span className="lg-brand-mark">Г</span>
      <span>
        Гарри
        {suffix ? <em> · {suffix}</em> : <small>Подготовка к ОГЭ и ЕГЭ</small>}
      </span>
    </div>
  );
}

export function Login({ onLogin }: { onLogin: (session: Session) => void }) {
  const [door, setDoor] = useState<Door>('choose');
  const [role, setRole] = useState<Role>('student');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [step, setStep] = useState<Step>('name');
  const [code, setCode] = useState('');
  const [repeat, setRepeat] = useState('');
  const { busy, error, run, clearError } = useAction();
  const halloween = useHalloween();
  useEffect(() => {
    if (error) {
      setCode('');
      setRepeat('');
    }
  }, [error]);
  function backToName() {
    clearError();
    setStep('name');
    setCode('');
    setRepeat('');
  }
  function open(next: Door) {
    backToName();
    setDoor(next);
    setRole(next === 'student' ? 'student' : 'teacher');
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    void run(async () => {
      let session: Session;
      if (role === 'student' || role === 'teacher') {
        if (step === 'create') {
          if (code.length !== 6) throw new Error('Код состоит из 6 цифр');
          if (code !== repeat) throw new Error('Коды не совпадают. Введите их ещё раз');
        } else if (step === 'code' && code.length !== 6) throw new Error('Введите все 6 цифр кода');
        setApiToken('');
        const sendCode = step === 'name' ? undefined : code;
        const result =
          role === 'student'
            ? await api.student.login(lastName, firstName, sendCode)
            : await api.teacher.login(firstName, middleName, sendCode);
        if (result.status !== 'ok') {
          setStep(result.status === 'code_new' ? 'create' : 'code');
          return;
        }
        session =
          'student' in result
            ? {
                role: 'student',
                name: result.student.full_name,
                token: result.token,
                studentId: result.student.id,
              }
            : {
                // An employee with several roles opens the screen of the highest one.
                role: result.teacher.roles.includes('admin')
                  ? 'admin'
                  : result.teacher.roles.includes('responsible')
                    ? 'responsible'
                    : 'teacher',
                name: result.teacher.name,
                token: result.token,
                staffId: result.teacher.id,
                teacherId: result.teacher.roles.includes('teacher') ? result.teacher.id : undefined,
                roles: result.teacher.roles,
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

  if (door === 'choose')
    return <LoginChoice onStudent={() => open('student')} onStaff={() => open('staff')} />;

  const student = door === 'student';
  return (
    <div className={`lg-page${halloween && student ? ' lg-hw' : ''}`}>
      {student ? (
        <section className="lg-side lg-side-purple">
          <Brand />
          <div className="lg-pitch">
            <span className="lg-eyebrow">КАБИНЕТ УЧЕНИКА</span>
            <h1>Записывайтесь на пробники и смотрите результаты с разбором.</h1>
          </div>
          <span />
        </section>
      ) : (
        <section className="lg-side lg-side-dark">
          <Brand suffix="для сотрудников" />
          <div className="lg-pitch">
            <h1 className="lg-h1-small">Один вход — кабинет по вашей роли</h1>
            <div className="lg-roles">
              {staffRoles.map((item) => (
                <div key={item.role}>
                  <span className="lg-role-tag">{item.title}</span>
                  <span>{item.text}</span>
                </div>
              ))}
            </div>
          </div>
          <p className="lg-side-note">Роль задаёт администратор.</p>
        </section>
      )}
      <section className="lg-main">
        <form onSubmit={submit} className="lg-panel">
          <button
            type="button"
            className="lg-back"
            onClick={() => (step === 'name' ? open('choose') : backToName())}
          >
            <ArrowLeft size={16} />
            {step !== 'name' ? 'Изменить имя' : student ? 'Назад' : 'Я ученик'}
          </button>
          <div className="lg-title">
            <h2>
              {step === 'create'
                ? 'Придумайте код'
                : step === 'code'
                  ? 'Введите код'
                  : student
                    ? 'Вход для ученика'
                    : 'Вход сотрудника'}
            </h2>
            <p>
              {step === 'create'
                ? 'Это ваш первый вход. Придумайте личный код из 6 цифр — дальше будете входить с ним.'
                : step === 'code'
                  ? 'Введите личный код из 6 цифр.'
                  : student
                    ? 'Введите фамилию и имя, как они указаны в списке учеников.'
                    : 'Выберите роль и введите данные для входа.'}
            </p>
          </div>
          {!student && step === 'name' && (
            <div className="lg-tabs" role="group" aria-label="Роль сотрудника">
              {(['teacher', 'admin'] as Role[]).map((r) => (
                <button
                  type="button"
                  key={r}
                  aria-pressed={role === r || (r === 'admin' && role === 'responsible')}
                  disabled={busy}
                  onClick={() => {
                    setRole(r);
                    clearError();
                  }}
                >
                  {r === 'admin' ? 'Администратор' : roleNames[r]}
                </button>
              ))}
            </div>
          )}
          <ErrorNotice message={error} />
          {step !== 'name' && (role === 'student' || role === 'teacher') ? (
            <>
              <div className="lg-who">
                {role === 'student' ? `${lastName} ${firstName}` : `${firstName} ${middleName}`}
              </div>
              <div className="lg-code-field">
                <span>{step === 'create' ? 'Новый код' : 'Код доступа'}</span>
                <CodeInput value={code} onChange={setCode} autoFocus disabled={busy} />
              </div>
              {step === 'create' && (
                <div className="lg-code-field">
                  <span>Повторите код</span>
                  <CodeInput value={repeat} onChange={setRepeat} label="Повтор кода" disabled={busy} />
                </div>
              )}
              <p className="lg-hint">
                {step === 'create'
                  ? 'Код личный — не пересылайте его друзьям. Если забудете, администратор сбросит его.'
                  : 'После 5 неверных попыток вход приостанавливается на 5 минут, затем на 30.'}
              </p>
            </>
          ) : role === 'student' ? (
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
                Роль
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
          <Button type="submit" disabled={busy} icon={<ChevronRight size={20} />} className="lg-submit">
            {busy
              ? 'Входим…'
              : step === 'create'
                ? 'Сохранить код и войти'
                : step === 'name' && (role === 'student' || role === 'teacher')
                  ? 'Продолжить'
                  : 'Войти'}
          </Button>
          <p className="lg-help">
            {step === 'create'
              ? 'Запомните код: он понадобится при каждом входе.'
              : role === 'student'
                ? 'Если войти не получается, обратитесь к администратору.'
                : role === 'teacher'
                  ? 'Введите имя и отчество так, как они указаны в названии группы в CRM.'
                  : 'Ключ доступа выдаёт администратор. Выбранная роль определяет интерфейс кабинета.'}
          </p>
        </form>
      </section>
      {halloween && student && <p className="lg-credit">{CREDIT}</p>}
    </div>
  );
}
