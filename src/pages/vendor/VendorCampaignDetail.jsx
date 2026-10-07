import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Icon from '../../components/Icon.jsx';
import { Meter, PLATFORM_LABEL, fmtDate, fmtNum, useToast } from '../../components/ui.jsx';
import AddCreators from '../internal/campaigns/AddCreators.jsx';
import CreatorsStage from '../internal/campaigns/CreatorsStage.jsx';
import { dueText, daysLeft, progressOf } from './vendorUtil.js';

export default function VendorCampaignDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [c, setC] = useState(null);
  const [creators, setCreators] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [adding, setAdding] = useState(false);
  const [toast, toastNode] = useToast();

  const load = () =>
    api
      .getCampaign(id)
      .then((d) => setC(d.item))
      .catch((e) => (e.status === 404 ? setNotFound(true) : toast(e.message, true)));
  const loadCreators = () =>
    api
      .listCampaignCreators(id)
      .then((d) => setCreators(d.items))
      .catch((e) => toast(e.message, true));
  // while Instagram lookups are still running for creators on this page, refresh every few seconds
  const polls = useRef(0);
  const waitingIg = (creators || []).some((s) => s.creator?.ig?.status === 'queued');
  useEffect(() => {
    if (!waitingIg || polls.current > 150) return undefined;
    const t = setTimeout(() => {
      polls.current += 1;
      loadCreators();
    }, 6000);
    return () => clearTimeout(t);
  }, [creators, waitingIg]);
  useEffect(() => {
    load();
    loadCreators();
  }, [id]);

  if (notFound)
    return (
      <div className="page">
        <Link to=".." className="back">
          <Icon name="arrowLeft" size={16} /> My campaigns
        </Link>
        <p className="muted">This campaign isn’t available to you.</p>
      </div>
    );
  if (!c)
    return (
      <div className="page">
        <div className="skel" style={{ height: 160 }} />
        <div className="skel" style={{ height: 260 }} />
      </div>
    );

  const m = c.mine || { quota: 0, counts: {} };
  const added = m.counts?.submitted || 0;
  const sent = m.counts?.shortlisted || 0;
  const approved = m.counts?.approved || 0;
  const rejected = m.counts?.rejected || 0;
  const remaining = Math.max(0, m.quota - added);
  const prog = progressOf(c.mine);
  const left = daysLeft(m.deadline);
  const closed = m.status === 'closed' || ['completed', 'cancelled'].includes(c.status);

  return (
    <div className="page vd">
      <Link to=".." className="back">
        <Icon name="arrowLeft" size={16} /> My campaigns
      </Link>

      <section className="cd-hero">
        <div className="cd-hero-main">
          <div className="cd-tags">
            <span className="c-code">{c.code}</span>
            <span className={`vc-state is-${prog.tone}`}>{prog.label}</span>
          </div>
          <h2>{c.name}</h2>
        </div>
      </section>

      {/* ── What's needed from this vendor ── */}
      <section className="vd-need">
        <div className="vd-need-main">
          <span className="vd-eyebrow">Your requirement</span>
          <div className="vd-quota">
            <strong>{fmtNum(m.quota)}</strong>
            <span>
              creators
              <br />
              needed from you
            </span>
          </div>
          <Meter label="Added so far" value={added} max={m.quota} sub={`${fmtNum(added)} of ${fmtNum(m.quota)}${added > m.quota ? ` · +${fmtNum(added - m.quota)} extra` : ''}`} />
          <p className="vd-remaining">
            {remaining
              ? `${fmtNum(remaining)} more to reach the target — and you can add more than ${fmtNum(m.quota)}: some creators get filtered out along the way.`
              : 'Target met — keep adding. Extra creators give the team and the brand more to choose from.'}
          </p>
          {!closed && (
            <button type="button" className="btn primary" onClick={() => setAdding(true)}>
              <Icon name="plus" size={17} /> Add creators
            </button>
          )}
        </div>
        <dl className="vd-facts">
          <div>
            <dt>Deadline</dt>
            <dd className={left !== null && left < 3 ? 'vc-due-soon' : ''}>
              {m.deadline ? fmtDate(m.deadline) : '—'}
              <small>{dueText(m.deadline)}</small>
            </dd>
          </div>
          <div>
            <dt>Platforms</dt>
            <dd>{c.platforms?.length ? c.platforms.map((p) => PLATFORM_LABEL[p]).join(', ') : '—'}</dd>
          </div>
          <div>
            <dt>Deliverables per creator</dt>
            <dd>{c.deliverables || '—'}</dd>
          </div>
          <div>
            <dt>Progress</dt>
            <dd>
              {fmtNum(sent)} sent to client · {fmtNum(approved)} approved
              {rejected ? <small>{fmtNum(rejected)} not selected</small> : null}
            </dd>
          </div>
          {m.instructions && (
            <div className="full">
              <dt>Instructions from Swol Media</dt>
              <dd className="vd-instr">{m.instructions}</dd>
            </div>
          )}
        </dl>
      </section>

      <div className="vd-section-head">
        <h2>Your creators</h2>
        <p className="muted">Everything you’ve proposed for this campaign and where each one stands.</p>
      </div>
      {creators === null ? (
        <div className="skel" style={{ height: 200 }} />
      ) : (
        <CreatorsStage stage="vendor" items={creators} campaignName={c.name} onMove={async () => false} onAdd={closed ? null : () => setAdding(true)} />
      )}

      {adding && (
        <AddCreators
          campaign={c}
          vendorName={user.company || 'your team'}
          onClose={() => setAdding(false)}
          onAdded={(d, keepOpen) => {
            if (!keepOpen) setAdding(false);
            toast(`${fmtNum(d.added)} creator${d.added === 1 ? '' : 's'} added${d.skipped.length ? ` · ${d.skipped.length} skipped` : ''}${d.instagram?.queued ? ' · fetching their Instagram details' : ''}`);
            loadCreators();
            load();
          }}
        />
      )}
      {toastNode}
    </div>
  );
}
