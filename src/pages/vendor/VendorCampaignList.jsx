import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Icon from '../../components/Icon.jsx';
import { Empty, Meter, PLATFORM_LABEL, fmtDate, fmtNum, useToast } from '../../components/ui.jsx';
import { dueText, daysLeft, progressOf } from './vendorUtil.js';
import Greeting from '../../components/Greeting.jsx';

const FILTERS = [
  ['open', 'Open'],
  ['done', 'Target met'],
  ['all', 'All'],
];

export default function VendorCampaignList() {
  const { user } = useAuth();
  const [items, setItems] = useState(null);
  const [filter, setFilter] = useState('open');
  const [toast, toastNode] = useToast();

  useEffect(() => {
    api
      .listCampaigns()
      .then((d) => setItems(d.items.filter((c) => c.mine)))
      .catch((e) => toast(e.message, true));
  }, []);

  const sum = useMemo(() => {
    const s = { campaigns: 0, quota: 0, added: 0, approved: 0 };
    for (const c of items || []) {
      if (['completed', 'cancelled'].includes(c.status)) continue;
      s.campaigns += 1;
      s.quota += c.mine.quota;
      s.added += c.mine.counts?.submitted || 0;
      s.approved += c.mine.counts?.approved || 0;
    }
    return s;
  }, [items]);

  const shown = (items || []).filter((c) => {
    const done = (c.mine.counts?.submitted || 0) >= c.mine.quota || ['completed', 'cancelled'].includes(c.status);
    return filter === 'all' || (filter === 'done' ? done : !done);
  });

  return (
    <div className="page vp">
      <Greeting
        name={user.name}
        crumbs={['My campaigns', user.company || 'Vendor', `${fmtNum(sum.campaigns)} active`]}
        line={
          sum.quota > sum.added
            ? `${fmtNum(sum.quota - sum.added)} more creator${sum.quota - sum.added === 1 ? '' : 's'} to reach your targets — extras are always welcome.`
            : 'You’ve met every creator target so far.'
        }
      />

      <section className="tiles">
        <div className="tile">
          <span>Active campaigns</span>
          <strong>{fmtNum(sum.campaigns)}</strong>
          <em>assigned to you</em>
        </div>
        <div className="tile">
          <span>Creators requested</span>
          <strong>{fmtNum(sum.quota)}</strong>
          <em>across all campaigns</em>
        </div>
        <div className="tile">
          <span>Creators added</span>
          <strong>{fmtNum(sum.added)}</strong>
          <em>{sum.quota > sum.added ? `${fmtNum(sum.quota - sum.added)} still to add` : 'targets met — extras welcome'}</em>
        </div>
        <div className="tile">
          <span>Approved by client</span>
          <strong>{fmtNum(sum.approved)}</strong>
          <em>on campaigns</em>
        </div>
      </section>

      <div className="seg">
        {FILTERS.map(([k, l]) => (
          <button key={k} type="button" className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>
            {l}
          </button>
        ))}
      </div>

      {items === null ? (
        <div className="c-rows">
          {[1, 2].map((i) => (
            <div key={i} className="skel" style={{ height: 150 }} />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <Empty
          icon="campaigns"
          title={items.length ? 'Nothing here' : 'No campaigns yet'}
          text={items.length ? 'Try another filter.' : 'When Swol Media assigns you to a campaign, it will appear here with the number of creators needed.'}
        />
      ) : (
        <div className="c-rows">
          {shown.map((c, i) => {
            const m = c.mine;
            const added = m.counts?.submitted || 0;
            const prog = progressOf(m);
            const left = daysLeft(m.deadline);
            return (
              <Link key={c._id} to={c._id} className="c-row vc-row" style={{ '--i': i }}>
                <div className="c-row-main">
                  <div className="c-row-tags">
                    <span className="c-code">{c.code}</span>
                    <span className={`vc-state is-${prog.tone}`}>{prog.label}</span>
                  </div>
                  <h3>{c.name}</h3>
                  {(c.platforms?.length > 0 || c.deliverables) && (
                    <p className="c-client">
                      {c.platforms?.map((p) => PLATFORM_LABEL[p]).join(', ')}
                      {c.platforms?.length > 0 && c.deliverables && <span className="dot">·</span>}
                      {c.deliverables}
                    </p>
                  )}
                </div>

                <div className="vc-need">
                  <div className="vc-big">
                    <span>Creators needed from you</span>
                    <strong>{fmtNum(m.quota)}</strong>
                  </div>
                  <div className="vc-meta">
                    <Meter label="Added" value={added} max={m.quota} sub={`${fmtNum(added)} / ${fmtNum(m.quota)}${added > m.quota ? ` · +${fmtNum(added - m.quota)} extra` : ''}`} />
                    <p>
                      <span className={left !== null && left < 3 ? 'vc-due-soon' : ''}>
                        <Icon name="clock" size={13} /> {m.deadline ? `${fmtDate(m.deadline)} · ${dueText(m.deadline)}` : 'No deadline'}
                      </span>
                      <span>
                        <Icon name="check" size={13} /> {fmtNum(m.counts?.approved || 0)} approved
                      </span>
                    </p>
                  </div>
                </div>
                <Icon name="arrowRight" size={18} className="c-go" />
              </Link>
            );
          })}
        </div>
      )}
      {toastNode}
    </div>
  );
}
