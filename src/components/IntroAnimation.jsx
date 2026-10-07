import { useEffect, useRef } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Landing intro, drawn live on a <canvas> (no video file):
//   1. a thin vertical line of light opens in the centre
//   2. "SWOL · MEDIA · ENTERTAINMENT" spins out of the line, letter by letter
//   3. the letters form a 3D ring, tilted, revolving around the line
//   4. the arm with the phone punches through from behind — the glass shatters
//   5. the ring turns to face the camera and settles round the arm: the logo,
//      with soft smoke, a back light and a few drifting shards
// Black & white only. Respects "reduce motion" (shows the final frame).
// ─────────────────────────────────────────────────────────────────────────────

const TEXT = 'SWOL · MEDIA · ENTERTAINMENT · ';
const FONT = '"Arial Black", "Archivo Black", "Swol Display", "Helvetica Neue", Arial, sans-serif';
const T = {
  lineIn: 0.8, // vertical line grows
  emerge0: 0.55, // first letter leaves the line
  step: 0.042, // gap between letters
  fly: 1.15, // each letter's flight out to the ring
  tilt0: 3.7, // ring starts turning to face the camera
  tilt1: 5.7, // …and faces it
  punch0: 4.0, // arm starts coming in from behind
  impact: 4.5, // glass breaks
  settle: 5.9, // ring comes to rest in the logo position
};
const TILT = -0.98; // rad: ring leaning back (top far away) while it revolves
const REST_TILT = -0.2; // a slight lean when settled, so the letters' depth shows
const SLOW = (Math.PI * 2) / 70; // gentle turn once settled, rad/s
const SPIN_A = 0.17; // spin slows down smoothly into the settled position
const DEPTH = 6; // extrusion layers for the 3D letters

const clamp = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOut = (t) => 1 - Math.pow(1 - clamp(t), 3);
const easeIn = (t) => Math.pow(clamp(t), 2.2);
const easeInOut = (t) => {
  t = clamp(t);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};
const easeOutBack = (t) => {
  t = clamp(t);
  const c = 1.9;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};
const lerp = (a, b, t) => a + (b - a) * t;

function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Sutherland–Hodgman: clip a polygon to an axis-aligned rectangle
function clipRect(pts, x0, y0, x1, y1) {
  const edges = [(p) => p[0] >= x0, (p) => p[0] <= x1, (p) => p[1] >= y0, (p) => p[1] <= y1];
  const cross = [
    (a, b) => [x0, a[1] + ((b[1] - a[1]) * (x0 - a[0])) / (b[0] - a[0])],
    (a, b) => [x1, a[1] + ((b[1] - a[1]) * (x1 - a[0])) / (b[0] - a[0])],
    (a, b) => [a[0] + ((b[0] - a[0]) * (y0 - a[1])) / (b[1] - a[1]), y0],
    (a, b) => [a[0] + ((b[0] - a[0]) * (y1 - a[1])) / (b[1] - a[1]), y1],
  ];
  let out = pts;
  for (let e = 0; e < 4 && out.length; e++) {
    const inp = out;
    out = [];
    for (let i = 0; i < inp.length; i++) {
      const a = inp[i], b = inp[(i + 1) % inp.length];
      const ain = edges[e](a), bin = edges[e](b);
      if (ain) out.push(a);
      if (ain !== bin) out.push(cross[e](a, b));
    }
  }
  return out;
}

export default function IntroAnimation({ onSettled }) {
  const ref = useRef(null);

  useEffect(() => {
    const cv = ref.current;
    const ctx = cv.getContext('2d');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const arm = new Image();
    let armDark = null; // the arm in shadow, for when it is still behind the glass
    arm.onload = () => {
      const c = document.createElement('canvas');
      c.width = arm.naturalWidth;
      c.height = arm.naturalHeight;
      const x = c.getContext('2d');
      x.drawImage(arm, 0, 0);
      x.globalCompositeOperation = 'source-atop';
      x.fillStyle = 'rgba(0,0,0,0.72)';
      x.fillRect(0, 0, c.width, c.height);
      armDark = c;
      if (reduce && L) requestAnimationFrame(frame);
    };
    arm.src = '/brand/arm.png';
    let W = 0, H = 0, dpr = 1, L = null, raf = 0, t0 = null, settledSent = false;

    // ── layout (recomputed on resize) ──────────────────────────────────────
    function build() {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = window.innerWidth;
      H = window.innerHeight;
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      cv.style.width = `${W}px`;
      cv.style.height = `${H}px`;

      const R = Math.min(W * (W < 600 ? 0.37 : 0.3), H * 0.3, 330); // ring radius (text centre line)
      const cx = W / 2, cy = H / 2;
      const fs = R * 0.205; // font size
      const F = R * 3.2; // camera distance, for perspective
      ctx.font = `800 ${fs}px ${FONT}`;
      const circ = Math.PI * 2 * R;
      const widths = [...TEXT].map((c) => ctx.measureText(c).width);
      const gap = (circ - widths.reduce((a, w) => a + w, 0)) / widths.length; // spread round the full circle
      const rand = rng(7);
      let s = 0;
      const chars = [...TEXT].map((c, i) => {
        const phi = ((s + widths[i] / 2) / circ) * Math.PI * 2; // clockwise from the top
        s += widths[i] + gap;
        return { c, phi, lineY: (rand() - 0.5) * H * 0.42, born: T.emerge0 + i * T.step, swirl: 1.3 + rand() * 0.9 };
      });
      const top = chars[5].phi; // the dot between SWOL and MEDIA sits at 12 o'clock
      for (const ch of chars) ch.phi -= top;

      // glass shards around the impact point
      const I = [cx, cy - R * 0.05];
      const reach = Math.hypot(Math.max(I[0], W - I[0]), Math.max(I[1], H - I[1])) * 1.08;
      const RAYS = 26;
      const angles = Array.from({ length: RAYS }, (_, i) => ((i + (rand() - 0.5) * 0.7) / RAYS) * Math.PI * 2);
      const radii = [0.035, 0.08, 0.14, 0.22, 0.32, 0.44, 0.58, 0.75, 0.94, 1.15].map((f) => f * reach);
      const grid = radii.map((r) =>
        angles.map((a) => {
          const rr = r * (0.82 + rand() * 0.36), aa = a + (rand() - 0.5) * 0.1;
          return [I[0] + Math.cos(aa) * rr, I[1] + Math.sin(aa) * rr];
        })
      );
      const shards = [];
      for (let j = 0; j < RAYS; j++) {
        const k = (j + 1) % RAYS;
        for (let i = -1; i < radii.length - 1; i++) {
          const poly = i < 0 ? [I, grid[0][j], grid[0][k]] : [grid[i][j], grid[i + 1][j], grid[i + 1][k], grid[i][k]];
          const c = clipRect(poly, 0, 0, W, H);
          if (c.length < 3) continue;
          const gx = c.reduce((a, p) => a + p[0], 0) / c.length, gy = c.reduce((a, p) => a + p[1], 0) / c.length;
          const dx = gx - I[0], dy = gy - I[1], d = Math.hypot(dx, dy) || 1;
          const linger = d > R * 0.6 && rand() < 0.08; // a few fragments stay and drift
          shards.push({
            pts: c.map((p) => [p[0] - gx, p[1] - gy]),
            g: [gx, gy],
            d,
            dir: [dx / d, dy / d],
            speed: linger ? 6 + rand() * 14 : (240 + rand() * 760) * (0.6 + d / (R * 2)),
            vz: linger ? 0.004 + rand() * 0.012 : 0.7 + rand() * 2.6,
            spin: (rand() - 0.5) * (linger ? 0.3 : 5),
            life: linger ? 1e9 : 1.0 + rand() * 1.2,
            shade: 0.05 + rand() * 0.16,
            edge: 0.35 + rand() * 0.55,
            linger,
            delay: (d / reach) * 0.2,
          });
        }
      }
      // crack lines that race out from the impact just before the glass gives way
      const cracks = angles.map((a) => {
        const pts = [I];
        let r = 0;
        while (r < reach * 0.9) {
          r += reach * (0.05 + rand() * 0.08);
          const aa = a + (rand() - 0.5) * 0.12;
          pts.push([I[0] + Math.cos(aa) * r, I[1] + Math.sin(aa) * r]);
        }
        return pts;
      });
      const dust = Array.from({ length: 170 }, () => ({ a: rand() * Math.PI * 2, sp: 250 + rand() * 900, r0: rand() * R * 0.4, size: 0.6 + rand() * 1.8, life: 0.6 + rand() * 1.4, lag: rand() * 0.15 }));
      const stars = Array.from({ length: 60 }, () => ({ x: rand() * W, y: rand() * H, vx: (rand() - 0.5) * 5, vy: -1 - rand() * 5, size: 0.4 + rand() * 1.3, tw: rand() * 6 }));
      const sparks = Array.from({ length: 26 }, () => ({ y: (rand() - 0.5) * H * 0.5, a: rand() * Math.PI * 2, sp: 30 + rand() * 120, life: 0.5 + rand() * 0.9, t: T.emerge0 + rand() * 2.2 }));
      const rays = Array.from({ length: 14 }, () => ({ a: rand() * Math.PI * 2, len: 0.4 + rand() * 0.6, w: 0.5 + rand() * 1.2, al: 0.15 + rand() * 0.35 }));
      const smoke = Array.from({ length: 9 }, (_, i) => ({ x: (i / 8) * W + (rand() - 0.5) * W * 0.1, y: H * (0.72 + rand() * 0.35), r: Math.max(W, H) * (0.18 + rand() * 0.16), vx: (rand() - 0.5) * 10, a: 0.05 + rand() * 0.05, ph: rand() * 6 }));
      L = { R, cx, cy, fs, F, chars, I, reach, shards, cracks, dust, stars, sparks, rays, smoke };
    }

    // ── the ring in 3D ─────────────────────────────────────────────────────
    function pose(t) {
      const tilt = lerp(TILT, REST_TILT, easeInOut((t - T.tilt0) / (T.tilt1 - T.tilt0)));
      const yaw = 0.3 * Math.sin(t * 0.9 + 0.6) * (1 - easeInOut((t - T.tilt0) / (T.tilt1 - T.tilt0)));
      const spin = t < T.settle ? -SPIN_A * (T.settle - t) ** 2 : (t - T.settle) * SLOW;
      return { ca: Math.cos(tilt), sa: Math.sin(tilt), cb: Math.cos(yaw), sb: Math.sin(yaw), spin };
    }
    // plane coordinates (x right, y down, z away) → world, after tilt (about x) and yaw (about y)
    const rot = (P, x, y, z) => {
      const y1 = y * P.ca - z * P.sa, z1 = y * P.sa + z * P.ca;
      return [x * P.cb + z1 * P.sb, y1, -x * P.sb + z1 * P.cb];
    };
    const proj = (v) => {
      const s = L.F / (L.F + v[2]);
      return [L.cx + v[0] * s, L.cy + v[1] * s, s];
    };

    // where each letter is at time t (or null before it is born)
    function letters(t) {
      const P = pose(t);
      const N = rot(P, 0, 0, 1);
      const out = [];
      for (const ch of L.chars) {
        const u = (t - ch.born) / T.fly;
        if (u <= 0) continue;
        const e = easeOut(u);
        const phi = ch.phi + P.spin - (1 - e) * ch.swirl;
        const r = L.R * lerp(0.03, 1, e);
        const sn = Math.sin(phi), cs = Math.cos(phi);
        const pos = rot(P, r * sn, -r * cs, 0);
        pos[1] += (1 - e) * ch.lineY; // leaves from a point on the vertical line
        const tan = rot(P, cs, sn, 0);
        const outw = rot(P, sn, -cs, 0);
        out.push({ c: ch.c, pos, tan, outw, N, e, u, scale: lerp(0.35, 1, e) });
      }
      return out;
    }

    function drawLetter(l, alpha, faceOnly, faceFill) {
      const k = l.scale;
      const base = proj(l.pos);
      const ax = proj([l.pos[0] + l.tan[0], l.pos[1] + l.tan[1], l.pos[2] + l.tan[2]]);
      const by = proj([l.pos[0] - l.outw[0], l.pos[1] - l.outw[1], l.pos[2] - l.outw[2]]);
      const a = [(ax[0] - base[0]) * k, (ax[1] - base[1]) * k];
      const b = [(by[0] - base[0]) * k, (by[1] - base[1]) * k];
      const far = clamp(1 - Math.max(0, l.pos[2]) / (L.R * 2.2)); // letters at the back are dimmer
      const A = alpha * lerp(0.45, 1, far) * clamp(l.u * 5);
      if (A <= 0.005) return;
      const dz = L.fs * 0.05;
      if (!faceOnly) {
        // extrusion: copies stepped back along the ring's normal (and a touch downward), darkest at the back
        for (let d = DEPTH; d >= 1; d--) {
          const p = proj([l.pos[0] + l.N[0] * dz * d, l.pos[1] + l.N[1] * dz * d, l.pos[2] + l.N[2] * dz * d]);
          const sh = Math.round(38 + (DEPTH - d) * 14);
          ctx.setTransform(dpr * a[0], dpr * a[1], dpr * b[0], dpr * b[1], dpr * p[0], dpr * (p[1] + d * L.fs * 0.018));
          ctx.globalAlpha = A;
          ctx.fillStyle = `rgb(${sh},${sh + 2},${sh + 6})`;
          ctx.fillText(l.c, 0, 0);
        }
      }
      ctx.setTransform(dpr * a[0], dpr * a[1], dpr * b[0], dpr * b[1], dpr * base[0], dpr * base[1]);
      ctx.globalAlpha = A;
      ctx.fillStyle = faceFill;
      ctx.fillText(l.c, 0, 0);
      // fresh letters burn bright as they leave the line
      if (!faceOnly && l.e < 0.7) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = A * (1 - l.e / 0.7) * 0.8;
        ctx.fillStyle = '#fff';
        ctx.fillText(l.c, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
      }
    }

    // ── frame ───────────────────────────────────────────────────────────────
    function frame(now) {
      if (t0 === null) t0 = now;
      let t = (now - t0) / 1000;
      if (reduce) t = 9;
      if (typeof window.__INTRO_T === 'number') t = window.__INTRO_T; // frozen frame (for previews)
      const { R, cx, cy, fs, I, shards, cracks, dust, stars, sparks, rays, smoke } = L;
      const tau = t - T.impact; // time since impact

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);

      // a short camera shake on impact
      const shake = tau > 0 && tau < 0.35 ? (1 - tau / 0.35) * R * 0.035 : 0;
      const sx = shake ? Math.sin(t * 91) * shake : 0, sy = shake ? Math.cos(t * 77) * shake : 0;
      ctx.setTransform(dpr, 0, 0, dpr, dpr * sx, dpr * sy);

      // soft centre light + faint floating dust
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.6);
      glow.addColorStop(0, `rgba(255,255,255,${0.05 + 0.05 * clamp(tau / 0.6)})`);
      glow.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(-50, -50, W + 100, H + 100);
      for (const m of stars) {
        const x = (m.x + m.vx * t + W) % W, y = (m.y + m.vy * t + H * 10) % H;
        ctx.fillStyle = `rgba(255,255,255,${0.12 + 0.14 * Math.sin(t * 1.3 + m.tw)})`;
        ctx.beginPath();
        ctx.arc(x, y, m.size, 0, Math.PI * 2);
        ctx.fill();
      }

      // back light + rays behind the logo once it has broken through
      const after = easeOut(tau / 1.2);
      if (after > 0) {
        const bl = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 1.9);
        bl.addColorStop(0, `rgba(255,255,255,${0.16 * after})`);
        bl.addColorStop(0.5, `rgba(255,255,255,${0.04 * after})`);
        bl.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = bl;
        ctx.fillRect(-50, -50, W + 100, H + 100);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (const r of rays) {
          const a = r.a + t * 0.04, len = Math.max(W, H) * r.len;
          const g = ctx.createLinearGradient(cx, cy, cx + Math.cos(a) * len, cy + Math.sin(a) * len);
          g.addColorStop(0, `rgba(255,255,255,${0.09 * r.al * after})`);
          g.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.strokeStyle = g;
          ctx.lineWidth = r.w * 3;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
          ctx.stroke();
        }
        ctx.restore();
      }

      // the ring: letters behind the centre are drawn first, the ones in front last
      ctx.font = `800 ${fs}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const face = ctx.createLinearGradient(0, -fs * 0.5, 0, fs * 0.5); // in each letter's own space
      face.addColorStop(0, '#ffffff');
      face.addColorStop(0.55, '#dfe3e8');
      face.addColorStop(1, '#a7aeb7');
      const ls = letters(t).sort((p, q) => q.pos[2] - p.pos[2]);
      const back = ls.filter((l) => l.pos[2] > 0), front = ls.filter((l) => l.pos[2] <= 0);
      // motion trails while the ring is spinning fast
      const trailA = 1 - clamp((t - 3.4) / 0.8);
      if (trailA > 0.01 && !reduce) {
        for (let j = 4; j >= 1; j--) for (const l of letters(t - j * 0.035)) drawLetter(l, 0.1 * trailA * (1 - j / 5), true, '#fff');
      }
      for (const l of back) drawLetter(l, 1, false, face);
      ctx.setTransform(dpr, 0, 0, dpr, dpr * sx, dpr * sy);
      ctx.globalAlpha = 1;

      // the vertical line of light (gone when the glass breaks)
      const lineA = easeOut(t / 0.35) * (1 - clamp((tau + 0.05) / 0.25));
      if (lineA > 0.005) {
        const h = H * 0.36 * easeOut(t / T.lineIn) * (1 + 0.04 * Math.sin(t * 7));
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (const [w, al] of [[16, 0.06], [6, 0.16], [2.2, 0.55], [1, 1]]) {
          const g = ctx.createLinearGradient(0, cy - h, 0, cy + h);
          g.addColorStop(0, 'rgba(220,232,255,0)');
          g.addColorStop(0.5, `rgba(235,242,255,${al * lineA})`);
          g.addColorStop(1, 'rgba(220,232,255,0)');
          ctx.fillStyle = g;
          ctx.fillRect(cx - w / 2, cy - h, w, h * 2);
        }
        // starburst at the centre while letters are thrown out
        const burst = clamp((t - 0.4) / 0.4) * (1 - clamp((t - 2.6) / 0.8)) * lineA;
        if (burst > 0.01) {
          for (let i = 0; i < 12; i++) {
            const a = (i / 12) * Math.PI * 2 + t * 0.7, len = R * (0.35 + 0.25 * Math.sin(i * 2.3 + t * 3));
            const g = ctx.createLinearGradient(cx, cy, cx + Math.cos(a) * len, cy + Math.sin(a) * len);
            g.addColorStop(0, `rgba(255,255,255,${0.45 * burst})`);
            g.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.strokeStyle = g;
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
            ctx.stroke();
          }
          const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.22);
          core.addColorStop(0, `rgba(255,255,255,${0.7 * burst})`);
          core.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = core;
          ctx.fillRect(cx - R * 0.22, cy - R * 0.22, R * 0.44, R * 0.44);
        }
        // sparks flicking off the line
        for (const s of sparks) {
          const st = t - s.t;
          if (st < 0 || st > s.life) continue;
          const x = cx + Math.cos(s.a) * s.sp * st, y = cy + s.y + Math.sin(s.a) * s.sp * st;
          ctx.fillStyle = `rgba(255,255,255,${0.8 * (1 - st / s.life) * lineA})`;
          ctx.fillRect(x - 0.8, y - 0.8, 1.6, 1.6);
        }
        ctx.restore();
      }

      // the arm: in shadow and far back, then punching through
      if (armDark) {
        const size0 = (R / 0.885) * 2; // arm.png shares the ring artwork's square crop
        let scale = 0, lit = 0, A = 0;
        if (t >= T.punch0 && t < T.impact) {
          const p = easeIn((t - T.punch0) / (T.impact - T.punch0));
          scale = lerp(0.22, 1.1, p);
          A = clamp(p * 3) * 0.9;
          lit = p * 0.35;
        } else if (t >= T.impact) {
          scale = lerp(1.1, 1, easeOutBack(tau / 0.7));
          A = 1;
          lit = lerp(0.35, 1, easeOut(tau / 0.35));
        }
        if (A > 0) {
          const size = size0 * scale;
          ctx.globalAlpha = A * (1 - lit);
          ctx.drawImage(armDark, cx - size / 2, cy - size / 2, size, size);
          ctx.globalAlpha = A * lit;
          ctx.drawImage(arm, cx - size / 2, cy - size / 2, size, size);
          ctx.globalAlpha = 1;
        }
      }

      // cracks race out just before the glass gives way
      const crackP = clamp((t - (T.impact - 0.14)) / 0.14);
      if (crackP > 0 && tau < 0.05) {
        ctx.strokeStyle = 'rgba(255,255,255,0.75)';
        ctx.lineWidth = 1;
        for (const c of cracks) {
          const n = Math.max(2, Math.ceil(c.length * crackP));
          ctx.beginPath();
          c.slice(0, n).forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
          ctx.stroke();
        }
      }

      // impact flash, shards flying at the camera, glass dust
      if (tau > 0) {
        if (tau < 0.4) {
          const f = 1 - tau / 0.4;
          const fl = ctx.createRadialGradient(I[0], I[1], 0, I[0], I[1], L.reach * 0.8);
          fl.addColorStop(0, `rgba(255,255,255,${0.3 * f})`);
          fl.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = fl;
          ctx.fillRect(-50, -50, W + 100, H + 100);
        }
        for (const s of shards) {
          const st = Math.max(0, tau - s.delay);
          const life = s.linger ? 1 : 1 - st / s.life;
          if (life <= 0) continue;
          const scale = 1 + s.vz * st;
          const x = I[0] + (s.g[0] - I[0]) * (1 + s.vz * st * 0.35) + s.dir[0] * s.speed * st;
          const y = I[1] + (s.g[1] - I[1]) * (1 + s.vz * st * 0.35) + s.dir[1] * s.speed * st + (s.linger ? 0 : 60 * st * st);
          if (s.linger && (x < -300 || x > W + 300 || y < -300 || y > H + 300)) continue;
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(s.spin * st);
          ctx.scale(scale, scale);
          ctx.beginPath();
          s.pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
          ctx.closePath();
          const a = s.linger ? lerp(1, 0.45, clamp(st / 2)) : life;
          // glass catches the light on one side
          const g = ctx.createLinearGradient(-40, -40, 40, 40);
          g.addColorStop(0, `rgba(255,255,255,${s.shade * a * 0.6})`);
          g.addColorStop(1, `rgba(255,255,255,${s.shade * a * 0.15})`);
          ctx.fillStyle = g;
          ctx.fill();
          ctx.strokeStyle = `rgba(255,255,255,${s.edge * a})`;
          ctx.lineWidth = 1 / scale;
          ctx.stroke();
          ctx.restore();
        }
        if (tau < 3) {
          for (const d of dust) {
            const st = tau - d.lag;
            if (st <= 0 || st > d.life) continue;
            const r = d.r0 + d.sp * st;
            ctx.fillStyle = `rgba(255,255,255,${0.8 * (1 - st / d.life)})`;
            ctx.beginPath();
            ctx.arc(I[0] + Math.cos(d.a) * r, I[1] + Math.sin(d.a) * r + 40 * st * st, d.size, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // letters in front of the centre
      for (const l of front) drawLetter(l, 1, false, face);
      ctx.setTransform(dpr, 0, 0, dpr, dpr * sx, dpr * sy);
      ctx.globalAlpha = 1;

      // smoke drifting along the bottom once it has settled
      const smokeA = easeOut((tau - 0.6) / 2.4);
      if (smokeA > 0) {
        for (const m of smoke) {
          const x = m.x + m.vx * t + Math.sin(t * 0.25 + m.ph) * 30, y = m.y + Math.cos(t * 0.2 + m.ph) * 14;
          const g = ctx.createRadialGradient(x, y, 0, x, y, m.r);
          g.addColorStop(0, `rgba(200,206,214,${m.a * smokeA})`);
          g.addColorStop(1, 'rgba(200,206,214,0)');
          ctx.fillStyle = g;
          ctx.fillRect(x - m.r, y - m.r, m.r * 2, m.r * 2);
        }
      }

      // vignette
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const v = ctx.createRadialGradient(cx, cy, Math.min(W, H) * 0.35, cx, cy, Math.max(W, H) * 0.8);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(0,0,0,0.7)');
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, W, H);

      if (!settledSent && t > T.impact + 1.1) {
        settledSent = true;
        onSettled?.();
      }
      if (!reduce) raf = requestAnimationFrame(frame);
    }

    const start = () => {
      build();
      raf = requestAnimationFrame(frame);
    };
    const onResize = () => build();
    window.addEventListener('resize', onResize);
    // wait (briefly) for the ring font so the first frames use it
    const fontReady = document.fonts?.load ? document.fonts.load(`400 40px "Archivo Black"`).catch(() => {}) : Promise.resolve();
    Promise.race([fontReady, new Promise((r) => setTimeout(r, 900))]).then(start);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, [onSettled]);

  return <canvas ref={ref} className="intro-canvas" role="img" aria-label="Swol Media Entertainment" />;
}
