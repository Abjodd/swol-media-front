import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../../../api.js';
import SheetOverride, { PRESETS } from './SheetOverride.jsx';
import { Panel } from '../../../components/ui.jsx';
import Icon from '../../../components/Icon.jsx';
import { CreatorPhoto, FetchingTag, Shimmer, Verified, isFetching } from '../../../components/SwipeDeck.jsx';
import { FollowersFilter, followersMatch, PLATFORM_LABEL, SUB_STATUS, SubChip, fmtCompact, fmtDate, fmtINR, fmtNum, useShowMore } from '../../../components/ui.jsx';

// Columns follow the sourcing sheet: name/username (links to the profile), followers, cost,
// price for the client and margin = price − cost (team only), vendor, state, city, district, genre — then status and actions.
const colsFor = (stage, selectable, extras = 0) =>
  [
    selectable && '36px',
    'minmax(180px, 1.7fr)',
    '112px', // followers (wide enough for its filter)
    stage === 'vendor' ? '100px' : '100px',
    stage !== 'vendor' && '118px',
    stage !== 'vendor' && '96px',
    stage !== 'vendor' && 'minmax(110px, 1fr)',
    'minmax(80px, 0.8fr)',
    'minmax(80px, 0.8fr)',
    'minmax(90px, 0.9fr)', // district
    'minmax(100px, 0.9fr)', // constituency
    'minmax(90px, 0.9fr)', // genre
    ...Array.from({ length: extras }, () => 'minmax(110px, 1fr)'), // the campaign's own columns
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
const extraKey = (col) => col.replace(/[.$]/g, '_');
const placeOk = (v, value) => !v || (v === EMPTY ? !String(value || '').trim() : String(value || '').trim() === v);
function passes(s, f) {
  const c = s.creator;
  if (f.name && !`${c.name} ${c.handle}`.toLowerCase().includes(f.name.trim().toLowerCase())) return false;
  if (!followersMatch(f.followers, c.followers)) return false;
  if (!moneyOk(f.cost, s.vendorCost?.amount || 0)) return false;
  if (!moneyOk(f.price, s.clientCost?.amount || 0)) return false;
  if (f.margin) {
    const m = marginOf(s);
    if (f.margin === 'none' ? m !== null : f.margin === 'pos' ? !(m > 0) : !(m !== null && m <= 0)) return false;
  }
  if (f.vendor && vendorOf(s) !== f.vendor) return false;
  if (!placeOk(f.state, c.state) || !placeOk(f.city, c.city) || !placeOk(f.district, c.district) || !placeOk(f.constituency, c.constituency)) return false;
  for (const [k, v] of Object.entries(f)) if (k.startsWith('x:') && v && !placeOk(v, s.extra?.[extraKey(k.slice(2))])) return false;
  if (f.genre && (f.genre === EMPTY ? genresOf(s).length > 0 : !genresOf(s).includes(f.genre))) return false;
  if (f.status && s.status !== f.status) return false;
  return true;
}

// ── Sorting: click a column header (or pick in "Sort by") — again to flip, a third time to go back to newest first ─
const STATUS_ORDER = ['submitted', 'shortlisted', 'sent_to_client', 'approved', 'declined', 'rejected'];
const SORTS = {
  added: ['Date added', (s) => new Date(s.createdAt).getTime(), 'desc'],
  name: ['Name', (s) => (s.creator.name || s.creator.handle || '').toLowerCase(), 'asc'],
  followers: ['Followers', (s) => s.creator.followers || 0, 'desc'],
  cost: ['Cost', (s) => s.vendorCost?.amount || 0, 'desc'],
  price: ['Price', (s) => s.clientCost?.amount || 0, 'desc'],
  margin: ['Margin', (s) => marginOf(s), 'desc'],
  vendor: ['Vendor', (s) => vendorOf(s).toLowerCase(), 'asc'],
  platform: ['Platform', (s) => s.creator.platform || '', 'asc'],
  state: ['State', (s) => (s.creator.state || '').toLowerCase(), 'asc'],
  city: ['City', (s) => (s.creator.city || '').toLowerCase(), 'asc'],
  district: ['District', (s) => (s.creator.district || '').toLowerCase(), 'asc'],
  constituency: ['Constituency', (s) => (s.creator.constituency || '').toLowerCase(), 'asc'],
  genre: ['Genre', (s) => genresOf(s).join(', ').toLowerCase(), 'asc'],
  status: ['Status', (s) => STATUS_ORDER.indexOf(s.status), 'asc'],
};
const sortGet = (key) => (key.startsWith('x:') ? (s) => String(s.extra?.[extraKey(key.slice(2))] || '').toLowerCase() : SORTS[key]?.[1]);
function sortRows(list, sort) {
  const get = sort && sortGet(sort.key);
  if (!get) return list;
  const dir = sort.dir === 'desc' ? -1 : 1;
  const blank = (v) => v === null || v === undefined || v === '' || v === 0;
  return list
    .map((s) => [s, get(s)])
    .sort(([, a], [, b]) => {
      // empty values always go last, whichever way the column is sorted
      if (blank(a) !== blank(b)) return blank(a) ? 1 : -1;
      if (typeof a === 'number' && typeof b === 'number') return (a - b) * dir;
      return String(a).localeCompare(String(b), undefined, { numeric: true }) * dir;
    })
    .map(([s]) => s);
}
// A column header: its name, and a ↕ button that opens the sort options for that column.
// ↕ = not sorted; ↑ / ↓ = sorted this way. (Phones hide the headers and use "Sort by" above the list instead.)
function SortHead({ k, label, sort, setSort, className }) {
  const [open, setOpen] = useState(null); // { top, left } of the menu while open
  const btn = useRef(null);
  const menu = useRef(null);
  const on = sort?.key === k;
  const numeric = NUMERIC.includes(k);
  const place = () => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return null;
    return { top: r.bottom + 6, left: Math.max(8, Math.min(r.left - 8, window.innerWidth - 228)), gone: r.bottom < 0 || r.top > window.innerHeight };
  };
  const show = () => setOpen(place());
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (e.type === 'keydown' && e.key !== 'Escape') return;
      if (e.type === 'mousedown' && (menu.current?.contains(e.target) || btn.current?.contains(e.target))) return;
      setOpen(null);
    };
    // the page or the table (sideways) scrolls: the menu stays under its button, and closes once that's off screen
    const follow = () => {
      const at = place();
      setOpen(!at || at.gone ? null : at);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    window.addEventListener('resize', follow);
    window.addEventListener('scroll', follow, true);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
      window.removeEventListener('resize', follow);
      window.removeEventListener('scroll', follow, true);
    };
  }, [Boolean(open)]); // eslint-disable-line react-hooks/exhaustive-deps
  const choose = (dir) => {
    setSort(dir ? { key: k, dir } : null);
    setOpen(null);
  };
  const opts = [
    ['asc', 'sortUp', k === 'added' ? 'Oldest first' : numeric ? 'Low → high' : 'A → Z'],
    ['desc', 'sortDown', k === 'added' ? 'Newest first' : numeric ? 'High → low' : 'Z → A'],
  ];
  if (numeric && k !== 'added') opts.reverse(); // numbers: biggest first is the usual question
  const host = typeof document !== 'undefined' ? document.querySelector('.app') || document.body : null;
  return (
    <span className={`cs-sorth ${on ? 'on' : ''} ${className || ''}`}>
      <span className="cs-sort-l">{label}</span>
      <button
        ref={btn}
        type="button"
        className={`cs-sortbtn ${on ? `on ${sort.dir}` : ''} ${open ? 'open' : ''}`}
        onClick={() => (open ? setOpen(null) : show())}
        aria-haspopup="menu"
        aria-expanded={Boolean(open)}
        aria-label={`Sort by ${label}${on ? ` (now ${opts.find(([d]) => d === sort.dir)[2]})` : ''}`}
        title={`Sort by ${label.toLowerCase()}`}
      >
        <Icon name={on ? (sort.dir === 'asc' ? 'sortUp' : 'sortDown') : 'sortBoth'} size={13} />
      </button>
      {open &&
        host &&
        createPortal(
          <div ref={menu} className="cs-sortmenu" role="menu" aria-label={`Sort by ${label}`} style={{ top: open.top, left: open.left }}>
            <small>Sort by {label}</small>
            {opts.map(([dir, icon, text]) => (
              <button key={dir} type="button" role="menuitemradio" aria-checked={on && sort.dir === dir} className={on && sort.dir === dir ? 'on' : ''} onClick={() => choose(dir)}>
                <Icon name={icon} size={15} /> {text}
                {on && sort.dir === dir && <Icon name="check" size={14} className="cs-sm-ok" />}
              </button>
            ))}
            {on && (
              <button type="button" role="menuitem" className="cs-sm-clear" onClick={() => choose(null)}>
                <Icon name="close" size={14} /> Clear sort
              </button>
            )}
          </div>,
          host
        )}
    </span>
  );
}

// "Sort by": every column by name, and an arrow button for the direction (up = A→Z / low→high, down = Z→A / high→low).
// No sort chosen = Date added, newest first.
const NUMERIC = ['added', 'followers', 'cost', 'price', 'margin', 'status'];
const dirText = (key, dir) => (key === 'added' ? (dir === 'asc' ? 'Oldest first' : 'Newest first') : NUMERIC.includes(key) ? (dir === 'asc' ? 'Low → high' : 'High → low') : dir === 'asc' ? 'A → Z' : 'Z → A');
function SortBar({ sort, setSort, columns, className = '' }) {
  const key = sort?.key || 'added';
  const dir = sort?.dir || 'desc';
  const pick = (k) => setSort(k === 'added' ? null : { key: k, dir: (k.startsWith('x:') ? 'asc' : SORTS[k]?.[2]) || 'asc' });
  const flip = () => {
    const d = dir === 'asc' ? 'desc' : 'asc';
    setSort(key === 'added' && d === 'desc' ? null : { key, dir: d });
  };
  return (
    <div className={`cs-sortby ${className}`} role="group" aria-label="Sort">
      <span className="cs-sortby-l">
        <Icon name="sortBoth" size={14} /> Sort by
      </span>
      <select value={key} onChange={(e) => pick(e.target.value)} aria-label="Sort by">
        {columns.map(([k, l]) => (
          <option key={k} value={k}>
            {l}
          </option>
        ))}
      </select>
      <button type="button" className={`cs-dir ${dir}`} onClick={flip} title={`${dirText(key, dir)} — click to reverse`} aria-label={`Direction: ${dirText(key, dir)}. Click to reverse`}>
        <Icon name={dir === 'asc' ? 'sortUp' : 'sortDown'} size={15} />
        <span>{dirText(key, dir)}</span>
      </button>
    </div>
  );
}

// header of one of the campaign's own columns: sort, rename, remove
function ExtraHead({ name, campaignId, sort, setSort, onChanged, toast }) {
  const [mode, setMode] = useState(''); // '' | edit | remove
  const [val, setVal] = useState(name);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const to = val.trim();
    if (!to || to === name) return setMode('');
    setBusy(true);
    try {
      await api.renameExtraColumn(campaignId, name, to);
      if (sort?.key === `x:${name}`) setSort({ ...sort, key: `x:${to}` });
      setMode('');
      onChanged?.(`Column renamed to “${to}”`);
    } catch (e) {
      toast?.(e.message, true);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    setBusy(true);
    try {
      await api.removeExtraColumn(campaignId, name);
      if (sort?.key === `x:${name}`) setSort(null);
      onChanged?.(`Column “${name}” removed`);
    } catch (e) {
      toast?.(e.message, true);
      setBusy(false);
    }
  };
  if (mode === 'edit')
    return (
      <span className="xh">
        <input className="cs-ftext on xh-in" autoFocus value={val} maxLength={40} disabled={busy} onChange={(e) => setVal(e.target.value)} onBlur={save} onKeyDown={(e) => (e.key === 'Enter' ? save() : e.key === 'Escape' ? (setVal(name), setMode('')) : null)} aria-label={`Rename column ${name}`} />
      </span>
    );
  if (mode === 'remove')
    return (
      <span className="xh xh-rm">
        <button type="button" className="linkish danger" disabled={busy} onClick={remove}>
          Remove “{name}”?
        </button>
        <button type="button" className="linkish" onClick={() => setMode('')}>
          Keep
        </button>
      </span>
    );
  return (
    <span className="xh">
      <SortHead k={`x:${name}`} label={name} sort={sort} setSort={setSort} />
      <button type="button" className="xh-btn" onClick={() => (setVal(name), setMode('edit'))} title="Rename this column" aria-label={`Rename column ${name}`}>
        <Icon name="edit" size={12} />
      </button>
      <button type="button" className="xh-btn" onClick={() => setMode('remove')} title="Remove this column" aria-label={`Remove column ${name}`}>
        <Icon name="close" size={12} />
      </button>
    </span>
  );
}

// "Update from sheet" (replaces the old Prices button): what to update, then the sheet
function UpdateMenu({ onPick }) {
  return (
    <details className="dl-menu up-menu">
      <summary className="btn ghost sm" title="Update creators on this campaign from a sheet or a pasted list">
        <Icon name="upload" size={15} /> Update from sheet
      </summary>
      <div className="dl-pop" role="menu">
        {Object.entries(PRESETS).map(([k, p]) => (
          <button key={k} type="button" role="menuitem" onClick={(e) => (e.currentTarget.closest('details').removeAttribute('open'), onPick(k))}>
            <b>
              <Icon name={p.icon} size={14} /> {p.title}
            </b>
            <small>{p.hint}</small>
          </button>
        ))}
      </div>
    </details>
  );
}

// Totals of the rows the filters show
function Summary({ list, total, stage }) {
  const t = useMemo(() => {
    let followers = 0, cost = 0, price = 0, costN = 0, priceN = 0, margin = 0, marginBase = 0;
    for (const s of list) {
      followers += s.creator.followers || 0;
      const c = s.vendorCost?.amount || 0;
      const p = s.clientCost?.amount || 0;
      if (c) (cost += c), (costN += 1);
      if (p) (price += p), (priceN += 1);
      if (c && p) (margin += p - c), (marginBase += p);
    }
    return { followers, cost, price, costN, priceN, margin, marginBase };
  }, [list]);
  const n = list.length;
  const vendor = stage === 'vendor';
  const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);
  const marginPct = t.marginBase ? Math.round((t.margin / t.marginBase) * 100) : null;
  const tiles = [
    { k: 'n', icon: 'creators', label: 'Creators', value: fmtNum(n), sub: n !== total ? `of ${fmtNum(total)} shown by the filters` : 'all creators here', bar: total ? pct(n, total) : 0 },
    { k: 'f', icon: 'activity', label: 'Total followers', value: fmtCompact(t.followers), sub: n ? `${fmtCompact(Math.round(t.followers / n))} on average` : '—' },
    { k: 'c', icon: 'wallet', label: vendor ? 'Your cost' : 'Cost', value: fmtINR(t.cost), sub: !n ? '—' : t.costN === n ? `${fmtINR(Math.round(t.cost / n))} on average` : `${fmtNum(n - t.costN)} without a cost`, bar: pct(t.costN, n), warn: t.costN < n },
  ];
  if (!vendor) {
    tiles.push({ k: 'p', icon: 'target', label: 'Price', value: fmtINR(t.price), sub: !n ? '—' : t.priceN === n ? 'every creator priced' : `${fmtNum(n - t.priceN)} without a price`, bar: pct(t.priceN, n), warn: t.priceN < n });
    tiles.push({
      k: 'm',
      icon: 'sparkles',
      label: 'Margin',
      value: `${t.margin < 0 ? '−' : ''}${fmtINR(Math.abs(t.margin))}`,
      sub: marginPct === null ? 'needs a cost and a price' : `${marginPct}% of price`,
      bar: marginPct === null ? 0 : Math.max(0, Math.min(100, marginPct)),
      neg: t.margin < 0,
    });
  }
  return (
    <div className="cs-sum" aria-label="Totals for the creators shown">
      {tiles.map((x) => (
        <div key={x.k} className={`cs-sum-t ${x.neg ? 'neg' : ''} ${x.warn ? 'warn' : ''}`}>
          <small>
            <Icon name={x.icon} size={13} /> {x.label}
          </small>
          <b>{x.value}</b>
          <em>{x.sub}</em>
          {x.bar !== undefined && (
            <i className="cs-sum-bar" aria-hidden="true">
              <span style={{ width: `${x.bar}%` }} />
            </i>
          )}
        </div>
      ))}
    </div>
  );
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

export default function CreatorsStage({ stage, items, campaignId, campaignName, downloads, extraColumns = [], onPricesSet, onColumnsChanged, onMove, onRemove, onAdd, busy, toast }) {
  const [pricing, setPricing] = useState(''); // the "Update from sheet" panel: '' or what to update (price | vendor | location | any)
  const extras = stage === 'vendor' ? [] : extraColumns;
  const [plat, setPlat] = useState(''); // platform toggle: '' = all
  const [sort, setSort] = useState(null); // { key, dir } — null: newest first
  const view = STAGE_VIEW[stage];
  const [filter, setFilter] = useState(view.filters ? view.filters[0][0] : 'all');
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState(() => new Set());

  const stageAll = useMemo(() => items.filter((s) => view.statuses.includes(s.status)), [items, view]);
  // the platforms on this stage, most creators first — a toggle above the table when there's more than one
  const platforms = useMemo(() => {
    const n = {};
    for (const s of stageAll) n[s.creator.platform || 'other'] = (n[s.creator.platform || 'other'] || 0) + 1;
    return Object.entries(n).sort((a, b) => b[1] - a[1]);
  }, [stageAll]);
  const inStage = useMemo(() => (plat ? stageAll.filter((s) => (s.creator.platform || 'other') === plat) : stageAll), [stageAll, plat]);
  const counts = useMemo(() => {
    const c = {};
    for (const [k, , st, fn] of view.filters || []) c[k] = st ? inStage.filter((s) => st.includes(s.status) && (!fn || fn(s))).length : inStage.length;
    return c;
  }, [inStage, view]);
  const [, , allowed, pass] = view.filters?.find(([k]) => k === filter) || [];
  // per-column filters: { name, followers, cost, price, margin, vendor, state, city, district, genre, status }
  const [cols, setCols] = useState({});
  useEffect(() => {
    setCols({});
    setSort(null);
  }, [stage]);
  const setCol = (k) => (v) => (setCols((f) => ({ ...f, [k]: v })), setPicked(new Set()));
  const colCount = Object.values(cols).filter(Boolean).length;
  const dcols = useDeferredValue(cols);
  const opts = useMemo(
    () => ({
      vendor: valuesOf(inStage, vendorOf).map((v) => [v, v]),
      state: valuesOf(inStage, (s) => s.creator.state),
      city: valuesOf(inStage, (s) => s.creator.city),
      district: valuesOf(inStage, (s) => s.creator.district),
      constituency: valuesOf(inStage, (s) => s.creator.constituency),
      ...Object.fromEntries(extras.map((x) => [`x:${x}`, valuesOf(inStage, (s) => s.extra?.[extraKey(x)])])),
      genre: valuesOf(inStage, genresOf),
      status: [...new Set(inStage.map((s) => s.status))].map((v) => [v, SUB_STATUS[v] || v]),
    }),
    [inStage, extras]
  );
  const place = (list) => list.map((v) => [v, v === EMPTY ? '(empty)' : v]);
  // the search box stays responsive while the list catches up (React filters in the background)
  const dq = useDeferredValue(q.trim().toLowerCase());
  const words = useMemo(() => new Map(inStage.map((s) => [s._id, `${s.creator.name} ${s.creator.handle} ${s.creator.city} ${s.vendor?.name || 'swol media'}`.toLowerCase()])), [inStage]);
  const [version, setVersion] = useState(0); // a saved cost or price changes the margin next to it — redraw the rows
  const filtered = useMemo(
    () => inStage.filter((s) => (!allowed || allowed.includes(s.status)) && (!pass || pass(s)) && (!dq || words.get(s._id).includes(dq)) && passes(s, dcols)),
    [inStage, allowed, pass, dq, words, dcols, version] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const shown = useMemo(() => sortRows(filtered, sort), [filtered, sort, version]); // eslint-disable-line react-hooks/exhaustive-deps
  // draw the first 60 rows, more as you scroll
  const [rows, moreRows] = useShowMore(shown, { resetKey: `${stage}|${filter}|${plat}|${dq}|${JSON.stringify(dcols)}|${sort?.key}|${sort?.dir}` });

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
        <SheetOverride
          campaignId={campaignId}
          preset={pricing}
          extraColumns={extraColumns}
          onClose={() => setPricing('')}
          onDone={(d) => {
            onPricesSet?.(d);
            if (d.counts.vendor || d.extraColumns?.length !== extraColumns.length) onColumnsChanged?.();
            toast?.(`Updated ${d.updated} creator${d.updated === 1 ? '' : 's'}${d.notFound.length ? ` · ${d.notFound.length} not on this campaign` : ''}`, !d.updated);
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
          {onPricesSet && <UpdateMenu onPick={setPricing} />}
          {onAdd && (
            <button type="button" className="btn primary" onClick={onAdd}>
              <Icon name="plus" size={17} /> Add creators
            </button>
          )}
        </div>
      </div>
      {view.note && <p className="cs-note">{view.note}</p>}
      {stageAll.length > 0 && (
        <div className={`cs-bar2 ${platforms.length > 1 ? '' : 'phone-only'}`}>
          {platforms.length > 1 && (
            <div className="seg cs-plat-seg" role="tablist" aria-label="Platform">
              <button type="button" role="tab" aria-selected={!plat} className={!plat ? 'on' : ''} onClick={() => (setPlat(''), setPicked(new Set()))}>
                All platforms <span>{fmtNum(stageAll.length)}</span>
              </button>
              {platforms.map(([k, n]) => (
                <button key={k} type="button" role="tab" aria-selected={plat === k} className={plat === k ? 'on' : ''} onClick={() => (setPlat(k), setPicked(new Set()))}>
                  {PLATFORM_LABEL[k] || 'Other'} <span>{fmtNum(n)}</span>
                </button>
              ))}
            </div>
          )}
          <SortBar
            className="phone-only"
            sort={sort}
            setSort={setSort}
            columns={[
              ...Object.entries(SORTS)
                .filter(([k]) => (stage !== 'vendor' || !['price', 'margin', 'vendor'].includes(k)) && (k !== 'platform' || platforms.length > 1))
                .map(([k, [l]]) => [k, k === 'cost' && stage === 'vendor' ? 'Your cost' : l]),
              ...extras.map((x) => [`x:${x}`, x]),
            ]}
          />
        </div>
      )}
      {stageAll.length > 0 && <Summary list={shown} total={inStage.length} stage={stage} />}

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
        <div className={`cs-table cs-wide ${selectable ? '' : 'no-check'}`} role="table" style={{ '--cols': colsFor(stage, selectable, extras.length), '--minw': `${1360 + extras.length * 130}px` }}>
          <div className="cs-row cs-head" role="row">
            {selectable && (
              <label className="cs-check">
                <input type="checkbox" checked={allOn} onChange={toggleAll} aria-label="Select all" />
              </label>
            )}
            <SortHead k="name" label="Name / username" sort={sort} setSort={setSort} />
            <SortHead k="followers" label="Followers" sort={sort} setSort={setSort} />
            <SortHead k="cost" label={stage === 'vendor' ? 'Your cost' : 'Cost'} sort={sort} setSort={setSort} />
            {stage !== 'vendor' && <SortHead k="price" label="Price" sort={sort} setSort={setSort} />}
            {stage !== 'vendor' && <SortHead k="margin" label="Margin" sort={sort} setSort={setSort} />}
            {stage !== 'vendor' && <SortHead k="vendor" label="Vendor" sort={sort} setSort={setSort} />}
            <SortHead k="state" label="State" sort={sort} setSort={setSort} />
            <SortHead k="city" label="City" sort={sort} setSort={setSort} />
            <SortHead k="district" label="District" sort={sort} setSort={setSort} />
            <SortHead k="constituency" label="Constituency" sort={sort} setSort={setSort} />
            <SortHead k="genre" label="Genre" sort={sort} setSort={setSort} />
            {extras.map((x) => (
              <ExtraHead key={x} name={x} campaignId={campaignId} sort={sort} setSort={setSort} toast={toast} onChanged={(msg) => (toast?.(msg), onColumnsChanged?.())} />
            ))}
            <SortHead k="status" label="Status" sort={sort} setSort={setSort} />
            <span />
          </div>
          <div className="cs-row cs-head cs-filters" role="row">
            {selectable && <span />}
            <span>
              <input className={`cs-ftext ${cols.name ? 'on' : ''}`} value={cols.name || ''} onChange={(e) => setCol('name')(e.target.value)} placeholder="Filter name" aria-label="Filter name or username" />
            </span>
            <span>
              <FollowersFilter compact value={cols.followers} onChange={setCol('followers')} />
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
              <ColSelect label="constituency" value={cols.constituency} onChange={setCol('constituency')} options={place(opts.constituency)} />
            </span>
            <span>
              <ColSelect label="genre" value={cols.genre} onChange={setCol('genre')} options={place(opts.genre)} />
            </span>
            {extras.map((x) => (
              <span key={x}>
                <ColSelect label={x} value={cols[`x:${x}`]} onChange={setCol(`x:${x}`)} options={place(opts[`x:${x}`] || [])} />
              </span>
            ))}
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
                <span className="cs-cell" data-label="Constituency">
                  <PlaceCell sub={s} field="constituency" campaignId={campaignId} toast={toast} />
                </span>
                <span className="cs-cell cs-genre" data-label="Genre">
                  {c.categories?.length ? c.categories.join(', ') : '—'}
                </span>
                {extras.map((x) => (
                  <span key={x} className="cs-cell cs-extra" data-label={x} title={s.extra?.[extraKey(x)] || ''}>
                    {s.extra?.[extraKey(x)] || <span className="muted">—</span>}
                  </span>
                ))}
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
// State / City / District / Constituency — click to type, Enter or click away to save (saved on the creator)
const PLACE_LABEL = { state: 'State', city: 'City', district: 'District', constituency: 'Constituency' };
function PlaceCell({ sub, field, campaignId, toast }) {
  const [value, setValue] = useState(sub.creator[field] || '');
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setValue(sub.creator[field] || '');
  }, [sub.creator[field]]); // eslint-disable-line react-hooks/exhaustive-deps

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
  useEffect(() => {
    setAmount(sub[field]?.amount || 0);
  }, [sub[field]?.amount]); // eslint-disable-line react-hooks/exhaustive-deps
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
