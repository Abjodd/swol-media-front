import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import Icon from './Icon.jsx';
import ReelDeck from './ReelDeck.jsx';
import { fmtCompact, fmtDate, whenVisible } from './ui.jsx';
import { withSession } from '../session.js';

// Reels for a campaign: paste Instagram reel links → each one is matched to the creator who posted it.
// Vendors see and manage their own; the Swol Media team sees everything (and can watch them like the client).
const STATUS = {
  queued: ['Matching…', 'wait'],
  ok: ['Matched', 'ok'],
  unmatched: ['Not matched', 'warn'],
  not_found: ['Not found', 'warn'],
  error: ['Couldn’t check', 'warn'],
};

export default function ReelsManager({ campaignId, role, toast, canAdd = true }) {
  const [items, setItems] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState(role === 'internal' ? 'watch' : 'list');
  const polls = useRef(0);

  const load = () =>
    api
      .listAssets(campaignId)
      .then((d) => setItems(d.items))
      .catch((e) => toast?.(e.message, true));
  useEffect(() => {
    load();
  }, [campaignId]); // eslint-disable-line react-hooks/exhaustive-deps
  // keep checking while links are being matched
  const waiting = (items || []).some((a) => a.status === 'queued');
  useEffect(() => {
    if (!waiting || polls.current > 120) return undefined;
    const t = setTimeout(() => ((polls.current += 1), whenVisible(load)), 5000);
    return () => clearTimeout(t);
  }, [items, waiting]); // eslint-disable-line react-hooks/exhaustive-deps

  // anything link-like is sent, so links that aren't reels come back as "skipped" instead of vanishing
  const links = useMemo(() => String(text).split(/[\s,]+/).filter((x) => /^https?:\/\/|^www\.|instagram\.com|instagr\.am|^[\w-]+(\.[\w-]+)+\/\S/i.test(x)), [text]);
  const add = async () => {
    setBusy(true);
    try {
      const d = await api.addAssets(campaignId, text);
      toast?.(`${d.added} reel${d.added === 1 ? '' : 's'} added — matching them to creators${d.skipped.length ? ` · ${d.skipped.length} skipped` : ''}`, !d.added);
      if (d.skipped.length) setText(d.skipped.map((x) => x.link).join('\n'));
      else setText('');
      polls.current = 0;
      load();
    } catch (e) {
      toast?.(e.message, true);
    } finally {
      setBusy(false);
    }
  };
  const remove = async (a) => {
    try {
      await api.deleteAsset(campaignId, a._id);
      setItems((l) => l.filter((x) => x._id !== a._id));
    } catch (e) {
      toast?.(e.message, true);
    }
  };
  const retry = async (a) => {
    try {
      await api.retryAsset(campaignId, a._id);
      polls.current = 0;
      load();
    } catch (e) {
      toast?.(e.message, true);
    }
  };

  // the team: who uploaded each reel — a vendor, or Swol Media when the team added it
  const vendorOf = (a) => a.vendor?.name || 'Swol Media';
  const vendors = useMemo(() => (role === 'internal' ? [...new Set((items || []).map(vendorOf))].sort() : []), [items, role]); // eslint-disable-line react-hooks/exhaustive-deps
  const [vendorPick, setVendorPick] = useState('');
  const shown = useMemo(() => (vendorPick ? (items || []).filter((a) => vendorOf(a) === vendorPick) : items || []), [items, vendorPick]); // eslint-disable-line react-hooks/exhaustive-deps
  const matched = shown.filter((a) => a.status === 'ok');
  const byCreator = useMemo(() => {
    const m = new Map();
    for (const a of shown) {
      const key = a.creator?._id || `x:${a.owner || a._id}`;
      if (!m.has(key)) m.set(key, { creator: a.creator, owner: a.owner, list: [] });
      m.get(key).list.push(a);
    }
    return [...m.values()].sort((x, y) => Boolean(y.creator) - Boolean(x.creator));
  }, [shown]);

  return (
    <section className="card rm">
      <div className="rm-head">
        <div>
          <h2>{role === 'vendor' ? 'Assets' : 'Execution'}</h2>
          <p className="muted">
            {role === 'vendor'
              ? 'Paste the Instagram reel links your creators posted. Each one is matched to the creator’s profile and shared with Swol Media and the client.'
              : 'The reels creators posted for this campaign, matched to their profiles. The client sees the matched ones in their Execution tab.'}
          </p>
        </div>
        {role === 'internal' && (
          <div className="seg">
            <button type="button" className={view === 'watch' ? 'on' : ''} onClick={() => setView('watch')}>
              <Icon name="play" size={14} /> Watch <span>{matched.length}</span>
            </button>
            <button type="button" className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>
              <Icon name="note" size={14} /> All links <span>{shown.length}</span>
            </button>
          </div>
        )}
        {role === 'internal' && vendors.length > 1 && (
          <label className="rm-vendor">
            <span>Vendor</span>
            <select value={vendorPick} onChange={(e) => setVendorPick(e.target.value)}>
              <option value="">All vendors</option>
              {vendors.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {view === 'list' && canAdd && (
        <div className="rm-add">
          <textarea
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'Paste reel links — one per line, or all together\nhttps://www.instagram.com/reel/C8x1AbCdEf/\nhttps://www.instagram.com/priya.styles/reel/C9y2BcDeFg/'}
            className="mono-area"
          />
          <div className="rm-add-bar">
            <span className="muted">{links.length ? `${links.length} link${links.length === 1 ? '' : 's'} found` : 'Links from the Instagram app (Share → Copy link) work as they are'}</span>
            <button type="button" className="btn primary" disabled={busy || !links.length} onClick={add}>
              <Icon name="upload" size={15} /> {busy ? 'Adding…' : `Add ${links.length > 1 ? `${links.length} reels` : 'reel'}`}
            </button>
          </div>
        </div>
      )}

      {items === null ? (
        <div className="skel" style={{ height: 240 }} />
      ) : view === 'watch' ? (
        <ReelDeck showVendor={role === 'internal'} items={matched} emptyText={items.length ? 'None of the links are matched to a creator yet — see “All links”.' : 'Reels appear here as soon as vendors add them in their Assets tab.'} />
      ) : !items.length ? (
        <p className="rm-none">No reels added yet.</p>
      ) : (
        <div className="rm-groups">
          {byCreator.map((g) => (
            <div key={g.creator?._id || g.owner || g.list[0]._id} className="rm-group">
              <h3>
                {g.creator ? (
                  <>
                    {g.creator.name || `@${g.creator.handle}`} <small>@{g.creator.handle}</small>
                  </>
                ) : g.owner ? (
                  <>
                    @{g.owner} <small>not matched to a creator</small>
                  </>
                ) : g.list.some((a) => a.status === 'queued') ? (
                  <>Matching…</>
                ) : (
                  <>Not matched</>
                )}
                <span className="rm-n">{g.list.length}</span>
              </h3>
              <div className="rm-grid">
                {g.list.map((a) => {
                  const [label, tone] = STATUS[a.status] || [a.status, 'wait'];
                  return (
                    <article key={a._id} className="rm-item">
                      <a className="rm-thumb" href={a.url} target="_blank" rel="noreferrer" title="Open on Instagram">
                        {a.thumbUrl ? <img src={withSession(a.thumbUrl)} alt="" loading="lazy" /> : <Icon name="camera" size={20} />}
                        {a.videoUrl && (
                          <span className="rm-play">
                            <Icon name="play" size={12} />
                          </span>
                        )}
                      </a>
                      <div className="rm-meta">
                        <span className={`rm-st ${tone}`}>{label}</span>
                        {role === 'internal' && (
                          <span className="rm-vend" title="Who uploaded this reel">
                            <b>Vendor</b> {vendorOf(a)}
                          </span>
                        )}
                        {a.status === 'ok' && (a.plays || a.likes) > 0 && (
                          <small>
                            {a.plays ? `${fmtCompact(a.plays)} plays · ` : ''}
                            {fmtCompact(a.likes)} likes
                          </small>
                        )}
                        {a.error && a.status !== 'ok' && <small className="rm-err">{a.error}</small>}
                        <small className="muted">
                          Added {fmtDate(a.createdAt)}
                        </small>
                        <span className="rm-acts">
                          {['unmatched', 'error', 'not_found'].includes(a.status) && (
                            <button type="button" className="link-btn" onClick={() => retry(a)}>
                              Try again
                            </button>
                          )}
                          <button type="button" className="link-btn danger-text" onClick={() => remove(a)}>
                            Remove
                          </button>
                        </span>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
