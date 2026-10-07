import { useState } from 'react';
import { fmtNum } from './ui.jsx';

// Small, dependency-free charts shared by the Overview pages. Black-and-white: one ink series,
// colour only for status, values labelled, every mark has a hover/focus tooltip.

// ── one tooltip for every chart on the page ────────────────────────────────
export function useTip() {
  const [tip, setTip] = useState(null);
  const bind = (value, label) => ({
    tabIndex: 0,
    'aria-label': `${label}: ${value}`,
    onPointerMove: (e) => setTip({ x: e.clientX, y: e.clientY, value, label }),
    onPointerLeave: () => setTip(null),
    onFocus: (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      setTip({ x: r.left + r.width / 2, y: r.top, value, label });
    },
    onBlur: () => setTip(null),
  });
  const node = tip && (
    <div className="ov-tip" style={{ left: tip.x, top: tip.y }} role="status">
      <strong>{tip.value}</strong>
      <span>{tip.label}</span>
    </div>
  );
  return [bind, node];
}

// horizontal bars — one ink series, value at the tip
export function HBars({ rows, tip, unit = 'creators', empty }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.some((r) => r.value)) return <p className="ch-empty">{empty}</p>;
  return (
    <ul className="hb">
      {rows.map((r) => (
        <li key={r.label} {...tip(`${fmtNum(r.value)} ${r.value === 1 ? unit.replace(/s$/, '') : unit}`, r.label + (r.sub ? ` (${r.sub})` : ''))}>
          <span className="hb-label">
            {r.label}
            {r.sub && <small>{r.sub}</small>}
          </span>
          <span className="hb-track">
            <i style={{ width: `${(r.value / max) * 100}%` }} />
          </span>
          <b className="hb-val">{fmtNum(r.value)}</b>
        </li>
      ))}
    </ul>
  );
}

// columns over time — one ink series, the latest value labelled
export function Columns({ cols, tip }) {
  const raw = Math.max(1, ...cols.map((c) => c.value));
  const step = raw <= 4 ? 1 : Math.ceil(raw / 4);
  const max = Math.ceil(raw / step) * step; // clean top tick
  const ticks = [];
  for (let t = 0; t <= max; t += step) ticks.push(t);
  return (
    <div className="col-chart">
      <div className="col-area">
        {ticks.map((t) => (
          <span key={t} className="col-tick" style={{ bottom: `${(t / max) * 100}%` }}>
            <em>{fmtNum(t)}</em>
          </span>
        ))}
        <div className="col-bars">
          {cols.map((c, i) => (
            <div key={c.key} className="col" style={{ '--i': i }} {...tip(`${fmtNum(c.value)} shared`, c.long)}>
              <span className="col-bar" style={{ height: `${(c.value / max) * 100}%` }}>
                {i === cols.length - 1 && c.value > 0 && <b>{fmtNum(c.value)}</b>}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="col-x" aria-hidden>
        {cols.map((c) => (
          <small key={c.key}>{c.label}</small>
        ))}
      </div>
    </div>
  );
}


// two or three series per period, side by side (legend required — identity is never colour alone)
export function GroupedColumns({ cols, series, tip }) {
  const raw = Math.max(1, ...cols.flatMap((c) => series.map((s) => c[s.key] || 0)));
  const step = raw <= 4 ? 1 : Math.ceil(raw / 4);
  const max = Math.ceil(raw / step) * step;
  const ticks = [];
  for (let t = 0; t <= max; t += step) ticks.push(t);
  return (
    <div className="col-chart gc">
      <ul className="gc-legend">
        {series.map((s) => (
          <li key={s.key}>
            <i className={`gc-${s.tone}`} /> {s.label}
          </li>
        ))}
      </ul>
      <div className="col-area">
        {ticks.map((t) => (
          <span key={t} className="col-tick" style={{ bottom: `${(t / max) * 100}%` }}>
            <em>{fmtNum(t)}</em>
          </span>
        ))}
        <div className="col-bars">
          {cols.map((c, i) => (
            <div key={c.key} className="col gc-col" style={{ '--i': i }}>
              {series.map((s) => (
                <span
                  key={s.key}
                  className={`col-bar gc-${s.tone}`}
                  style={{ height: `${((c[s.key] || 0) / max) * 100}%` }}
                  {...tip(`${fmtNum(c[s.key] || 0)} ${s.label.toLowerCase()}`, c.long)}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="col-x" aria-hidden>
        {cols.map((c) => (
          <small key={c.key}>{c.label}</small>
        ))}
      </div>
    </div>
  );
}
