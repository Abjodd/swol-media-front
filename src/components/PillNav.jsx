import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import Icon from './Icon.jsx';

// The floating pill navigation.
// A solid "liquid" blob sits behind the active tab. When the tab changes, the blob's
// leading edge races ahead and the trailing edge follows with a springy overshoot,
// so it stretches across and snaps into place. A lighter ghost blob follows the
// pointer on hover. Item positions are measured, so any number of tabs works.
export default function PillNav({ items, active, lead, children }) {
  const trackRef = useRef(null);
  const itemRefs = useRef({});
  const prev = useRef(null);
  const [blob, setBlob] = useState(null);
  const [ghost, setGhost] = useState(null);

  const measure = useCallback((key) => {
    const track = trackRef.current;
    const el = itemRefs.current[key];
    if (!track || !el) return null;
    const left = el.offsetLeft;
    const right = track.clientWidth - (el.offsetLeft + el.offsetWidth);
    return { left, right };
  }, []);

  const place = useCallback(() => {
    const m = measure(active);
    if (!m) return setBlob(null);
    const p = prev.current;
    const dir = p == null ? 0 : m.left > p.left ? 1 : m.left < p.left ? -1 : 0;
    prev.current = m;
    setBlob({ ...m, dir, key: active });
  }, [active, measure]);

  useLayoutEffect(place, [place]);

  // keep the latest placer in a ref so the resize watcher is set up once, not on every tab change
  const placeRef = useRef(place);
  placeRef.current = place;
  useEffect(() => {
    const track = trackRef.current;
    if (!track || typeof ResizeObserver === 'undefined') return undefined;
    let w = track.clientWidth;
    const ro = new ResizeObserver(() => {
      if (track.clientWidth === w) return;
      w = track.clientWidth;
      prev.current = null; // re-measure without animating
      placeRef.current();
    });
    ro.observe(track);
    document.fonts?.ready?.then(() => {
      prev.current = null;
      placeRef.current();
    });
    return () => ro.disconnect();
  }, []);

  const onEnter = (key) => {
    const m = measure(key);
    if (m) setGhost((g) => ({ ...m, on: true, dir: g?.on ? (m.left > g.left ? 1 : -1) : 0 }));
  };

  const blobStyle = blob && {
    left: blob.left,
    right: blob.right,
    // moving right: right edge leads, left edge trails (and vice versa)
    transition:
      blob.dir === 0
        ? 'none'
        : blob.dir > 0
          ? 'right .38s cubic-bezier(.2,.9,.25,1), left .62s cubic-bezier(.45,1.4,.45,1) .06s'
          : 'left .38s cubic-bezier(.2,.9,.25,1), right .62s cubic-bezier(.45,1.4,.45,1) .06s',
  };
  const ghostStyle = ghost && {
    left: ghost.left,
    right: ghost.right,
    opacity: ghost.on ? 1 : 0,
    transition:
      ghost.dir === 0
        ? 'opacity .25s'
        : 'left .32s cubic-bezier(.3,1.3,.5,1), right .32s cubic-bezier(.3,1.3,.5,1), opacity .25s',
  };

  return (
    <div className="nv-pill">
      {lead}
      <div className="nv-track" ref={trackRef} onMouseLeave={() => setGhost((g) => g && { ...g, on: false, dir: 0 })}>
        {ghost && <span className="nv-ghost" style={ghostStyle} aria-hidden />}
        {blob && (
          <span className="nv-blob" style={blobStyle} aria-hidden>
            {/* re-keyed on every move so the squash-and-stretch replays */}
            <i key={`${blob.key}-${blob.dir}`} className={blob.dir ? 'go' : ''} />
          </span>
        )}
        {items.map((t) => (
          <NavLink
            key={t.path}
            to={t.path}
            ref={(el) => (itemRefs.current[t.path] = el)}
            className={`nv-link ${active === t.path ? 'on' : ''}`}
            onMouseEnter={() => onEnter(t.path)}
            onFocus={() => onEnter(t.path)}
            title={t.label}
          >
            <Icon name={t.icon} size={17} />
            <span>{t.label}</span>
          </NavLink>
        ))}
      </div>
      {children}
    </div>
  );
}
