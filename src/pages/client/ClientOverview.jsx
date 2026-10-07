import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Icon from '../../components/Icon.jsx';
import Greeting from '../../components/Greeting.jsx';
import { Columns, HBars, useTip } from '../../components/Charts.jsx';
import { Empty, Num, PLATFORM_LABEL, StatusChip, fmtCompact, fmtDate, fmtNum, useToast } from '../../components/ui.jsx';

// Client overview: what's happening across the brand's campaigns, with a picker to focus on one.
// Charts are black-and-white; colour only marks a decision (selected / waiting / saved / passed),
// always alongside a legend, a count and a tooltip.

const DECISIONS = [
  ['selected', 'Selected'],
  ['waiting', 'Waiting for you'],
  ['saved', 'Saved for later'],
  ['passed', 'Passed'],
];
const TIERS = [
  ['Nano', 'under 10K', 0, 1e4],
  ['Micro', '10K–100K', 1e4, 1e5],
  ['Mid', '100K–500K', 1e5, 5e5],
  ['Macro', '500K–1M', 5e5, 1e6],
  ['Mega', '1M+', 1e6, Infinity],
];
const DAY = 864e5;
const daysLeft = (d) => (d ? Math.ceil((new Date(d).setHours(23, 59, 59) - Date.now()) / DAY) : null);
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

export default function ClientOverview() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [focus, setFocus] = useState('all');
  const [toast, toastNode] = useToast();
  const [tip, tipNode] = useTip();

  useEffect(() => {
    api
      .clientInsights()
      .then(setData)
      .catch((e) => toast(e.message, true));
  }, []);

  const camps = data?.campaigns || [];
  const scope = focus === 'all' ? camps : camps.filter((c) => c._id === focus);
  const scopeIds = new Set(scope.map((c) => String(c._id)));
  const list = useMemo(() => (data?.creators || []).filter((k) => scopeIds.has(String(k.campaign))), [data, focus]); // eslint-disable-line react-hooks/exhaustive-deps

  const m = useMemo(() => {
    const by = { selected: 0, waiting: 0, saved: 0, passed: 0 };
    for (const k of list) by[k.status] += 1;
    const sel = list.filter((k) => k.status === 'selected');
    const pool = sel.length ? sel : list; // profile charts: the selected creators, or the whole shortlist until there are some
    const er = sel.filter((k) => k.engagementRate > 0);
    const count = (fn) => {
      const o = {};
      for (const k of pool) for (const v of [].concat(fn(k)).filter(Boolean)) o[v] = (o[v] || 0) + 1;
      return Object.entries(o)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([label, value]) => ({ label, value }));
    };
    // creators shared with the brand, per week, last 8 weeks
    const now = new Date();
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
    const weeks = Array.from({ length: 8 }, (_, i) => {
      const start = new Date(monday.getTime() - (7 - i) * 7 * DAY);
      const end = new Date(start.getTime() + 7 * DAY);
      return {
        key: i,
        label: start.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
        long: `Week of ${start.toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}`,
        value: list.filter((k) => new Date(k.sharedAt) >= start && new Date(k.sharedAt) < end).length,
      };
    });
    return {
      by,
      total: list.length,
      needed: scope.reduce((a, c) => a + (c.creatorsNeeded || 0), 0),
      reach: sel.reduce((a, k) => a + k.followers, 0),
      views: sel.reduce((a, k) => a + k.avgViews, 0),
      er: er.length ? er.reduce((a, k) => a + k.engagementRate, 0) / er.length : 0,
      rate: pct(by.selected, by.selected + by.passed),
      poolLabel: sel.length ? 'selected creators' : 'creators shortlisted so far',
      tiers: TIERS.map(([label, sub, lo, hi]) => ({ label, sub, value: pool.filter((k) => k.followers >= lo && k.followers < hi && k.followers > 0).length })),
      platforms: count((k) => PLATFORM_LABEL[k.platform] || k.platform),
      cities: count((k) => k.city || k.state),
      genres: count((k) => k.categories?.slice(0, 2)),
      weeks,
      live: scope.filter((c) => ['sourcing', 'internal_review', 'client_review', 'live'].includes(c.status)).length,
    };
  }, [list, scope]);

  if (!data)
    return (
      <div className="page">
        <div className="skel" style={{ height: 200 }} />
        <div className="skel-grid">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skel" />
          ))}
        </div>
      </div>
    );

  const waitingAll = (data.creators || []).filter((k) => k.status === 'waiting').length;
  const one = focus !== 'all' ? scope[0] : null;

  return (
    <div className="page ov-client">
      <Greeting
        name={user.name}
        crumbs={['Overview', user.company || 'Your brand', `${fmtNum(camps.length)} campaign${camps.length === 1 ? '' : 's'}`]}
        line={waitingAll ? `${fmtNum(waitingAll)} creator${waitingAll === 1 ? ' is' : 's are'} waiting for your review.` : 'You’re all caught up on reviews.'}
      />

      {camps.length === 0 ? (
        <Empty icon="campaigns" title="No campaigns yet" text="When Swol Media starts a campaign for you, its progress and numbers show up here." />
      ) : (
        <>
          {/* scope: everything below follows this */}
          <div className="ov-scope">
            <span className="microlabel">Showing</span>
            <div className="seg">
              <button type="button" className={focus === 'all' ? 'on' : ''} onClick={() => setFocus('all')}>
                All campaigns <span>{camps.length}</span>
              </button>
              {camps.map((c) => (
                <button key={c._id} type="button" className={focus === c._id ? 'on' : ''} onClick={() => setFocus(c._id)}>
                  {c.name}
                </button>
              ))}
            </div>
          </div>

          {one && (
            <section className="ov-focus">
              <div>
                <div className="cd-tags">
                  <span className="c-code">{one.code}</span>
                  <StatusChip status={one.status} />
                </div>
                <h2>{one.name}</h2>
                {one.objective && <p>{one.objective}</p>}
              </div>
              <dl>
                <div>
                  <dt>Dates</dt>
                  <dd>{one.startDate || one.endDate ? `${one.startDate ? fmtDate(one.startDate) : 'TBC'} – ${one.endDate ? fmtDate(one.endDate) : 'TBC'}` : 'To be confirmed'}</dd>
                </div>
                <div>
                  <dt>Platforms</dt>
                  <dd>{one.platforms?.map((p) => PLATFORM_LABEL[p]).join(', ') || '—'}</dd>
                </div>
                <div>
                  <dt>Deliverables</dt>
                  <dd>{one.deliverables || '—'}</dd>
                </div>
              </dl>
              <Link to={`../campaigns/${one._id}`} className="btn primary">
                {one.counts?.waiting ? `Review ${fmtNum(one.counts.waiting)} creators` : 'Open campaign'} <Icon name="arrowRight" size={16} />
              </Link>
            </section>
          )}

          {/* headline numbers */}
          <section className="ov-kpis">
            <div className="ov-hero">
              <span className="microlabel">Creators selected</span>
              <strong>
                <Num value={m.by.selected} />
                {m.needed > 0 && <small>/ {fmtNum(m.needed)}</small>}
              </strong>
              <div className="ov-hero-bar" title={`${pct(m.by.selected, m.needed)}% of the creators needed`}>
                <i style={{ width: `${Math.min(100, pct(m.by.selected, m.needed))}%` }} />
              </div>
              <p>{m.needed ? `${pct(m.by.selected, m.needed)}% of the creators needed${focus === 'all' ? ` across ${fmtNum(scope.length)} campaign${scope.length === 1 ? '' : 's'}` : ''}` : 'Creators you select join the campaign'}</p>
            </div>
            <div className="tile">
              <span>Combined reach</span>
              <strong>{m.reach ? fmtCompact(m.reach) : '—'}</strong>
              <em>followers across your selected creators</em>
            </div>
            <div className="tile">
              <span>Views per post</span>
              <strong>{m.views ? fmtCompact(m.views) : '—'}</strong>
              <em>expected, from their average views</em>
            </div>
            <div className="tile">
              <span>Avg engagement</span>
              <strong>{m.er ? `${m.er.toFixed(1)}%` : '—'}</strong>
              <em>across selected creators</em>
            </div>
            <Link to={one ? `../campaigns/${one._id}` : '../campaigns'} className={`tile tile-link ov-waiting ${m.by.waiting ? 'is-on' : ''}`}>
              <span>Waiting for you</span>
              <strong>
                <Num value={m.by.waiting} />
              </strong>
              <em>{m.by.waiting ? 'Review them now →' : m.by.saved ? `${fmtNum(m.by.saved)} saved for later` : 'Nothing to review'}</em>
            </Link>
          </section>

          {/* decisions + activity */}
          <section className="ov-charts two">
            <article className="card ch">
              <header>
                <h2>Your decisions</h2>
                <p>
                  {m.total
                    ? `${fmtNum(m.total)} creator${m.total === 1 ? '' : 's'} shortlisted for you · you’ve said yes to ${m.rate}% of those you decided on`
                    : 'Swol Media hasn’t shortlisted anyone yet'}
                </p>
              </header>
              {m.total > 0 && (
                <>
                  <div className="dec-bar" role="img" aria-label={DECISIONS.map(([k, l]) => `${l}: ${m.by[k]}`).join(', ')}>
                    {DECISIONS.map(([k, l]) =>
                      m.by[k] ? <i key={k} className={`d-${k}`} style={{ flexGrow: m.by[k] }} {...tip(fmtNum(m.by[k]), l)} /> : null
                    )}
                  </div>
                  <ul className="dec-legend">
                    {DECISIONS.map(([k, l]) => (
                      <li key={k}>
                        <i className={`d-${k}`} />
                        <span>{l}</span>
                        <b>{fmtNum(m.by[k])}</b>
                        <small>{pct(m.by[k], m.total)}%</small>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </article>
            <article className="card ch">
              <header>
                <h2>Creators shared with you</h2>
                <p>Per week, last 8 weeks</p>
              </header>
              <Columns cols={m.weeks} tip={tip} />
            </article>
          </section>

          {/* who the creators are */}
          <section className="ov-charts three">
            <article className="card ch">
              <header>
                <h2>Audience size</h2>
                <p>Followers of your {m.poolLabel}</p>
              </header>
              <HBars rows={m.tiers} tip={tip} empty="No follower numbers yet" />
            </article>
            <article className="card ch">
              <header>
                <h2>Where they are</h2>
                <p>Top cities of your {m.poolLabel}</p>
              </header>
              <HBars rows={m.cities} tip={tip} empty="No locations yet" />
            </article>
            <article className="card ch">
              <header>
                <h2>Content &amp; platforms</h2>
                <p>Top genres, then platforms</p>
              </header>
              <HBars rows={m.genres} tip={tip} empty="No genres yet" />
              <div className="ch-split" />
              <HBars rows={m.platforms} tip={tip} empty="No platforms yet" />
            </article>
          </section>

          {/* every campaign at a glance */}
          <section className="card ov-table">
            <header className="cd-card-head">
              <div>
                <h2>All campaigns</h2>
                <p>Status, timing and progress of every campaign</p>
              </div>
              <Link to="../campaigns" className="btn ghost sm">
                Open campaigns <Icon name="arrowRight" size={15} />
              </Link>
            </header>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Campaign</th>
                    <th>Status</th>
                    <th>Dates</th>
                    <th>Platforms</th>
                    <th>Selected</th>
                    <th>To review</th>
                    <th>Reach</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {camps.map((c) => {
                    const mine = data.creators.filter((k) => String(k.campaign) === String(c._id));
                    const sel = mine.filter((k) => k.status === 'selected');
                    const reach = sel.reduce((a, k) => a + k.followers, 0);
                    const left = daysLeft(c.endDate);
                    return (
                      <tr key={c._id} className={focus === c._id ? 'is-focus' : ''}>
                        <td>
                          <Link to={`../campaigns/${c._id}`} className="ov-camp-name">
                            <strong>{c.name}</strong>
                            <span>{c.code}</span>
                          </Link>
                        </td>
                        <td data-label="Status">
                          <StatusChip status={c.status} />
                        </td>
                        <td data-label="Dates" className="small">
                          {c.endDate ? (
                            <>
                              {fmtDate(c.endDate)}
                              <br />
                              <span className={left !== null && left <= 7 && left >= 0 ? 'ov-soon' : 'muted'}>
                                {left === null ? '' : left < 0 ? 'Ended' : left === 0 ? 'Ends today' : `${left} day${left === 1 ? '' : 's'} left`}
                              </span>
                            </>
                          ) : (
                            <span className="muted">To be confirmed</span>
                          )}
                        </td>
                        <td data-label="Platforms" className="small">
                          {c.platforms?.map((p) => PLATFORM_LABEL[p]).join(', ') || '—'}
                        </td>
                        <td data-label="Selected">
                          <div className="ov-prog" {...tip(`${fmtNum(sel.length)} of ${fmtNum(c.creatorsNeeded)}`, `${c.name} — selected`)}>
                            <span>
                              <b>{fmtNum(sel.length)}</b> / {fmtNum(c.creatorsNeeded)}
                            </span>
                            <i>
                              <span style={{ width: `${Math.min(100, pct(sel.length, c.creatorsNeeded))}%` }} />
                            </i>
                          </div>
                        </td>
                        <td data-label="To review">{c.counts?.waiting ? <b className="ov-wait">{fmtNum(c.counts.waiting)}</b> : <span className="muted">0</span>}</td>
                        <td data-label="Reach">{reach ? fmtCompact(reach) : '—'}</td>
                        <td className="row-actions">
                          <Link to={`../campaigns/${c._id}`} className="icon-btn" aria-label={`Open ${c.name}`}>
                            <Icon name="arrowRight" size={15} />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
      {tipNode}
      {toastNode}
    </div>
  );
}
