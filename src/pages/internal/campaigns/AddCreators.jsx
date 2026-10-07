import { useMemo, useRef, useState } from 'react';
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
  const entries = useMemo(() => all.filter(hasCost), [all]);
  const noCost = all.length - entries.length;
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
    if (!entries.length)
      return setError(mode === 'sheet' ? 'None of these rows has a cost — fill the Commercial column' : mode === 'links' ? 'Add a cost for these creators' : 'Add the creator’s cost');
    if (entries.length > 500) return setError('Add up to 500 creators at a time');
    setBusy(true);
    try {
      const d = await api.addCampaignCreators(campaign._id, { entries: entries.map(({ _row, ...x }) => x), platform, assignmentId: by || undefined });
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
        <>
          {error && <span className="pn-err">{error}</span>}
          {!error && entries.length > 0 && (
            <span className="pn-step">
              {fmtNum(entries.length)} creator{entries.length === 1 ? '' : 's'} · added by {who}
              {noCost ? ` · ${fmtNum(noCost)} without a cost will be left out` : ''}
            </span>
          )}
          <button type="button" className="btn ghost" onClick={onClose}>
            {result ? 'Done' : 'Cancel'}
          </button>
          <button className="btn primary" form="add-creators" disabled={busy || !entries.length}>
            {busy ? 'Adding…' : `Add ${entries.length > 1 ? fmtNum(entries.length) + ' creators' : 'creator'}`}
          </button>
        </>
      }
    >
      <form id="add-creators" onSubmit={submit} noValidate className="ac">
        {result && (
          <div className="ac-result">
            <p>
              <Icon name="check" size={16} /> {fmtNum(result.added)} added
              {result.skipped.length ? ` · ${fmtNum(result.skipped.length)} skipped` : ''}
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
                <span className="sh-req">Every row needs a cost in the <b>Commercial</b> column</span>
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
                {!found.includes('commercial') && (
                  <p className="sh-warn">This sheet has no “Commercial” column. Every creator needs a cost — add the column and upload again.</p>
                )}
                {found.includes('commercial') && noCost > 0 && (
                  <p className="sh-warn">
                    {fmtNum(noCost)} row{noCost === 1 ? ' has' : 's have'} no cost and will be left out: rows{' '}
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
                          {PREVIEW_COLS.filter((k) => found.includes(k)).map((k) => (
                            <th key={k}>{LABEL[k]}</th>
                          ))}

                        </tr>
                      </thead>
                      <tbody>
                        {sheet.entries.slice(0, 6).map((r) => (
                          <tr key={r._row} className={hasCost(r) ? '' : 'no-cost'}>
                            <td>{r._row}</td>
                            {PREVIEW_COLS.filter((k) => found.includes(k)).map((k) => (
                              <td key={k}>{r[k] || (k === 'commercial' ? <em className="sh-miss">missing</em> : '—')}</td>
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
            <Field label="Profile links" full hint="One per line: “link”, “link, cost” or “Name, link, cost”. Or paste rows straight from your sheet (with the header row).">
              <textarea
                rows={10}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={'https://instagram.com/priya.styles, 15000\nRiya Sen, https://instagram.com/riya_sen, 8k\nhttps://youtube.com/@techwithraj\n@foodie.raj'}
                className="mono-area"
                autoFocus
              />
            </Field>
            <Field label={vendorName ? 'Your cost for each creator' : 'Cost for each creator'} required hint="Used for lines without their own cost. Different costs? Write “link, cost” on each line, or upload a sheet.">
              <input value={eachCost} onChange={(e) => setEachCost(e.target.value)} placeholder="e.g. 15,000 per reel" />
            </Field>
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
            <Field label="Followers">
              <input value={one.followers} onChange={set('followers')} placeholder="e.g. 120000" inputMode="numeric" />
            </Field>
            <Field label={vendorName ? 'Your cost' : 'Cost'} required hint={vendorName ? 'What this creator costs, e.g. 15,000 per reel' : 'What this creator costs — the client cost is added later in the campaign table'}>
              <input value={one.commercial} onChange={set('commercial')} placeholder="15,000 per reel" />
            </Field>
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
