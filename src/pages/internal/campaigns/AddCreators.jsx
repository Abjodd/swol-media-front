import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../../api.js';
import Icon from '../../../components/Icon.jsx';
import { Panel, Field, PLATFORM_LABEL, fmtNum } from '../../../components/ui.jsx';
import { readSheetFile, rowsToEntries, TEMPLATE_HEADERS } from '../../../sheet.js';

// Pasted text → entries: one per line ("link", "Name, link", "@handle", "Name, @handle").
// A pasted sheet with a header row (copied from Google Sheets / Excel) is read like an upload.
function pastedEntries(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return [];
  if (/\t/.test(lines[0]) || /username|profile link/i.test(lines[0])) {
    const rows = lines.map((l) => l.split(/\t|,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((c) => c.trim().replace(/^"|"$/g, '')));
    const { entries } = rowsToEntries(rows);
    if (entries.length) return entries;
  }
  return lines.map((l) => {
    // "link", "Name, link", "link, 15000", "Name, link, 15,000 per reel"
    const parts = l.split(/,(?=\s*\S)/).map((x) => x.trim());
    const isCost = (x) => /^₹?\s*\d[\d.,]*\s*(k|l|lac|lakh|cr)?\b/i.test(x);
    let linkAt = parts.findIndex((x) => /^https?:|^www\.|^@/i.test(x)); // a link or @handle wins
    if (linkAt < 0) linkAt = parts.findIndex((x) => /^[\w.]+$/.test(x) && !isCost(x)); // else a bare username
    if (linkAt < 0) return { link: l };
    const e = { link: parts[linkAt] };
    if (linkAt > 0) e.name = parts.slice(0, linkAt).join(', ');
    if (parts.length > linkAt + 1) e.commercial = parts.slice(linkAt + 1).join(','); // "15,000 per reel" was split at its comma
    return e;
  });
}

// the sourcing sheet's columns, in its order (SN is only a row number)
const PREVIEW_COLS = ['vendor', 'handle', 'followers', 'name', 'link', 'commercial', 'state', 'city', 'district', 'genre'];
const hasCost = (e) => /\d/.test(String(e.commercial ?? ''));

// ── pricing: chosen before adding creators ─────────────────────────────────
// manual = one to one (each creator's own cost from the sheet) · bucket = budget split by followers · slab = pay by follower range
const PRICING = [
  { key: 'manual', title: 'One to one', icon: 'user', text: 'Each creator has their own price, taken from the sheet’s Commercial column (or typed in).' },
  { key: 'bucket', title: 'Bucket', icon: 'wallet', text: 'Set one budget. Each creator gets a share of it in proportion to their followers.' },
  { key: 'slab', title: 'Slabs', icon: 'layers', text: 'Set follower ranges with a fixed pay each, e.g. 0–100K followers → ₹1,000.' },
];
// "5,00,000", "5L", "500k", "1.2M" → number
export const toNum = (v) => {
  const m = String(v ?? '').toLowerCase().replace(/[,₹\s]/g, '').match(/^(\d+(?:\.\d+)?)(k|m|l|lac|lakh|cr)?$/);
  if (!m) return NaN;
  return Math.round(parseFloat(m[1]) * ({ k: 1e3, m: 1e6, l: 1e5, lac: 1e5, lakh: 1e5, cr: 1e7 }[m[2]] || 1));
};
const short = (n) => (n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${+(n / 1e3).toFixed(1)}K` : String(n));
const inr = (n) => `₹${Math.round(n).toLocaleString('en-IN')}`;
// the last slab is always "and above" (no upper limit), so every creator above the last range is covered
// pay boxes start empty (showing "amount") so every slab's pay is a deliberate choice
const DEFAULT_SLABS = [
  { min: '0', max: '100000', amount: '' },
  { min: '100000', max: '200000', amount: '' },
  { min: '200000', max: '', amount: '' },
];
// each slab starts where the one above ends — only the first slab's "from" is typed in
// … and there's always a final "and above" slab after the last range
const withAbove = (list) => (list.length && String(list[list.length - 1].max ?? '').trim() === '' ? list : [...list, { min: '', max: '', amount: '' }]);
const chain = (list) => {
  const l = withAbove(list);
  return l.map((x, i) => (i === 0 ? { ...x, min: '0' } : { ...x, min: l[i - 1].max })); // the first slab always starts at 0
};
const fromDefault = (slabs) => chain(slabs.map((x) => ({ min: String(x.min ?? 0), max: x.max == null ? '' : String(x.max), amount: String(x.amount ?? '') })));
// the slabs as numbers, sorted, plus the first problem found (mirrors the server's check)
function readSlabs(slabs) {
  // rows are already in order (each starts where the previous ends), so check them as shown
  const list = slabs.map((x) => ({ min: toNum(x.min || 0) || 0, max: String(x.max ?? '').trim() === '' ? null : toNum(x.max), amount: toNum(x.amount) }));
  let problem = list.length ? '' : 'Add at least one slab';
  list.forEach((x, i) => {
    if (problem) return;
    const last = i === list.length - 1;
    if (!last && x.max === null) problem = `Slab ${i + 1}: set “To”`;
    else if (!last && !(x.max > x.min)) problem = `Slab ${i + 1}: “To” must be more than ${short(x.min)}`;
    else if (!(x.amount > 0)) problem = last && i > 0 ? `Set the pay for “${short(x.min)} and above”` : `Slab ${i + 1}: set the pay`;
  });
  return { list, problem };
}
const slabFor = (list, f) => list.find((x) => f >= x.min && (x.max === null || f < x.max));
const followersOf = (e) => parseInt(String(e.followers ?? '').replace(/[^\d]/g, ''), 10) || 0;

const EMPTY_ONE = { vendor: '', handle: '', link: '', name: '', followers: '', commercial: '', state: '', city: '', district: '', genre: '', following: '', avgViews: '', engagement: '', photo: '', phone: '', email: '', note: '' };

const downloadTemplate = () => {
  const csv = '﻿' + TEMPLATE_HEADERS.join(',') + '\r\n' + '1,,priya.styles,120000,Priya Sharma,https://instagram.com/priya.styles,"15,000 per reel",Maharashtra,Mumbai,Mumbai Suburban,Fashion\r\n';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = 'Swol Media – creator sheet template.csv';
  a.click();
  URL.revokeObjectURL(a.href);
};

export default function AddCreators({ campaign, assignments = [], vendorName, onClose, onAdded }) {
  const [mode, setMode] = useState('sheet');
  // step 1: how this upload is priced; step 2: add the creators
  const [step, setStep] = useState('pricing');
  const [pricing, setPricing] = useState('manual');
  const [budget, setBudget] = useState('');
  const [slabs, setSlabsRaw] = useState(DEFAULT_SLABS);
  const setSlabs = (list) => setSlabsRaw(chain(list));
  const [saveDefault, setSaveDefault] = useState(false);
  const [savedDefault, setSavedDefault] = useState(null); // 'campaign' | 'vendor' when this campaign has default slabs
  // start from the campaign's default slabs, if someone set them
  useEffect(() => {
    api
      .pricingDefault(campaign._id)
      .then((d) => {
        if (!d.slabs?.length) return;
        setSlabsRaw(fromDefault(d.slabs));
        setPricing('slab');
        setSavedDefault(d.from);
      })
      .catch(() => {});
  }, [campaign._id]);
  const manual = pricing === 'manual';
  const slabCheck = useMemo(() => readSlabs(slabs), [slabs]);
  const budgetNum = toNum(budget);
  const pricingProblem = pricing === 'bucket' ? (budgetNum > 0 ? '' : 'Set the bucket budget') : pricing === 'slab' ? slabCheck.problem : '';
  const pricingLabel =
    pricing === 'bucket'
      ? `Bucket · ${inr(budgetNum || 0)} split by followers`
      : pricing === 'slab'
        ? `Slabs · ${slabCheck.list.map((x) => `${x.max === null ? `${short(x.min)}+` : `${short(x.min)}–${short(x.max)}`} ${inr(x.amount || 0)}`).join(' · ')}`
        : 'One to one · each creator’s own cost';
  const [by, setBy] = useState(''); // '' = Swol Media (or the sheet's Vendor column), else assignment id
  const [platform, setPlatform] = useState('instagram');
  const [text, setText] = useState('');
  const [sheet, setSheet] = useState(null); // { name, entries, problems, map }
  const [over, setOver] = useState(false);
  const [eachCost, setEachCost] = useState(''); // paste mode: cost for lines that don't have one
  const [one, setOne] = useState(EMPTY_ONE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const fileRef = useRef(null);

  // every creator needs a cost; rows without one are held back (and listed)
  const all = useMemo(() => {
    if (mode === 'sheet') return sheet?.entries || [];
    if (mode === 'links') return pastedEntries(text).map((e) => (hasCost(e) || !eachCost.trim() ? e : { ...e, commercial: eachCost.trim() }));
    return one.link.trim() || one.handle.trim() ? [one] : [];
  }, [mode, sheet, text, one, eachCost]);
  // every row with a username or link is added; empty cells (even the cost) just stay empty
  const entries = all;
  // what each creator would cost under a bucket / slab, from the followers we know now (the sheet's Followers column)
  const estimate = useMemo(() => {
    if (manual) return null;
    const out = new Map();
    if (pricing === 'bucket') {
      const total = entries.reduce((a, e) => a + followersOf(e), 0);
      for (const e of entries) out.set(e, followersOf(e) && budgetNum > 0 ? (budgetNum * followersOf(e)) / total : null);
    } else for (const e of entries) out.set(e, followersOf(e) ? slabFor(slabCheck.list, followersOf(e))?.amount ?? 0 : null);
    return out;
  }, [manual, pricing, entries, budgetNum, slabCheck]);
  const estText = (e) => {
    const v = estimate?.get(e);
    if (v == null) return <em className="sh-miss">after Instagram lookup</em>;
    if (!v) return <em className="sh-miss">no slab</em>;
    return inr(v);
  };
  const noCost = manual ? all.filter((e) => !hasCost(e)).length : 0; // added with the cost left empty
  const set = (k) => (e) => setOne({ ...one, [k]: e.target.value });

  const loadFile = async (file) => {
    if (!file) return;
    setError('');
    setResult(null);
    if (file.size > 5 * 1024 * 1024) return setError('That file is larger than 5 MB');
    try {
      const rows = await readSheetFile(file);
      const parsed = rowsToEntries(rows);
      if (!parsed.map) return setError('Couldn’t find a “Username” or “Profile Link” column in the first rows of this sheet');
      setSheet({ name: file.name, ...parsed });
    } catch (err) {
      setError(err.message || 'Couldn’t read that file');
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!all.length)
      return setError(mode === 'sheet' ? 'Upload a sheet first' : mode === 'links' ? 'Paste at least one profile link' : 'Add the creator’s username or profile link');
    if (pricingProblem) return setError(pricingProblem);
    if (entries.length > 500) return setError('Add up to 500 creators at a time');
    setBusy(true);
    try {
      const plan = manual ? { mode: 'manual' } : pricing === 'bucket' ? { mode: 'bucket', budget: budgetNum } : { mode: 'slab', slabs: slabCheck.list, saveDefault };
      const d = await api.addCampaignCreators(campaign._id, { entries: entries.map(({ _row, ...x }) => x), platform, assignmentId: by || undefined, pricing: plan });
      if (d.skipped.length || d.unmatchedVendors?.length) {
        setResult(d);
        if (d.added) onAdded(d, true);
        if (mode === 'links') setText(d.skipped.map((s) => s.input).join('\n'));
        if (mode === 'sheet') setSheet(null);
        if (mode === 'one' && d.added) setOne(EMPTY_ONE);
      } else onAdded(d);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // vendors add to their own assignment; the internal team can credit a vendor, use the sheet's Vendor column, or Swol Media
  const usesVendorCol = !vendorName && !by && entries.some((x) => x.vendor);
  const who = vendorName || (by ? assignments.find((a) => a._id === by)?.vendor.name : usesVendorCol ? 'the Vendor column' : 'Swol Media');
  const found = sheet?.map ? Object.keys(sheet.map.cols).filter((k) => k !== 'sn') : [];
  // preview columns; with a bucket / slab the worked-out cost sits right after Followers instead of Commercial
  const previewCols = PREVIEW_COLS.filter((k) => found.includes(k) && (manual || k !== 'commercial')).flatMap((k) => (!manual && k === 'followers' ? [k, 'est'] : [k]));
  if (!manual && !previewCols.includes('est')) previewCols.splice(previewCols.indexOf('handle') + 1, 0, 'est');
  const LABEL = { vendor: 'Vendor', handle: 'Username', followers: 'Followers', name: 'Name', link: 'Profile link', commercial: 'Commercial', state: 'State', city: 'City', district: 'District', genre: 'Genre', following: 'Following', avgViews: 'Avg views', engagement: 'Engagement', photo: 'Photo', phone: 'Phone', email: 'Email', bio: 'Bio', note: 'Note' };

  return (
    <Panel
      title="Add creators"
      subtitle={
        vendorName
          ? `Add the creators you’re proposing for ${campaign.name}. Upload your sheet, paste profile links, or add one at a time.`
          : `Add creator profiles to ${campaign.name}. Every profile and its details are saved to the creator database.`
      }
      onClose={onClose}
      wide
      footer={
        step === 'pricing' ? (
          <>
            {pricingProblem && pricing !== 'manual' && <span className="pn-step">{pricingProblem}</span>}
            <button type="button" className="btn ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn primary" disabled={Boolean(pricingProblem)} onClick={() => (setError(''), setStep('add'))}>
              Continue <Icon name="arrowRight" size={15} />
            </button>
          </>
        ) : (
          <>
            {error && <span className="pn-err">{error}</span>}
            {!error && entries.length > 0 && (
              <span className="pn-step">
                {fmtNum(entries.length)} creator{entries.length === 1 ? '' : 's'} · added by {who}
                {noCost ? ` · ${fmtNum(noCost)} without a cost (added with it empty)` : ''}
              </span>
            )}
            <button type="button" className="btn ghost" onClick={onClose}>
              {result ? 'Done' : 'Cancel'}
            </button>
            <button className="btn primary" form="add-creators" disabled={busy || !entries.length}>
              {busy ? 'Adding…' : `Add ${entries.length > 1 ? fmtNum(entries.length) + ' creators' : 'creator'}`}
            </button>
          </>
        )
      }
    >
      {step === 'pricing' ? (
        <div className="ac pr">
          <div className="pr-head">
            <h3>How are these creators priced?</h3>
            <p>Choose before adding them — it decides where each creator’s cost comes from.</p>
          </div>
          <div className="pr-opts" role="radiogroup" aria-label="Pricing">
            {PRICING.map((o) => (
              <button key={o.key} type="button" role="radio" aria-checked={pricing === o.key} className={`pr-opt ${pricing === o.key ? 'on' : ''}`} onClick={() => setPricing(o.key)}>
                <span className="pr-ic">
                  <Icon name={o.icon} size={18} />
                </span>
                <strong>{o.title}</strong>
                <span>{o.text}</span>
                <i className="pr-dot" aria-hidden />
              </button>
            ))}
          </div>

          {pricing === 'bucket' && (
            <div className="pr-cfg">
              <Field label="Bucket budget (₹)" required hint="The total for everyone in this upload, e.g. 5,00,000 or 5L">
                <input value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="5,00,000" inputMode="numeric" autoFocus />
              </Field>
              <div className="pr-formula" aria-label="How the cost is worked out">
                <span className="pr-frac">
                  <span>Creator’s followers × {budgetNum > 0 ? inr(budgetNum) : 'budget'}</span>
                  <span>Total followers of everyone in this upload</span>
                </span>
                <small>= that creator’s cost. Followers come from the sheet or the Instagram lookup, and costs update when the real numbers arrive.</small>
              </div>
            </div>
          )}

          {pricing === 'slab' && (
            <div className="pr-cfg">
              <div className="pr-slabs">
                <div className="pr-slab pr-slab-h">
                  <span>Followers from</span>
                  <span>To</span>
                  <span>Pay (₹)</span>
                  <span />
                </div>
                {slabs.map((x, i) => {
                  const above = i === slabs.length - 1; // the permanent "and above" slab
                  return (
                    <div className={`pr-slab ${above ? 'is-above' : ''}`} key={i}>
                      <input
                        value={i === 0 ? '0' : x.min || ''}
                        readOnly
                        tabIndex={-1}
                        className="pr-auto"
                        placeholder="set “To” above"
                        aria-label={i === 0 ? 'Slab 1 starts at 0 followers' : `Slab ${i + 1} from (same as slab ${i}’s “To”)`}
                        title={i === 0 ? 'Slabs always start at 0 followers' : 'Starts where the slab above ends'}
                      />
                      {above ? (
                        <input value="and above" readOnly tabIndex={-1} className="pr-auto" aria-label="No upper limit" title="The last slab has no upper limit — anyone above the last range gets this pay" />
                      ) : (
                        <input value={x.max} onChange={(e) => setSlabs(slabs.map((y, j) => (j === i ? { ...y, max: e.target.value } : y)))} placeholder="to" inputMode="numeric" aria-label={`Slab ${i + 1} to`} />
                      )}
                      <input value={x.amount} onChange={(e) => setSlabs(slabs.map((y, j) => (j === i ? { ...y, amount: e.target.value } : y)))} placeholder="amount" inputMode="numeric" aria-label={above ? 'Pay for and above' : `Slab ${i + 1} pay`} />
                      {above ? (
                        <span className="pr-lock" title="Always there — covers everyone above the last range">
                          <Icon name="lock" size={14} />
                        </span>
                      ) : (
                        <button type="button" className="icon-btn" aria-label={`Remove slab ${i + 1}`} disabled={slabs.length <= 2} onClick={() => setSlabs(slabs.filter((_, j) => j !== i))}>
                          <Icon name="close" size={14} />
                        </button>
                      )}
                    </div>
                  );
                })}
                <button
                  type="button"
                  className="btn ghost sm pr-add"
                  title="Adds a range before “and above”"
                  onClick={() => {
                    const ranges = slabs.slice(0, -1);
                    const from = ranges.length ? ranges[ranges.length - 1].max : slabs[0].min;
                    setSlabs([...ranges, { min: from, max: '', amount: '' }, slabs[slabs.length - 1]]);
                  }}
                >
                  <Icon name="plus" size={14} /> Add slab
                </button>
              </div>
              <p className="pr-note">
                Each slab starts where the one above ends, and the last slab always covers everyone above the last range — so no creator is left without a pay. You can write 100000, 100k or 1L.
              </p>
              {slabCheck.list.length > 0 && !slabCheck.problem && (
                <p className="pr-sum">
                  {slabCheck.list.map((x, i) => (
                    <em key={i}>
                      {x.max === null ? `${short(x.min)}+` : `${short(x.min)}–${short(x.max)}`} → {inr(x.amount)}
                    </em>
                  ))}
                </p>
              )}
              <label className="pr-toggle">
                <input type="checkbox" role="switch" checked={saveDefault} onChange={(e) => setSaveDefault(e.target.checked)} />
                <span className="pr-switch" aria-hidden />
                <span>
                  <b>{savedDefault ? 'Update the default slabs for this campaign' : 'Set as default for this campaign'}</b>
                  <small>
                    {savedDefault
                      ? `These slabs were filled in from ${savedDefault === 'vendor' ? 'your' : 'the campaign’s'} default. Turn this on to save your changes as the new default.`
                      : vendorName
                        ? 'Your next uploads to this campaign start with these slabs.'
                        : 'Every upload to this campaign starts with these slabs (vendors can still set their own).'}
                  </small>
                </span>
              </label>
            </div>
          )}
        </div>
      ) : (
      <form id="add-creators" onSubmit={submit} noValidate className="ac">
        <div className="pr-chosen">
          <span>
            <Icon name={PRICING.find((o) => o.key === pricing).icon} size={15} /> <b>Pricing:</b> {pricingLabel}
          </span>
          <button type="button" className="btn ghost sm" onClick={() => (setStep('pricing'), setResult(null))}>
            Change
          </button>
        </div>
        {result && (
          <div className="ac-result">
            <p>
              <Icon name="check" size={16} /> {fmtNum(result.added)} added
              {result.noCost ? ` (${fmtNum(result.noCost)} without a cost)` : ''}
              {result.skipped.length ? ` · ${fmtNum(result.skipped.length)} skipped` : ''}
              {result.pricing?.label ? ` · ${result.pricing.label}` : ''}
            </p>
            {result.unmatchedVendors?.length > 0 && (
              <p className="ac-warn">
                Not on this campaign, so added as Swol Media: {result.unmatchedVendors.join(', ')}. Assign them in the Vendors tab first to credit them.
              </p>
            )}
            {result.skipped.length > 0 && (
              <ul>
                {result.skipped.slice(0, 8).map((s, i) => (
                  <li key={i}>
                    <code>{s.input}</code> — {s.reason}
                  </li>
                ))}
                {result.skipped.length > 8 && <li>…and {result.skipped.length - 8} more</li>}
              </ul>
            )}
          </div>
        )}

        {!vendorName && (
          <div className="fx-grid">
            <Field label="Added by" hint="Credit one vendor for everything, or leave on “Swol Media” to use each row’s Vendor column" full>
              <select value={by} onChange={(e) => setBy(e.target.value)}>
                <option value="">Swol Media / the sheet’s Vendor column</option>
                {assignments.map((a) => (
                  <option key={a._id} value={a._id}>
                    {a.vendor.name} — {fmtNum(a.counts.submitted)} of {fmtNum(a.quota)} added
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}

        <div className="seg full-w ac-mode three">
          <button type="button" className={mode === 'sheet' ? 'on' : ''} onClick={() => setMode('sheet')}>
            <Icon name="file" size={15} /> Upload sheet
          </button>
          <button type="button" className={mode === 'links' ? 'on' : ''} onClick={() => setMode('links')}>
            <Icon name="upload" size={15} /> Paste links
          </button>
          <button type="button" className={mode === 'one' ? 'on' : ''} onClick={() => setMode('one')}>
            <Icon name="user" size={15} /> One creator
          </button>
        </div>

        {mode === 'sheet' && (
          <div className="fx-grid">
            {!sheet ? (
              <div
                className={`sh-drop full ${over ? 'over' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => fileRef.current?.click()}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileRef.current?.click()}
                onDragOver={(e) => (e.preventDefault(), setOver(true))}
                onDragLeave={() => setOver(false)}
                onDrop={(e) => (e.preventDefault(), setOver(false), loadFile(e.dataTransfer.files?.[0]))}
              >
                <span className="sh-drop-ic">
                  <Icon name="upload" size={22} />
                </span>
                <strong>Drop your creator sheet here, or click to choose</strong>
                <span>Excel (.xlsx) or CSV — from Google Sheets use File → Download</span>
                <span className="sh-req">
                  {manual ? (
                    <>
                      Put each creator’s cost in the <b>Commercial</b> column — rows with empty cells are still added
                    </>
                  ) : (
                    <>
                      Costs come from your {pricing === 'bucket' ? 'bucket' : 'slabs'} — the Commercial column is ignored. A <b>Followers</b> column lets you check costs now.
                    </>
                  )}
                </span>
                <span className="sh-cols">
                  {TEMPLATE_HEADERS.map((h) => (
                    <em key={h}>{h}</em>
                  ))}
                </span>
              </div>
            ) : (
              <div className="sh-loaded full">
                <div className="sh-loaded-head">
                  <span className="sh-file-ic">
                    <Icon name="file" size={18} />
                  </span>
                  <div>
                    <strong>{sheet.name}</strong>
                    <span>
                      {fmtNum(sheet.entries.length)} creator{sheet.entries.length === 1 ? '' : 's'} found
                      {sheet.problems.length ? ` · ${fmtNum(sheet.problems.length)} row${sheet.problems.length === 1 ? '' : 's'} without a username or link` : ''}
                      {noCost ? ` · ${fmtNum(noCost)} without a cost` : ''}
                    </span>
                  </div>
                  <button type="button" className="btn ghost sm" onClick={() => (setSheet(null), setResult(null))}>
                    Choose another
                  </button>
                </div>
                <p className="sh-found">
                  Columns read:{' '}
                  {found.map((k) => (
                    <em key={k}>{LABEL[k] || k}</em>
                  ))}
                </p>
                {manual && !found.includes('commercial') && (
                  <p className="sh-note">This sheet has no “Commercial” column, so the creators are added without a cost — fill it in later from the campaign table.</p>
                )}
                {manual && found.includes('commercial') && noCost > 0 && (
                  <p className="sh-note">
                    {fmtNum(noCost)} row{noCost === 1 ? ' has' : 's have'} no cost — {noCost === 1 ? 'it is' : 'they are'} still added, with the cost empty to fill in later: rows{' '}
                    {sheet.entries.filter((r) => !hasCost(r)).slice(0, 8).map((r) => r._row).join(', ')}
                    {noCost > 8 ? '…' : ''}
                  </p>
                )}
                {sheet.entries.length > 0 && (
                  <div className="sh-table-wrap">
                    <table className="sh-table">
                      <thead>
                        <tr>
                          <th>Row</th>
                          {previewCols.map((k) => (
                            <th key={k}>{k === 'est' ? `Cost (${pricing === 'bucket' ? 'share' : 'slab'})` : LABEL[k]}</th>
                          ))}

                        </tr>
                      </thead>
                      <tbody>
                        {sheet.entries.slice(0, 6).map((r) => (
                          <tr key={r._row}>
                            <td>{r._row}</td>
                            {previewCols.map((k) => (
                              <td key={k}>{k === 'est' ? <b>{estText(r)}</b> : r[k] || (k === 'commercial' ? <em className="sh-miss">empty</em> : '—')}</td>
                            ))}

                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {sheet.entries.length > 6 && <p className="sh-more">…and {fmtNum(sheet.entries.length - 6)} more</p>}
                  </div>
                )}
              </div>
            )}
            <div className="fx full ac-file">
              <button type="button" className="btn ghost sm" onClick={downloadTemplate}>
                <Icon name="download" size={15} /> Download blank template
              </button>
              <span className="fx-hint">Usernames without a link are taken as {PLATFORM_LABEL[platform]} — change below if needed.</span>
            </div>
            <Field label="Platform for usernames" hint="Profile links are detected automatically">
              <PlatformSelect value={platform} onChange={setPlatform} />
            </Field>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.csv,.txt,.tsv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              hidden
              onChange={(e) => (loadFile(e.target.files?.[0]), (e.target.value = ''))}
            />
          </div>
        )}

        {mode === 'links' && (
          <div className="fx-grid">
            <Field
              label="Profile links"
              full
              hint={
                manual
                  ? 'One per line: “link”, “link, cost” or “Name, link, cost”. Or paste rows straight from your sheet (with the header row).'
                  : `One per line: “link” or “Name, link”. Costs come from your ${pricing === 'bucket' ? 'bucket' : 'slabs'} once followers are known. Or paste rows from your sheet (with the header row).`
              }
            >
              <textarea
                rows={10}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={'https://instagram.com/priya.styles, 15000\nRiya Sen, https://instagram.com/riya_sen, 8k\nhttps://youtube.com/@techwithraj\n@foodie.raj'}
                className="mono-area"
                autoFocus
              />
            </Field>
            {manual && <Field label={vendorName ? 'Your cost for each creator' : 'Cost for each creator'} hint="Optional — used for lines without their own cost. Leave empty to add them without a cost and fill it in later.">
              <input value={eachCost} onChange={(e) => setEachCost(e.target.value)} placeholder="e.g. 15,000 per reel" />
            </Field>}
            <Field label="Platform for bare @handles" hint="Links are detected automatically">
              <PlatformSelect value={platform} onChange={setPlatform} />
            </Field>
          </div>
        )}

        {mode === 'one' && (
          <div className="fx-grid">
            <Field label="Username" hint="Without the @">
              <input value={one.handle} onChange={set('handle')} placeholder="priya.styles" autoFocus />
            </Field>
            <Field label="Platform">
              <PlatformSelect value={platform} onChange={setPlatform} />
            </Field>
            <Field label="Profile link" full hint="Optional if you’ve entered the username">
              <input value={one.link} onChange={set('link')} placeholder="https://instagram.com/priya.styles" />
            </Field>
            <Field label="Name">
              <input value={one.name} onChange={set('name')} placeholder="Priya Sharma" />
            </Field>
            <Field label="Followers" hint={manual ? undefined : 'Sets the cost now — the Instagram lookup replaces it with the real number'}>
              <input value={one.followers} onChange={set('followers')} placeholder="e.g. 120000" inputMode="numeric" />
            </Field>
            {manual ? (
              <Field label={vendorName ? 'Your cost' : 'Cost'} hint={vendorName ? 'What this creator costs, e.g. 15,000 per reel — you can also add it later' : 'What this creator costs (optional) — the client cost is added later in the campaign table'}>
                <input value={one.commercial} onChange={set('commercial')} placeholder="15,000 per reel" />
              </Field>
            ) : (
              <Field label="Cost" hint={pricing === 'bucket' ? 'A share of the bucket — worked out from followers' : 'From your slabs — worked out from followers'}>
                <input value={entries[0] ? (estimate?.get(entries[0]) ? inr(estimate.get(entries[0])) : 'After the Instagram lookup') : ''} readOnly placeholder="Worked out from followers" />
              </Field>
            )}
            <Field label="Genre">
              <input value={one.genre} onChange={set('genre')} placeholder="Fashion, food, tech…" />
            </Field>
            <Field label="State">
              <input value={one.state} onChange={set('state')} placeholder="Maharashtra" />
            </Field>
            <Field label="City">
              <input value={one.city} onChange={set('city')} placeholder="Mumbai" />
            </Field>
            <Field label="District">
              <input value={one.district} onChange={set('district')} placeholder="Mumbai Suburban" />
            </Field>
            {!vendorName && (
              <Field label="Vendor" hint="Only used when “Added by” is Swol Media">
                <input value={one.vendor} onChange={set('vendor')} placeholder="Vendor name, if any" />
              </Field>
            )}
            <details className="fx full ac-more">
              <summary>More details (stats, photo, contact)</summary>
              <div className="fx-grid">
                <Field label="Following">
                  <input value={one.following} onChange={set('following')} placeholder="e.g. 850" inputMode="numeric" />
                </Field>
                <Field label="Avg views">
                  <input value={one.avgViews} onChange={set('avgViews')} placeholder="e.g. 45000" inputMode="numeric" />
                </Field>
                <Field label="Engagement %">
                  <input value={one.engagement} onChange={set('engagement')} placeholder="e.g. 4.2" inputMode="decimal" />
                </Field>
                <Field label="Profile photo link">
                  <input value={one.photo} onChange={set('photo')} placeholder="https://…" />
                </Field>
                <Field label="Phone">
                  <input value={one.phone} onChange={set('phone')} placeholder="+91 98xxxxxxxx" inputMode="tel" />
                </Field>
                <Field label="Email">
                  <input type="email" value={one.email} onChange={set('email')} placeholder="creator@email.com" />
                </Field>
                <Field label="Note" full>
                  <input value={one.note} onChange={set('note')} placeholder="Availability, anything the team should know" />
                </Field>
              </div>
            </details>
          </div>
        )}
      </form>
      )}
    </Panel>
  );
}

function PlatformSelect({ value, onChange }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {Object.entries(PLATFORM_LABEL).map(([k, l]) => (
        <option key={k} value={k}>
          {l}
        </option>
      ))}
    </select>
  );
}
