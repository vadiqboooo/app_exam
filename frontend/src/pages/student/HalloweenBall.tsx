import { useState, type CSSProperties } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useStudentWorkspace } from '../../layouts/StudentWorkspace';
import { Art, Bat, Glow, GlowDefs, Stars } from '../../halloween/Art';
import { lookup, predictions } from '../../halloween/result';

const FOG = [
  ['#7357db', '#a98bff'],
  ['#a455e8', '#ff7ac8'],
  ['#ff7a1a', '#ffb067'],
  ['#ff9a3c', '#ffe08a'],
];
const EYE = [0.12, 0.35, 0.6, 0.9];
const DIRS = [
  [-120, -110],
  [0, -150],
  [120, -110],
  [150, 0],
  [120, 115],
  [0, 150],
  [-120, 115],
  [-150, 0],
  [-80, -140],
  [85, -140],
];
const SPARK = ['#ffd9a0', '#ff9a3c', '#ffffff'];
const shortDay = (value: string) =>
  new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' })
    .format(new Date(value))
    .replace('.', '');

function Sky() {
  return (
    <svg
      className="hw-backdrop"
      viewBox="0 0 390 844"
      preserveAspectRatio="xMidYMin slice"
      aria-hidden="true"
    >
      <GlowDefs prefix="bl" />
      <Glow id="blGlowM" cx={330} cy={80} r={110} duration={4} />
      <Stars
        points={[
          [40, 130, 1.8, 0, 3],
          [110, 80, 1.5, 0.8, 2.6],
          [230, 160, 1.6, 1.4, 3.2],
          [360, 230, 1.8, 0.4, 2.8],
          [60, 330, 1.4, 1.2, 3.1],
          [300, 40, 1.6, 2, 2.5],
          [20, 520, 1.4, 0.6, 3],
          [370, 560, 1.5, 1.6, 2.7],
          [200, 700, 1.4, 0.9, 3.3],
        ]}
      />
      <Art name="cobweb" s={0.390625} color="#ffffff" opacity={0.13} />
      <g className="hw-sw" style={{ animationDuration: '4.2s', transformOrigin: '352px 0px' }}>
        <path d="M352 0V80" stroke="#cbbde6" strokeOpacity="0.5" strokeWidth="1.2" />
        <Art name="spider" x={331} y={74} s={0.08203125} color="#cbbde6" opacity={0.85} />
      </g>
      <Bat x={110} y={120} s={0.078125} drift={8} />
      <Bat x={260} y={250} s={0.0546875} drift={6.5} delay={-2} flap={0.42} />
      <Bat x={30} y={260} s={0.046875} drift={9} delay={-4} flap={0.36} />
      <path d="M0 844V790c60-22 100 8 170-12 70-20 110 16 190-6 12-3 22-4 30-4V844z" fill="#07030f" />
    </svg>
  );
}

export function HalloweenBall() {
  const { id } = useParams();
  const { data } = useStudentWorkspace();
  const [taps, setTaps] = useState(0);
  const found = lookup(data, Number(id));
  if (!found) return <Navigate to="/available" replace />;
  const { exam, summary } = found;
  const lines = predictions(exam.subject, summary);
  const k = Math.min(taps, 3);
  const ready = taps >= 3;
  const [fog, fog2] = FOG[k];
  const left = 3 - taps;

  return (
    <div className="hw-ball-page">
      <Sky />
      <div className="hw-ball-body">
        <div className="hw-ball-top">
          <Link to="/available" aria-label="Назад к пробникам">
            <ArrowLeft size={20} />
          </Link>
          <span>
            {exam.subject} · {shortDay(exam.starts_at)}
          </span>
        </div>
        <div className="hw-ball-head">
          <h1 className="hw-display">
            Шар <span>предсказаний</span>
          </h1>
          <p>
            {taps === 0
              ? 'Прикоснись к шару — он расскажет, как прошёл твой пробник.'
              : ready
                ? 'Шар всё сказал. Теперь он готов назвать твой балл.'
                : 'Ещё раз — шар видит всё больше.'}
          </p>
        </div>
        <div className="hw-ball-stage">
          {taps === 0 && (
            <>
              <span className="hw-hint" style={{ left: 100, top: 90, width: 80, height: 80 }} />
              <span
                className="hw-hint"
                style={{ left: 100, top: 90, width: 80, height: 80, animationDelay: '1s' }}
              />
            </>
          )}
          <div className="hw-bob" style={{ position: 'absolute', inset: 0 }}>
            <button
              type="button"
              className="hw-ballbtn"
              aria-label="Коснуться шара"
              key={`ball-${taps}`}
              onClick={() => setTaps(taps + 1)}
              style={{ animation: taps ? 'hwShake .6s ease-out' : undefined }}
            >
              <svg
                width="280"
                height="300"
                viewBox="0 0 280 300"
                style={{ display: 'block', overflow: 'visible' }}
              >
                <defs>
                  <radialGradient id="bgl" cx="40%" cy="32%" r="75%">
                    <stop offset="0" stopColor="#6b52c9" />
                    <stop offset="0.55" stopColor="#2d1c66" />
                    <stop offset="1" stopColor="#150b33" />
                  </radialGradient>
                  <radialGradient id="bhalo">
                    <stop offset="0" stopColor="#a98bff" stopOpacity="0.55" />
                    <stop offset="1" stopColor="#a98bff" stopOpacity="0" />
                  </radialGradient>
                  <filter id="bfog" x="-40%" y="-40%" width="180%" height="180%">
                    <feGaussianBlur stdDeviation="14" />
                  </filter>
                  <clipPath id="bclip">
                    <circle cx="140" cy="130" r="108" />
                  </clipPath>
                </defs>
                <g className="hw-br" style={{ animationDuration: '3.2s' }}>
                  <circle cx="140" cy="130" r="150" fill="url(#bhalo)" />
                </g>
                <path
                  d="M62 262c46-30 110-30 156 0l16 28H46z"
                  fill="#1a0f30"
                  stroke="#ff9a3c"
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                />
                <path
                  d="M84 246c34-16 78-16 112 0"
                  fill="none"
                  stroke="#ff9a3c"
                  strokeOpacity="0.6"
                  strokeWidth="2"
                />
                <circle
                  cx="140"
                  cy="130"
                  r="108"
                  fill="url(#bgl)"
                  stroke="#cbb8ff"
                  strokeOpacity="0.7"
                  strokeWidth="2.5"
                />
                <g clipPath="url(#bclip)">
                  <g className="hw-mist">
                    <circle cx="110" cy="150" r="58" fill={fog} opacity="0.85" filter="url(#bfog)" />
                    <circle cx="178" cy="120" r="46" fill={fog2} opacity="0.8" filter="url(#bfog)" />
                  </g>
                  <g className="hw-mist2">
                    <circle cx="140" cy="176" r="40" fill={fog2} opacity="0.6" filter="url(#bfog)" />
                  </g>
                  <g style={{ opacity: EYE[k], transition: 'opacity .5s ease' }}>
                    <Art name="eye" x={88} y={78} s={0.203125} color="#fff4e0" />
                  </g>
                </g>
                <ellipse
                  cx="96"
                  cy="70"
                  rx="34"
                  ry="16"
                  fill="#ffffff"
                  opacity="0.32"
                  transform="rotate(-32 96 70)"
                />
                <circle cx="198" cy="190" r="5" fill="#ffffff" opacity="0.4" />
              </svg>
            </button>
          </div>
          <svg
            width="280"
            height="300"
            viewBox="0 0 280 300"
            key={`sparks-${taps}`}
            style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none', overflow: 'visible' }}
            aria-hidden="true"
          >
            {DIRS.map(([dx, dy], index) => (
              <circle
                key={index}
                cx="140"
                cy="130"
                r={index % 2 ? 3 : 4}
                fill={SPARK[index % 3]}
                style={
                  taps > 0
                    ? ({
                        '--dx': `${dx}px`,
                        '--dy': `${dy}px`,
                        opacity: 0,
                        animation: `hwSpark 1s ease-out ${index * 0.02}s forwards`,
                        transformBox: 'fill-box',
                        transformOrigin: 'center',
                      } as CSSProperties)
                    : { opacity: 0 }
                }
              />
            ))}
          </svg>
          {taps === 0 && <div className="hw-ri hw-ball-touch">КОСНИСЬ ШАРА</div>}
        </div>
        <div className="hw-dots" aria-hidden="true">
          {[0, 1, 2].map((index) => (
            <span key={index} className={index < k ? 'is-on' : ''} />
          ))}
        </div>
        <div className="hw-ball-pred">
          {taps > 0 && (
            <div key={`pred-${taps}`} className="hw-pred">
              <span>ПРЕДСКАЗАНИЕ {Math.min(taps, 3)} ИЗ 3</span>
              <strong>{lines[Math.min(taps, 3) - 1]}</strong>
            </div>
          )}
        </div>
        <div className="hw-ball-foot">
          {ready ? (
            <div className="hw-pop">
              <Link to={`/my-results/${found.result.id}`} className="hw-pulse hw-ball-go">
                <span className="hw-shine" />
                Узнать свой балл
                <ArrowRight size={20} />
              </Link>
            </div>
          ) : (
            <div className="hw-ball-wait">
              {taps === 0 ? 'Коснись шара 3 раза' : `Ещё ${left} ${left === 1 ? 'касание' : 'касания'}`}
            </div>
          )}
          <Link to={`/my-results/${found.result.id}`} className="hw-ball-skip">
            Пропустить предсказания
          </Link>
        </div>
      </div>
    </div>
  );
}
