import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Icon from '../../components/Icon.jsx';
import { Meter, PLATFORM_LABEL, fmtDate, fmtNum, useToast, whenVisible } from '../../components/ui.jsx';
import AddCreators from '../internal/campaigns/AddCreators.jsx';
import CreatorsStage from '../internal/campaigns/CreatorsStage.jsx';
import ReelsManager from '../../components/ReelsManager.jsx';
import { dueText, daysLeft, progressOf } from './vendorUtil.js';

export default function VendorCampaignDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [c, setC] = useState(null);
  const [creators, setCreators] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [adding, setAdding] = useState(false);
  const [toast, toastNode] = useToast();
  const [vtab, setVtab] = useState(() => (new URLSearchParams(window.location.search).get('tab') === 'assets' ? 'assets' : 'creators'));

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
      whenVisible(loadCreators);
    }, 8000);
    return () => clearTimeout(t);
  }, [creators, waitingIg]);
  // a background upload for this campaign added creators: show them (and the new counts once it's finished)
  useEffect(() => {
    const on = (e) => {
      if (String(e.detail?.campaignId) !== String(id)) return;
      loadCreators();
      if (e.detail.done) load();
    };
    window.addEventListener('swol:creators-added', on);
    return () => window.removeEventListener('swol:creators-added', on);
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  // take back a creator you added — only while it's still with the Swol Media team (not once sent to the client)
  const removeCreator = async (sub) => {
    if (!window.confirm(`Remove ${sub.creator.name || '@' + sub.creator.handle} from this campaign?`)) return;
    try {
      await api.removeCampaignCreator(id, sub._id);
      toast('Creator removed');
      setCreators((list) => list.filter((x) => x._id !== sub._id));
      load();
    } catch (e) {
      toast(e.message, true);
    }
  };
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

      <div className="seg cd-tabs vd-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={vtab === 'creators'} className={vtab === 'creators' ? 'on' : ''} onClick={() => setVtab('creators')}>
          <Icon name="creators" size={15} /> Your creators <span>{creators?.length ?? ''}</span>
        </button>
        <button type="button" role="tab" aria-selected={vtab === 'assets'} className={vtab === 'assets' ? 'on' : ''} onClick={() => setVtab('assets')}>
          <Icon name="play" size={15} /> Assets
        </button>
      </div>
      {vtab === 'assets' ? (
        <ReelsManager campaignId={c._id} role="vendor" toast={toast} canAdd={!closed} />
      ) : (
        <>
          <p className="vd-hint">Everything you’ve proposed for this campaign and where each one stands. You can remove a creator while it’s still in review.</p>
          {creators === null ? (
            <div className="skel" style={{ height: 200 }} />
          ) : (
            <CreatorsStage stage="vendor" items={creators} campaignId={c._id} campaignName={c.name} toast={toast} onMove={async () => false} onAdd={closed ? null : () => setAdding(true)} onRemove={removeCreator} />
          )}
        </>
      )}

      {adding && (
        <AddCreators
          campaign={c}
          vendorName={user.company || 'your team'}
          onClose={() => setAdding(false)}
        />
      )}
      {toastNode}
    </div>
  );
}
