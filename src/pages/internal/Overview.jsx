import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import Greeting from '../../components/Greeting.jsx';
import { api } from '../../api.js';
import Icon from '../../components/Icon.jsx';
import Avatar from '../../components/Avatar.jsx';
import { CAMPAIGN_STATUS, Empty, StatusChip, fmtCompact, fmtLakh, fmtINR, fmtNum, timeAgo, Num } from '../../components/ui.jsx';
import { GroupedColumns, HBars, useTip } from '../../components/Charts.jsx';

const DAY = 864e5;
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const daysLeft = (d) => (d ? Math.ceil((new Date(d).setHours(23, 59, 59) - Date.now()) / DAY) : null);
// ₹ in lakh / crore once it gets big
const money = (n) => (!n ? '₹0' : Math.abs(n) >= 1e5 ? `₹${fmtLakh(n)}` : fmtINR(n));

// Plain-language line for each activity entry
function describe(a) {
  const m = a.meta || {};
  switch (a.action) {
    case 'campaign.created':
      return (
        <>
          created campaign <b>{m.name}</b> for {m.client}
        </>
      );
    case 'campaign.status':
      return (
        <>
          moved <b>{m.name}</b> to {CAMPAIGN_STATUS[m.to] || m.to}
        </>
      );
    case 'vendor.assigned':
      return (
        <>
          assigned <b>{m.vendor}</b> to {m.name} · {fmtNum(m.quota)} creators
        </>
      );
    case 'document.uploaded':
      return (
        <>
          uploaded the {m.kind === 'nda' ? 'NDA' : m.kind === 'letter' ? 'letter' : 'document'} for <b>{m.name}</b>
        </>
      );
    case 'vendor.created':
      return (
        <>
          added vendor <b>{m.name}</b>
        </>
      );
    case 'client.created':
      return (
        <>
          added client <b>{m.name}</b>
        </>
      );
    case 'user.created':
      return <>created a new {m.role} login</>;
    case 'campaign.deleted':
      return (
        <>
          deleted campaign <b>{m.name}</b>
        </>
      );
    case 'creators.added':
      return (
        <>
          added {fmtNum(m.count)} creator{m.count === 1 ? '' : 's'} to <b>{m.name}</b>
          {m.by === 'vendor' ? ' for a vendor' : ''}
        </>
      );
    case 'creators.sent':
      return (
        <>
          sent {fmtNum(m.count)} creator{m.count === 1 ? '' : 's'} from <b>{m.name}</b> to the client
        </>
      );
    case 'creators.approved':
    case 'creators.declined':
    case 'creators.rejected':
    case 'creators.restored':
      return (
        <>
          {a.action.split('.')[1] === 'restored' ? 'moved back' : `marked`} {fmtNum(m.count)} creator{m.count === 1 ? '' : 's'}
          {a.action.split('.')[1] === 'restored' ? ' into review' : ` ${a.action.split('.')[1]}`} on <b>{m.name}</b>
        </>
      );
    default:
      return a.action;
  }
}

const ICON = {
  'campaign.created': 'campaigns',
  'campaign.status': 'activity',
  'vendor.assigned': 'target',
  'document.uploaded': 'file',
  'vendor.created': 'vendors',
  'client.created': 'building',
  'user.created': 'user',
  'campaign.deleted': 'trash',
  'creators.added': 'creators',
  'creators.sent': 'arrowRight',
  'creators.approved': 'check',
  'creators.declined': 'close',
  'creators.rejected': 'close',
  'creators.restored': 'activity',
};

export default function Overview() {
  const { user } = useAuth();
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [tip, tipNode] = useTip();
  const [campView, setCampView] = useState('active');
  const [scope, setScope] = useState('all'); // 'all' or a campaign id
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let live = true;
    setLoading(true);
    api
      .overview(scope)
      .then((x) => live && setD(x))
      .catch((e) => live && setErr(e.message))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [scope]);

  const weeks = useMemo(
    () =>
      (d?.analytics?.weeks || []).map((w, i) => {
        const start = new Date(w.start);
        return {
          ...w,
          key: i,
          label: start.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
          long: `Week of ${start.toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}`,
        };
      }),
    [d]
  );

  if (err) return <p className="muted">{err}</p>;
  if (!d)
    return (
      <div className="page">
        <div className="skel" style={{ height: 200 }} />
        <div className="tiles">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skel" style={{ height: 120 }} />
          ))}
        </div>
      </div>
    );

  const n = d.counts;
  const a = d.analytics;
  const f = a.funnel;
  const m = a.money;
  const one = scope !== 'all' ? a.campaigns[0] : null;
  const active = one ? a.campaigns : a.campaigns.filter((c) => ['sourcing', 'internal_review', 'client_review', 'live'].includes(c.status));
  const needed = active.reduce((s, c) => s + c.needed, 0);
  const approvedActive = active.reduce((s, c) => s + c.approved, 0);
  const campRows = one || campView === 'all' ? a.campaigns : active;
  const waitingReview = a.scope.waitingReview;
  const withClient = a.scope.withClient;
  const marginPct = m.clientBilling ? Math.round((m.margin / m.clientBilling) * 100) : 0;
  const FUNNEL = [
    ['Added by vendors & team', f.added, 'All creators put forward'],
    ['Sent to clients', f.sent, `${pct(f.sent, f.added)}% of added`],
    ['Approved by clients', f.approved, `${pct(f.approved, f.sent)}% of sent`],
  ];

  return (
    <div className="page ov ov-int">
      <Greeting
        name={user.name}
        crumbs={['Overview', 'Swol Media', `${fmtNum(n.campaigns)} campaign${n.campaigns === 1 ? '' : 's'}`]}
        line={
          n.awaitingReview
            ? `${fmtNum(n.awaitingReview)} creator${n.awaitingReview === 1 ? ' is' : 's are'} waiting for your team’s review.`
            : n.awaitingClient
              ? `${fmtNum(n.awaitingClient)} creator${n.awaitingClient === 1 ? ' is' : 's are'} with clients for approval.`
              : 'Nothing is waiting on you right now.'
        }
      />

      {/* ── which campaign(s) everything below shows ─────────── */}
      <div className={`ov-scope ov-scope-int ${loading ? 'is-loading' : ''}`}>
        <span className="microlabel">Showing</span>
        <div className="seg">
          <button type="button" className={scope === 'all' ? 'on' : ''} onClick={() => setScope('all')}>
            All campaigns <span>{d.campaignList.length}</span>
          </button>
          {d.campaignList.map((c) => (
            <button key={c._id} type="button" className={scope === String(c._id) ? 'on' : ''} onClick={() => setScope(String(c._id))} title={c.code}>
              {c.name}
            </button>
          ))}
        </div>
        {one && (
          <Link to={`../campaigns/${one._id}`} className="btn ghost sm">
            Open {one.code} <Icon name="arrowRight" size={14} />
          </Link>
        )}
      </div>

      <div className={`ov-body ${loading ? 'is-loading' : ''}`}>
      {/* ── headline ─────────────────────────────────────────── */}
      <section className="ov-kpis">
        <div className="ov-hero">
          <span className="microlabel">{one ? `Creators approved · ${one.client || one.code}` : 'Creators approved · active campaigns'}</span>
          <strong>
            <Num value={approvedActive} />
            {needed > 0 && <small>/ {fmtNum(needed)}</small>}
          </strong>
          <div className="ov-hero-bar" title={`${pct(approvedActive, needed)}% of the creators needed`}>
            <i style={{ width: `${Math.min(100, pct(approvedActive, needed))}%` }} />
          </div>
          <p>
            {one
              ? `${pct(approvedActive, needed)}% of the ${fmtNum(needed)} creators ${one.name} needs`
              : needed
                ? `${pct(approvedActive, needed)}% of what ${fmtNum(active.length)} active campaign${active.length === 1 ? ' needs' : 's need'}`
                : 'No active campaigns yet'}
          </p>
        </div>
        <Link to={one ? `../campaigns/${one._id}?tab=added` : '../campaigns'} className={`tile tile-link ov-waiting ${waitingReview ? 'is-on' : ''}`}>
          <span>Waiting for your review</span>
          <strong>
            <Num value={waitingReview} />
          </strong>
          <em>{waitingReview ? 'Open the review cards →' : 'All reviewed'}</em>
        </Link>
        <div className="tile">
          <span>With clients</span>
          <strong>
            <Num value={withClient} />
          </strong>
          <em>waiting for a brand’s decision</em>
        </div>
        <div className="tile">
          <span>Cost of approved</span>
          <strong>{money(m.approvedCost)}</strong>
          <em>
            {fmtNum(m.approved)} creator{m.approved === 1 ? '' : 's'} · {money(m.pipelineCost)} more in the pipeline
          </em>
        </div>
        <div className={`tile ov-margin ${m.margin < 0 ? 'is-neg' : ''}`}>
          <span>Margin</span>
          <strong>{m.priced ? money(m.margin) : '—'}</strong>
          <em>{m.priced ? `${marginPct}% of ${money(m.clientBilling)} billed · ${fmtNum(m.priced)} of ${fmtNum(m.approved)} priced` : 'Add client costs to approved creators'}</em>
        </div>
      </section>

      {/* ── pipeline + weekly ───────────────────────────────── */}
      <section className="ov-charts two">
        <article className="card ch">
          <header>
            <h2>Creator pipeline</h2>
            <p>{one ? one.name : 'Across every campaign'}</p>
          </header>
          <ol className="fun">
            {FUNNEL.map(([label, v, note], i) => (
              <li key={label} {...tip(fmtNum(v), label)} style={{ '--w': `${Math.max(4, pct(v, f.added || 1))}%`, '--i': i }}>
                <span className="fun-bar">
                  <i />
                </span>
                <span className="fun-txt">
                  <b>{fmtNum(v)}</b> {label}
                  <small>{note}</small>
                </span>
              </li>
            ))}
          </ol>
          <ul className="fun-side">
            <li>
              <b>{fmtNum(f.inReview)}</b> in your review
            </li>
            <li>
              <b>{fmtNum(f.waiting)}</b> waiting on clients
            </li>
            <li className="is-red">
              <b>{fmtNum(f.rejected)}</b> rejected by your team
            </li>
            <li className="is-red">
              <b>{fmtNum(f.declined)}</b> passed by clients
            </li>
          </ul>
        </article>
        <article className="card ch">
          <header>
            <h2>Weekly activity</h2>
            <p>Last 8 weeks</p>
          </header>
          <GroupedColumns
            cols={weeks}
            tip={tip}
            series={[
              { key: 'added', label: 'Added', tone: 'ink' },
              { key: 'sent', label: 'Sent to client', tone: 'grey' },
              { key: 'approved', label: 'Approved', tone: 'ok' },
            ]}
          />
        </article>
      </section>

      {/* ── campaign health ─────────────────────────────────── */}
      <section className="card ov-health">
        <header className="cd-card-head">
          <div>
            <h2>Campaign health</h2>
            <p>Progress, timing and money for each campaign</p>
          </div>
          {!one && (<div className="seg">
            <button type="button" className={campView === 'active' ? 'on' : ''} onClick={() => setCampView('active')}>
              Active <span>{active.length}</span>
            </button>
            <button type="button" className={campView === 'all' ? 'on' : ''} onClick={() => setCampView('all')}>
              All <span>{a.campaigns.length}</span>
            </button>
          </div>)}
        </header>
        {campRows.length === 0 ? (
          <Empty icon="campaigns" title="No campaigns here" text="Create a campaign to start tracking it." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th>Status</th>
                  <th>Approved / needed</th>
                  <th>Pipeline</th>
                  <th>Ends</th>
                  <th>Cost</th>
                  <th>Client cost</th>
                  <th>Margin</th>
                </tr>
              </thead>
              <tbody>
                {campRows.map((c) => {
                  const left = daysLeft(c.endDate);
                  const p = pct(c.approved, c.needed);
                  return (
                    <tr key={c._id}>
                      <td>
                        <Link to={`../campaigns/${c._id}`} className="ov-camp-name">
                          <strong>{c.name}</strong>
                          <span>
                            {c.code} · {c.client}
                          </span>
                        </Link>
                      </td>
                      <td data-label="Status">
                        <StatusChip status={c.status} />
                      </td>
                      <td data-label="Approved">
                        <div className="ov-prog" {...tip(`${fmtNum(c.approved)} of ${fmtNum(c.needed)} (${p}%)`, `${c.name} — approved`)}>
                          <span>
                            <b>{fmtNum(c.approved)}</b> / {fmtNum(c.needed)}
                            <em>{p}%</em>
                          </span>
                          <i>
                            <span style={{ width: `${Math.min(100, p)}%` }} />
                          </i>
                        </div>
                      </td>
                      <td data-label="Pipeline" className="small">
                        <span className="ov-pipe-mini" title="Added · in your review · with client">
                          <b>{fmtNum(c.added)}</b> added
                          {c.inReview ? <em className="is-rev">{fmtNum(c.inReview)} to review</em> : null}
                          {c.waiting ? <em className="is-wait">{fmtNum(c.waiting)} with client</em> : null}
                        </span>
                      </td>
                      <td data-label="Ends" className="small">
                        {c.endDate ? (
                          <>
                            {new Date(c.endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                            <br />
                            <span className={left !== null && left <= 7 && left >= 0 ? 'ov-soon' : 'muted'}>
                              {left < 0 ? 'Ended' : left === 0 ? 'Today' : `${left}d left`}
                            </span>
                          </>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td data-label="Cost">{c.cost ? money(c.cost) : <span className="muted">—</span>}</td>
                      <td data-label="Client cost">{c.clientCost ? money(c.clientCost) : <span className="muted">—</span>}</td>
                      <td data-label="Margin" className={c.margin < 0 ? 'ov-neg' : c.margin > 0 ? 'ov-pos' : ''}>
                        {c.clientCost ? money(c.margin) : <span className="muted">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── vendors + clients ───────────────────────────────── */}
      <section className="ov-charts two">
        <article className="card ch">
          <header>
            <h2>Vendor performance</h2>
            <p>Creators given, how many reached the client and how many were approved</p>
          </header>
          {a.vendors.length === 0 ? (
            <p className="ch-empty">No vendor creators yet</p>
          ) : (
            <ul className="vp">
              {a.vendors.map((v) => {
                const max = Math.max(1, ...a.vendors.map((x) => x.given));
                return (
                  <li key={v.name} className={v.team ? 'is-team' : ''}>
                    <span className="vp-name">
                      {v.name}
                      <small>{v.asked ? `asked for ${fmtNum(v.asked)}` : v.team ? 'added directly' : 'not assigned now'}</small>
                    </span>
                    <span className="vp-bar" {...tip(`${fmtNum(v.given)} given · ${fmtNum(v.sent)} sent · ${fmtNum(v.approved)} approved`, v.name)}>
                      <i className="vp-given" style={{ width: `${(v.given / max) * 100}%` }} />
                      <i className="vp-sent" style={{ width: `${(v.sent / max) * 100}%` }} />
                      <i className="vp-ok" style={{ width: `${(v.approved / max) * 100}%` }} />
                    </span>
                    <span className="vp-fig">
                      <span>
                        <b>{fmtNum(v.approved)}</b> / {fmtNum(v.given)}
                      </span>
                      <em>{pct(v.approved, v.given)}% approved</em>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <ul className="gc-legend vp-legend">
            <li>
              <i className="gc-grey-l" /> Given
            </li>
            <li>
              <i className="gc-grey" /> Sent to client
            </li>
            <li>
              <i className="gc-ok" /> Approved
            </li>
          </ul>
        </article>
        <article className="card ch">
          <header>
            <h2>Clients &amp; campaigns</h2>
            <p>Campaigns per brand, then every campaign by status</p>
          </header>
          <HBars rows={a.clients} tip={tip} unit="campaigns" empty="No clients yet" />
          <div className="ch-split" />
          <HBars
            rows={Object.entries(CAMPAIGN_STATUS)
              .map(([k, label]) => ({ label, value: one ? a.campaigns.filter((c) => c.status === k).length : d.campaignsByStatus[k] || 0 }))
              .filter((r) => r.value)}
            tip={tip}
            unit="campaigns"
            empty="No campaigns yet"
          />
          <div className="ch-split" />
          <div className="ov-mini-tiles">
            <Link to="../creators">
              <b>
                <Num value={n.creators} />
              </b>
              creators in the database
            </Link>
            <Link to="../vendors">
              <b>
                <Num value={n.vendors} />
              </b>
              active vendors
            </Link>
            <Link to="../clients">
              <b>
                <Num value={n.clients} />
              </b>
              active clients
            </Link>
          </div>
        </article>
      </section>

      {/* ── who the creators are ────────────────────────────── */}
      <section className="ov-charts three">
        <article className="card ch">
          <header>
            <h2>Audience size</h2>
            <p>Followers of {a.audience.basis === 'approved' ? 'approved' : 'all added'} creators</p>
          </header>
          <HBars rows={a.audience.tiers} tip={tip} empty="No follower numbers yet" />
        </article>
        <article className="card ch">
          <header>
            <h2>Where they are</h2>
            <p>Top states</p>
          </header>
          <HBars rows={a.audience.states} tip={tip} empty="No locations yet" />
        </article>
        <article className="card ch">
          <header>
            <h2>Content &amp; platforms</h2>
            <p>Top genres, then platforms</p>
          </header>
          <HBars rows={a.audience.genres} tip={tip} empty="No genres yet" />
          <div className="ch-split" />
          <HBars rows={a.audience.platforms} tip={tip} empty="No platforms yet" />
        </article>
      </section>

      {/* ── activity ───────────────────────────────────────── */}
      <section className="card ov-activity">
        <div className="cd-card-head">
          <div>
            <h2>Recent activity</h2>
            <p className="muted">{one ? `What’s happened on ${one.name}` : 'What the team has been doing'}</p>
          </div>
        </div>
        {d.activity.length === 0 ? (
          <p className="muted">Nothing yet.</p>
        ) : (
          <ul className="feed">
            {d.activity.map((x) => (
              <li key={x.id}>
                <span className="feed-ic">
                  <Icon name={ICON[x.action] || 'activity'} size={15} />
                </span>
                <div>
                  <p>
                    {x.actor && <Avatar user={x.actor} size={20} />} <b>{x.actor?.name || 'Someone'}</b> {describe(x)}
                  </p>
                  <span>{timeAgo(x.at)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      </div>
      {tipNode}
    </div>
  );
}
