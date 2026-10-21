import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../../api.js';
import SwipeDeck, { BackRow, DefaultBack } from '../../../components/SwipeDeck.jsx';
import { fmtDate, fmtINR, fmtNum } from '../../../components/ui.jsx';

// The Swol Media team's review of newly added creators, one card at a time.
// Right = shortlist (sends them to the client), left = reject, up = hold for later (team only).
const TEAM_ACTIONS = {
  right: { status: 'sent_to_client', label: 'Shortlist', stamp: 'Shortlist' },
  left: { status: 'rejected', label: 'Reject', stamp: 'Reject' },
  up: { status: 'held', label: 'Hold for later', stamp: 'Hold for later' },
};
const VERB = { sent_to_client: 'Shortlisted and sent to the client', rejected: 'Rejected', held: 'On hold', submitted: 'Back in review' };
const inReview = (s) => ['submitted', 'shortlisted'].includes(s.status);
const applyMove = (s, to) => (to === 'held' ? { ...s, held: true } : { ...s, status: to, held: false });

function TeamBack({ sub }) {
  const s = sub;
  return (
    <DefaultBack sub={s}>
      <BackRow label="Cost">
        <b>{fmtINR(s.vendorCost?.amount)}</b>
        {s.vendorCost?.text && s.vendorCost.text !== String(s.vendorCost.amount) ? <small className="sw-row-sub"> ({s.vendorCost.text})</small> : null}
      </BackRow>
      <BackRow label="Price">{s.clientCost?.amount ? <b className="sw-neg">{fmtINR(s.clientCost.amount)}</b> : <span className="muted">Not set — needed before shortlisting (set it in the table)</span>}</BackRow>
      <BackRow label="Margin">{s.clientCost?.amount && s.vendorCost?.amount ? fmtINR(s.clientCost.amount - s.vendorCost.amount) : null}</BackRow>
      <BackRow label="Added by">{`${s.vendor?.name || 'Swol Media'}, ${fmtDate(s.createdAt)}`}</BackRow>
      <BackRow label="Phone">{s.creator.contact?.phone}</BackRow>
      <BackRow label="Email">{s.creator.contact?.email}</BackRow>
      <BackRow label="Vendor note">{s.note}</BackRow>
    </DefaultBack>
  );
}

export default function InternalReview({ campaign, items, onChanged, toast }) {
  // local overrides so a swipe shows at once, before the server round-trip lands
  const [over, setOver] = useState({}); // id → { status, held }
  const [history, setHistory] = useState([]);
  const [backId, setBackId] = useState(null);
  const [busy, setBusy] = useState(false);

  // drop overrides once the reloaded list agrees with them
  useEffect(() => {
    setOver((o) => {
      const next = { ...o };
      for (const s of items) {
        const v = next[s._id];
        if (v && v.status === s.status && Boolean(v.held) === Boolean(s.held)) delete next[s._id];
      }
      return next;
    });
  }, [items]);

  const list = useMemo(() => items.map((s) => (over[s._id] ? { ...s, ...over[s._id] } : s)), [items, over]);
  const queue = useMemo(() => {
    const q = list.filter((s) => inReview(s) && !s.held);
    if (backId) q.sort((a, b) => (b._id === backId) - (a._id === backId));
    return q;
  }, [list, backId]);
  const held = list.filter((s) => inReview(s) && s.held).length;

  const decide = useCallback(
    async (sub, to, { fromDeck = true } = {}) => {
      const next = applyMove(sub, to);
      setOver((o) => ({ ...o, [sub._id]: { status: next.status, held: next.held } }));
      if (fromDeck) setHistory((h) => [...h.slice(-19), sub]);
      if (to !== 'submitted') setBackId((b) => (b === sub._id ? null : b));
      try {
        await api.moveCampaignCreators(campaign._id, [sub._id], to);
        onChanged();
      } catch (e) {
        setOver((o) => {
          const n = { ...o };
          delete n[sub._id];
          return n;
        });
        if (fromDeck) setHistory((h) => h.filter((x) => x._id !== sub._id));
        toast(e.message, true);
      }
    },
    [campaign._id, onChanged, toast]
  );

  const undo = useCallback(async () => {
    const last = history[history.length - 1];
    if (!last || busy) return;
    setBusy(true);
    setHistory((h) => h.slice(0, -1));
    setBackId(last._id);
    await decide(last, 'submitted', { fromDeck: false });
    toast(`${VERB.submitted}: ${last.creator.name || '@' + last.creator.handle}`);
    setBusy(false);
  }, [history, busy, decide, toast]);

  return (
    <div className="ir">
      {held > 0 && (
        <p className="ir-held">
          {fmtNum(held)} on hold — find them in the table under “On hold”.
        </p>
      )}
      <SwipeDeck
        items={queue}
        total={queue.length + history.length}
        onDecide={(sub, to) => decide(sub, to)}
        onUndo={undo}
        canUndo={history.length > 0}
        busy={busy}
        backId={backId}
        actions={TEAM_ACTIONS}
        renderBack={(sub) => <TeamBack sub={sub} />}
        doneTitle="Nothing left to review"
        doneText={held ? `${fmtNum(held)} creator${held === 1 ? ' is' : 's are'} on hold. Switch to the table to decide on them.` : 'New creators from vendors and your team will appear here.'}
      />
    </div>
  );
}
