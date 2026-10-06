import { useEffect, useState } from 'react';
import { ArrowRight, Briefcase, GraduationCap } from 'lucide-react';
import { Art, Bat, CREDIT, Glow, GlowDefs, Stars } from './Art';
import { Brew } from './Brew';
import { daysToWeek, setHalloween, useHalloween, WEEK } from './theme';

const SPARKLE = 'M12 1l2.6 8.4L23 12l-8.4 2.6L12 23l-2.6-8.4L1 12l8.4-2.6z';
const dayMonth = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' });
const days = (count: number) => {
  const mod10 = count % 10;
  const mod100 = count % 100;
  return mod10 === 1 && mod100 !== 11
    ? `${count} день`
    : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
      ? `${count} дня`
      : `${count} дней`;
};

/** Night sky for the wide screen (the design is 1280×800). */
function WideScene() {
  return (
    <svg
      className="hw-art-wide hw-only-wide"
      viewBox="0 0 1280 800"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <GlowDefs prefix="lw" />
      <Glow id="lwGlowM" cx={1040} cy={150} r={170} duration={5} />
      <g className="hw-fl" style={{ animationDuration: '7s' }}>
        <Art name="moon" x={940} y={50} s={0.390625} color="#ffd9a0" opacity={0.96} />
      </g>
      <Stars
        points={[
          [620, 70, 2, 0, 3],
          [760, 130, 1.6, 0.8, 2.6],
          [860, 60, 2, 1.5, 3.4],
          [1200, 280, 1.8, 0.4, 2.8],
          [560, 210, 1.5, 1.2, 3.1],
          [1180, 60, 2, 2, 2.5],
          [980, 260, 1.4, 0.6, 3.3],
          [470, 120, 1.6, 1.8, 2.9],
        ]}
      />
      <Art name="cobweb" s={0.5859375} color="#ffffff" opacity={0.16} />
      <g className="hw-sw" style={{ animationDuration: '4.2s', transformOrigin: '630px 0px' }}>
        <path d="M630 0V92" stroke="#cbbde6" strokeOpacity="0.5" strokeWidth="1.5" />
        <Art name="spider" x={598} y={84} s={0.125} color="#cbbde6" opacity={0.85} />
      </g>
      <Bat x={860} y={96} s={0.16796875} drift={8} />
      <Bat x={1150} y={290} s={0.1171875} drift={6.5} delay={-2} flap={0.42} />
      <Bat x={690} y={200} s={0.08984375} drift={9} delay={-4} flap={0.36} />
      <Bat x={1010} y={300} s={0.07421875} drift={7} delay={-1} flap={0.4} />
      <path
        d="M0 800V720c60-30 100 10 170-18 70-28 110 22 190-8 80-30 130 18 210-6 90-26 130 14 220-4 80-16 120 24 210-2 90-26 130 20 280-10V800z"
        fill="#07030f"
      />
      <Art name="graves" x={640} y={590} s={0.33203125} color="#1a0f30" />
      <Art name="cat" x={1236} y={672} s={0.16796875} flip color="#1a0f30" />
      <Glow id="lwGlow" cx={215} cy={700} r={130} duration={3.2} />
      <g className="hw-fk" style={{ animationDuration: '2.6s' }}>
        <Art name="pumpkin" x={140} y={610} s={0.29296875} color="#ff8f33" />
      </g>
      <Glow id="lwGlow" cx={1058} cy={722} r={80} duration={3.6} delay={-1} />
      <g className="hw-fk" style={{ animationDuration: '3s', animationDelay: '-0.8s' }}>
        <Art name="pumpkin" x={1010} y={666} s={0.1875} color="#ff8f33" />
      </g>
      <text x="1250" y="782" textAnchor="end" fontSize="10" fontFamily="Manrope, sans-serif" fill="#7a6a9c">
        {CREDIT}
      </text>
    </svg>
  );
}

/** Night sky for a phone (the design is 390×844). */
function PhoneScene() {
  return (
    <svg
      className="hw-art-wide hw-only-phone"
      viewBox="0 0 390 844"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <GlowDefs prefix="lm" />
      <Glow id="lmGlowM" cx={300} cy={96} r={120} duration={5} />
      <g className="hw-fl" style={{ animationDuration: '7s' }}>
        <Art name="moon" x={244} y={44} s={0.21875} color="#ffd9a0" opacity={0.96} />
      </g>
      <Stars
        points={[
          [40, 230, 1.6, 0, 3],
          [120, 150, 1.5, 0.8, 2.6],
          [200, 60, 1.8, 1.5, 3.4],
          [350, 230, 1.5, 0.4, 2.8],
          [70, 300, 1.4, 1.2, 3.1],
          [260, 210, 1.6, 2, 2.5],
        ]}
      />
      <Art name="cobweb" s={0.29296875} color="#ffffff" opacity={0.18} />
      <g className="hw-sw" style={{ animationDuration: '4.2s', transformOrigin: '196px 0px' }}>
        <path d="M196 0V66" stroke="#cbbde6" strokeOpacity="0.5" strokeWidth="1.2" />
        <Art name="spider" x={174} y={62} s={0.0859375} color="#cbbde6" opacity={0.85} />
      </g>
      <Bat x={150} y={120} s={0.0859375} drift={8} />
      <Bat x={320} y={200} s={0.06640625} drift={6.5} delay={-2} flap={0.42} />
      <path d="M0 844V776c40-20 70 6 120-12 50-18 80 14 136-4 50-16 84 10 134-6V844z" fill="#07030f" />
      <Art name="graves" x={150} y={700} s={0.16796875} color="#1a0f30" />
      <Art name="cat" x={348} y={730} s={0.09765625} flip color="#1a0f30" />
      <Glow id="lmGlow" cx={70} cy={772} r={80} duration={3.2} />
      <g className="hw-fk" style={{ animationDuration: '2.6s' }}>
        <Art name="pumpkin" x={22} y={716} s={0.1796875} color="#ff8f33" />
      </g>
      <Glow id="lmGlow" cx={340} cy={790} r={44} duration={3.6} delay={-1} />
      <g className="hw-fk" style={{ animationDuration: '3s', animationDelay: '-0.8s' }}>
        <Art name="pumpkin" x={312} y={764} s={0.109375} color="#ff8f33" />
      </g>
      <text x="195" y="836" textAnchor="middle" fontSize="8" fontFamily="Manrope, sans-serif" fill="#7a6a9c">
        {CREDIT}
      </text>
    </svg>
  );
}

function HalloweenChoice({ onStudent, onStaff }: { onStudent: () => void; onStaff: () => void }) {
  const left = daysToWeek();
  const from = dayMonth.format(WEEK.start);
  const to = dayMonth.format(WEEK.end);
  return (
    <div className="hw-scope hw-stage hw-choice">
      <WideScene />
      <PhoneScene />
      <button type="button" className="hw-reset" onClick={() => setHalloween(false)}>
        Обычная тема
      </button>
      <div className="hw-choice-inner">
        <div className="hw-ri hw-choice-brand">
          <span>Г</span>
          <span>
            <strong>Гарри</strong>
            <small>Подготовка к ОГЭ и ЕГЭ</small>
          </span>
        </div>
        <div className="hw-choice-body">
          <div className="hw-choice-pitch">
            <span className="hw-ri hw-choice-tag" style={{ animationDelay: '0.1s' }}>
              ХЭЛЛОУИНСКАЯ НЕДЕЛЯ · {from.toUpperCase()} — {to.toUpperCase()}
            </span>
            <h1 className="hw-ri hw-display" style={{ animationDelay: '0.2s' }}>
              Побори свой <span>первый страх</span>
            </h1>
            <p className="hw-ri hw-choice-lead" style={{ animationDelay: '0.3s' }}>
              Пробные экзамены ОГЭ и ЕГЭ в самую страшную неделю — с {from} по {to}.
            </p>
            <p className="hw-ri hw-choice-text" style={{ animationDelay: '0.4s' }}>
              Многие боятся идти на экзамен, потому что не знают, как он проходит. Приходи на пробник: увидишь
              экзамен изнутри, узнаешь свой балл — и страх станет знакомым.
            </p>
            {left > 0 && (
              <div className="hw-ri hw-choice-chips" style={{ animationDelay: '0.5s' }}>
                <span>Осталось {days(left)}</span>
              </div>
            )}
          </div>
          <div className="hw-choice-doors">
            <h2 className="hw-ri" style={{ animationDelay: '0.3s' }}>
              Войти в кабинет
            </h2>
            <button
              type="button"
              className="hw-card hw-ri hw-door is-student"
              style={{ animationDelay: '0.4s' }}
              onClick={onStudent}
            >
              <span className="hw-shine" />
              <span className="hw-door-icon">
                <GraduationCap size={26} />
              </span>
              <span className="hw-door-text">
                <strong>Я ученик</strong>
                <small>Записаться на пробник и смотреть результаты</small>
              </span>
              <ArrowRight className="hw-go" size={22} />
            </button>
            <button
              type="button"
              className="hw-card hw-ri hw-door"
              style={{ animationDelay: '0.52s' }}
              onClick={onStaff}
            >
              <span className="hw-door-icon">
                <Briefcase size={26} />
              </span>
              <span className="hw-door-text">
                <strong>Я сотрудник</strong>
                <small>Явка, проверка работ и баллы учеников</small>
              </span>
              <ArrowRight className="hw-go" size={22} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function LightChoice({
  onStudent,
  onStaff,
  onMagic,
}: {
  onStudent: () => void;
  onStaff: () => void;
  onMagic: () => void;
}) {
  return (
    <div className="lg-page">
      <section className="lg-side lg-side-purple">
        <div className="lg-brand">
          <span className="lg-brand-mark">Г</span>
          <span>
            Гарри
            <small>Подготовка к ОГЭ и ЕГЭ</small>
          </span>
        </div>
        <div className="lg-pitch">
          <span className="lg-eyebrow">ПРОБНЫЕ ЭКЗАМЕНЫ ОГЭ И ЕГЭ</span>
          <h1>Пробник как настоящий экзамен. Результат — с разбором.</h1>
        </div>
        <span />
      </section>
      <section className="lg-main">
        <div className="lg-panel lg-panel-wide">
          <div className="lg-title">
            <h2>Войти в кабинет</h2>
            <p>Кто вы?</p>
          </div>
          <div className="lg-doors">
            <button type="button" className="lg-door" onClick={onStudent}>
              <span className="lg-door-icon">
                <GraduationCap size={28} strokeWidth={1.8} />
              </span>
              <span className="lg-door-text">
                <strong>Я ученик</strong>
                <span>Записаться на пробник и смотреть результаты</span>
              </span>
              <ArrowRight size={22} />
            </button>
            <button type="button" className="lg-door" onClick={onStaff}>
              <span className="lg-door-icon lg-door-icon-slate">
                <Briefcase size={28} strokeWidth={1.8} />
              </span>
              <span className="lg-door-text">
                <strong>Я сотрудник</strong>
                <span>Явка, проверка работ и баллы учеников</span>
              </span>
              <ArrowRight size={22} />
            </button>
          </div>
          <button type="button" className="hw-magic lg-magic" onClick={onMagic}>
            <svg className="hw-sp" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path d={SPARKLE} fill="#ffe9a8" />
            </svg>
            <span>
              <strong>Воспользоваться магией</strong>
              <small>Школа Гарри — всё немного волшебное</small>
            </span>
            <svg className="hw-sp" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path d={SPARKLE} fill="#ffe9a8" />
            </svg>
          </button>
        </div>
      </section>
    </div>
  );
}

/** The door choice: ordinary, or Halloween once the student has used the magic. */
export function LoginChoice({ onStudent, onStaff }: { onStudent: () => void; onStaff: () => void }) {
  const halloween = useHalloween();
  const [brewing, setBrewing] = useState(false);
  useEffect(() => {
    if (!brewing) return;
    const timer = setTimeout(() => {
      setHalloween(true);
      setBrewing(false);
    }, 3900);
    return () => clearTimeout(timer);
  }, [brewing]);

  if (brewing) return <Brew />;
  return halloween ? (
    <HalloweenChoice onStudent={onStudent} onStaff={onStaff} />
  ) : (
    <LightChoice onStudent={onStudent} onStaff={onStaff} onMagic={() => setBrewing(true)} />
  );
}
