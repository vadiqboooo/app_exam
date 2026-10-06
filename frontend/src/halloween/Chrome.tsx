import { BarChart3, CalendarDays } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { Art, Bat, CREDIT, Glow, GlowDefs, Stars } from './Art';

/** Night sky at the top of the student's home screen (the design is 390×360). */
export function HwSky() {
  return (
    <svg className="hw-sky" viewBox="0 0 390 360" aria-hidden="true">
      <GlowDefs prefix="sk" orange={0.35} moon={0.22} />
      <circle cx="300" cy="74" r="100" fill="url(#skGlowM)" />
      <Art name="moon" x={250} y={24} s={0.1953125} color="#ffd9a0" opacity={0.96} />
      <Stars
        points={[
          [190, 40, 1.8],
          [250, 150, 1.5],
          [120, 90, 1.5],
          [360, 170, 1.6],
        ]}
      />
      <Art name="cobweb" s={0.25390625} color="#ffffff" opacity={0.18} />
      <Bat x={205} y={86} s={0.0859375} drift={8} />
      <Bat x={330} y={150} s={0.06640625} drift={6.5} delay={-2} flap={0.42} />
    </svg>
  );
}

/** Graveyard and pumpkins at the bottom of the student's home screen (350×84). */
export function HwGround() {
  return (
    <svg className="hw-ground" viewBox="0 0 350 84" aria-hidden="true">
      <GlowDefs prefix="gr" />
      <circle cx="60" cy="52" r="46" fill="url(#grGlow)" />
      <Art name="graves" x={125} y={10} s={0.14453125} color="#1a0f30" />
      <g className="hw-fk">
        <Art name="pumpkin" x={12} y={10} s={0.125} color="#ff8f33" />
      </g>
      <g className="hw-fk" style={{ animationDuration: '3s', animationDelay: '-0.8s' }}>
        <Art name="pumpkin" x={276} y={36} s={0.0859375} color="#ff8f33" />
      </g>
      <Art name="cat" x={262} y={34} s={0.08984375} flip color="#1a0f30" />
      <Stars
        fill="#ffd9a0"
        points={[
          [110, 14, 2],
          [190, 8, 1.6],
          [320, 20, 2],
        ]}
      />
      <text x="175" y="82" textAnchor="middle" fontSize="8" fontFamily="Manrope, sans-serif" fill="#7a6a9c">
        {CREDIT}
      </text>
    </svg>
  );
}

/** Soft stars and a glow for the inner screens that have their own header (booking, ball, result). */
export function HwBackdrop({ moon = true }: { moon?: boolean }) {
  return (
    <svg
      className="hw-backdrop"
      viewBox="0 0 390 844"
      preserveAspectRatio="xMidYMin slice"
      aria-hidden="true"
    >
      <GlowDefs prefix="bd" />
      {moon && <Glow id="bdGlowM" cx={330} cy={80} r={110} duration={4} />}
      <Stars
        points={[
          [30, 110, 1.6, 0, 3],
          [200, 40, 1.4, 0.8, 2.6],
          [310, 150, 1.6, 1.4, 3.2],
          [90, 300, 1.3, 0.4, 2.8],
          [360, 330, 1.5, 1.2, 3.1],
          [40, 500, 1.3, 0.9, 3],
          [350, 560, 1.4, 1.6, 2.7],
        ]}
      />
      <Art name="cobweb" s={0.29296875} color="#ffffff" opacity={0.1} />
      <Bat x={250} y={700} s={0.05859375} drift={8} />
    </svg>
  );
}

/** The two tabs of the student's cabinet. */
export function HwNav() {
  return (
    <nav className="hw-nav" aria-label="Разделы">
      <NavLink to="/available" className={({ isActive }) => (isActive ? 'is-active' : '')}>
        <CalendarDays size={22} />
        Пробники
      </NavLink>
      <NavLink to="/my-results" end className={({ isActive }) => (isActive ? 'is-active' : '')}>
        <BarChart3 size={22} />
        Результаты
      </NavLink>
    </nav>
  );
}
