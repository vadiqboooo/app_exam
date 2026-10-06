import type { CSSProperties } from 'react';
import { ART } from './shapes';

type Item = {
  kind: 'paper' | 'book' | 'badge' | 'grade';
  sx: number;
  sy: number;
  r: number;
  delay: number;
  label?: string;
};

// Things that fly into the cauldron: start offset from the cauldron, rotation, delay.
const ITEMS: Item[] = [
  { kind: 'paper', sx: -520, sy: -300, r: -35, delay: 0.5 },
  { kind: 'book', sx: 500, sy: -320, r: 40, delay: 0.67, label: 'ЕГЭ' },
  { kind: 'badge', sx: -560, sy: 90, r: -20, delay: 0.84, label: '76' },
  { kind: 'grade', sx: 540, sy: 150, r: 55, delay: 1.01 },
  { kind: 'paper', sx: -300, sy: -380, r: -60, delay: 1.18 },
  { kind: 'badge', sx: 300, sy: -380, r: 30, delay: 1.35, label: 'ОГЭ' },
  { kind: 'book', sx: -420, sy: 230, r: -45, delay: 1.52, label: 'ЕГЭ' },
  { kind: 'paper', sx: 420, sy: 260, r: 25, delay: 1.69 },
  { kind: 'badge', sx: 0, sy: -400, r: -30, delay: 1.86, label: '5' },
  { kind: 'grade', sx: -640, sy: -140, r: 50, delay: 2.03 },
  { kind: 'paper', sx: 620, sy: -110, r: -15, delay: 2.2 },
  { kind: 'book', sx: 160, sy: -370, r: 35, delay: 2.37, label: 'ЕГЭ' },
];
const THREADS = [
  { d: 'M 77 80 C 298 40, 720 180, 640 440', color: '#b79bff', delay: 0.4 },
  { d: 'M 1203 112 C 982 72, 560 196, 640 440', color: '#ff9a3c', delay: 0.75 },
  { d: 'M 51 496 C 286 456, 720 388, 640 440', color: '#7dff9a', delay: 1.1 },
  { d: 'M 1229 464 C 994 424, 560 372, 640 440', color: '#ff6bd6', delay: 1.45 },
  { d: 'M 640 -16 C 580 -56, 720 132, 640 440', color: '#7ec8ff', delay: 1.8 },
];
const SPARKS = [
  [230, 240, 0],
  [1024, 224, 0.5],
  [358, 592, 1],
  [921, 560, 0.3],
  [665, 80, 0.9],
];
// [x offset, size, duration, delay]
const BUBBLES = [
  [-50, 12, 1.6, 0],
  [-22, 9, 1.8, 0.35],
  [8, 14, 2, 0.7],
  [38, 10, 2.2, 1.05],
  [60, 8, 2.4, 1.4],
  [-8, 7, 2.6, 1.75],
];
// [left edge offset, flicker period]
const FLAMES = [
  [-66, 0.5],
  [-22, 0.62],
  [22, 0.74],
];
const SPARKLE = 'M12 1l2.6 8.4L23 12l-8.4 2.6L12 23l-2.6-8.4L1 12l8.4-2.6z';

function Flying({ item }: { item: Item }) {
  const at: CSSProperties & Record<string, string | number> = {
    position: 'absolute',
    left: 0,
    top: 0,
    '--sx': `${item.sx}px`,
    '--sy': `${item.sy}px`,
    '--r': `${item.r}deg`,
    animation: `hwFly 1.9s cubic-bezier(.4,0,.6,1) ${item.delay}s both`,
  };
  const shadow = '0 4px 12px rgba(0,0,0,.35)';
  const lines = 'repeating-linear-gradient(#cfd0e0 0 2px, transparent 2px 9px)';
  return (
    <div style={at}>
      {item.kind === 'paper' && (
        <div
          style={{
            width: 54,
            height: 70,
            margin: '-35px 0 0 -27px',
            background: '#fff',
            borderRadius: 4,
            boxShadow: shadow,
            padding: '9px 8px',
            boxSizing: 'border-box',
            backgroundImage: lines,
            backgroundOrigin: 'content-box',
            backgroundClip: 'content-box',
          }}
        />
      )}
      {item.kind === 'grade' && (
        <div
          style={{
            width: 54,
            height: 70,
            margin: '-35px 0 0 -27px',
            background: '#fff',
            borderRadius: 4,
            boxShadow: shadow,
            padding: 8,
            boxSizing: 'border-box',
            font: '800 22px Manrope, sans-serif',
            color: '#d6342c',
            textAlign: 'right',
          }}
        >
          5
          <div
            style={{
              marginTop: 4,
              height: 30,
              backgroundImage: 'repeating-linear-gradient(#cfd0e0 0 2px, transparent 2px 8px)',
            }}
          />
        </div>
      )}
      {item.kind === 'book' && (
        <div
          style={{
            width: 60,
            height: 78,
            margin: '-39px 0 0 -30px',
            background: '#7357db',
            borderRadius: '4px 8px 8px 4px',
            boxShadow: '0 4px 12px rgba(0,0,0,.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            font: '800 13px Manrope, sans-serif',
            color: '#fff',
            borderLeft: '7px dotted #d7ccff',
          }}
        >
          {item.label}
        </div>
      )}
      {item.kind === 'badge' && (
        <div
          style={{
            width: 50,
            height: 50,
            margin: '-25px 0 0 -25px',
            background: '#ff7a1a',
            borderRadius: 10,
            boxShadow: '0 4px 12px rgba(0,0,0,.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            font: '800 18px Manrope, sans-serif',
            color: '#1a0b2e',
          }}
        >
          {item.label}
        </div>
      )}
    </div>
  );
}

/** The 4-second potion scene shown when a student presses «Воспользоваться магией». */
export function Brew() {
  return (
    <div
      role="status"
      aria-label="Варим зелье"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        overflow: 'hidden',
        animation: 'hwBgIn .6s ease both',
        background: 'radial-gradient(70% 70% at 50% 55%, #3a1f6b 0%, #1a0b2e 60%, #0b0616 100%)',
      }}
    >
      <div style={{ position: 'absolute', left: '50%', top: '55%', width: 0, height: 0 }}>
        <div
          style={{
            position: 'absolute',
            left: -234,
            top: -234,
            width: 468,
            height: 468,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(125,255,154,.30), rgba(125,255,154,0) 65%)',
          }}
        />
      </div>
      <svg
        viewBox="0 0 1280 800"
        preserveAspectRatio="xMidYMid slice"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        aria-hidden="true"
      >
        {THREADS.map((thread) => (
          <path
            key={thread.color}
            d={thread.d}
            fill="none"
            stroke={thread.color}
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeDasharray="900"
            style={{ animation: `hwThread 2.4s ease-in-out ${thread.delay}s both` }}
          />
        ))}
        {SPARKS.map(([x, y, delay]) => (
          <path
            key={`${x}${y}`}
            className="hw-sp"
            d={SPARKLE}
            fill="#ffd36b"
            transform={`translate(${x} ${y})`}
            style={{ animationDelay: `${delay}s` }}
          />
        ))}
      </svg>
      <div style={{ position: 'absolute', left: '50%', top: '55%', width: 0, height: 0 }}>
        {FLAMES.map(([x, duration]) => (
          <svg
            key={x}
            width="44"
            height="70"
            viewBox="0 0 44 70"
            style={{
              position: 'absolute',
              left: x,
              top: 179,
              transformOrigin: '50% 100%',
              animation: `hwFlame ${duration}s ease-in-out infinite`,
            }}
          >
            <path
              d="M22 2C30 20 42 30 40 48 38 62 30 68 22 68 14 68 6 62 4 48 2 34 14 28 22 2Z"
              fill="#ff7a1a"
            />
            <path
              d="M22 26C27 38 34 44 32 55 30 63 26 66 22 66 18 66 14 63 12 55 10 46 18 40 22 26Z"
              fill="#ffd36b"
            />
          </svg>
        ))}
        <div
          style={{
            position: 'absolute',
            left: -130,
            top: -55,
            width: 260,
            height: 260,
            animation: 'hwCauldronIn .8s cubic-bezier(.2,.8,.2,1) .15s both',
          }}
        >
          <svg width="260" height="260" viewBox="0 0 512 512" style={{ display: 'block' }}>
            <g style={{ color: '#2a1850' }}>
              <path fill="currentColor" d={ART.cauldron} />
            </g>
          </svg>
          <div
            style={{
              position: 'absolute',
              left: 44,
              top: 38,
              width: 172,
              height: 31,
              borderRadius: '50%',
              background: 'radial-gradient(ellipse, #a8ffbe 0%, #4ed97a 70%)',
              boxShadow: '0 0 30px rgba(125,255,154,.8)',
            }}
          />
        </div>
        {[-64, -24, 16].map((x, index) => (
          <span
            key={x}
            style={{
              position: 'absolute',
              left: x,
              top: -20,
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(190,255,210,.55), rgba(190,255,210,0))',
              animation: `hwSteam ${2.6 + index * 0.4}s ease-out ${index * 0.6}s infinite`,
            }}
          />
        ))}
        {BUBBLES.map(([x, size, duration, delay]) => (
          <span
            key={x}
            style={{
              position: 'absolute',
              left: x,
              top: -6,
              width: size,
              height: size,
              borderRadius: '50%',
              border: '2px solid rgba(160,255,190,.9)',
              background: 'rgba(125,255,154,.25)',
              animation: `hwBubble ${duration}s ease-out ${delay}s infinite`,
            }}
          />
        ))}
        {ITEMS.map((item) => (
          <Flying key={`${item.sx}${item.sy}`} item={item} />
        ))}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: 80,
            height: 80,
            borderRadius: '50%',
            background: 'radial-gradient(circle, #ffffff 0%, #b9ffcf 40%, rgba(185,255,207,0) 70%)',
            animation: 'hwBurst .9s ease-out 3s both',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: -320,
            width: 640,
            top: 285,
            textAlign: 'center',
            font: '800 20px Manrope, sans-serif',
            color: '#f3ecff',
            letterSpacing: '.02em',
          }}
        >
          Варим зелье
          {[0, 0.2, 0.4].map((delay) => (
            <span key={delay} style={{ animation: `hwDots 1.2s ${delay}s infinite` }}>
              .
            </span>
          ))}
        </div>
        <div
          style={{
            position: 'absolute',
            left: -320,
            width: 640,
            top: 315,
            textAlign: 'center',
            font: '600 13px Manrope, sans-serif',
            color: '#b9a8d8',
          }}
        >
          сейчас всё станет по-другому
        </div>
      </div>
    </div>
  );
}
