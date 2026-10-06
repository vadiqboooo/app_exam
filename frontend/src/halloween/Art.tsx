import type { CSSProperties } from 'react';
import { ART, type ArtName } from './shapes';

/** One shape from the Halloween set, placed with the same translate/scale the designs use. */
export function Art({
  name,
  x = 0,
  y = 0,
  s = 1,
  flip = false,
  color,
  opacity = 1,
  className,
  style,
}: {
  name: ArtName;
  x?: number;
  y?: number;
  s?: number;
  flip?: boolean;
  color?: string;
  opacity?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <g
      className={className}
      transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`}
      style={{ color, ...style }}
      opacity={opacity}
    >
      <path fill="currentColor" d={ART[name]} />
    </g>
  );
}

/** Twinkling stars: [x, y, radius, delay, duration]. */
export function Stars({ points, fill = '#ffd9a0' }: { points: number[][]; fill?: string }) {
  return (
    <g fill={fill}>
      {points.map(([cx, cy, r, delay = 0, duration = 3], index) => (
        <circle
          key={index}
          className="hw-tw"
          cx={cx}
          cy={cy}
          r={r}
          style={{ animationDelay: `${delay}s`, animationDuration: `${duration}s` }}
        />
      ))}
    </g>
  );
}

/** A bat that drifts across and flaps; wraps `Art` in the two animation layers. */
export function Bat({
  x,
  y,
  s,
  drift = 8,
  delay = 0,
  flap = 0.5,
}: {
  x: number;
  y: number;
  s: number;
  drift?: number;
  delay?: number;
  flap?: number;
}) {
  return (
    <g className="hw-dr" style={{ animationDuration: `${drift}s`, animationDelay: `${delay}s` }}>
      <g className="hw-fp" style={{ animationDuration: `${flap}s` }}>
        <Art name="bat" x={x} y={y} s={s} color="#07030f" />
      </g>
    </g>
  );
}

/** Glow that breathes behind a pumpkin or the moon. */
export function Glow({
  id,
  cx,
  cy,
  r,
  duration = 4,
  delay = 0,
}: {
  id: string;
  cx: number;
  cy: number;
  r: number;
  duration?: number;
  delay?: number;
}) {
  return (
    <g className="hw-br" style={{ animationDuration: `${duration}s`, animationDelay: `${delay}s` }}>
      <circle cx={cx} cy={cy} r={r} fill={`url(#${id})`} />
    </g>
  );
}

export function GlowDefs({
  prefix,
  orange = 0.38,
  moon = 0.26,
}: {
  prefix: string;
  orange?: number;
  moon?: number;
}) {
  return (
    <defs>
      <radialGradient id={`${prefix}Glow`}>
        <stop offset="0" stopColor="#ff7a1a" stopOpacity={orange} />
        <stop offset="1" stopColor="#ff7a1a" stopOpacity="0" />
      </radialGradient>
      <radialGradient id={`${prefix}GlowM`}>
        <stop offset="0" stopColor="#ffb25c" stopOpacity={moon} />
        <stop offset="1" stopColor="#ffb25c" stopOpacity="0" />
      </radialGradient>
    </defs>
  );
}

export const CREDIT = 'Иконки: game-icons.net (Lorc, Delapouite) · CC BY 3.0';
