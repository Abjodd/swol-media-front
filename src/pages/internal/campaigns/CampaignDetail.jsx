import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../../../api.js';
import Icon from '../../../components/Icon.jsx';
import {
  CAMPAIGN_STATUS,
  FileDrop,
  Meter,
  StatusChip,
  PLATFORM_LABEL,
  fmtDate,
  fmtMoney,
  fmtNum,
  fmtSize,
  readFile,
  toInputDate,
  useToast,
} from '../../../components/ui.jsx';
import AssignVendor from './AssignVendor.jsx';
import AddCreators from './AddCreators.jsx';
import CreatorsStage from './CreatorsStage.jsx';
import InternalReview from './InternalReview.jsx';
import { Pipeline } from '../../../components/Pipeline.jsx';

const TABS = [
  ['vendors', 'Vendors', 'vendors'],
  ['added', 'Creators added', 'creators'],
  ['client', 'With client', 'arrowRight'],
  ['approved', 'Campaign creators', 'check'],
  ['brief', 'Brief & files', 'note'],
];

const DOC_SLOTS = [
  ['nda', 'NDA', 'Non-disclosure agreement for vendors and creators'],
  ['letter', 'Letter', 'Campaign / authorisation letter'],
];

export default function CampaignDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [data, setData] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [briefDraft, setBriefDraft] = useState(null); // null = not editing
  const [uploading, setUploading] = useState('');
  const [editQuota, setEditQuota] = useState({}); // { [assignmentId]: value }
  const [creators, setCreators] = useState(null);
  const [adding, setAdding] = useState(false);
  const [moving, setMoving] = useState(false);
  const refreshTimer = useRef(null);
  const [params, setParams] = useSearchParams();
  const [toast, toastNode] = useToast();

  const load = () =>
    api
      .getCampaign(id)
      .then(setData)
      .catch((e) => (e.status === 404 ? setNotFound(true) : toast(e.message, true)));
  const loadCreators = () =>
    api
      .listCampaignCreators(id)
      .then((d) => {
        setCreators(d.items);
        setData((prev) => prev && { ...prev, item: { ...prev.item, pipeline: d.pipeline } });
      })
      .catch((e) => toast(e.message, true));
  useEffect(() => {
    load();
    loadCreators();
    if (location.state?.toast) {
      toast(location.state.toast);
      navigate(location.pathname + location.search, { replace: true, state: null }); // show it once, not again on Back
    }
  }, [id]);

  if (notFound)
    return (
      <div className="page">
        <Link to=".." className="back">
          <Icon name="arrowLeft" size={16} /> All campaigns
        </Link>
        <p className="muted">This campaign doesn’t exist or was deleted.</p>
      </div>
    );
  if (!data)
    return (
      <div className="page">
        <div className="skel" style={{ height: 180 }} />
        <div className="skel" style={{ height: 320 }} />
      </div>
    );

  const c = data.item;
  const t = c.totals;
  const p = c.pipeline;
  const remaining = Math.max(0, c.creatorsNeeded - t.quota);
  const STAGE_TAB = { 1: 'vendors', 2: 'added', 3: 'client', 4: 'approved', 5: 'approved' };
  const tab = TABS.some(([k]) => k === params.get('tab')) ? params.get('tab') : STAGE_TAB[p.stage];
  const pickTab = (k) => setParams({ tab: k }, { replace: true });
  // "Creators added": swipe cards while there's something to review, else the table (or whatever was picked)
  const reviewable = (creators || []).some((s) => ['submitted', 'shortlisted'].includes(s.status) && !s.held);
  const addedView = params.get('view') === 'table' || params.get('view') === 'cards' ? params.get('view') : reviewable ? 'cards' : 'table';
  const tabCount = { vendors: data.assignments.length, added: p.inReview, client: p.waitingClient, approved: p.approved };

  const move = async (ids, status) => {
    setMoving(true);
    try {
      const d = await api.moveCampaignCreators(c._id, ids, status);
      const verb = { sent_to_client: 'sent to the client', approved: 'approved', declined: 'marked declined', rejected: 'rejected', submitted: 'moved back to review', held: 'put on hold' }[status];
      toast(`${d.updated} creator${d.updated === 1 ? '' : 's'} ${verb}`);
      if (d.campaignStatus !== c.status) setData((prev) => ({ ...prev, item: { ...prev.item, status: d.campaignStatus } }));
      await loadCreators();
      load();
      return true;
    } catch (e) {
      toast(e.message, true);
      return false;
    } finally {
      setMoving(false);
    }
  };

  // the deck saves each swipe itself; refresh the list and pipeline once things settle
  const refreshSoon = () => {
    clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      loadCreators();
      load();
    }, 700);
  };

  const removeCreator = async (sub) => {
    if (!window.confirm(`Remove ${sub.creator.name || '@' + sub.creator.handle} from this campaign? Their profile stays in the creator database.`)) return;
    try {
      await api.removeCampaignCreator(c._id, sub._id);
      toast('Creator removed from the campaign');
      await loadCreators();
      load();
    } catch (e) {
      toast(e.message, true);
    }
  };

  const patch = async (body, msg) => {
    try {
      const d = await api.updateCampaign(c._id, body);
      setData((prev) => ({ ...prev, item: { ...prev.item, ...d.item, totals: prev.item.totals } }));
      if (msg) toast(msg);
      return true;
    } catch (e) {
      toast(e.message, true);
      return false;
    }
  };

  const upload = async (kind, file) => {
    if (!file) return;
    setUploading(kind);
    try {
      const d = await api.uploadDocument(c._id, kind, file.name, await readFile(file));
      setData((prev) => ({ ...prev, item: { ...prev.item, documents: d.documents } }));
      toast(`${kind === 'nda' ? 'NDA' : kind === 'letter' ? 'Letter' : 'Document'} uploaded`);
    } catch (e) {
      toast(e.message, true);
    } finally {
      setUploading('');
    }
  };

  const removeDoc = async (doc) => {
    if (!window.confirm(`Remove ${doc.filename}?`)) return;
    try {
      const d = await api.deleteDocument(c._id, doc.id);
      setData((prev) => ({ ...prev, item: { ...prev.item, documents: d.documents } }));
      toast('Document removed');
    } catch (e) {
      toast(e.message, true);
    }
  };

  const saveQuota = async (a) => {
    const v = parseInt(editQuota[a._id], 10);
    if (!(v > 0)) return toast('Creators wanted must be 1 or more', true);
    try {
      await api.updateAssignment(c._id, a._id, { quota: v });
      setEditQuota((q) => {
        const n = { ...q };
        delete n[a._id];
        return n;
      });
      toast(`${a.vendor.name} now owes ${fmtNum(v)} creators`);
      load();
    } catch (e) {
      toast(e.message, true);
    }
  };

  const removeAssignment = async (a) => {
    if (!window.confirm(`Remove ${a.vendor.name} from this campaign?`)) return;
    try {
      await api.removeAssignment(c._id, a._id);
      toast(`${a.vendor.name} removed`);
      load();
    } catch (e) {
      toast(e.message, true);
    }
  };

  const deleteCampaign = async () => {
    const n = p.added;
    const msg = `Delete “${c.name}”?\n\nThis removes its vendor assignments, documents${n ? ` and the ${n} creator${n === 1 ? '' : 's'} on it` : ''}. Creator profiles stay in the creator database. This can’t be undone.`;
    if (!window.confirm(msg)) return;
    try {
      await api.deleteCampaign(c._id);
      navigate('/dashboard/campaigns', { replace: true, state: { toast: `${c.name} deleted` } });
    } catch (e) {
      toast(e.message, true);
    }
  };

  const otherDocs = c.documents.filter((d) => !['nda', 'letter'].includes(d.kind));

  return (
    <div className="page cd">
      <Link to=".." className="back">
        <Icon name="arrowLeft" size={16} /> All campaigns
      </Link>

      {/* ── Header ─────────────────────────────────── */}
      <section className="cd-hero">
        <div className="cd-hero-main">
          <div className="cd-tags">
            <span className="c-code">{c.code}</span>
            <StatusChip status={c.status} />
          </div>
          <h2>{c.name}</h2>
          <p className="cd-sub">
            <Icon name="building" size={16} /> {c.client?.name}
            <span className="dot">•</span>
            <Icon name="calendar" size={16} /> {c.startDate ? fmtDate(c.startDate) : 'No start'} → {c.endDate ? fmtDate(c.endDate) : 'No end'}
            {c.budget?.amount ? (
              <>
                <span className="dot">•</span> {fmtMoney(c.budget.amount)}
              </>
            ) : null}
          </p>
          {c.platforms?.length > 0 && (
            <div className="cd-plats">
              {c.platforms.map((p) => (
                <span key={p}>{PLATFORM_LABEL[p]}</span>
              ))}
              {c.deliverables && <span className="deliv">{c.deliverables}</span>}
            </div>
          )}
        </div>
        <div className="cd-hero-side">
          <label className="fx">
            <span className="fx-label">Status</span>
            <select value={c.status} onChange={(e) => patch({ status: e.target.value }, `Status: ${CAMPAIGN_STATUS[e.target.value]}`)}>
              {Object.entries(CAMPAIGN_STATUS).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <a className="btn ghost sm" href={api.exportUrl(c._id)} download={`${c.code} ${c.name} – full campaign data.csv`} title="Campaign details, pipeline, vendors and every creator at every stage">
            <Icon name="download" size={15} /> Download all data (CSV)
          </a>
          <button className="btn ghost sm danger-text" onClick={deleteCampaign}>
            <Icon name="trash" size={15} /> Delete campaign
          </button>
        </div>
      </section>

      {/* ── Pipeline ───────────────────────────────── */}
      <Pipeline p={p} active={tab} onPick={pickTab} />

      <div className="seg scroll cd-tabs" role="tablist">
        {TABS.map(([k, l, ic]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => pickTab(k)}>
            <Icon name={ic} size={15} /> {l}
            {tabCount[k] !== undefined && <span>{fmtNum(tabCount[k])}</span>}
          </button>
        ))}
      </div>

      {tab === 'vendors' && (
        <div className="cd-tab">
        <section className="card cd-vendors">
          <div className="cd-card-head">
            <div>
              <h2>Vendors &amp; creator targets</h2>
              <p className="muted">Each vendor gets a number of creators to bring for this campaign.</p>
            </div>
            <button className="btn primary" onClick={() => setAssigning(true)}>
              <Icon name="plus" size={18} /> Assign vendor
            </button>
          </div>

          <Meter label="Creators assigned to vendors" value={t.quota} max={c.creatorsNeeded} sub={`${fmtNum(t.quota)} of ${fmtNum(c.creatorsNeeded)}`} />

          {data.assignments.length === 0 ? (
            <div className="cd-empty">
              <Icon name="vendors" size={22} />
              <p>No vendors yet. Assign one and tell them how many creators you need.</p>
            </div>
          ) : (
            <ul className="as-list">
              {data.assignments.map((a) => {
                const editing = editQuota[a._id] !== undefined;
                return (
                  <li key={a._id} className="as-row">
                    <div className="as-who">
                      <span className="v-mono sm">{a.vendor.name.slice(0, 2).toUpperCase()}</span>
                      <div>
                        <strong>{a.vendor.name}</strong>
                        <span>
                          {[a.vendor.contact?.name, a.vendor.contact?.phone].filter(Boolean).join(' · ') || 'No contact details'}
                        </span>
                      </div>
                    </div>
                    <div className="as-quota">
                      <span className="as-label">Creators wanted</span>
                      {editing ? (
                        <span className="as-edit">
                          <input
                            type="number"
                            min="1"
                            value={editQuota[a._id]}
                            onChange={(e) => setEditQuota({ ...editQuota, [a._id]: e.target.value })}
                            onKeyDown={(e) => e.key === 'Enter' && saveQuota(a)}
                            autoFocus
                          />
                          <button className="btn primary sm" onClick={() => saveQuota(a)}>
                            Save
                          </button>
                        </span>
                      ) : (
                        <button className="as-num" onClick={() => setEditQuota({ ...editQuota, [a._id]: String(a.quota) })} title="Change the number">
                          {fmtNum(a.quota)} <Icon name="edit" size={14} />
                        </button>
                      )}
                    </div>
                    <div className="as-progress">
                      <Meter value={a.counts.submitted} max={a.quota} label="Submitted" sub={`${fmtNum(a.counts.submitted)} / ${fmtNum(a.quota)}`} />
                    </div>
                    <div className="as-due">
                      <span className="as-label">Deadline</span>
                      <span>{a.deadline ? fmtDate(a.deadline) : '—'}</span>
                    </div>
                    <button className="icon-btn" onClick={() => removeAssignment(a)} title={`Remove ${a.vendor.name}`} aria-label={`Remove ${a.vendor.name}`}>
                      <Icon name="trash" size={16} />
                    </button>
                    {a.instructions && <p className="as-note">{a.instructions}</p>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        </div>
      )}

      {tab === 'added' && creators !== null && (
        <div className="ir-switch seg" role="tablist" aria-label="View">
          <button type="button" className={addedView === 'cards' ? 'on' : ''} onClick={() => setParams({ tab: 'added', view: 'cards' }, { replace: true })}>
            <Icon name="sparkles" size={14} /> Review cards
            <span>{fmtNum(creators.filter((s) => ['submitted', 'shortlisted'].includes(s.status) && !s.held).length)}</span>
          </button>
          <button type="button" className={addedView === 'table' ? 'on' : ''} onClick={() => setParams({ tab: 'added', view: 'table' }, { replace: true })}>
            <Icon name="menu" size={14} /> Table
          </button>
        </div>
      )}

      {tab === 'added' && addedView === 'cards' && creators !== null && (
        <InternalReview campaign={c} items={creators} onChanged={refreshSoon} toast={toast} />
      )}

      {['added', 'client', 'approved'].includes(tab) &&
        !(tab === 'added' && addedView === 'cards') &&
        (creators === null ? (
          <div className="skel" style={{ height: 260 }} />
        ) : (
          <CreatorsStage
            key={tab}
            stage={tab}
            items={creators}
            campaignId={c._id}
            campaignName={c.name}
            toast={toast}
            exportUrl={api.exportUrl(c._id)}
            exportName={`${c.code} ${c.name} – full campaign data.csv`}
            busy={moving}
            onMove={move}
            onRemove={tab === 'approved' ? null : removeCreator}
            onAdd={tab === 'added' ? () => setAdding(true) : null}
          />
        ))}

      {tab === 'brief' && (
        <div className="cd-brief-grid">
          {/* ── Brief ─────────────────────────────── */}
          <section className="card">
            <div className="cd-card-head">
              <h2>Brief</h2>
              {briefDraft === null ? (
                <button className="btn ghost sm" onClick={() => setBriefDraft(c.brief || '')}>
                  <Icon name="edit" size={15} /> {c.brief ? 'Edit' : 'Write brief'}
                </button>
              ) : null}
            </div>
            {c.objective && (
              <p className="cd-obj">
                <Icon name="target" size={15} /> {c.objective}
              </p>
            )}
            {briefDraft !== null ? (
              <div className="cd-brief-edit">
                <textarea rows={8} value={briefDraft} onChange={(e) => setBriefDraft(e.target.value)} autoFocus placeholder="Write the campaign brief…" />
                <div>
                  <button className="btn ghost sm" onClick={() => setBriefDraft(null)}>
                    Cancel
                  </button>
                  <button className="btn primary sm" onClick={async () => (await patch({ brief: briefDraft }, 'Brief saved')) && setBriefDraft(null)}>
                    Save brief
                  </button>
                </div>
              </div>
            ) : c.brief ? (
              <p className="cd-brief">{c.brief}</p>
            ) : (
              <p className="muted">No brief yet.</p>
            )}
          </section>

          {/* ── Documents ─────────────────────────── */}
          <section className="card">
            <div className="cd-card-head">
              <h2>Documents</h2>
            </div>
            <div className="docs">
              {DOC_SLOTS.map(([kind, label, help]) => {
                const doc = c.documents.find((d) => d.kind === kind);
                return (
                  <div key={kind} className="doc-slot">
                    <span className="fx-label">
                      {label} <small>{help}</small>
                    </span>
                    {doc ? (
                      <div className="doc">
                        <span className="doc-ic">
                          <Icon name="file" size={18} />
                        </span>
                        <a className="doc-name" href={api.documentUrl(c._id, doc.id)} target="_blank" rel="noreferrer">
                          <strong>{doc.filename}</strong>
                          <span>
                            {fmtSize(doc.size)} · {fmtDate(doc.uploadedAt)}
                          </span>
                        </a>
                        <a className="icon-btn" href={api.documentUrl(c._id, doc.id, true)} title="Download" aria-label="Download">
                          <Icon name="download" size={16} />
                        </a>
                        <button className="icon-btn" onClick={() => removeDoc(doc)} title="Remove" aria-label="Remove">
                          <Icon name="trash" size={16} />
                        </button>
                      </div>
                    ) : null}
                    {uploading === kind ? (
                      <div className="drop compact busy">Uploading…</div>
                    ) : (
                      <FileDrop compact label={label} existing={Boolean(doc)} file={null} onFile={(f) => upload(kind, f)} />
                    )}
                  </div>
                );
              })}
              {otherDocs.map((doc) => (
                <div key={doc.id} className="doc">
                  <span className="doc-ic">
                    <Icon name="file" size={18} />
                  </span>
                  <a className="doc-name" href={api.documentUrl(c._id, doc.id)} target="_blank" rel="noreferrer">
                    <strong>{doc.filename}</strong>
                    <span>{fmtSize(doc.size)}</span>
                  </a>
                  <button className="icon-btn" onClick={() => removeDoc(doc)} title="Remove" aria-label="Remove">
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              ))}
              <div className="doc-slot">
                <span className="fx-label">Other files</span>
                {uploading === 'other' ? (
                  <div className="drop compact busy">Uploading…</div>
                ) : (
                  <FileDrop compact label="another file" file={null} onFile={(f) => upload('other', f)} />
                )}
              </div>
            </div>
          </section>
        </div>
      )}

      {assigning && (
        <AssignVendor
          campaign={c}
          remaining={remaining}
          assignedIds={data.assignments.map((a) => a.vendor._id)}
          onClose={() => setAssigning(false)}
          onAssigned={(d) => {
            setAssigning(false);
            toast(`${d.assignment.vendor.name} assigned · ${fmtNum(d.assignment.quota)} creators`);
            load();
          }}
        />
      )}
      {adding && (
        <AddCreators
          campaign={c}
          assignments={data.assignments}
          onClose={() => setAdding(false)}
          onAdded={(d, keepOpen) => {
            if (!keepOpen) setAdding(false);
            const ig = d.instagram || {};
            const igNote = !ig.creators
              ? ''
              : !ig.enabled
                ? ' · Instagram lookup is off — HIKERAPI_KEY isn’t set in server/.env'
                : ig.queued
                  ? ` · fetching Instagram data for ${fmtNum(ig.queued)}`
                  : '';
            toast(`${fmtNum(d.added)} creator${d.added === 1 ? '' : 's'} added${d.skipped.length ? ` · ${d.skipped.length} skipped` : ''}${igNote}`, !ig.enabled && ig.creators > 0);
            loadCreators();
            load();
            // photos and Instagram numbers arrive in the background — refresh a few times
            if (ig.queued) [6000, 15000, 35000].forEach((ms) => setTimeout(loadCreators, ms));
          }}
        />
      )}
      {toastNode}
    </div>
  );
}
