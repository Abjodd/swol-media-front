import { useMemo, useRef, useState } from 'react';
import { api } from '../../../api.js';
import { OVERRIDE_FIELDS, pasteRows, readOverride, readSheetFile } from '../../../sheet.js';
import { Panel, fmtNum } from '../../../components/ui.jsx';
import Icon from '../../../components/Icon.jsx';
import VendorCheck, { applyVendorChoices, checkVendors } from '../../../components/VendorCheck.jsx';

// "Update from sheet" (team): a sheet — or two columns pasted from one — with each creator's username or profile
// link, and any other columns. Each column is matched to a field of the table (price, vendor, location, constituency…)
// or kept as a new column of this campaign, named after the sheet's header (rename it here, or later from the table).
export const PRESETS = {
  price: { title: 'Prices', icon: 'wallet', fields: ['price'], hint: 'username or link · price', example: '@priya.styles  15000\nhttps://instagram.com/riya_sen, 8k\nfoodie.raj\t₹22,500' },
  vendor: { title: 'Vendors', icon: 'vendors', fields: ['vendor'], hint: 'username or link · vendor name', example: '@priya.styles\tAbjod Media\nhttps://youtube.com/@techwithraj, Bright Reach' },
  location: { title: 'Location', icon: 'mapPin', fields: ['state', 'city', 'district', 'constituency'], hint: 'username or link · constituency (or columns State, City, District, Constituency with headers)', example: '@priya.styles\tKasba Peth\nriya_sen\tShivajinagar' },
  any: { title: 'Any columns', icon: 'layers', fields: null, hint: 'a username or link column + any columns, with headers', example: 'Username\tPrice\tLanguage\tConstituency\n@priya.styles\t15000\tMarathi\tKasba Peth' },
};
const LABEL = Object.fromEntries(OVERRIDE_FIELDS);
const BUILT_IN = /^(name|name \/ username|username|followers|cost|price|margin|vendor|state|city|district|constituency|genre|status)$/i;
const CHUNK = 500;

export default function SheetOverride({ campaignId, preset: start = 'any', extraColumns = [], onClose, onDone }) {
  const [preset, setPreset] = useState(start);
  const [mode, setMode] = useState(start === 'any' ? 'file' : 'paste');
  const [pasted, setPasted] = useState('');
  const [sheet, setSheet] = useState(null); // { name, header, creatorCol, columns, body }
  const [error, setError] = useState('');
  const [questions, setQuestions] = useState(null); // vendor look-alikes to answer
  const [choice, setChoice] = useState({});
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const fileRef = useRef(null);
  const p = PRESETS[preset];

  const take = (rows, name) => {
    const s = readOverride(rows, preset);
    if (!s.body.length) return setError('No rows found — one creator per line, their username or profile link first');
    // a preset only fills its own fields: other columns start as "skip" (pick them below to use them too)
    if (p.fields) for (const col of s.columns) if (!p.fields.includes(col.field)) col.field = 'skip';
    // a header that names one of the campaign's columns fills that column
    for (const col of s.columns) {
      const same = extraColumns.find((x) => x.toLowerCase() === col.name.toLowerCase());
      if (same && col.field === 'extra') col.name = same;
    }
    setError('');
    setQuestions(null);
    setChoice({});
    setSheet({ name, ...s });
  };
  const readPaste = () => take(pasteRows(pasted), 'Pasted list');
  const load = async (file) => {
    if (!file) return;
    try {
      take(await readSheetFile(file), file.name);
    } catch (e) {
      setError(e.message || 'Couldn’t read that file');
    }
  };

  const setCol = (i, patch) => setSheet((s) => ({ ...s, columns: s.columns.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));
  const used = (sheet?.columns || []).filter((c) => c.field !== 'skip');
  const problems = useMemo(() => {
    if (!sheet) return [];
    const out = [];
    const seen = new Map();
    for (const c of used) {
      const k = c.field === 'extra' ? `extra:${c.name.trim().toLowerCase()}` : c.field;
      if (c.field === 'extra' && !c.name.trim()) out.push('Give every new column a name');
      else if (c.field === 'extra' && BUILT_IN.test(c.name.trim())) out.push(`“${c.name}” is already a column of the table — pick that field instead, or rename the new column`);
      else if (seen.has(k)) out.push(`Two columns fill ${c.field === 'extra' ? `“${c.name}”` : LABEL[c.field]} — skip one`);
      seen.set(k, true);
    }
    if (!used.length) out.push('Pick at least one column to update');
    return [...new Set(out)];
  }, [sheet]); // eslint-disable-line react-hooks/exhaustive-deps
  const rowsOf = (rename = (v) => v) =>
    sheet.body
      .map((r) => {
        const values = {};
        for (const c of used) {
          const v = r.cells[c.index] || '';
          values[c.field === 'extra' ? `extra:${c.name.trim()}` : c.field] = c.field === 'vendor' ? rename(v) : v;
        }
        return { input: r.cells[sheet.creatorCol] || '', values };
      })
      .filter((r) => r.input);
  const newCols = used.filter((c) => c.field === 'extra' && !extraColumns.some((x) => x.toLowerCase() === c.name.trim().toLowerCase()));

  const submit = async () => {
    setError('');
    // vendor names that look like an existing vendor: ask first (once)
    const vcol = used.find((c) => c.field === 'vendor');
    if (vcol && questions === null) {
      try {
        const q = await checkVendors(
          api,
          sheet.body.map((r) => r.cells[vcol.index]).filter((v) => v && !/^swol(\s*media)?$/i.test(v))
        );
        setQuestions(q);
        if (q.length) return; // answer them, then press Update again
      } catch (e) {
        return setError(e.message);
      }
    }
    if ((questions || []).some((q) => choice[q.name] === undefined)) return setError('Answer the vendor question above first');
    const { rename, confirmed } = applyVendorChoices(questions || [], choice);
    const rows = rowsOf(rename);
    const total = { updated: 0, counts: {}, notFound: [], invalid: [], autoVendors: [], extraColumns };
    setProgress({ done: 0, total: rows.length });
    try {
      for (let i = 0; i < rows.length; i += CHUNK) {
        const d = await api.overrideCreators(campaignId, rows.slice(i, i + CHUNK), confirmed);
        total.updated += d.updated;
        for (const [k, n] of Object.entries(d.counts || {})) total.counts[k] = (total.counts[k] || 0) + n;
        total.notFound.push(...d.notFound);
        total.invalid.push(...d.invalid);
        total.autoVendors.push(...(d.autoVendors || []).filter((v) => !total.autoVendors.some((x) => x.vendorId === v.vendorId)));
        total.extraColumns = d.extraColumns || total.extraColumns;
        setProgress({ done: Math.min(rows.length, i + CHUNK), total: rows.length });
      }
      setResult(total);
      onDone?.(total);
    } catch (e) {
      setError(e.message);
    } finally {
      setProgress(null);
    }
  };

  const ready = sheet && !problems.length && !progress;
  return (
    <Panel
      wide
      title="Update from sheet"
      subtitle="Match a sheet to the creators on this campaign by username or profile link. Each column updates a field of the table — or becomes a new column, named after its header."
      onClose={onClose}
      footer={
        <>
          {error ? <span className="pn-err">{error}</span> : sheet && !result && problems.length ? <span className="pn-err">{problems[0]}</span> : progress ? <span className="pn-step">Updating {fmtNum(progress.done)} of {fmtNum(progress.total)}…</span> : null}
          <button type="button" className="btn ghost" onClick={onClose}>
            {result ? 'Done' : 'Cancel'}
          </button>
          {!result && sheet && (
            <button type="button" className="btn primary" disabled={!ready} onClick={submit}>
              {progress ? 'Updating…' : questions?.length ? 'Continue' : `Update ${fmtNum(sheet.body.filter((r) => r.cells[sheet.creatorCol]).length)} creator${sheet.body.length === 1 ? '' : 's'}`}
            </button>
          )}
        </>
      }
    >
      <div className="ac so">
        {result ? (
          <Result r={result} />
        ) : !sheet ? (
          <>
            <div className="so-presets" role="radiogroup" aria-label="What to update">
              {Object.entries(PRESETS).map(([k, x]) => (
                <button key={k} type="button" role="radio" aria-checked={preset === k} className={preset === k ? 'on' : ''} onClick={() => setPreset(k)}>
                  <Icon name={x.icon} size={16} />
                  <b>{x.title}</b>
                </button>
              ))}
            </div>
            <div className="seg pr-modes" role="tablist" aria-label="How to add the sheet">
              <button type="button" role="tab" aria-selected={mode === 'file'} className={mode === 'file' ? 'on' : ''} onClick={() => setMode('file')}>
                <Icon name="upload" size={14} /> Upload a sheet
              </button>
              <button type="button" role="tab" aria-selected={mode === 'paste'} className={mode === 'paste' ? 'on' : ''} onClick={() => setMode('paste')}>
                <Icon name="copy" size={14} /> Paste a list
              </button>
            </div>
            {mode === 'paste' ? (
              <>
                <label className="pr-paste">
                  <span>One creator per line — {p.hint}. Copying columns from Excel or Google Sheets works too.</span>
                  <textarea autoFocus value={pasted} onChange={(e) => setPasted(e.target.value)} rows={9} placeholder={p.example} />
                </label>
                <button type="button" className="btn primary sm" disabled={!pasted.trim()} onClick={readPaste}>
                  Check {fmtNum(pasted.split(/\r?\n/).filter((l) => l.trim()).length)} line{pasted.split(/\r?\n/).filter((l) => l.trim()).length === 1 ? '' : 's'}
                </button>
              </>
            ) : (
              <div className="sh-drop" role="button" tabIndex={0} onClick={() => fileRef.current?.click()} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => (e.preventDefault(), load(e.dataTransfer.files?.[0]))}>
                <span className="sh-drop-ic">
                  <Icon name="upload" size={22} />
                </span>
                <strong>Drop the sheet here, or click to choose</strong>
                <span>Excel (.xlsx) or CSV · {p.hint}</span>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="sh-loaded-head">
              <span className="sh-file-ic">
                <Icon name="file" size={18} />
              </span>
              <div>
                <strong>{sheet.name}</strong>
                <span>
                  {fmtNum(sheet.body.length)} row{sheet.body.length === 1 ? '' : 's'} · creators from {sheet.header ? `“${sheet.header[sheet.creatorCol] || `column ${sheet.creatorCol + 1}`}”` : `column ${sheet.creatorCol + 1}`}
                </span>
              </div>
              <button type="button" className="btn ghost sm" onClick={() => (setSheet(null), setQuestions(null))}>
                {sheet.name === 'Pasted list' ? 'Edit list' : 'Choose another'}
              </button>
            </div>

            <div className="so-map" role="table" aria-label="Columns">
              <div className="so-row so-head" role="row">
                <span>Column in the sheet</span>
                <span>Example</span>
                <span>Goes to</span>
              </div>
              <div className="so-row so-who" role="row">
                <span>
                  <b>{sheet.header?.[sheet.creatorCol] || `Column ${sheet.creatorCol + 1}`}</b>
                </span>
                <span className="so-ex">{sheet.body[0]?.cells[sheet.creatorCol] || '—'}</span>
                <span>
                  <select
                    value={sheet.creatorCol}
                    onChange={(e) => {
                      const i = Number(e.target.value);
                      setSheet((s) => {
                        const all = [...new Set([s.creatorCol, ...s.columns.map((c) => c.index)])].sort((a, b) => a - b);
                        const columns = all.filter((x) => x !== i).map((x) => s.columns.find((c) => c.index === x) || { index: x, header: s.header?.[x] || '', field: 'skip', name: (s.header?.[x] || `Column ${x + 1}`).slice(0, 40) });
                        return { ...s, creatorCol: i, columns };
                      });
                    }}
                    aria-label="Column with the creator"
                  >
                    {[sheet.creatorCol, ...sheet.columns.map((c) => c.index)].sort((a, b) => a - b).map((x) => (
                      <option key={x} value={x}>
                        Creator (username / link){x !== sheet.creatorCol ? ` — use “${sheet.header?.[x] || `Column ${x + 1}`}”` : ''}
                      </option>
                    ))}
                  </select>
                </span>
              </div>
              {sheet.columns.map((col, i) => {
                const existing = extraColumns.find((x) => x.toLowerCase() === col.name.trim().toLowerCase());
                return (
                  <div key={col.index} className={`so-row ${col.field === 'skip' ? 'off' : ''}`} role="row">
                    <span>
                      <b>{col.header || `Column ${col.index + 1}`}</b>
                    </span>
                    <span className="so-ex">{sheet.body.find((r) => r.cells[col.index])?.cells[col.index] || '—'}</span>
                    <span className="so-to">
                      <select
                        value={col.field === 'extra' ? (existing ? `x:${existing}` : 'extra') : col.field}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v.startsWith('x:')) setCol(i, { field: 'extra', name: v.slice(2) });
                          else if (v === 'extra') setCol(i, { field: 'extra', name: existing ? (col.header || `Column ${col.index + 1}`).slice(0, 40) : col.name });
                          else setCol(i, { field: v });
                        }}
                        aria-label={`What “${col.header || `column ${col.index + 1}`}” updates`}
                      >
                        <option value="skip">Don’t use</option>
                        <optgroup label="Table fields">
                          {OVERRIDE_FIELDS.map(([k, l]) => (
                            <option key={k} value={k}>
                              {l}
                            </option>
                          ))}
                        </optgroup>
                        <optgroup label="Columns of this campaign">
                          <option value="extra">＋ New column…</option>
                          {extraColumns.map((x) => (
                            <option key={x} value={`x:${x}`}>
                              {x}
                            </option>
                          ))}
                        </optgroup>
                      </select>
                      {col.field === 'extra' && !existing && (
                        <label className="so-name">
                          <span>Column name</span>
                          <input value={col.name} maxLength={40} onChange={(e) => setCol(i, { name: e.target.value })} aria-label="New column name" />
                        </label>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
            {newCols.length > 0 && (
              <p className="so-note">
                <Icon name="plus" size={14} /> {newCols.length === 1 ? 'A new column' : `${newCols.length} new columns`} will be added to the table: {newCols.map((c) => `“${c.name.trim()}”`).join(', ')}. You can rename {newCols.length === 1 ? 'it' : 'them'} later from the table header.
              </p>
            )}
            <p className="so-note muted">Empty cells leave the creator’s current value as it is. Creators not on this campaign are listed after the update.</p>
            {questions?.length > 0 && <VendorCheck questions={questions} choice={choice} setChoice={setChoice} />}
          </>
        )}
        <input ref={fileRef} type="file" hidden accept=".xlsx,.csv,.txt,.tsv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => (load(e.target.files?.[0]), (e.target.value = ''))} />
      </div>
    </Panel>
  );
}

function Result({ r }) {
  const [copied, setCopied] = useState('');
  const parts = Object.entries(r.counts)
    .filter(([k]) => k !== 'extra')
    .map(([k, n]) => `${LABEL[k] || k} ${fmtNum(n)}`);
  if (r.counts.extra) parts.push(`new / extra columns ${fmtNum(r.counts.extra)}`);
  const copy = async (v) => {
    try {
      await navigator.clipboard.writeText(`Swol Media login\n${window.location.origin}/login\nID: ${v.login.email}\nPassword: ${v.login.password}`);
      setCopied(v.vendorId);
      setTimeout(() => setCopied(''), 1500);
    } catch {
      /* clipboard blocked */
    }
  };
  return (
    <div className="ac-result">
      <p>
        <Icon name="check" size={16} /> Updated {fmtNum(r.updated)} creator{r.updated === 1 ? '' : 's'}
      </p>
      {parts.length > 0 && <p className="muted">{parts.join(' · ')}</p>}
      {r.autoVendors.length > 0 && (
        <div className="up-vendors">
          <p>
            <b>{r.autoVendors.length === 1 ? 'Vendor' : `${r.autoVendors.length} vendors`} added to this campaign</b>
          </p>
          <ul>
            {r.autoVendors.map((v) => (
              <li key={v.vendorId}>
                <strong>
                  {v.name}
                  {v.newVendor && <em>new</em>}
                </strong>
                {v.login ? (
                  <span className="up-login">
                    <code>{v.login.email}</code>
                    <code>{v.login.password}</code>
                    <button type="button" className="up-copy" onClick={() => copy(v)}>
                      {copied === v.vendorId ? 'Copied' : 'Copy login'}
                    </button>
                  </span>
                ) : (
                  <small>already has a login</small>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {r.notFound.length > 0 && (
        <p className="ac-warn">
          Not on this campaign ({fmtNum(r.notFound.length)}): {r.notFound.slice(0, 12).join(', ')}
          {r.notFound.length > 12 ? ` and ${fmtNum(r.notFound.length - 12)} more` : ''}
        </p>
      )}
      {r.invalid.length > 0 && (
        <p className="ac-warn">
          Not changed ({fmtNum(r.invalid.length)}): {r.invalid.slice(0, 8).map((x) => `${x.input} — ${LABEL[x.field] || x.field || ''} ${x.reason}`).join('; ')}
          {r.invalid.length > 8 ? ` and ${fmtNum(r.invalid.length - 8)} more` : ''}
        </p>
      )}
    </div>
  );
}
