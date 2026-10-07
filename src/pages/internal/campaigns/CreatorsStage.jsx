import { useMemo, useState } from 'react';
import { api } from '../../../api.js';
import Icon from '../../../components/Icon.jsx';
import { CreatorPhoto, Verified } from '../../../components/SwipeDeck.jsx';
import { PLATFORM_LABEL, SubChip, fmtCompact, fmtDate, fmtINR } from '../../../components/ui.jsx';

// Columns follow the sourcing sheet: name/username (links to the profile), followers, cost,
// client cost (team only), vendor, state, city, district, genre — then status and actions.
const colsFor = (stage, selectable) =>
  [
    selectable && '36px',
    'minmax(180px, 1.7fr)',
    '80px',
    stage === 'vendor' ? '100px' : '100px',
    stage !== 'vendor' && '118px',
    stage !== 'vendor' && 'minmax(110px, 1fr)',
    'minmax(80px, 0.8fr)',
    'minmax(80px, 0.8fr)',
    'minmax(90px, 0.9fr)',
    'minmax(90px, 0.9fr)',
    '112px',
    stage === 'vendor' ? '8px' : '40px',
  ]
    .filter(Boolean)
    .join(' ');

// What each stage tab shows and which bulk actions it offers.
export const STAGE_VIEW = {
  added: {
    statuses: ['submitted', 'shortlisted', 'rejected'],
    filters: [
      ['open', 'In review', ['submitted', 'shortlisted'], (s) => !s.held],
      ['held', 'On hold', ['submitted', 'shortlisted'], (s) => s.held],
      ['rejected', 'Rejected', ['rejected']],
      ['all', 'All', null],
    ],
    empty: ['No creators yet', 'Add profile links yourself, or wait for vendors to upload theirs.'],
    actions: [
      { to: 'sent_to_client', label: 'Send to client', primary: true, from: ['submitted', 'shortlisted'] },
      { to: 'held', label: 'Hold for later', from: ['submitted', 'shortlisted'], when: (s) => !s.held },
      { to: 'rejected', label: 'Reject', from: ['submitted', 'shortlisted'] },
      { to: 'submitted', label: 'Back to review', from: ['rejected', 'submitted', 'shortlisted'], when: (s) => s.status === 'rejected' || s.held },
    ],
  },
  client: {
    statuses: ['sent_to_client', 'declined'],
    filters: [
      ['waiting', 'Waiting', ['sent_to_client']],
      ['declined', 'Declined', ['declined']],
      ['all', 'All', null],
    ],
    empty: ['Nothing with the client yet', 'Select creators in “Creators added” and send them to the client.'],
    actions: [
      { to: 'approved', label: 'Mark approved', primary: true, from: ['sent_to_client'] },
      { to: 'declined', label: 'Mark declined', from: ['sent_to_client'] },
      { to: 'submitted', label: 'Take back', from: ['sent_to_client', 'declined'] },
      { to: 'sent_to_client', label: 'Send again', from: ['declined'] },
    ],
  },
  // vendor portal: everything they've proposed, read-only
  vendor: {
    statuses: ['submitted', 'shortlisted', 'rejected', 'sent_to_client', 'approved', 'declined'],
    filters: [
      ['all', 'All', null],
      ['review', 'In review', ['submitted', 'shortlisted']],
      ['client', 'With client', ['sent_to_client']],
      ['approved', 'Approved', ['approved']],
      ['dropped', 'Not selected', ['rejected', 'declined']],
    ],
    empty: ['No creators added yet', 'Add the profile links of the creators you’re proposing for this campaign.'],
    actions: [],
  },
  approved: {
    statuses: ['approved'],
    filters: null,
    empty: ['No campaign creators yet', 'Creators appear here once the client approves them.'],
    actions: [{ to: 'sent_to_client', label: 'Undo approval', from: ['approved'] }],
  },
};


export default function CreatorsStage({ stage, items, campaignId, campaignName, exportUrl, exportName, onMove, onRemove, onAdd, busy, toast }) {
  const view = STAGE_VIEW[stage];
  const [filter, setFilter] = useState(view.filters ? view.filters[0][0] : 'all');
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState(() => new Set());

  const inStage = useMemo(() => items.filter((s) => view.statuses.includes(s.status)), [items, view]);
  const counts = useMemo(() => {
    const c = {};
    for (const [k, , st, fn] of view.filters || []) c[k] = st ? inStage.filter((s) => st.includes(s.status) && (!fn || fn(s))).length : inStage.length;
    return c;
  }, [inStage, view]);
  const [, , allowed, pass] = view.filters?.find(([k]) => k === filter) || [];
  const shown = inStage.filter(
    (s) =>
      (!allowed || allowed.includes(s.status)) &&
      (!pass || pass(s)) &&
      `${s.creator.name} ${s.creator.handle} ${s.creator.city} ${s.vendor?.name || 'swol media'}`.toLowerCase().includes(q.toLowerCase())
  );

  const selectable = view.actions.length > 0;
  const sel = shown.filter((s) => picked.has(s._id));
  const allOn = shown.length > 0 && sel.length === shown.length;
  const toggle = (id) =>
    setPicked((p) => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const toggleAll = () => setPicked(allOn ? new Set() : new Set(shown.map((s) => s._id)));

  const run = async (a) => {
    const ids = sel.filter((s) => a.from.includes(s.status) && (!a.when || a.when(s))).map((s) => s._id);
    if (!ids.length) return;
    if (await onMove(ids, a.to)) setPicked(new Set());
  };

  return (
    <section className="card cs">
      <div className="cs-bar">
        <div className="search-x">
          <Icon name="search" size={17} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, handle, city, vendor" />
        </div>
        {view.filters && (
          <div className="seg">
            {view.filters.map(([k, l]) => (
              <button key={k} type="button" className={filter === k ? 'on' : ''} onClick={() => (setFilter(k), setPicked(new Set()))}>
                {l} <span>{counts[k]}</span>
              </button>
            ))}
          </div>
        )}
        <div className="cs-tools">
          {exportUrl && (
            <a className="btn ghost sm" href={exportUrl} download={exportName || true} title="Download every stage of this campaign — details, vendors and all creators — as one CSV">
              <Icon name="download" size={15} /> CSV
            </a>
          )}
          {onAdd && (
            <button type="button" className="btn primary" onClick={onAdd}>
              <Icon name="plus" size={17} /> Add creators
            </button>
          )}
        </div>
      </div>
      {view.note && <p className="cs-note">{view.note}</p>}

      {shown.length === 0 ? (
        <div className="cd-empty">
          <Icon name="creators" size={22} />
          <strong>{inStage.length ? 'Nothing matches' : view.empty[0]}</strong>
          <p>{inStage.length ? 'Try another filter or search.' : view.empty[1]}</p>
          {onAdd && !inStage.length && (
            <button type="button" className="btn primary sm" onClick={onAdd}>
              Add creators
            </button>
          )}
        </div>
      ) : (
        <div className="cs-scroll">
        <div className={`cs-table cs-wide ${selectable ? '' : 'no-check'}`} role="table" style={{ '--cols': colsFor(stage, selectable) }}>
          <div className="cs-row cs-head" role="row">
            {selectable && (
              <label className="cs-check">
                <input type="checkbox" checked={allOn} onChange={toggleAll} aria-label="Select all" />
              </label>
            )}
            <span>Name / username</span>
            <span>Followers</span>
            <span>{stage === 'vendor' ? 'Your cost' : 'Cost'}</span>
            {stage !== 'vendor' && <span>Client cost</span>}
            {stage !== 'vendor' && <span>Vendor</span>}
            <span>State</span>
            <span>City</span>
            <span>District</span>
            <span>Genre</span>
            <span>Status</span>
            <span />
          </div>
          {shown.map((s) => {
            const c = s.creator;
            return (
              <div key={s._id} className={`cs-row ${picked.has(s._id) ? 'on' : ''}`} role="row">
                {selectable && (
                  <label className="cs-check">
                    <input type="checkbox" checked={picked.has(s._id)} onChange={() => toggle(s._id)} aria-label={`Select ${c.name}`} />
                  </label>
                )}
                <div className="cs-who">
                  <CreatorPhoto creator={c} className="cs-av" />
                  <div>
                    {c.profileUrl ? (
                      <a href={c.profileUrl} target="_blank" rel="noreferrer" className="cs-link" title={`Open ${PLATFORM_LABEL[c.platform]} profile`}>
                        <strong>
                          {c.name || `@${c.handle}`} <Verified k={c} />
                        </strong>
                        <span className="cs-handle">@{c.handle}</span>
                      </a>
                    ) : (
                      <>
                        <strong>{c.name || `@${c.handle}`}</strong>
                        <span>@{c.handle}</span>
                      </>
                    )}
                    <span className="cs-plat">{PLATFORM_LABEL[c.platform]}</span>
                  </div>
                </div>
                <span className="cs-cell" data-label="Followers">
                  {fmtCompact(c.followers)}
                </span>
                <span className="cs-cell" data-label={stage === 'vendor' ? 'Your cost' : 'Cost'}>
                  {stage === 'vendor' ? <b className="cost-v">{fmtINR(s.vendorCost?.amount)}</b> : <MoneyCell sub={s} campaignId={campaignId} field="vendorCost" toast={toast} />}
                </span>
                {stage !== 'vendor' && (
                  <span className="cs-cell" data-label="Client cost">
                    <MoneyCell sub={s} campaignId={campaignId} field="clientCost" toast={toast} />
                  </span>
                )}
                {stage !== 'vendor' && (
                  <span className="cs-cell" data-label="Vendor">
                    {s.vendor?.name || <em>Swol Media</em>}
                    <small>{fmtDate(s.createdAt)}</small>
                  </span>
                )}
                <span className="cs-cell" data-label="State">
                  {c.state || '—'}
                </span>
                <span className="cs-cell" data-label="City">
                  {c.city || '—'}
                </span>
                <span className="cs-cell" data-label="District">
                  {c.district || '—'}
                </span>
                <span className="cs-cell cs-genre" data-label="Genre">
                  {c.categories?.length ? c.categories.join(', ') : '—'}
                </span>
                <span className="cs-cell" data-label="Status">
                  <SubChip status={s.status} />
                  {stage === 'vendor' && <small>Added {fmtDate(s.createdAt)}</small>}
                </span>
                <span className="cs-act">
                  {onRemove && s.status !== 'approved' && (
                    <button type="button" className="icon-btn" onClick={() => onRemove(s)} title="Remove from campaign" aria-label="Remove from campaign">
                      <Icon name="trash" size={15} />
                    </button>
                  )}
                </span>
              </div>
            );
          })}
        </div>
        </div>
      )}

      {/* bulk actions slide up when something is selected */}
      {selectable && <div className={`cs-bulk ${sel.length ? 'show' : ''}`} aria-hidden={!sel.length}>
        <span>
          <b>{sel.length}</b> selected
        </span>
        <button type="button" className="link-btn" onClick={() => setPicked(new Set())}>
          Clear
        </button>
        <div className="cs-bulk-actions">
          {view.actions.map((a) => {
            const n = sel.filter((s) => a.from.includes(s.status) && (!a.when || a.when(s))).length;
            if (!n) return null;
            return (
              <button key={a.to + a.label} type="button" className={`btn sm ${a.primary ? 'primary' : 'ghost'}`} disabled={busy} onClick={() => run(a)}>
                {a.label} {n !== sel.length ? `(${n})` : ''}
              </button>
            );
          })}
        </div>
      </div>}
    </section>
  );
}

// One editable amount — the vendor's cost or the final client cost. Click to change (internal only).
function MoneyCell({ sub, campaignId, field, toast }) {
  const [amount, setAmount] = useState(sub[field]?.amount || 0);
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState('');
  const [saving, setSaving] = useState(false);
  const isClient = field === 'clientCost';

  const save = async () => {
    if (String(amount || '') === val.trim()) return setEditing(false);
    if (!isClient && !val.trim()) return setEditing(false); // the cost can't be emptied
    setSaving(true);
    try {
      const d = await api.setCreatorCost(campaignId, sub._id, { [field]: val });
      setAmount(d[field].amount);
      setEditing(false);
    } catch (e) {
      toast?.(e.message, true);
    } finally {
      setSaving(false);
    }
  };

  if (editing)
    return (
      <input
        className="cost-in"
        autoFocus
        value={val}
        disabled={saving}
        inputMode="numeric"
        placeholder={isClient ? 'Client cost' : 'Cost'}
        onChange={(e) => setVal(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => (e.key === 'Enter' ? save() : e.key === 'Escape' ? setEditing(false) : null)}
      />
    );
  if (!amount && isClient)
    return (
      <button type="button" className="cost-add" onClick={() => (setVal(''), setEditing(true))}>
        + Add client cost
      </button>
    );
  return (
    <button
      type="button"
      className={`cost-btn ${isClient ? 'is-client' : ''}`}
      onClick={() => (setVal(String(amount || '')), setEditing(true))}
      title={isClient ? 'Final cost for the client — only your team sees this. Click to change.' : `Cost${sub.vendorCost?.text ? ` (${sub.vendorCost.text})` : ''} — click to change`}
    >
      <b>{fmtINR(amount)}</b>
    </button>
  );
}
