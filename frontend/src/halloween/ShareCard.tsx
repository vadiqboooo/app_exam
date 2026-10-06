import { forwardRef } from 'react';
import { Art } from './Art';
import { rank, type Summary } from './result';

export type CardTheme = 'pumpkin' | 'ghost' | 'witch';

export const CARD_THEMES: Record<
  CardTheme,
  { name: string; ac: string; ac2: string; stops: [string, string, string] }
> = {
  pumpkin: { name: 'Тыква', ac: '#ff7a1a', ac2: '#ffb067', stops: ['#3a1a6e', '#1a0b2e', '#0e0719'] },
  ghost: { name: 'Призрак', ac: '#5eead4', ac2: '#b8fff0', stops: ['#0f3b44', '#0a1f2a', '#060f16'] },
  witch: { name: 'Ведьма', ac: '#d27bff', ac2: '#f0c8ff', stops: ['#5b1b7a', '#2a0d45', '#12061f'] },
};

const FONT = "Unbounded, Manrope, 'Segoe UI', system-ui, sans-serif";
const BODY = "Manrope, 'Segoe UI', system-ui, sans-serif";

/** A 252×448 story card drawn as one SVG, so it can be saved as a picture. */
export const ShareCard = forwardRef<
  SVGSVGElement,
  { theme: CardTheme; summary: Summary; subject: string; format: 'ege' | 'oge' | null }
>(function ShareCard({ theme, summary, subject, format }, ref) {
  const t = CARD_THEMES[theme];
  const value = summary.value == null ? '—' : String(summary.value);
  const big = summary.isGrade ? 80 : 66;
  const labelX = 18 + value.length * (summary.isGrade ? 52 : 46) + 10;
  const label = summary.isGrade ? ['оценка', 'по ОГЭ'] : ['баллов', `из ${summary.maxValue}`];
  const pill = rank(summary.percent);
  const kicker = `ПРОБНИК ${format === 'oge' ? 'ОГЭ' : 'ЕГЭ'} · ${subject.toUpperCase()}`;
  const barY = summary.isGrade ? 292 : 0;
  return (
    <svg
      ref={ref}
      width="252"
      height="448"
      viewBox="0 0 252 448"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={`Карточка: ${subject}, ${value}`}
      style={{
        display: 'block',
        borderRadius: 22,
        boxShadow: '0 18px 50px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.14)',
      }}
    >
      <defs>
        <linearGradient id={`cardBg-${theme}`} x1="0.1" y1="0" x2="0.35" y2="1">
          <stop offset="0" stopColor={t.stops[0]} />
          <stop offset="0.55" stopColor={t.stops[1]} />
          <stop offset="1" stopColor={t.stops[2]} />
        </linearGradient>
        <radialGradient id={`cardGlow-${theme}`}>
          <stop offset="0" stopColor="#ffd9a0" stopOpacity="0.35" />
          <stop offset="1" stopColor="#ffd9a0" stopOpacity="0" />
        </radialGradient>
        <clipPath id={`cardClip-${theme}`}>
          <rect width="252" height="448" rx="22" />
        </clipPath>
      </defs>
      <g clipPath={`url(#cardClip-${theme})`}>
        <rect width="252" height="448" fill={`url(#cardBg-${theme})`} />
        <circle cx="200" cy="70" r="80" fill={`url(#cardGlow-${theme})`} />
        <g fill="#ffd9a0">
          <circle cx="30" cy="40" r="1.4" />
          <circle cx="90" cy="100" r="1.2" />
          <circle cx="150" cy="28" r="1.5" />
          <circle cx="230" cy="150" r="1.4" />
          <circle cx="20" cy="150" r="1.2" />
        </g>
        <Art name="bat" x={30} y={70} s={0.0546875} color="#07030f" />
        <Art name="bat" x={110} y={150} s={0.0390625} color="#07030f" />
        <path d="M0 448V404c30-14 52 8 88-8 36-16 56 10 98-4 30-10 50 6 66-2V448z" fill="#07030f" />
        <Art name="graves" x={140} y={338} s={0.1953125} color="#1a0f30" />
        {theme === 'pumpkin' && (
          <>
            <Art name="pumpkin" x={152} y={16} s={0.1796875} color={t.ac} />
            <Art name="cat" x={190} y={392} s={0.078125} color="#1a0f30" />
          </>
        )}
        {theme === 'ghost' && (
          <>
            <circle cx="200" cy="64" r="40" fill={t.ac2} opacity="0.92" />
            <Art name="ghost" x={172} y={34} s={0.109375} color="#0f2a2e" />
            <Art name="skeleton" x={180} y={360} s={0.125} color={t.ac} />
          </>
        )}
        {theme === 'witch' && (
          <>
            <Art name="moon" x={156} y={20} s={0.171875} color={t.ac2} opacity={0.95} />
            <Art name="cauldron" x={176} y={364} s={0.125} color={t.ac} />
          </>
        )}
        <text
          x="18"
          y="30"
          fontFamily={BODY}
          fontSize="8.5"
          fontWeight="800"
          letterSpacing="1.2"
          fill="#f3ecff"
          opacity="0.85"
        >
          ГАРРИ · ХЭЛЛОУИНСКАЯ НЕДЕЛЯ
        </text>
        <text
          x="18"
          y="128"
          fontFamily={BODY}
          fontSize="9"
          fontWeight="800"
          letterSpacing="0.9"
          fill={t.ac2}
          textLength={kicker.length * 6.9 > 216 ? 216 : undefined}
          lengthAdjust="spacingAndGlyphs"
        >
          {kicker}
        </text>
        <text
          x="18"
          y="156"
          fontFamily={FONT}
          fontSize="16"
          fontWeight="800"
          fill="#ffffff"
          textLength="216"
          lengthAdjust="spacingAndGlyphs"
        >
          Первый страх <tspan fill={t.ac}>побеждён</tspan>
        </text>
        <text
          x="18"
          y={summary.isGrade ? 232 : 222}
          fontFamily={FONT}
          fontSize={big}
          fontWeight="800"
          fill="#fff4e0"
        >
          {value}
        </text>
        <text
          x={labelX}
          y={summary.isGrade ? 208 : 200}
          fontFamily={BODY}
          fontSize="11"
          fontWeight="800"
          fill={t.ac2}
        >
          {label[0]}
        </text>
        <text
          x={labelX}
          y={summary.isGrade ? 222 : 213}
          fontFamily={BODY}
          fontSize="11"
          fontWeight="800"
          fill={t.ac2}
        >
          {label[1]}
        </text>
        {!summary.isGrade && (
          <g>
            <rect x="18" y="238" width={pill.length * 6.2 + 22} height="22" rx="11" fill={t.ac} />
            <text x="29" y="253" fontFamily={BODY} fontSize="10" fontWeight="800" fill="#1a0b2e">
              {pill}
            </text>
          </g>
        )}
        {summary.isGrade && (
          <g>
            <text x="18" y="262" fontFamily={BODY} fontSize="10.5" fontWeight="800" fill="#ffffff">
              {`Набрано баллов: ${summary.primary ?? 0} из ${summary.maxPrimary}`}
            </text>
            <text
              x="234"
              y="262"
              textAnchor="end"
              fontFamily={BODY}
              fontSize="10.5"
              fontWeight="800"
              fill={t.ac2}
            >
              {`${summary.percent}%`}
            </text>
            <rect x="18" y="268" width="216" height="9" rx="4.5" fill="#ffffff" opacity="0.16" />
            <rect x="18" y="268" width={(216 * summary.percent) / 100} height="9" rx="4.5" fill={t.ac} />
            {summary.parts.slice(0, 2).map((part, index) => {
              const percent = Math.round((part.got / (part.max || 1)) * 100);
              const x = 18 + index * 114;
              return (
                <g key={part.name}>
                  <text
                    x={x}
                    y={barY + 4}
                    fontFamily={BODY}
                    fontSize="9"
                    fontWeight="800"
                    fill="#ffffff"
                  >{`Часть ${index + 1}`}</text>
                  <text
                    x={x + 102}
                    y={barY + 4}
                    textAnchor="end"
                    fontFamily={BODY}
                    fontSize="9"
                    fontWeight="800"
                    fill={t.ac2}
                  >{`${percent}%`}</text>
                  <rect x={x} y={barY + 9} width="102" height="5" rx="2.5" fill="#ffffff" opacity="0.16" />
                  <rect x={x} y={barY + 9} width={(102 * percent) / 100} height="5" rx="2.5" fill={t.ac} />
                </g>
              );
            })}
            <g>
              <rect x="18" y="318" width={pill.length * 6.2 + 22} height="22" rx="11" fill={t.ac} />
              <text x="29" y="333" fontFamily={BODY} fontSize="10" fontWeight="800" fill="#1a0b2e">
                {pill}
              </text>
            </g>
          </g>
        )}
        <text x="18" y="398" fontFamily={BODY} fontSize="8.5" fontWeight="800" letterSpacing="1" fill={t.ac2}>
          ПРОБНИК СДАН В ШКОЛЕ
        </text>
        <text x="18" y="416" fontFamily={BODY} fontSize="14" fontWeight="800" fill="#ffffff">
          Школа «Гарри»
        </text>
      </g>
    </svg>
  );
});

/** Renders the card to a PNG (3×) so it can be shared as a story. */
export async function cardToPng(svg: SVGSVGElement): Promise<Blob> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('width', '756');
  clone.setAttribute('height', '1344');
  clone.style.boxShadow = 'none';
  clone.style.borderRadius = '0';
  const xml = new XMLSerializer().serializeToString(clone);
  const image = new Image();
  const loaded = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Не удалось собрать картинку'));
  });
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  await loaded;
  const canvas = document.createElement('canvas');
  canvas.width = 756;
  canvas.height = 1344;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Не удалось собрать картинку');
  context.drawImage(image, 0, 0);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Не удалось собрать картинку'))),
      'image/png',
    ),
  );
}
