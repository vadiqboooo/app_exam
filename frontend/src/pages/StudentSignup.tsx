import { useState, type FormEvent } from 'react';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { api, saveSession, setApiToken } from '../api/client';
import type { Session } from '../types';
import { useAction } from '../hooks/useAction';
import { Button } from '../components/Button';
import { ErrorNotice } from '../components/ErrorNotice';
import { CodeInput } from '../components/CodeInput';
import { formatPhone } from '../lib/phone';
import { CREDIT } from '../halloween/Art';
import { useHalloween } from '../halloween/theme';

type Step = 1 | 2 | 3;

const labels: Record<1 | 2 | 3, string> = {
  1: 'ШАГ 1 ИЗ 3 · ИМЯ',
  2: 'ШАГ 2 ИЗ 3 · ПАРОЛЬ',
  3: 'ШАГ 3 ИЗ 3 · ТЕЛЕФОН',
};

/** Регистрация ученика не из школы: имя → пароль из 6 цифр → телефон. Заявку подтверждает администратор. */
export function StudentSignup({
  onBack,
  onLogin,
}: {
  onBack: () => void;
  onLogin: (session: Session) => void;
}) {
  const [step, setStep] = useState<Step>(1);
  const [lastName, setLastName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [code, setCode] = useState('');
  const [repeat, setRepeat] = useState('');
  const [phone, setPhone] = useState('');
  const [agree, setAgree] = useState(false);
  const [problem, setProblem] = useState('');
  const { busy, error, run, clearError } = useAction();
  const halloween = useHalloween();

  const phoneDigits = phone.replace(/\D/g, '').length;
  const check = (): string => {
    if (step === 1) {
      if (lastName.trim().length < 2) return 'Введите фамилию';
      if (firstName.trim().length < 2) return 'Введите имя';
    } else if (step === 2) {
      if (code.length < 6) return 'Пароль состоит из 6 цифр';
      if (repeat !== code) return 'Пароли не совпадают';
    } else if (step === 3) {
      if (phoneDigits < 11) return 'Введите телефон полностью, например +7 (900) 123-45-67';
      if (!agree) return 'Без согласия заявку отправить нельзя';
    }
    return '';
  };

  function back() {
    clearError();
    setProblem('');
    if (step === 1) onBack();
    else setStep((step - 1) as Step);
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    clearError();
    const invalid = check();
    setProblem(invalid);
    if (invalid) return;
    if (step < 3) return setStep((step + 1) as Step);
    void run(async () => {
      setApiToken('');
      const result = await api.student.signUp({
        last_name: lastName.trim(),
        first_name: firstName.trim(),
        code,
        phone,
      });
      // The applicant enters the cabinet at once and can book; the booking is final after the call.
      const session: Session = {
        role: 'student',
        name: result.student.full_name,
        token: result.token,
        studentId: result.student.id,
      };
      saveSession(session);
      onLogin(session);
    });
  }

  return (
    <div className={`lg-page${halloween ? ' lg-hw' : ''}`}>
      <section className="lg-side lg-side-purple">
        <div className="lg-brand">
          <span className="lg-brand-mark">Г</span>
          <span>
            Гарри
            <small>Подготовка к ОГЭ и ЕГЭ</small>
          </span>
        </div>
        <div className="lg-pitch">
          <span className="lg-eyebrow">РЕГИСТРАЦИЯ УЧЕНИКА</span>
          <h1>Не учитесь у нас? Оставьте заявку — и записывайтесь на пробники.</h1>
        </div>
        <span />
      </section>
      <section className="lg-main">
        {
          <form onSubmit={submit} className="lg-panel" noValidate>
            <button type="button" className="lg-back" onClick={back}>
              <ArrowLeft size={16} />
              Назад
            </button>
            <div className="lg-steps" aria-hidden="true">
              {[1, 2, 3].map((n) => (
                <span key={n} className={n <= step ? 'is-on' : ''} />
              ))}
            </div>
            <span className="lg-step-label">{labels[step]}</span>
            <div className="lg-title">
              <h2>
                {step === 1 ? (
                  <>
                    Как вас <em>зовут</em>?
                  </>
                ) : step === 2 ? (
                  <>
                    Придумайте <em>пароль</em>
                  </>
                ) : (
                  <>
                    Ваш <em>телефон</em>
                  </>
                )}
              </h2>
              <p>
                {step === 1
                  ? 'Для тех, кто ещё не учится в школе. Администратор проверит заявку и подтвердит её по телефону.'
                  : step === 2
                    ? `Это 6 цифр, как код ученика школы. По нему вы будете входить вместе с фамилией. ${
                        halloween ? 'Никому его не говорите, даже призракам.' : 'Не пересылайте его друзьям.'
                      }`
                    : 'Администратор позвонит, чтобы подтвердить запись. Номер видит только школа.'}
              </p>
            </div>
            <ErrorNotice message={problem || error} />
            {step === 1 && (
              <>
                <label>
                  Фамилия
                  <input
                    autoComplete="family-name"
                    placeholder="Иванов"
                    autoFocus
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                </label>
                <label>
                  Имя
                  <input
                    autoComplete="given-name"
                    placeholder="Алексей"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                </label>
              </>
            )}
            {step === 2 && (
              <>
                <div className="lg-code-field">
                  <span>Пароль — 6 цифр</span>
                  <CodeInput value={code} onChange={setCode} label="Пароль" autoFocus />
                </div>
                <div className="lg-code-field">
                  <span>Повторите пароль</span>
                  <CodeInput value={repeat} onChange={setRepeat} label="Повтор пароля" />
                </div>
              </>
            )}
            {step === 3 && (
              <>
                <label>
                  Телефон
                  <input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    autoFocus
                    placeholder="+7 (___) ___-__-__"
                    value={phone}
                    onChange={(e) => setPhone(formatPhone(e.target.value))}
                  />
                </label>
                <label className="lg-agree">
                  <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                  <span>Согласен на обработку персональных данных</span>
                </label>
              </>
            )}
            <Button
              type="submit"
              disabled={busy}
              icon={step < 3 ? <ChevronRight size={20} /> : undefined}
              className="lg-submit"
            >
              {step === 3 ? (busy ? 'Отправляем…' : 'Отправить заявку') : 'Далее'}
            </Button>
            {step === 1 && (
              <button type="button" className="lg-link" onClick={onBack}>
                У меня уже есть код от школы
              </button>
            )}
          </form>
        }
      </section>
      {halloween && <p className="lg-credit">{CREDIT}</p>}
    </div>
  );
}
