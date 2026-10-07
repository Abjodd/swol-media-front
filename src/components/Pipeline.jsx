import { fmtNum } from './ui.jsx';

// The four stages every campaign moves through.
export const STAGES = [
  { key: 'vendors', n: 1, label: 'Vendors assigned', short: 'Vendors' },
  { key: 'added', n: 2, label: 'Creators added', short: 'Added' },
  { key: 'client', n: 3, label: 'Sent to client', short: 'With client' },
  { key: 'approved', n: 4, label: 'Approved by client', short: 'Approved' },
];

const pct = (v, max) => (max > 0 ? Math.min(100, Math.round((v / max) * 100)) : 0);

// value / target / note for each stage, from the pipeline counts the API returns
export function stageFigures(p) {
  return {
    vendors: {
      value: p.quota,
      target: p.needed,
      note: p.vendors ? `${p.vendors} vendor${p.vendors === 1 ? '' : 's'} asked for ${fmtNum(p.quota)} of ${fmtNum(p.needed)}` : 'No vendors assigned yet',
      done: p.needed > 0 && p.quota >= p.needed,
    },
    // stages 2 and 3 are plain counts (vendors can add more than needed); their bar shows the split
    added: {
      value: p.added,
      target: null,
      segs: [
        [p.sent, 'fwd', 'sent to client'],
        [p.inReview, 'rev', 'in review'],
        [p.rejected, 'rej', 'rejected'],
      ],
      note: p.added ? `${fmtNum(p.addedByVendors)} from vendors, ${fmtNum(p.addedByUs)} by your team${p.rejected ? `, ${fmtNum(p.rejected)} rejected` : ''}` : 'No creators added yet',
      done: p.needed > 0 && p.added >= p.needed,
    },
    client: {
      value: p.sent,
      target: null,
      segs: [
        [p.approved, 'ok', 'approved'],
        [p.waitingClient, 'wait', 'waiting'],
        [p.declined, 'rej', 'declined'],
      ],
      note: p.sent ? `${fmtNum(p.waitingClient)} waiting, ${fmtNum(p.declined)} declined` : p.inReview ? `${fmtNum(p.inReview)} in review, ready to send` : 'Nothing sent yet',
      done: p.needed > 0 && p.sent >= p.needed && p.waitingClient === 0,
    },
    approved: {
      value: p.approved,
      target: p.needed,
      note: p.needed ? `${fmtNum(p.approved)} of ${fmtNum(p.needed)} needed (${pct(p.approved, p.needed)}%)` : p.approved ? `${fmtNum(p.approved)} approved` : 'None approved yet',
      done: p.needed > 0 && p.approved >= p.needed,
    },
  };
}

// progress toward a target, or — for count-only stages — how that count splits up
function Bar({ x, cls }) {
  if (x.segs) {
    const total = x.segs.reduce((a, [v]) => a + (v || 0), 0);
    return (
      <span className={`${cls} is-split`} title={x.segs.map(([v, , l]) => `${fmtNum(v || 0)} ${l}`).join(' · ')}>
        {total > 0 && x.segs.map(([v, tone], i) => (v ? <i key={i} className={`seg-${tone}`} style={{ width: `${(v / total) * 100}%` }} /> : null))}
      </span>
    );
  }
  return (
    <span className={cls}>
      <i style={{ width: `${pct(x.value, x.target)}%` }} />
    </span>
  );
}

// Big, clickable pipeline for the campaign page
export function Pipeline({ p, active, onPick }) {
  const f = stageFigures(p);
  const reached = Math.min(p.stage, 4);
  return (
    <ol className="pl" style={{ '--pl-f': (reached - 1) / 3 }}>
      {STAGES.map((s) => {
        const x = f[s.key];
        const state = x.done ? 'done' : s.n === reached ? 'now' : s.n < reached ? 'past' : 'next';
        return (
          <li key={s.key} className={`pl-stage stage-${s.key} is-${state} ${active === s.key ? 'picked' : ''}`}>
            <button type="button" onClick={() => onPick?.(s.key)} aria-pressed={active === s.key}>
              <span className="pl-node">
                {x.done ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M20 6 9 17l-5-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  s.n
                )}
              </span>
              <span className="pl-body">
                <span className="pl-label">
                  <em>Stage {s.n}</em>
                  {s.label}
                </span>
                <span className="pl-count">
                  <strong>{fmtNum(x.value)}</strong>
                  {x.target != null && <small>/ {fmtNum(x.target)}</small>}
                </span>
                <Bar x={x} cls="pl-bar" />
                <span className="pl-note">{x.note}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

// Compact version for the campaign list
export function MiniPipeline({ p }) {
  const f = stageFigures(p);
  const reached = Math.min(p.stage, 4);
  return (
    <div className="mpl">
      {STAGES.map((s) => {
        const x = f[s.key];
        const state = x.done ? 'done' : s.n === reached ? 'now' : s.n < reached ? 'past' : 'next';
        return (
          <div key={s.key} className={`mpl-cell stage-${s.key} is-${state}`}>
            <span className="mpl-label">
              <b>{s.n}</b> {s.short}
            </span>
            <span className="mpl-num">
              {fmtNum(x.value)}
              {x.target != null && <small>/{fmtNum(x.target)}</small>}
            </span>
            <Bar x={x} cls="mpl-bar" />
          </div>
        );
      })}
    </div>
  );
}
