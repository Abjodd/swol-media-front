import { useState } from 'react';
import { api } from '../api.js';
import Icon from './Icon.jsx';
import { Panel, fmtNum } from './ui.jsx';

// After a vendor's upload: creators that someone else already has on this campaign.
// The vendor can offer a lower price — lower than the current one replaces it, otherwise the row stays out.
const toNum = (v) => {
  const m = String(v ?? '').toLowerCase().replace(/[,₹\s]/g, '').match(/^(\d+(?:\.\d+)?)(k|l|lac|lakh)?$/);
  return m ? Math.round(parseFloat(m[1]) * ({ k: 1e3, l: 1e5, lac: 1e5, lakh: 1e5 }[m[2]] || 1)) : 0;
};
const inr = (n) => `₹${fmtNum(n)}`;

export default function OfferPanel({ job, onClose }) {
  const [rows, setRows] = useState(() => job.conflicts.map((x) => ({ ...x, offer: x.yours ? String(x.yours) : '', state: '', msg: '' })));
  const [busy, setBusy] = useState(false);
  const set = (i, patch) => setRows((list) => list.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const lower = (r) => toNum(r.offer) > 0 && (!r.price || toNum(r.offer) < r.price);

  const send = async (i) => {
    const r = rows[i];
    if (!(toNum(r.offer) > 0)) return set(i, { state: 'error', msg: 'Enter your price' });
    set(i, { state: 'busy', msg: '' });
    try {
      const d = await api.offerCreatorPrice(job.campaignId, r.sid, r.offer);
      set(i, { state: d.outcome, msg: d.message });
      if (d.outcome === 'replaced') window.dispatchEvent(new CustomEvent('swol:creators-added', { detail: { campaignId: job.campaignId, done: true } }));
    } catch (e) {
      set(i, { state: 'error', msg: e.message });
    }
  };
  const open = rows.map((r, i) => [r, i]).filter(([r]) => !['replaced', 'kept', 'skipped', 'busy'].includes(r.state));
  const ready = open.filter(([r]) => lower(r));
  const sendAll = async () => {
    setBusy(true);
    for (const [, i] of ready) await send(i);
    setBusy(false);
  };

  return (
    <Panel
      wide
      title="Already on this campaign"
      subtitle={`${fmtNum(rows.length)} creator${rows.length === 1 ? ' from your upload is' : 's from your upload are'} already on ${job.campaignName}. Offer a lower price to take ${rows.length === 1 ? 'it' : 'them'} over — if your price isn’t lower, your row stays out.`}
      onClose={onClose}
      footer={
        <>
          <span className="pn-step">{ready.length ? `${fmtNum(ready.length)} offer${ready.length === 1 ? '' : 's'} ready` : 'Enter a price below the current one'}</span>
          <button type="button" className="btn ghost" onClick={onClose}>
            Done
          </button>
          <button type="button" className="btn primary" disabled={busy || !ready.length} onClick={sendAll}>
            {busy ? 'Sending…' : `Offer ${ready.length > 1 ? `all ${fmtNum(ready.length)}` : 'price'}`}
          </button>
        </>
      }
    >
      <div className="of-list">
        {rows.map((r, i) => {
          const n = toNum(r.offer);
          const done = ['replaced', 'kept', 'skipped'].includes(r.state);
          return (
            <article key={r.sid} className={`of-row is-${r.state || 'open'}`}>
              <div className="of-who">
                <strong>{r.name && r.name !== r.handle ? r.name : `@${r.handle}`}</strong>
                <span>@{r.handle}</span>
              </div>
              <div className="of-now">
                <small>On the campaign at</small>
                <b>{r.price ? inr(r.price) : 'no cost yet'}</b>
                {r.yours > 0 && <small>your sheet: {inr(r.yours)}</small>}
              </div>
              {done ? (
                <p className={`of-out ${r.state}`}>
                  <Icon name={r.state === 'replaced' ? 'check' : 'close'} size={14} /> {r.state === 'skipped' ? 'Left out' : r.msg}
                </p>
              ) : (
                <div className="of-act">
                  <label className="of-input">
                    <span>₹</span>
                    <input value={r.offer} onChange={(e) => set(i, { offer: e.target.value, state: '', msg: '' })} placeholder="Your price" inputMode="numeric" aria-label={`Your price for @${r.handle}`} />
                  </label>
                  <small className={`of-hint ${n ? (lower(r) ? 'ok' : 'no') : ''}`}>
                    {!n ? (r.price ? `Under ${inr(r.price)} to take over` : 'Any price takes over') : lower(r) ? 'Lower — you’d take over' : `Not lower than ${inr(r.price)} — won’t be added`}
                  </small>
                  {r.state === 'error' && <small className="of-err">{r.msg}</small>}
                  <div className="of-btns">
                    <button type="button" className="btn primary sm" disabled={r.state === 'busy' || !n} onClick={() => send(i)}>
                      {r.state === 'busy' ? 'Sending…' : 'Offer'}
                    </button>
                    <button type="button" className="btn ghost sm" onClick={() => set(i, { state: 'skipped' })}>
                      Leave out
                    </button>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </Panel>
  );
}
