import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { CreatorPhoto, Verified } from './SwipeDeck.jsx';
import { fmtCompact, fmtDate } from './ui.jsx';
import { withSession } from '../session.js';

// Execution: the creators' reels, one at a time — swipe (or ←/→) for the next one.
// Videos play by themselves; one mute switch covers every reel and is remembered.
const MUTE_KEY = 'swol.reelsMuted';
const readMuted = () => {
  try {
    return localStorage.getItem(MUTE_KEY) !== '0';
  } catch {
    return true;
  }
};
const SWIPE = 70;

export default function ReelDeck({ items, emptyTitle = 'No reels yet', emptyText = 'Reels appear here as soon as the vendors add them.' }) {
  const [i, setI] = useState(0);
  const [muted, setMuted] = useState(readMuted);
  const [drag, setDrag] = useState(null); // { x0, dx }
  const [dir, setDir] = useState(0); // -1 / 1 for the slide-in animation
  const videoRef = useRef(null);
  const n = items.length;
  const at = Math.min(i, Math.max(0, n - 1));
  const r = items[at];

  useEffect(() => {
    if (i > n - 1) setI(Math.max(0, n - 1));
  }, [n, i]);

  const go = useCallback(
    (step) => {
      if (!n) return;
      setDir(step);
      setI((x) => (x + step + n) % n);
    },
    [n]
  );
  const toggleMute = () => {
    setMuted((m) => {
      try {
        localStorage.setItem(MUTE_KEY, m ? '0' : '1');
      } catch {
        /* ignore */
      }
      return !m;
    });
  };

  // keyboard: ← → for the next reel, M to mute
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.('input, textarea, select')) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') go(1);
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') go(-1);
      else if (e.key.toLowerCase() === 'm') toggleMute();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  // play the current reel from the start (muted autoplay works everywhere; unmuted once you've tapped)
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = muted;
    v.currentTime = 0;
    const p = v.play();
    if (p?.catch)
      p.catch(() => {
        // the browser refused sound before a tap — play silently instead (and show it as muted)
        v.muted = true;
        setMuted(true);
        v.play().catch(() => {});
      });
  }, [at, r?._id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted]);
  // pause when the tab is hidden
  useEffect(() => {
    const onVis = () => videoRef.current && (document.hidden ? videoRef.current.pause() : videoRef.current.play().catch(() => {}));
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  if (!n)
    return (
      <div className="rd-empty">
        <span>
          <Icon name="camera" size={22} />
        </span>
        <strong>{emptyTitle}</strong>
        <p>{emptyText}</p>
      </div>
    );

  const k = r.creator || {};
  const down = (e) => {
    if (e.button > 0 || e.target.closest('a,button')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ x0: e.clientX, y0: e.clientY, dx: 0, dy: 0 });
  };
  const move = (e) => drag && setDrag({ ...drag, dx: e.clientX - drag.x0, dy: e.clientY - drag.y0 });
  const up = () => {
    if (!drag) return;
    const { dx, dy } = drag;
    setDrag(null);
    if (Math.abs(dx) > SWIPE && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
    else if (Math.abs(dy) > SWIPE) go(dy < 0 ? 1 : -1);
    else if (Math.abs(dx) < 6 && Math.abs(dy) < 6 && videoRef.current) {
      // tap: pause / play
      const v = videoRef.current;
      v.paused ? v.play().catch(() => {}) : v.pause();
    }
  };

  return (
    <div className="rd">
      <button type="button" className="rd-nav prev" onClick={() => go(-1)} aria-label="Previous reel" disabled={n < 2}>
        <Icon name="chevronLeft" size={20} />
      </button>
      <div className="rd-stage">
        <article
          key={r._id}
          className={`rd-card ${dir > 0 ? 'in-next' : dir < 0 ? 'in-prev' : ''} ${drag ? 'is-drag' : ''}`}
          style={drag ? { transform: `translateX(${drag.dx}px) rotate(${drag.dx / 30}deg)` } : undefined}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={() => setDrag(null)}
        >
          {r.videoUrl ? (
            <video
              ref={videoRef}
              className="rd-video"
              src={withSession(r.videoUrl)}
              poster={r.thumbUrl ? withSession(r.thumbUrl) : undefined}
              autoPlay
              muted={muted}
              loop
              playsInline
              preload="auto"
              draggable={false}
            />
          ) : (
            <iframe className="rd-embed" src={`https://www.instagram.com/${r.kind === 'post' ? 'p' : 'reel'}/${r.code}/embed/`} title={`Reel by @${k.handle || r.owner}`} allow="autoplay; encrypted-media" loading="lazy" />
          )}
          <div className="rd-top">
            <span className="rd-count">
              {at + 1} / {n}
            </span>
            {r.videoUrl && (
              <button type="button" className="rd-mute" onClick={toggleMute} aria-label={muted ? 'Unmute reels' : 'Mute reels'} title={`${muted ? 'Unmute' : 'Mute'} all reels (M)`}>
                <Icon name={muted ? 'volumeOff' : 'volume'} size={17} />
              </button>
            )}
          </div>
          <div className="rd-info">
            <div className="rd-who">
              <CreatorPhoto creator={k.handle ? k : { handle: r.owner, platform: 'instagram' }} className="rd-av" />
              <div>
                <strong>
                  {k.name || `@${k.handle || r.owner}`} <Verified k={k} />
                </strong>
                <span>
                  @{k.handle || r.owner}
                  {k.followers ? ` · ${fmtCompact(k.followers)} followers` : ''}
                </span>
              </div>
            </div>
            {(r.plays || r.likes || r.comments) > 0 && (
              <dl className="rd-stats">
                {r.plays > 0 && (
                  <div>
                    <dd>{fmtCompact(r.plays)}</dd>
                    <dt>Plays</dt>
                  </div>
                )}
                <div>
                  <dd>{fmtCompact(r.likes)}</dd>
                  <dt>Likes</dt>
                </div>
                <div>
                  <dd>{fmtCompact(r.comments)}</dd>
                  <dt>Comments</dt>
                </div>
              </dl>
            )}
            {r.caption && <p className="rd-cap">{r.caption}</p>}
            <p className="rd-meta">
              {r.postedAt ? `Posted ${fmtDate(r.postedAt)} · ` : ''}
              <a href={r.url} target="_blank" rel="noreferrer">
                Open on Instagram <Icon name="external" size={12} />
              </a>
            </p>
          </div>
        </article>
      </div>
      <button type="button" className="rd-nav next" onClick={() => go(1)} aria-label="Next reel" disabled={n < 2}>
        <Icon name="arrowRight" size={20} />
      </button>
      <p className="rd-hint">Swipe or use ← → for the next reel · tap to pause · M to mute</p>
    </div>
  );
}
