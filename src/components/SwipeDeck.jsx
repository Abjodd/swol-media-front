import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { initialsOf } from './Avatar.jsx';
import { PLATFORM_LABEL, fmtCompact } from './ui.jsx';
import { withSession } from '../session.js';

// Public profile pictures for the big platforms, when the team hasn't pasted a photo link.
const PHOTO_SOURCE = { instagram: 'instagram', youtube: 'youtube', x: 'x' };
// A photo fetched from Instagram (HikerAPI) is stored with us and served from /api/creators/:id/photo.
const photoFor = (k) =>
  k.avatarUrl?.startsWith('/api/')
    ? withSession(k.avatarUrl)
    : k.avatarUrl || (PHOTO_SOURCE[k.platform] ? `https://unavatar.io/${PHOTO_SOURCE[k.platform]}/${encodeURIComponent(k.handle)}?fallback=false` : '');

// still waiting for the Instagram (HikerAPI) lookup — show a loading shimmer instead of blanks
export const isFetching = (k) => k?.ig?.status === 'queued';
export const Shimmer = ({ w }) => <i className="ig-shimmer" style={w ? { width: w } : undefined} aria-label="Loading from Instagram" />;
// "Fetching from Instagram" with animated dots, under a creator's name
export const FetchingTag = ({ k }) =>
  isFetching(k) ? (
    <span className="ig-fetching" title="Photo, followers and averages are on their way from Instagram">
      Fetching data<b>.</b><b>.</b><b>.</b>
    </span>
  ) : null;

// The creator's photo, falling back to large initials on black when there isn't one.
// While the Instagram lookup runs (and we have no photo of our own yet) it shimmers.
export function CreatorPhoto({ creator, className = '' }) {
  const loading = isFetching(creator) && !creator.avatarUrl;
  const src = loading ? '' : photoFor(creator);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [src]);
  if (loading) return <div className={`cph ${className} is-loading`} aria-label="Loading photo" />;
  return (
    <div className={`cph ${className} ${!src || failed ? 'is-empty' : ''}`}>
      {src && !failed ? (
        <img src={src} alt="" draggable={false} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      ) : (
        <span>{initialsOf(creator.name || creator.handle)}</span>
      )}
    </div>
  );
}

// numbers fetched from Instagram show a real 0 as "0"; unknown numbers show "—";
// numbers still on their way from Instagram shimmer
const statOf = (k) => (n, known) => (n ? fmtCompact(n) : known ? '0' : isFetching(k) ? <Shimmer /> : '—');
const er = (k) =>
  k.engagementRate ? `${Number(k.engagementRate).toFixed(1).replace(/\.0$/, '')}%` : k.ig?.fetchedAt && k.followers ? '0%' : isFetching(k) ? <Shimmer /> : '—';
const fetched = (k) => Boolean(k.ig?.fetchedAt);
export const creatorStats = (k) => {
  const stat = statOf(k);
  return [
    ['Followers', stat(k.followers, fetched(k))],
    ['Avg views', stat(k.avgViews)],
    ['Avg likes', stat(k.avgLikes, fetched(k) && k.ig?.sampled > 0)],
    ['Engagement', er(k)],
  ];
};
// the longer list for the back of the card
export const creatorStatsFull = (k) => {
  const stat = statOf(k);
  return [
    ['Followers', stat(k.followers, fetched(k))],
    ['Following', stat(k.following, fetched(k))],
    ['Avg views', stat(k.avgViews)],
    ['Avg likes', stat(k.avgLikes, fetched(k) && k.ig?.sampled > 0)],
    ['Avg comments', stat(k.avgComments, fetched(k) && k.ig?.sampled > 0)],
    ['Engagement', er(k)],
    ...(k.ig?.fetchedAt ? [['Posts', stat(k.ig.posts, true)]] : []),
  ];
};

// short labels from the Instagram lookup: category, account type, post count
export const igTags = (k) => {
  const ig = k.ig || {};
  return [ig.category, ig.business ? 'Business account' : null, ig.private ? 'Private' : null, ig.posts ? `${fmtCompact(ig.posts)} posts` : null].filter(Boolean);
};
const dateOf = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

// small black tick for verified accounts
export const Verified = ({ k }) =>
  k?.ig?.verified ? (
    <span className="ig-tick" title="Verified on Instagram" aria-label="Verified">
      <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 1.5l2.6 1.9 3.2-.2 1 3.1 2.6 1.9-1 3.1 1 3.1-2.6 1.9-1 3.1-3.2-.2L12 22.5l-2.6-1.9-3.2.2-1-3.1L2.6 15.8l1-3.1-1-3.1 2.6-1.9 1-3.1 3.2.2z" fill="currentColor" />
        <path d="M8 12.2l2.6 2.6L16.2 9" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  ) : null;

// what each direction means — the client's defaults; the Swol Media team passes its own
export const CLIENT_ACTIONS = {
  right: { status: 'approved', label: 'Select', stamp: 'Select' },
  left: { status: 'declined', label: 'Pass', stamp: 'Pass' },
  up: { status: 'saved', label: 'Save for later', stamp: 'Save for later' },
};
const THRESHOLD = 110;
const TAP = 6; // px of movement still counted as a click
const DOUBLE = 260; // ms between clicks for a double-click

const openProfile = (k) => k.profileUrl && window.open(k.profileUrl, '_blank', 'noopener,noreferrer');

function Card({ sub, depth, onGone, flingRef, flipRef, back, teach, onStart, actions, renderBack }) {
  const k = sub.creator;
  const el = useRef(null);
  const drag = useRef(null);
  const [pos, setPos] = useState({ x: 0, y: 0, moving: false });
  const [out, setOut] = useState(null); // 'left' | 'right' | 'up'
  const [flipped, setFlipped] = useState(false);
  const clickTimer = useRef(null);
  const top = depth === 0;
  useEffect(() => () => clearTimeout(clickTimer.current), []);

  const fling = useCallback(
    (dir) => {
      if (out) return;
      setOut(dir);
      setTimeout(() => onGone(sub, dir), 320);
    },
    [out, onGone, sub]
  );
  // let the buttons and keyboard throw the top card
  useEffect(() => {
    if (top) {
      flingRef.current = fling;
      flipRef.current = () => setFlipped((f) => !f);
    }
  }, [top, fling, flingRef, flipRef]);

  // one click flips the card; two quick clicks open their profile instead
  const tap = () => {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
      openProfile(k);
      return;
    }
    clickTimer.current = setTimeout(() => {
      clickTimer.current = null;
      setFlipped((f) => !f);
    }, DOUBLE);
  };

  const down = (e) => {
    if (!top || out || e.button > 0 || e.target.closest('a,button')) return;
    el.current.setPointerCapture(e.pointerId);
    drag.current = { x0: e.clientX, y0: e.clientY, t0: performance.now() };
    onStart();
    setPos({ x: 0, y: 0, moving: true });
  };
  const move = (e) => {
    if (!drag.current) return;
    setPos({ x: e.clientX - drag.current.x0, y: e.clientY - drag.current.y0, moving: true });
  };
  const up = (e) => {
    if (!drag.current) return;
    const { x0, y0, t0 } = drag.current;
    drag.current = null;
    const dx = e.clientX - x0;
    const dy = e.clientY - y0;
    const dt = Math.max(1, performance.now() - t0);
    if (Math.abs(dx) < TAP && Math.abs(dy) < TAP) {
      setPos({ x: 0, y: 0, moving: false });
      return tap();
    }
    const vx = dx / dt;
    const vy = dy / dt;
    if (-dy > THRESHOLD && Math.abs(dy) > Math.abs(dx)) return fling('up');
    if (dx > THRESHOLD || (vx > 0.6 && dx > 40)) return fling('right');
    if (dx < -THRESHOLD || (vx < -0.6 && dx < -40)) return fling('left');
    if (vy < -0.8 && dy < -50) return fling('up');
    setPos({ x: 0, y: 0, moving: false }); // spring back
  };

  // how far along each gesture is (0..1) — drives the stamps
  const pr = Math.min(1, Math.max(0, pos.x / THRESHOLD));
  const pl = Math.min(1, Math.max(0, -pos.x / THRESHOLD));
  const pu = Math.min(1, Math.max(0, -pos.y / THRESHOLD)) * (Math.abs(pos.y) > Math.abs(pos.x) ? 1 : 0.3);

  let transform;
  if (out === 'right') transform = `translate(140%, ${pos.y}px) rotate(28deg)`;
  else if (out === 'left') transform = `translate(-140%, ${pos.y}px) rotate(-28deg)`;
  else if (out === 'up') transform = `translate(${pos.x}px, -130%) scale(0.9)`;
  else if (top) transform = `translate(${pos.x}px, ${pos.y}px) rotate(${pos.x / 18}deg)`;
  else transform = `translateY(${depth * 16}px) scale(${1 - depth * 0.05})`;

  return (
    <article
      ref={el}
      className={`sw-card ${top ? 'is-top' : ''} ${back ? 'is-back' : ''} ${teach && top ? 'teach' : ''} ${pos.moving ? 'is-moving' : ''} ${out ? `is-out out-${out}` : ''}`}
      style={{ transform, zIndex: 10 - depth, opacity: depth > 2 ? 0 : 1 }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      aria-hidden={!top}
    >
      <div className={`sw-flip ${flipped ? 'is-flipped' : ''}`}>
        <div className="sw-face sw-front">
          <div className="sw-photo">
            <CreatorPhoto creator={k} />
            <span className="sw-plat">{PLATFORM_LABEL[k.platform]}</span>
            <span className="sw-turn" aria-hidden>
              <Icon name="undo" size={13} /> Tap to flip
            </span>
            <div className="sw-name">
              <h3>
                {k.name || k.handle} <Verified k={k} />
              </h3>
              <p>
                @{k.handle}
                {k.city ? <span>{k.city}</span> : null}
              </p>
            </div>
          </div>
          <dl className="sw-stats">
            {creatorStats(k).map(([l, v]) => (
              <div key={l}>
                <dd>{v}</dd>
                <dt>{l}</dt>
              </div>
            ))}
          </dl>
          <div className="sw-more">
            {k.ig?.status === 'queued' && (
              <p className="sw-tags">
                <span className="sw-fetching">
                  Fetching Instagram details<b>.</b><b>.</b><b>.</b>
                </span>
              </p>
            )}
            {igTags(k).length > 0 && (
              <p className="sw-tags">
                {igTags(k).map((t) => (
                  <span key={t}>{t}</span>
                ))}
              </p>
            )}
            {(k.categories?.length > 0 || k.bio) && (
              <p className="sw-bio">
                {k.categories?.slice(0, 3).map((c) => (
                  <em key={c}>{c}</em>
                ))}
                {k.bio}
              </p>
            )}
            {k.profileUrl && (
              <a href={k.profileUrl} target="_blank" rel="noreferrer" className="sw-link">
                Open {PLATFORM_LABEL[k.platform]} profile <Icon name="external" size={14} />
              </a>
            )}
          </div>
        </div>
        <div className="sw-face sw-back" aria-hidden={!flipped}>
          {renderBack ? renderBack(sub) : <DefaultBack sub={sub} />}
          <p className="sw-back-hint">Tap to flip back · double-tap opens their profile</p>
        </div>
      </div>
      <b className="sw-stamp st-yes" style={{ opacity: out === 'right' ? 1 : pr }}>
        {actions.right.stamp}
      </b>
      <b className="sw-stamp st-no" style={{ opacity: out === 'left' ? 1 : pl }}>
        {actions.left.stamp}
      </b>
      <b className="sw-stamp st-save" style={{ opacity: out === 'up' ? 1 : pu }}>
        {actions.up.stamp}
      </b>
    </article>
  );
}

// One labelled row on the back of a card (skipped when empty)
export function BackRow({ label, children }) {
  if (children == null || children === '' || (Array.isArray(children) && !children.filter(Boolean).length)) return null;
  return (
    <div className="sw-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

// The back of the card: more about the creator (the full layout comes later)
export function DefaultBack({ sub, lead, children }) {
  const k = sub.creator;
  const place = [k.city, k.district, k.state].filter(Boolean).join(', ');
  return (
    <div className="sw-back-in">
      <div className="sw-back-head">
        <CreatorPhoto creator={k} className="sw-back-photo" />
        <div>
          <h3>
            {k.name || k.handle} <Verified k={k} />
          </h3>
          <p>
            @{k.handle} · {PLATFORM_LABEL[k.platform]}
          </p>
        </div>
      </div>
      {lead}
      <dl className="sw-back-stats">
        {creatorStatsFull(k).map(([l, v]) => (
          <div key={l}>
            <dd>{v}</dd>
            <dt>{l}</dt>
          </div>
        ))}
      </dl>
      <dl className="sw-rows">
        <BackRow label="Location">{place}</BackRow>
        <BackRow label="Genre">{k.categories?.join(', ')}</BackRow>
        <BackRow label="Bio">{k.bio ? <span className="sw-bio-full">{k.bio}</span> : null}</BackRow>
        <BackRow label="Category">{k.ig?.category}</BackRow>
        <BackRow label="Account">{[k.ig?.verified ? 'Verified' : null, k.ig?.business ? 'Business' : null, k.ig?.private ? 'Private' : k.ig?.fetchedAt ? 'Public' : null].filter(Boolean).join(' · ')}</BackRow>
        <BackRow label="Website">
          {k.ig?.website ? (
            <a href={k.ig.website} target="_blank" rel="noreferrer" onPointerDown={(e) => e.stopPropagation()}>
              {k.ig.website.replace(/^https?:\/\//, '')}
            </a>
          ) : null}
        </BackRow>
        <BackRow label="Data">{k.ig?.fetchedAt ? `From Instagram, ${dateOf(k.ig.fetchedAt)}${k.ig.sampled ? ` · averages of ${k.ig.sampled} recent posts` : ''}` : null}</BackRow>
        {children}
      </dl>
    </div>
  );
}

// Tinder-style review. Client: right = select, left = pass, up = save for later.
// Click a card to flip it for more details; double-click opens their profile.
// `items` are the creators waiting for review (top card first); `onDecide(sub, status)` records it.
export default function SwipeDeck({ items, total, onDecide, onUndo, canUndo, busy, backId, actions = CLIENT_ACTIONS, renderBack, doneTitle = 'All caught up', doneText }) {
  const flingRef = useRef(null);
  const flipRef = useRef(null);
  const [hint, setHint] = useState(true);
  const stopHint = useCallback(() => setHint(false), []);

  const gone = useCallback(
    (sub, dir) => {
      setHint(false);
      onDecide(sub, actions[dir].status);
    },
    [onDecide, actions]
  );

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest('input,textarea,select')) return;
      const dir = { ArrowRight: 'right', ArrowLeft: 'left', ArrowUp: 'up' }[e.key];
      if (dir && flingRef.current && items.length) {
        e.preventDefault();
        setHint(false);
        flingRef.current(dir);
      }
      if ((e.key === ' ' || e.key === 'Enter') && flipRef.current && items.length && !e.target.closest('button,a')) {
        e.preventDefault();
        flipRef.current();
      }
      if ((e.key === 'Backspace' || (e.key === 'z' && (e.metaKey || e.ctrlKey))) && canUndo) {
        e.preventDefault();
        onUndo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [items.length, canUndo, onUndo]);

  useEffect(() => {
    if (!items.length) flingRef.current = null;
  }, [items.length]);

  const done = total - items.length;
  const throwTop = (dir) => {
    setHint(false);
    flingRef.current?.(dir);
  };

  return (
    <div className="sw">
      <div className="sw-progress">
        <span>
          <b>{items.length}</b> left to review
        </span>
        <i>
          <span style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
        </i>
      </div>

      <div className="sw-stage">
        {items.length === 0 ? (
          <div className="sw-done">
            <span className="sw-done-ic">
              <Icon name="check" size={26} />
            </span>
            <h3>{doneTitle}</h3>
            <p>{doneText || 'You’ve been through every creator Swol Media shortlisted. New ones will appear here.'}</p>
          </div>
        ) : (
          items
            .slice(0, 4)
            .map((s, i) => <Card key={s._id} sub={s} depth={i} onGone={gone} flingRef={flingRef} flipRef={flipRef} back={s._id === backId} teach={hint} onStart={stopHint} actions={actions} renderBack={renderBack} />)
            .reverse()
        )}
        {items.length > 0 && (
          <div className="sw-hint" aria-hidden>
            <span className="h-l">
              <Icon name="arrowLeft" size={14} /> {actions.left.label}
            </span>
            <span className="h-u">{actions.up.label}</span>
            <span className="h-r">
              {actions.right.label} <Icon name="arrowRight" size={14} />
            </span>
          </div>
        )}
      </div>

      <div className="sw-actions">
        <button type="button" className="sw-btn sw-undo" onClick={onUndo} disabled={!canUndo || busy} title="Undo (Backspace)" aria-label="Undo last decision">
          <Icon name="undo" size={18} />
        </button>
        <button type="button" className="sw-btn sw-no" onClick={() => throwTop('left')} disabled={!items.length} title={`${actions.left.label} (←)`} aria-label={actions.left.label}>
          <Icon name="close" size={26} />
        </button>
        <button type="button" className="sw-btn sw-save" onClick={() => throwTop('up')} disabled={!items.length} title={`${actions.up.label} (↑)`} aria-label={actions.up.label}>
          <Icon name="bookmark" size={20} />
        </button>
        <button type="button" className="sw-btn sw-yes" onClick={() => throwTop('right')} disabled={!items.length} title={`${actions.right.label} (→)`} aria-label={actions.right.label}>
          <Icon name="check" size={26} />
        </button>
      </div>
      <p className="sw-keys">
        <kbd>←</kbd> {actions.left.label.toLowerCase()} · <kbd>↑</kbd> {actions.up.label.toLowerCase()} · <kbd>→</kbd> {actions.right.label.toLowerCase()} · <kbd>⌫</kbd> undo
        <br />
        Click a card to flip it for details · double-click to open their profile
      </p>
    </div>
  );
}
