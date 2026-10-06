import { useState } from 'react';
import { CalendarDays, Check, MapPin } from 'lucide-react';
import { Art, Glow, GlowDefs, Stars } from './Art';
import { ART } from './shapes';

const longDay = (value: string) =>
  new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(
    new Date(value),
  );
const timeLabel = (value: string) =>
  new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

/** The letter and the witch who carries it away; the sky and the ground stay behind both. */
function Scene() {
  return (
    <div className="hw-booked-scene">
      <svg
        width="390"
        height="844"
        viewBox="0 0 390 844"
        style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}
        aria-hidden="true"
      >
        <defs>
          <radialGradient id="bkLglow">
            <stop offset="0" stopColor="#ffb067" stopOpacity="0.55" />
            <stop offset="1" stopColor="#ffb067" stopOpacity="0" />
          </radialGradient>
        </defs>
        <path d="M0 844V770c60-22 100 8 170-12 70-20 110 16 190-6 12-3 22-4 30-4V844z" fill="#07030f" />
        <Art name="graves" x={210} y={670} s={0.29296875} color="#1a0f30" />
        <Art name="cat" x={30} y={740} s={0.1171875} color="#1a0f30" />
        <Art name="pumpkin" x={300} y={744} s={0.13671875} color="#ff8f33" />
        <g transform="translate(195 480)">
          <g className="hw-lpath">
            <g className="hw-lin" style={{ animationDelay: '.2s' }}>
              <g className="hw-lbob">
                <g className="hw-lswing">
                  <circle cx="0" cy="0" r="90" fill="url(#bkLglow)" />
                  <g>
                    <rect
                      x="-60"
                      y="-40"
                      width="120"
                      height="82"
                      rx="8"
                      fill="#fff1d6"
                      stroke="#ffb067"
                      strokeWidth="2"
                    />
                    <path
                      d="M-58 -37 0 8 58 -37"
                      fill="none"
                      stroke="#e0a65a"
                      strokeWidth="2.5"
                      strokeLinejoin="round"
                    />
                    <path d="M-58 40 -14 4M58 40 14 4" fill="none" stroke="#e8c892" strokeWidth="2" />
                    <circle cx="0" cy="6" r="14" fill="#ff7a1a" stroke="#c85a00" strokeWidth="2" />
                    <text
                      x="0"
                      y="12"
                      textAnchor="middle"
                      fontFamily="Unbounded, Manrope, sans-serif"
                      fontSize="15"
                      fontWeight="800"
                      fill="#1a0b2e"
                    >
                      Г
                    </text>
                  </g>
                </g>
              </g>
            </g>
          </g>
          <circle className="hw-grab" cx="0" cy="-10" r="60" fill="none" stroke="#ffd9a0" strokeWidth="3" />
          <g className="hw-wpath">
            <g transform="translate(-115 -170)">
              <defs>
                <mask id="bkWitchMask">
                  <rect x="-10" y="-10" width="532" height="532" fill="#000" />
                  <circle cx="256" cy="256" r="233" fill="#fff" />
                  <g style={{ color: '#000' }}>
                    <path fill="currentColor" d={ART.moon} />
                  </g>
                </mask>
              </defs>
              <g transform="scale(0.44921875)">
                <rect x="0" y="0" width="512" height="512" fill="#07030f" mask="url(#bkWitchMask)" />
              </g>
              <g transform="translate(20 100)">
                <circle
                  className="hw-trail"
                  cx="-6"
                  cy="30"
                  r="3"
                  fill="#ffd9a0"
                  style={{ animationDelay: '0s' }}
                />
                <circle
                  className="hw-trail"
                  cx="-24"
                  cy="40"
                  r="2.4"
                  fill="#ff9a3c"
                  style={{ animationDelay: '0.25s' }}
                />
                <circle
                  className="hw-trail"
                  cx="-40"
                  cy="22"
                  r="2.8"
                  fill="#ffffff"
                  style={{ animationDelay: '0.5s' }}
                />
                <circle
                  className="hw-trail"
                  cx="-16"
                  cy="56"
                  r="2"
                  fill="#ffd9a0"
                  style={{ animationDelay: '0.75s' }}
                />
              </g>
            </g>
          </g>
        </g>
      </svg>
      <div className="hw-booked-cap">
        <span className="hw-display">Ведьма уже летит…</span>
        <span>доставляет вашу запись в школу</span>
      </div>
    </div>
  );
}

export function Booked({
  format,
  title,
  subject,
  startsAt,
  school,
  address,
  closes,
  onHome,
  onAgain,
}: {
  format: 'ege' | 'oge' | null;
  title: string;
  subject: string;
  startsAt: string;
  school: string;
  address: string | null;
  closes?: string;
  onHome: () => void;
  onAgain: () => void;
}) {
  const [run, setRun] = useState(0);
  return (
    <div className="hw-scope hw-booked">
      <div className="hw-booked-inner" key={run}>
        <svg
          className="hw-booked-sky"
          viewBox="0 0 390 844"
          preserveAspectRatio="xMidYMin slice"
          aria-hidden="true"
        >
          <GlowDefs prefix="bk" />
          <Glow id="bkGlowM" cx={320} cy={90} r={120} duration={4} />
          <Stars
            points={[
              [30, 110, 1.6, 0, 3],
              [200, 40, 1.4, 0.8, 2.6],
              [310, 170, 1.6, 1.4, 3.2],
              [90, 300, 1.3, 0.4, 2.8],
              [360, 340, 1.5, 1.2, 3.1],
              [40, 520, 1.3, 0.9, 3],
              [350, 580, 1.4, 1.6, 2.7],
              [180, 620, 1.3, 0.3, 3.3],
            ]}
          />
          <Art name="cobweb" s={0.33203125} color="#ffffff" opacity={0.1} />
        </svg>
        <Scene />
        <div className="hw-booked-final">
          <div className="hw-booked-hero">
            <div className="hw-booked-badge">
              <Check size={46} strokeWidth={2.6} />
            </div>
            <h1 className="hw-fin hw-display" style={{ animationDelay: '4.5s' }}>
              Вы записаны
              <br />
              <span>на экзамен!</span>
            </h1>
            <p className="hw-fin" style={{ animationDelay: '4.65s' }}>
              Ведьма доставила письмо в школу. Запись появилась в разделе «Пробники»
              {closes ? `, изменить время можно до ${closes}` : ''}.
            </p>
          </div>
          <div className="hw-fin hw-booked-card" style={{ animationDelay: '4.8s' }}>
            <div>
              <span>
                {format === 'oge' ? 'ОГЭ' : 'ЕГЭ'} · {title.toUpperCase()}
              </span>
              <strong className="hw-display">{subject}</strong>
            </div>
            <hr />
            <p>
              <CalendarDays size={20} />
              <span>
                <b>{capitalize(longDay(startsAt))}</b> в {timeLabel(startsAt)}
              </span>
            </p>
            <p>
              <MapPin size={20} />
              <span>
                <b>{school}</b>
                {address && (
                  <>
                    <br />
                    <em>{address}</em>
                  </>
                )}
              </span>
            </p>
            <div className="hw-booked-note">Приходите за 15 минут до начала.</div>
          </div>
          <div className="hw-fin hw-booked-actions" style={{ animationDelay: '5s' }}>
            <button type="button" className="hw-booked-primary" onClick={onHome}>
              <span className="hw-shine" />К моим пробникам
            </button>
            <button type="button" onClick={onAgain}>
              Записаться на ещё один предмет
            </button>
            <button type="button" className="hw-booked-replay" onClick={() => setRun(run + 1)}>
              Показать анимацию ещё раз
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
