import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import Icon from './Icon.jsx';
import { fmtNum, timeAgo } from './ui.jsx';

// The bell in the top bar: problems that need a look, grouped by campaign —
// rows of an upload that weren't valid links, Instagram profiles that couldn't be fetched
// (renamed, deleted, private), and reel links that are broken or not from the campaign's creators.
const ICON = { bad_links: 'link', reel_links: 'link', ig_not_found: 'alert', ig_failed: 'alert', ig_private: 'lock', ig_paused: 'clock', reel_problem: 'play', price_changed: 'wallet', creator_replaced: 'alert' };
const POLL = 60 * 1000;

export default function NotificationBell({ role }) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState(null);
  const [freshIds, setFreshIds] = useState(() => new Set()); // unread when the list was opened (stay highlighted)
  const ref = useRef(null);

  const count = () => !document.hidden && api.notificationCount().then((d) => setUnread(d.unread)).catch(() => {});
  useEffect(() => {
    count();
    const t = setInterval(count, POLL);
    const soon = () => setTimeout(count, 1500);
    window.addEventListener('focus', count);
    window.addEventListener('swol:creators-added', soon); // an upload may have raised some
    return () => {
      clearInterval(t);
      window.removeEventListener('focus', count);
      window.removeEventListener('swol:creators-added', soon);
    };
  }, []);

  const load = () =>
    api
      .notifications()
      .then((d) => {
        setItems(d.items);
        const fresh = d.items.filter((n) => !n.read).map((n) => n._id);
        setFreshIds(new Set(fresh));
        setUnread(d.unread);
        // opening the list counts as reading it (they stay highlighted until it's closed)
        if (fresh.length) api.readNotifications(fresh).then(() => setUnread((u) => Math.max(0, u - fresh.length))).catch(() => {});
      })
      .catch(() => setItems([]));

  useEffect(() => {
    if (!open) return undefined;
    load();
    const away = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  // grouped by campaign, the most recent group first; problems without a campaign under "General"
  const groups = useMemo(() => {
    const out = new Map();
    for (const n of items || []) {
      const k = n.campaign?._id || 'general';
      if (!out.has(k)) out.set(k, { campaign: n.campaign, list: [] });
      out.get(k).list.push(n);
    }
    return [...out.values()];
  }, [items]);

  const dismiss = (n) => {
    setItems((list) => list.filter((x) => x._id !== n._id));
    api.dismissNotification(n._id).catch(() => {});
  };
  const where = (n) => {
    if (!n.campaign) return null;
    const reel = n.kind.startsWith('reel');
    return `/dashboard/campaigns/${n.campaign._id}?tab=${reel ? (role === 'vendor' ? 'assets' : 'execution') : role === 'vendor' ? 'creators' : 'added'}`;
  };

  return (
    <div className="nb" ref={ref}>
      <button type="button" className={`nb-btn ${open ? 'open' : ''}`} onClick={() => setOpen(!open)} aria-label={`Notifications${unread ? ` (${unread} new)` : ''}`} aria-expanded={open}>
        <Icon name="bell" size={18} />
        {unread > 0 && <span className="nb-badge">{unread > 99 ? '99+' : unread}</span>}
      </button>

      {open && (
        <div className="nb-pop" role="dialog" aria-label="Notifications">
          <header className="nb-head">
            <strong>Notifications</strong>
            <span>{items ? `${fmtNum(items.length)} to look at` : 'Loading…'}</span>
          </header>
          <div className="nb-body">
            {items === null ? (
              <div className="nb-skel">
                <i />
                <i />
                <i />
              </div>
            ) : items.length === 0 ? (
              <div className="nb-empty">
                <Icon name="check" size={20} />
                <strong>All clear</strong>
                <p>Bad links, Instagram profiles that couldn’t be fetched and reel problems show up here, with their campaign.</p>
              </div>
            ) : (
              groups.map((g) => (
                <section key={g.campaign?._id || 'general'} className="nb-group">
                  <h4>
                    {g.campaign ? (
                      <>
                        <span>{g.campaign.code}</span> {g.campaign.name}
                      </>
                    ) : (
                      'General'
                    )}
                  </h4>
                  {g.list.map((n) => (
                    <Note key={n._id} n={n} fresh={freshIds.has(n._id)} to={where(n)} onGo={() => setOpen(false)} onDismiss={() => dismiss(n)} />
                  ))}
                </section>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Note({ n, fresh, to, onGo, onDismiss }) {
  const [more, setMore] = useState(false);
  return (
    <article className={`nb-item sev-${n.severity} ${fresh ? 'fresh' : ''}`}>
      <span className="nb-ic">
        <Icon name={ICON[n.kind] || 'alert'} size={15} />
      </span>
      <div className="nb-main">
        <p className="nb-title">
          {n.title}
          {n.count > 1 && <b> · {fmtNum(n.count)}</b>}
        </p>
        {n.text && <p className="nb-text">{n.text}</p>}
        {n.items?.length > 0 && (
          <>
            <button type="button" className="nb-more" onClick={() => setMore(!more)} aria-expanded={more}>
              {more ? 'Hide' : `Show ${n.count > n.items.length ? `the first ${n.items.length}` : n.items.length === 1 ? 'it' : `all ${n.items.length}`}`} <Icon name="chevronDown" size={13} />
            </button>
            {more && (
              <ul className="nb-list">
                {n.items.map((x, i) => (
                  <li key={i}>
                    <span>{x.label || '(empty)'}</span>
                    {x.reason && <em>{x.reason}</em>}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        <div className="nb-acts">
          <time>{timeAgo(n.at)}</time>
          {n.link && (
            <a href={n.link} target="_blank" rel="noreferrer">
              Open link <Icon name="external" size={12} />
            </a>
          )}
          {to && (
            <Link to={to} onClick={onGo}>
              Go to campaign <Icon name="arrowRight" size={12} />
            </Link>
          )}
        </div>
      </div>
      <button type="button" className="nb-x" onClick={onDismiss} aria-label="Dismiss" title="Dismiss">
        <Icon name="close" size={14} />
      </button>
    </article>
  );
}
