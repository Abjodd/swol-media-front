import { useMemo } from 'react';

// Realistic cracked-glass background for the hero logo.
// - Fine radial cracks that wander, fork and taper toward their ends
// - Irregular concentric fractures, dense near the impact and rare further out
// - A crushed, powdery impact point with micro-cracks
// - Shards stay in the pane, barely misaligned, each catching light differently
// Every crack is drawn twice (dark refraction line + bright edge) to suggest glass thickness.
// Cracks appear in the order a real fracture travels: outward from the impact.

// IMPACT = where the arm starts (the cut-off shoulder end of the bicep), in SVG units from the centre.
// Worked out from the logo artwork: shoulder at (2120, 1770) in the 3500px source image.
export const IMPACT = [26.3, 4.9];

function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SPEED = 0.0042; // seconds per SVG unit of crack travel
const f = (n) => n.toFixed(2);

function buildGlass(seed, ox, oy) {
  const rand = rng(seed);
  const segs = []; // individual crack segments {x1,y1,x2,y2,w,o,t}
  const dist = (x, y) => Math.hypot(x - ox, y - oy);

  // Walk a crack from (x,y) at angle a for length len, with natural wobble and taper.
  function walk(x, y, a, len, w0, depth, out) {
    let travelled = 0;
    const pts = [[x, y]];
    while (travelled < len) {
      const step = 2.2 + rand() * 4.5;
      a += (rand() - 0.5) * 0.32; // wobble
      const nx = x + Math.cos(a) * step;
      const ny = y + Math.sin(a) * step;
      const k = 1 - travelled / len; // taper 1 → 0
      const w = Math.max(0.08, w0 * (0.25 + 0.75 * k));
      segs.push({ x1: x, y1: y, x2: nx, y2: ny, w, o: 0.45 + 0.5 * k, t: dist(x, y) * SPEED });
      x = nx;
      y = ny;
      pts.push([x, y]);
      travelled += step;
      // forks
      if (depth < 2 && travelled > 8 && rand() < 0.07 - depth * 0.03) {
        const side = rand() < 0.5 ? -1 : 1;
        walk(x, y, a + side * (0.35 + rand() * 0.55), len * (0.15 + rand() * 0.3), w * 0.75, depth + 1, null);
      }
    }
    if (out) out.push(pts);
  }

  // 1) Radial cracks
  const RAYS = 26;
  const radial = [];
  for (let i = 0; i < RAYS; i++) {
    const a = ((i + (rand() - 0.5) * 0.8) / RAYS) * Math.PI * 2;
    const len = 55 + rand() * 80;
    walk(ox + Math.cos(a) * 1.5, oy + Math.sin(a) * 1.5, a, len, 0.55 + rand() * 0.35, 0, radial);
  }

  // point on a radial crack closest to radius r
  const at = (pts, r) => {
    let best = pts[0];
    let bd = Infinity;
    for (const p of pts) {
      const d = Math.abs(dist(p[0], p[1]) - r);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return dist(best[0], best[1]) > r * 0.6 ? best : null;
  };

  // 2) Concentric fractures — irregular chords between neighbouring radial cracks
  const rings = [];
  let r = 3.5;
  while (r < 75) {
    rings.push(r);
    r *= 1.32 + rand() * 0.18;
  }
  const ringPts = rings.map(() => []);
  rings.forEach((r0, ri) => {
    const keep = Math.max(0.05, 1 - (r0 / 70) ** 1.1);
    for (let j = 0; j < RAYS; j++) {
      const A = at(radial[j], r0 * (0.85 + rand() * 0.3));
      const B = at(radial[(j + 1) % RAYS], r0 * (0.85 + rand() * 0.3));
      ringPts[ri][j] = A;
      if (!A || !B || rand() > keep) continue;
      // two-piece chord with a slight kink
      const mx = (A[0] + B[0]) / 2 + (rand() - 0.5) * r0 * 0.12;
      const my = (A[1] + B[1]) / 2 + (rand() - 0.5) * r0 * 0.12;
      const w = Math.max(0.08, 0.38 - r0 * 0.004) * (0.6 + rand() * 0.6);
      const t = dist(mx, my) * SPEED + 0.05;
      const o = 0.35 + rand() * 0.45;
      segs.push({ x1: A[0], y1: A[1], x2: mx, y2: my, w, o, t });
      segs.push({ x1: mx, y1: my, x2: B[0], y2: B[1], w, o, t });
    }
  });

  // 3) Micro-cracks around the impact (crushed zone)
  for (let i = 0; i < 70; i++) {
    const a = rand() * Math.PI * 2;
    const d0 = rand() * 9;
    const x = ox + Math.cos(a) * d0;
    const y = oy + Math.sin(a) * d0;
    const b = a + (rand() - 0.5) * 2.4;
    const l = 0.8 + rand() * 2.6;
    segs.push({ x1: x, y1: y, x2: x + Math.cos(b) * l, y2: y + Math.sin(b) * l, w: 0.1 + rand() * 0.12, o: 0.5 + rand() * 0.4, t: d0 * SPEED });
  }

  // 4) Shards — cells between radial cracks and rings; barely shifted, each with its own reflection
  const shards = [];
  for (let ri = 0; ri < rings.length - 1; ri++) {
    for (let j = 0; j < RAYS; j++) {
      const k = (j + 1) % RAYS;
      const a = ringPts[ri][j], b = ringPts[ri][k], c = ringPts[ri + 1][k], d = ringPts[ri + 1][j];
      if (!a || !b || !c || !d) continue;
      const cx = (a[0] + b[0] + c[0] + d[0]) / 4;
      const cy = (a[1] + b[1] + c[1] + d[1]) / 4;
      const len = dist(cx, cy) || 1;
      const shift = 0.15 + rand() * 0.55; // tiny misalignment, like real cracked glass
      shards.push({
        d: `M${f(a[0])},${f(a[1])}L${f(b[0])},${f(b[1])}L${f(c[0])},${f(c[1])}L${f(d[0])},${f(d[1])}Z`,
        dx: f(((cx - ox) / len) * shift),
        dy: f(((cy - oy) / len) * shift),
        g: Math.floor(rand() * 4), // which reflection gradient
        o: rand() < 0.22 ? 0.55 + rand() * 0.45 : rand() * 0.28,
        t: (len * SPEED + 0.05).toFixed(3),
      });
    }
  }

  return { segs, shards };
}

export default function GlassShatter({ seed = 11, burst = 0, impact = IMPACT }) {
  const [ox, oy] = impact;
  const { segs, shards } = useMemo(() => buildGlass(seed, ox, oy), [seed, ox, oy]);
  const reflections = [20, 65, 120, 160];

  return (
    <svg key={burst} className="glass" viewBox="-100 -100 200 200" aria-hidden="true">
      <defs>
        {reflections.map((deg, i) => (
          <linearGradient key={i} id={`gRef${i}`} gradientTransform={`rotate(${deg} .5 .5)`}>
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="45%" stopColor="#dfe9ff" stopOpacity="0.16" />
            <stop offset="52%" stopColor="#ffffff" stopOpacity="0.32" />
            <stop offset="60%" stopColor="#dfe9ff" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
        ))}
        <radialGradient id="gFade" cx={ox} cy={oy} r="105" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#fff" />
          <stop offset="45%" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <mask id="gMask">
          <circle cx={ox} cy={oy} r="105" fill="url(#gFade)" />
        </mask>
        <radialGradient id="gCrush" cx={ox} cy={oy} r="9" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#f4f8ff" stopOpacity="0.75" />
          <stop offset="40%" stopColor="#dbe6ff" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#dbe6ff" stopOpacity="0" />
        </radialGradient>
        <filter id="gGrain" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="2.4" numOctaves="2" seed="4" result="n" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1.6 -0.55" result="g" />
          <feComposite in="g" in2="SourceGraphic" operator="in" />
        </filter>
      </defs>

      <g mask="url(#gMask)">
        {/* shards catching light */}
        <g className="g-shards">
          {shards.map((s, i) => (
            <path
              key={i}
              d={s.d}
              fill={`url(#gRef${s.g})`}
              className="g-shard"
              style={{ '--o': s.o, '--dx': `${s.dx}px`, '--dy': `${s.dy}px`, '--t': `${s.t}s` }}
            />
          ))}
        </g>

        {/* dark refraction line under each crack (glass thickness) */}
        <g className="g-cracks-dark">
          {segs.map((s, i) => (
            <line
              key={i}
              x1={f(s.x1 + 0.18)} y1={f(s.y1 + 0.22)} x2={f(s.x2 + 0.18)} y2={f(s.y2 + 0.22)}
              strokeWidth={f(s.w * 1.8)}
              style={{ '--t': `${s.t.toFixed(3)}s` }}
            />
          ))}
        </g>

        {/* bright crack edges */}
        <g className="g-cracks">
          {segs.map((s, i) => (
            <line
              key={i}
              x1={f(s.x1)} y1={f(s.y1)} x2={f(s.x2)} y2={f(s.y2)}
              strokeWidth={f(s.w)}
              style={{ '--t': `${s.t.toFixed(3)}s`, '--o': s.o.toFixed(2) }}
            />
          ))}
        </g>

        {/* crushed impact point */}
        <g className="g-crush">
          <circle cx={ox} cy={oy} r="9" fill="url(#gCrush)" />
          <circle cx={ox} cy={oy} r="7" fill="#fff" filter="url(#gGrain)" opacity="0.55" />
        </g>
      </g>
    </svg>
  );
}
