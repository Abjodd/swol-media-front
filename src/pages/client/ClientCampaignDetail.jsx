import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import Icon from '../../components/Icon.jsx';
import ReelDeck from '../../components/ReelDeck.jsx';
import SwipeDeck, { CreatorPhoto, DefaultBack, Verified, creatorStats, igTags } from '../../components/SwipeDeck.jsx';
import { Empty, Meter, PLATFORM_LABEL, StatusChip, fmtDate, fmtINR, fmtNum, useShowMore, useToast } from '../../components/ui.jsx';

const TABS = [
  ['review', 'To review'],
  ['selected', 'Selected'],
  ['saved', 'Saved for later'],
  ['declined', 'Declined'],
  ['execution', 'Execution'],
  ['brief', 'Brief'],
];
// which pile a creator is in, from the client's point of view
const pileOf = (s) => (s.status === 'approved' ? 'selected' : s.status === 'declined' ? 'declined' : s.saved ? 'saved' : 'review');
// what each decision does to a creator locally (mirrors the server)
const apply = (s, to) =>
  to === 'saved' ? { ...s, status: 'sent_to_client', saved: true } : { ...s, status: to, saved: false };
const VERB = { approved: 'Selected', declined: 'Passed on', saved: 'Saved for later', sent_to_client: 'Back to review' };

export default function ClientCampaignDetail() {
  const { id } = useParams();
  const [c, setC] = useState(null);
  const [creators, setCreators] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState([]); // deck decisions, newest last — for undo
  const [backId, setBackId] = useState(null); // the card that just came back from an undo
  const [params, setParams] = useSearchParams();
  const [toast, toastNode] = useToast();

  const load = () =>
    Promise.all([api.getCampaign(id), api.listCampaignCreators(id)])
      .then(([d, s]) => {
        setC(d.item);
        setCreators(s.items);
      })
      .catch((e) => (e.status === 404 ? setNotFound(true) : toast(e.message, true)));
  useEffect(() => {
    load();
  }, [id]);

  // keep prices and creator details fresh while the page is open (the team may set a cost meanwhile);
  // the client's own decisions on screen are left as they are
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      api
        .listCampaignCreators(id)
        .then((s) =>
          setCreators((list) => {
            if (!list) return s.items;
            const fresh = new Map(s.items.map((x) => [x._id, x]));
            const known = new Set(list.map((x) => x._id));
            return [
              ...list.filter((x) => fresh.has(x._id)).map((x) => ({ ...x, clientCost: fresh.get(x._id).clientCost, creator: fresh.get(x._id).creator })),
              ...s.items.filter((x) => !known.has(x._id)),
            ];
          })
        )
        .catch(() => {});
    };
    const t = setInterval(refresh, 20000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(t);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [id]);

  const groups = useMemo(() => {
    const g = { review: [], selected: [], saved: [], declined: [] };
    for (const s of creators || []) g[pileOf(s)].push(s);
    // a card brought back with undo goes straight to the top of the deck
    if (backId) g.review.sort((a, b) => (b._id === backId) - (a._id === backId));
    return g;
  }, [creators, backId]);
  const sentTotal = (creators || []).length;

  // record a decision: update the screen at once, then save; put it back if saving fails
  const decide = useCallback(
    async (sub, to, { fromDeck = false, quiet = false } = {}) => {
      const before = sub;
      setCreators((list) => list.map((x) => (x._id === sub._id ? apply(x, to) : x)));
      if (fromDeck) setHistory((h) => [...h.slice(-19), { sub: before, to }]);
      if (to !== 'sent_to_client') setBackId((b) => (b === sub._id ? null : b));
      try {
        await api.moveCampaignCreators(c._id, [sub._id], to);
        if (!quiet) toast(`${VERB[to]}: ${sub.creator.name || '@' + sub.creator.handle}`);
      } catch (e) {
        setCreators((list) => list.map((x) => (x._id === sub._id ? before : x)));
        if (fromDeck) setHistory((h) => h.filter((x) => x.sub._id !== sub._id));
        toast(e.message, true);
      }
    },
    [c?._id] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const undo = useCallback(async () => {
    const last = history[history.length - 1];
    if (!last || busy) return;
    setBusy(true);
    setHistory((h) => h.slice(0, -1));
    setBackId(last.sub._id);
    await decide(last.sub, 'sent_to_client', { quiet: true });
    setBusy(false);
  }, [history, busy, decide]);

  if (notFound)
    return (
      <div className="page">
        <Link to=".." className="back">
          <Icon name="arrowLeft" size={16} /> All campaigns
        </Link>
        <p className="muted">This campaign isn’t available.</p>
      </div>
    );
  if (!c || !creators)
    return (
      <div className="page">
        <div className="skel" style={{ height: 160 }} />
        <div className="skel" style={{ height: 300 }} />
      </div>
    );

  const tab = TABS.some(([k]) => k === params.get('tab')) ? params.get('tab') : groups.review.length || !groups.selected.length ? 'review' : 'selected';
  const pick = (k) => setParams({ tab: k }, { replace: true });
  const counts = { review: groups.review.length, selected: groups.selected.length, saved: groups.saved.length, declined: groups.declined.length };

  const list = groups[tab] || [];

  return (
    <div className="page">
      <Link to=".." className="back">
        <Icon name="arrowLeft" size={16} /> All campaigns
      </Link>

      <section className="cp-hero">
        <div className="cp-hero-main">
          <div className="cd-tags">
            <span className="c-code">{c.code}</span>
            <StatusChip status={c.status} />
          </div>
          <h2>{c.name}</h2>
          {c.objective && <p className="muted">{c.objective}</p>}
          {/* the essentials on one line — the full details are on the Brief tab */}
          <p className="cp-meta">
            <span>
              <Icon name="creators" size={14} /> {fmtNum(c.creatorsNeeded)} creators
            </span>
            {c.platforms?.length > 0 && <span>{c.platforms.map((p) => PLATFORM_LABEL[p]).join(', ')}</span>}
            <span>
              <Icon name="calendar" size={14} /> {c.startDate || c.endDate ? `${c.startDate ? fmtDate(c.startDate) : 'TBC'} – ${c.endDate ? fmtDate(c.endDate) : 'TBC'}` : 'Dates to be confirmed'}
            </span>
          </p>
        </div>
        <div className="cp-progress">
          <span className="microlabel">Selected so far</span>
          <strong>
            {fmtNum(counts.selected)}
            <small>/ {fmtNum(c.creatorsNeeded)}</small>
          </strong>
          <Meter value={counts.selected} max={c.creatorsNeeded} tone="ok" />
          <p>{counts.review ? `${fmtNum(counts.review)} waiting for your review${counts.saved ? `, ${fmtNum(counts.saved)} saved for later` : ''}` : counts.saved ? `${fmtNum(counts.saved)} saved for later` : 'Swol Media will send more creators as they’re shortlisted'}</p>
        </div>
      </section>

      <div className="seg cd-tabs" role="tablist">
        {TABS.map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`${tab === k ? 'on' : ''} tab-${k}`} onClick={() => pick(k)}>
            {l}
            {counts[k] !== undefined && <span>{fmtNum(counts[k])}</span>}
          </button>
        ))}
      </div>

      {tab === 'brief' ? (
        <>
      <dl className="cp-details">
          <div>
            <dt>Creators needed</dt>
            <dd>{fmtNum(c.creatorsNeeded)}</dd>
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
            <dt>Campaign dates</dt>
            <dd>{c.startDate || c.endDate ? `${c.startDate ? fmtDate(c.startDate) : 'TBC'} – ${c.endDate ? fmtDate(c.endDate) : 'TBC'}` : 'To be confirmed'}</dd>
          </div>
        </dl>
        <section className="card">
          <div className="cd-card-head">
            <h2>Campaign brief</h2>
          </div>
          {c.objective && (
            <p className="cd-obj">
              <Icon name="target" size={16} /> {c.objective}
            </p>
          )}
          {c.brief ? <p className="cd-brief">{c.brief}</p> : <p className="muted">No brief has been added yet.</p>}
        </section>
        </>
      ) : tab === 'execution' ? (
        <ClientExecution campaignId={c._id} />
      ) : tab === 'review' ? (
        sentTotal === 0 ? (
          <Empty icon="creators" title="No creators yet" text="Swol Media is shortlisting creators for this campaign. They’ll appear here for you to review." />
        ) : (
          <SwipeDeck
            items={groups.review}
            total={groups.review.length + history.length}
            onDecide={(sub, to) => decide(sub, to, { fromDeck: true, quiet: true })}
            onUndo={undo}
            canUndo={history.length > 0}
            busy={busy}
            backId={backId}
            renderBack={(sub) => (
              <DefaultBack
                sub={sub}
                lead={
                  <div className={`sw-price ${sub.clientCost?.amount ? '' : 'is-tbc'}`}>
                    <span>Cost</span>
                    <b>{sub.clientCost?.amount ? fmtINR(sub.clientCost.amount) : 'To be confirmed'}</b>
                  </div>
                }
              />
            )}
          />
        )
      ) : (
        <>
          {list.length > 0 && (
            <div className="page-bar">
              <span className="muted" style={{ marginRight: 'auto' }}>
                {fmtNum(list.length)} creator{list.length === 1 ? '' : 's'}
              </span>
            </div>
          )}
          {list.length === 0 ? (
            <Empty
              icon={{ selected: 'check', saved: 'bookmark', declined: 'close' }[tab]}
              title={{ selected: 'No creators selected yet', saved: 'Nothing saved for later', declined: 'No passed creators' }[tab]}
              text={
                {
                  selected: 'Swipe right on a creator in To review and they land here — these are the creators on your campaign.',
                  saved: 'Swipe up on a creator you’re unsure about. They wait here until you decide.',
                  declined: 'Creators you pass on appear here, in case you change your mind.',
                }[tab]
              }
            />
          ) : (
            <ShowMore list={list} resetKey={tab}>
              {(visible) => (
            <div className="pc-grid">
              {visible.map((s) => {
                const k = s.creator;
                const pile = pileOf(s);
                return (
                  <article key={s._id} className={`pc is-${pile}`}>
                    <div className="pc-top">
                      <CreatorPhoto creator={k} className="pc-photo" />
                      <div className="pc-id">
                        <strong>
                          {k.name || k.handle} <Verified k={k} />
                        </strong>
                        {k.profileUrl ? (
                          <a href={k.profileUrl} target="_blank" rel="noreferrer">
                            @{k.handle} <Icon name="external" size={12} />
                          </a>
                        ) : (
                          <span>@{k.handle}</span>
                        )}
                        <small>{[k.city, k.district, k.state].filter(Boolean).join(', ') || PLATFORM_LABEL[k.platform]}</small>
                        {k.categories?.length > 0 && <small className="pc-genre">{k.categories.join(', ')}</small>}
                      </div>
                    </div>
                    <dl className="pc-stats">
                      {creatorStats(k).map(([l, v]) => (
                        <div key={l}>
                          <dd>{v}</dd>
                          <dt>{l}</dt>
                        </div>
                      ))}
                    </dl>
                    {(igTags(k).length > 0 || k.bio) && (
                      <div className="pc-more">
                        {igTags(k).length > 0 && (
                          <p className="sw-tags">
                            {igTags(k).map((t) => (
                              <span key={t}>{t}</span>
                            ))}
                          </p>
                        )}
                        {k.bio && <p className="pc-bio">{k.bio}</p>}
                      </div>
                    )}
                    <div className="pc-acts" role="group" aria-label="Decision">
                      <button type="button" className={`pc-btn yes ${pile === 'selected' ? 'on' : ''}`} disabled={pile === 'selected'} onClick={() => decide(s, 'approved')}>
                        <Icon name="check" size={15} /> {pile === 'selected' ? 'Selected' : 'Select'}
                      </button>
                      <button type="button" className={`pc-btn save ${pile === 'saved' ? 'on' : ''}`} disabled={pile === 'saved'} onClick={() => decide(s, 'saved')}>
                        <Icon name="bookmark" size={14} /> {pile === 'saved' ? 'Saved' : 'Save'}
                      </button>
                      <button type="button" className={`pc-btn no ${pile === 'declined' ? 'on' : ''}`} disabled={pile === 'declined'} onClick={() => decide(s, 'declined')}>
                        <Icon name="close" size={15} /> {pile === 'declined' ? 'Passed' : 'Pass'}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
              )}
            </ShowMore>
          )}
        </>
      )}
      {toastNode}
    </div>
  );
}

// a long pile of creators draws 48 cards at first and more as you scroll
function ShowMore({ list, resetKey, children }) {
  const [visible, footer] = useShowMore(list, { step: 48, resetKey });
  return (
    <>
      {children(visible)}
      {footer}
    </>
  );
}

// Execution: the reels the selected creators posted for this campaign
function ClientExecution({ campaignId }) {
  const [items, setItems] = useState(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .listAssets(campaignId)
        .then((d) => alive && setItems(d.items))
        .catch(() => alive && setItems([]));
    load();
    const t = setInterval(load, 30000); // new reels show up while you watch
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [campaignId]);
  if (items === null) return <div className="skel" style={{ height: 520 }} />;
  return (
    <section className="card rm rm-client">
      <ReelDeck items={items} emptyTitle="No reels yet" emptyText="As your creators post for this campaign, their reels appear here." />
    </section>
  );
}
