import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../../api.js';
import { readSheetFile, rowsToPrices } from '../../../sheet.js';
import { Panel } from '../../../components/ui.jsx';
import Icon from '../../../components/Icon.jsx';
import { CreatorPhoto, FetchingTag, Shimmer, Verified, isFetching } from '../../../components/SwipeDeck.jsx';
import { PLATFORM_LABEL, SUB_STATUS, SubChip, fmtCompact, fmtDate, fmtINR, useShowMore } from '../../../components/ui.jsx';

// Columns follow the sourcing sheet: name/username (links to the profile), followers, cost,
// price for the client and margin = price − cost (team only), vendor, state, city, district, genre — then status and actions.
const colsFor = (stage, selectable) =>
  [
    selectable && '36px',
    'minmax(180px, 1.7fr)',
    '80px',
    stage === 'vendor' ? '100px' : '100px',
    stage !== 'vendor' && '118px',
    stage !== 'vendor' && '96px',
    stage !== 'vendor' && 'minmax(110px, 1fr)',
    'minmax(80px, 0.8fr)',
    'minmax(80px, 0.8fr)',
    'minmax(90px, 0.9fr)',
    'minmax(90px, 0.9fr)',
    '112px',
    '40px',
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

// vendors can take back a creator they added until the team sends it to the client
const VENDOR_REMOVABLE = ['submitted', 'shortlisted', 'rejected'];

// ── Column filters (the row under the table header) ─────────────────────────
const TIERS = [
  ['nano', 'Under 10K', 0, 1e4],
  ['micro', '10K–100K', 1e4, 1e5],
  ['mid', '100K–500K', 1e5, 5e5],
  ['macro', '500K–1M', 5e5, 1e6],
  ['mega', '1M+', 1e6, Infinity],
];
const MONEY = [
  ['set', 'Set'],
  ['none', 'Not set'],
  ['lt5', 'Under ₹5K', 1, 5e3],
  ['5to20', '₹5K–20K', 5e3, 2e4],
  ['20to50', '₹20K–50K', 2e4, 5e4],
  ['50plus', '₹50K+', 5e4, Infinity],
];
const moneyOk = (v, amount) => {
  if (!v) return true;
  if (v === 'set') return amount > 0;
  if (v === 'none') return !(amount > 0);
  const [, , lo, hi] = MONEY.find(([k]) => k === v);
  return amount >= lo && amount < hi;
};
const marginOf = (s) => (s.clientCost?.amount > 0 && s.vendorCost?.amount > 0 ? s.clientCost.amount - s.vendorCost.amount : null);
const EMPTY = '__empty__';
const vendorOf = (s) => s.vendor?.name || 'Swol Media';
const genresOf = (s) => s.creator.categories || [];
// a value list for a dropdown: every value in the column, A→Z, plus "(empty)" when some rows have none
function valuesOf(list, get) {
  const set = new Set();
  let blank = false;
  for (const s of list) {
    const v = get(s);
    const all = Array.isArray(v) ? v : [v];
    if (!all.length || all.every((x) => !String(x || '').trim())) blank = true;
    for (const x of all) if (String(x || '').trim()) set.add(String(x).trim());
  }
  const out = [...set].sort((a, b) => a.localeCompare(b));
  return blank ? [...out, EMPTY] : out;
}
const placeOk = (v, value) => !v || (v === EMPTY ? !String(value || '').trim() : String(value || '').trim() === v);
function passes(s, f) {
  const c = s.creator;
  if (f.name && !`${c.name} ${c.handle}`.toLowerCase().includes(f.name.trim().toLowerCase())) return false;
  if (f.followers) {
    const [, , lo, hi] = TIERS.find(([k]) => k === f.followers);
    if (!(c.followers >= lo && c.followers < hi && (lo > 0 || c.followers > 0))) return false;
  }
  if (!moneyOk(f.cost, s.vendorCost?.amount || 0)) return false;
  if (!moneyOk(f.price, s.clientCost?.amount || 0)) return false;
  if (f.margin) {
    const m = marginOf(s);
    if (f.margin === 'none' ? m !== null : f.margin === 'pos' ? !(m > 0) : !(m !== null && m <= 0)) return false;
  }
  if (f.vendor && vendorOf(s) !== f.vendor) return false;
  if (!placeOk(f.state, c.state) || !placeOk(f.city, c.city) || !placeOk(f.district, c.district)) return false;
  if (f.genre && (f.genre === EMPTY ? genresOf(s).length > 0 : !genresOf(s).includes(f.genre))) return false;
  if (f.status && s.status !== f.status) return false;
  return true;
}

function ColSelect({ value, onChange, options, label }) {
  return (
    <select className={`cs-fsel ${value ? 'on' : ''}`} value={value || ''} onChange={(e) => onChange(e.target.value)} aria-label={`Filter ${label}`} title={`Filter ${label}`}>
      <option value="">All</option>
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}

export default function CreatorsStage({ stage, items, campaignId, campaignName, downloads, onPricesSet, onMove, onRemove, onAdd, busy, toast }) {
  const [pricing, setPricing] = useState(false); // the "Upload prices" panel
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
  // per-column filters: { name, followers, cost, price, margin, vendor, state, city, district, genre, status }
  const [cols, setCols] = useState({});
  useEffect(() => setCols({}), [stage]);
  const setCol = (k) => (v) => (setCols((f) => ({ ...f, [k]: v })), setPicked(new Set()));
  const colCount = Object.values(cols).filter(Boolean).length;
  const dcols = useDeferredValue(cols);
  const opts = useMemo(
    () => ({
      vendor: valuesOf(inStage, vendorOf).map((v) => [v, v]),
      state: valuesOf(inStage, (s) => s.creator.state),
      city: valuesOf(inStage, (s) => s.creator.city),
      district: valuesOf(inStage, (s) => s.creator.district),
      genre: valuesOf(inStage, genresOf),
      status: [...new Set(inStage.map((s) => s.status))].map((v) => [v, SUB_STATUS[v] || v]),
    }),
    [inStage]
  );
  const place = (list) => list.map((v) => [v, v === EMPTY ? '(empty)' : v]);
  // the search box stays responsive while the list catches up (React filters in the background)
  const dq = useDeferredValue(q.trim().toLowerCase());
  const words = useMemo(() => new Map(inStage.map((s) => [s._id, `${s.creator.name} ${s.creator.handle} ${s.creator.city} ${s.vendor?.name || 'swol media'}`.toLowerCase()])), [inStage]);
  const [version, setVersion] = useState(0); // a saved cost or price changes the margin next to it — redraw the rows
  const shown = useMemo(
    () => inStage.filter((s) => (!allowed || allowed.includes(s.status)) && (!pass || pass(s)) && (!dq || words.get(s._id).includes(dq)) && passes(s, dcols)),
    [inStage, allowed, pass, dq, words, dcols, version] // eslint-disable-line react-hooks/exhaustive-deps
  );
  // draw the first 60 rows, more as you scroll
  const [rows, moreRows] = useShowMore(shown, { resetKey: `${stage}|${filter}|${dq}|${JSON.stringify(dcols)}` });

  const refresh = () => setVersion((v) => v + 1);
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
    let pick = sel.filter((s) => a.from.includes(s.status) && (!a.when || a.when(s)));
    // creators go to the client only with a price set
    if (a.to === 'sent_to_client') {
      const missing = pick.filter((s) => ['submitted', 'shortlisted'].includes(s.status) && !(s.clientCost?.amount > 0));
      if (missing.length) {
        pick = pick.filter((s) => !missing.includes(s));
        toast?.(
          pick.length
            ? `${missing.length} without a price ${missing.length === 1 ? 'was' : 'were'} left out — set a price to send ${missing.length === 1 ? 'it' : 'them'}`
            : `Set a price first — creators without one can’t be sent to the client`,
          true
        );
      }
    }
    const ids = pick.map((s) => s._id);
    if (!ids.length) return;
    if (await onMove(ids, a.to)) setPicked(new Set());
  };

  return (
    <section className="card cs">
      {pricing && (
        <PriceUpload
          campaignId={campaignId}
          onClose={() => setPricing(false)}
          onDone={(d) => {
            onPricesSet?.(d);
            toast?.(`Prices set for ${d.updated} creator${d.updated === 1 ? '' : 's'}${d.notFound.length ? ` · ${d.notFound.length} not on this campaign` : ''}`, !d.updated);
          }}
        />
      )}
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
          {colCount > 0 && (
            <button type="button" className="btn ghost sm" onClick={() => setCols({})} title="Clear the column filters">
              <Icon name="close" size={14} /> Clear {colCount} filter{colCount === 1 ? '' : 's'}
            </button>
          )}
          {downloads?.length > 0 && <DownloadMenu items={downloads} />}
          {onPricesSet && (
            <button type="button" className="btn ghost sm" onClick={() => setPricing(true)} title="Upload a sheet of usernames or links with their price">
              <Icon name="upload" size={15} /> Prices
            </button>
          )}
          {onAdd && (
            <button type="button" className="btn primary" onClick={onAdd}>
              <Icon name="plus" size={17} /> Add creators
            </button>
          )}
        </div>
      </div>
      {view.note && <p className="cs-note">{view.note}</p>}

      {inStage.length === 0 || (shown.length === 0 && !colCount) ? (
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
            {stage !== 'vendor' && <span>Price</span>}
            {stage !== 'vendor' && <span>Margin</span>}
            {stage !== 'vendor' && <span>Vendor</span>}
            <span>State</span>
            <span>City</span>
            <span>District</span>
            <span>Genre</span>
            <span>Status</span>
            <span />
          </div>
          <div className="cs-row cs-head cs-filters" role="row">
            {selectable && <span />}
            <span>
              <input className={`cs-ftext ${cols.name ? 'on' : ''}`} value={cols.name || ''} onChange={(e) => setCol('name')(e.target.value)} placeholder="Filter name" aria-label="Filter name or username" />
            </span>
            <span>
              <ColSelect label="followers" value={cols.followers} onChange={setCol('followers')} options={TIERS.map(([k, l]) => [k, l])} />
            </span>
            <span>
              <ColSelect label="cost" value={cols.cost} onChange={setCol('cost')} options={MONEY.map(([k, l]) => [k, l])} />
            </span>
            {stage !== 'vendor' && (
              <span>
                <ColSelect label="price" value={cols.price} onChange={setCol('price')} options={MONEY.map(([k, l]) => [k, l])} />
              </span>
            )}
            {stage !== 'vendor' && (
              <span>
                <ColSelect label="margin" value={cols.margin} onChange={setCol('margin')} options={[['pos', 'Positive'], ['neg', 'Zero or less'], ['none', 'Not worked out']]} />
              </span>
            )}
            {stage !== 'vendor' && (
              <span>
                <ColSelect label="vendor" value={cols.vendor} onChange={setCol('vendor')} options={opts.vendor} />
              </span>
            )}
            <span>
              <ColSelect label="state" value={cols.state} onChange={setCol('state')} options={place(opts.state)} />
            </span>
            <span>
              <ColSelect label="city" value={cols.city} onChange={setCol('city')} options={place(opts.city)} />
            </span>
            <span>
              <ColSelect label="district" value={cols.district} onChange={setCol('district')} options={place(opts.district)} />
            </span>
            <span>
              <ColSelect label="genre" value={cols.genre} onChange={setCol('genre')} options={place(opts.genre)} />
            </span>
            <span>
              <ColSelect label="status" value={cols.status} onChange={setCol('status')} options={opts.status} />
            </span>
            <span />
          </div>
          {shown.length === 0 && (
            <div className="cs-nomatch">
              Nothing matches these filters.{' '}
              <button type="button" className="linkish" onClick={() => setCols({})}>
                Clear filters
              </button>
            </div>
          )}
          {rows.map((s) => {
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
                    {isFetching(c) ? <FetchingTag k={c} /> : <span className="cs-plat">{PLATFORM_LABEL[c.platform]}</span>}
                  </div>
                </div>
                <span className="cs-cell" data-label="Followers">
                  {!c.followers && isFetching(c) ? <Shimmer w={44} /> : fmtCompact(c.followers)}
                </span>
                <span className="cs-cell" data-label={stage === 'vendor' ? 'Your cost' : 'Cost'}>
                  <MoneyCell sub={s} campaignId={campaignId} field="vendorCost" toast={toast} onSaved={refresh} />
                  <PriceTag sub={s} />
                </span>
                {stage !== 'vendor' && (
                  <span className="cs-cell" data-label="Price">
                    <MoneyCell sub={s} campaignId={campaignId} field="clientCost" toast={toast} onSaved={refresh} />
                  </span>
                )}
                {stage !== 'vendor' && (
                  <span className="cs-cell" data-label="Margin">
                    <Margin sub={s} />
                  </span>
                )}
                {stage !== 'vendor' && (
                  <span className="cs-cell" data-label="Vendor">
                    {s.vendor?.name || <em>Swol Media</em>}
                    <small>{fmtDate(s.createdAt)}</small>
                  </span>
                )}
                <span className="cs-cell" data-label="State">
                  <PlaceCell sub={s} field="state" campaignId={campaignId} toast={toast} />
                </span>
                <span className="cs-cell" data-label="City">
                  <PlaceCell sub={s} field="city" campaignId={campaignId} toast={toast} />
                </span>
                <span className="cs-cell" data-label="District">
                  <PlaceCell sub={s} field="district" campaignId={campaignId} toast={toast} />
                </span>
                <span className="cs-cell cs-genre" data-label="Genre">
                  {c.categories?.length ? c.categories.join(', ') : '—'}
                </span>
                <span className="cs-cell" data-label="Status">
                  <SubChip status={s.status} />
                  {stage === 'vendor' && <small>Added {fmtDate(s.createdAt)}</small>}
                </span>
                <span className="cs-act">
                  {onRemove && (stage === 'vendor' ? VENDOR_REMOVABLE.includes(s.status) : s.status !== 'approved') && (
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
      {moreRows}

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

// One editable amount — the vendor's cost or the price for the client. Click to change (internal only).
// State / City / District — click to type, Enter or click away to save (saved on the creator)
const PLACE_LABEL = { state: 'State', city: 'City', district: 'District' };
function PlaceCell({ sub, field, campaignId, toast }) {
  const [value, setValue] = useState(sub.creator[field] || '');
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => setValue(sub.creator[field] || ''), [sub.creator[field]]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    const next = val.trim();
    if (next === value) return setEditing(false);
    setSaving(true);
    try {
      const d = await api.setCreatorLocation(campaignId, sub._id, { [field]: next });
      setValue(d[field]);
      sub.creator[field] = d[field]; // keep the row's data in step (search, cards)
      setEditing(false);
    } catch (e) {
      toast?.(e.message, true);
    } finally {
      setSaving(false);
    }
  };

  if (!campaignId) return value || '—';
  if (editing)
    return (
      <input
        className="cost-in place-in"
        autoFocus
        value={val}
        disabled={saving}
        placeholder={PLACE_LABEL[field]}
        onChange={(e) => setVal(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => (e.key === 'Enter' ? save() : e.key === 'Escape' ? setEditing(false) : null)}
      />
    );
  return (
    <button type="button" className={`place-btn ${value ? '' : 'empty'}`} onClick={() => (setVal(value), setEditing(true))} title={`Click to ${value ? 'change' : 'add'} the ${PLACE_LABEL[field].toLowerCase()}`}>
      {value || `+ ${PLACE_LABEL[field]}`}
    </button>
  );
}

// how this creator's cost was set, when it came from a bucket or slabs
function PriceTag({ sub }) {
  const p = sub.pricing;
  if (!p || p.mode === 'manual') return null;
  if (p.pending) return <small className="cost-tag wait">waiting for followers</small>;
  return (
    <small className="cost-tag" title={sub.vendorCost?.text || ''}>
      {p.mode === 'bucket' ? 'Bucket share' : 'Slab'}
      {p.locked ? ' · edited' : ''}
    </small>
  );
}

// Price − cost, once both are known
function Margin({ sub }) {
  const price = sub.clientCost?.amount || 0;
  const cost = sub.vendorCost?.amount || 0;
  if (!price || !cost) return <span className="muted">—</span>;
  const m = price - cost;
  return (
    <span className={`margin ${m < 0 ? 'neg' : ''}`} title={`${fmtINR(price)} price − ${fmtINR(cost)} cost`}>
      <b>{m < 0 ? '−' : ''}{fmtINR(Math.abs(m))}</b>
      <small>{Math.round((m / price) * 100)}%</small>
    </span>
  );
}

function MoneyCell({ sub, campaignId, field, toast, onSaved }) {
  const [amount, setAmount] = useState(sub[field]?.amount || 0);
  // bucket / slab costs change when follower counts arrive — follow the latest value
  useEffect(() => setAmount(sub[field]?.amount || 0), [sub[field]?.amount]); // eslint-disable-line react-hooks/exhaustive-deps
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
      // keep the row's own data in step, so the cell (and margin) show the saved amount straight away
      sub[field] = { ...(sub[field] || {}), ...d[field] };
      if (field === 'vendorCost' && sub.pricing && sub.pricing.mode !== 'manual') sub.pricing = { ...sub.pricing, locked: true };
      setAmount(d[field].amount);
      setEditing(false);
      onSaved?.();
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
        placeholder={isClient ? 'Price' : 'Cost'}
        onChange={(e) => setVal(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => (e.key === 'Enter' ? save() : e.key === 'Escape' ? setEditing(false) : null)}
      />
    );
  if (!amount)
    return (
      <button type="button" className="cost-add" onClick={() => (setVal(''), setEditing(true))}>
        {isClient ? '+ Add price' : '+ Add cost'}
      </button>
    );
  return (
    <button
      type="button"
      className={`cost-btn ${isClient ? 'is-client' : ''}`}
      onClick={() => (setVal(String(amount || '')), setEditing(true))}
      title={isClient ? 'Price for the client — needed before sending to the client. Click to change.' : `Cost${sub.vendorCost?.text ? ` (${sub.vendorCost.text})` : ''} — click to change`}
    >
      <b>{fmtINR(amount)}</b>
    </button>
  );
}

// Download menu (internal): the full campaign workbook, and the short one for the client
export function DownloadMenu({ items }) {
  return (
    <details className="dl-menu">
      <summary className="btn ghost sm">
        <Icon name="download" size={15} /> Download
      </summary>
      <div className="dl-pop" role="menu">
        {items.map((d) => (
          <a key={d.url} href={d.url} download={d.name || true} role="menuitem" onClick={(e) => e.currentTarget.closest('details').removeAttribute('open')}>
            <b>{d.label}</b>
            <small>{d.hint}</small>
          </a>
        ))}
      </div>
    </details>
  );
}

// Upload a sheet of creators (username or profile link) and their price → sets each one's price on this campaign
function PriceUpload({ campaignId, onClose, onDone }) {
  const [sheet, setSheet] = useState(null); // { name, rows, header }
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const fileRef = useRef(null);

  const load = async (file) => {
    if (!file) return;
    setError('');
    setResult(null);
    try {
      const parsed = rowsToPrices(await readSheetFile(file));
      if (!parsed.rows.length) return setError('No rows found — the sheet needs a username or link column and a price column');
      setSheet({ name: file.name, ...parsed });
    } catch (e) {
      setError(e.message || 'Couldn’t read that file');
    }
  };
  const valid = (sheet?.rows || []).filter((r) => r.input && /\d/.test(r.price));
  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const d = await api.setCreatorPrices(campaignId, valid.map(({ input, price }) => ({ input, price })));
      setResult(d);
      onDone(d);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel
      title="Upload prices"
      subtitle="A sheet with two columns — each creator’s username or profile link, and their price. Prices are matched to the creators on this campaign."
      onClose={onClose}
      footer={
        <>
          {error && <span className="pn-err">{error}</span>}
          <button type="button" className="btn ghost" onClick={onClose}>
            {result ? 'Done' : 'Cancel'}
          </button>
          {!result && (
            <button type="button" className="btn primary" disabled={busy || !valid.length} onClick={submit}>
              {busy ? 'Setting prices…' : `Set ${valid.length || ''} price${valid.length === 1 ? '' : 's'}`}
            </button>
          )}
        </>
      }
    >
      <div className="ac">
        {result ? (
          <div className="ac-result">
            <p>
              <Icon name="check" size={16} /> Prices set for {result.updated} creator{result.updated === 1 ? '' : 's'}
            </p>
            {result.notFound.length > 0 && (
              <p className="ac-warn">
                Not on this campaign: {result.notFound.slice(0, 10).join(', ')}
                {result.notFound.length > 10 ? ` and ${result.notFound.length - 10} more` : ''}
              </p>
            )}
            {result.noPrice.length > 0 && <p className="ac-warn">No price on: {result.noPrice.slice(0, 10).join(', ')}</p>}
          </div>
        ) : !sheet ? (
          <div className="sh-drop" role="button" tabIndex={0} onClick={() => fileRef.current?.click()} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => (e.preventDefault(), load(e.dataTransfer.files?.[0]))}>
            <span className="sh-drop-ic">
              <Icon name="upload" size={22} />
            </span>
            <strong>Drop the price sheet here, or click to choose</strong>
            <span>Excel (.xlsx) or CSV · column 1: username or profile link · column 2: price</span>
            <span className="sh-cols">
              <em>Username / Profile link</em>
              <em>Price</em>
            </span>
          </div>
        ) : (
          <div className="sh-loaded">
            <div className="sh-loaded-head">
              <span className="sh-file-ic">
                <Icon name="file" size={18} />
              </span>
              <div>
                <strong>{sheet.name}</strong>
                <span>
                  {valid.length} with a price{sheet.rows.length - valid.length ? ` · ${sheet.rows.length - valid.length} skipped (no username or price)` : ''}
                  {sheet.header ? ` · columns “${sheet.header[0]}” and “${sheet.header[1]}”` : ''}
                </span>
              </div>
              <button type="button" className="btn ghost sm" onClick={() => setSheet(null)}>
                Choose another
              </button>
            </div>
            <div className="sh-table-wrap">
              <table className="sh-table">
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Username / link</th>
                    <th>Price</th>
                  </tr>
                </thead>
                <tbody>
                  {sheet.rows.slice(0, 8).map((r) => (
                    <tr key={r._row}>
                      <td>{r._row}</td>
                      <td>{r.input || <em className="sh-miss">empty</em>}</td>
                      <td>{r.price || <em className="sh-miss">empty</em>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {sheet.rows.length > 8 && <p className="sh-more">…and {sheet.rows.length - 8} more</p>}
            </div>
          </div>
        )}
        <input ref={fileRef} type="file" hidden accept=".xlsx,.csv,.txt,.tsv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => (load(e.target.files?.[0]), (e.target.value = ''))} />
      </div>
    </Panel>
  );
}
