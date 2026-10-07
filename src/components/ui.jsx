import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';

// ── Formatting helpers ─────────────────────────────────────────────────────
export const fmtNum = (n) => new Intl.NumberFormat('en-IN').format(n || 0);
export const fmtINR = (n) => (n ? `₹${fmtNum(n)}` : '—');
// A number that counts up from 0 (or from its last value) when it appears or changes.
export function Num({ value = 0, format = fmtNum, ms = 900 }) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const to = Number(value) || 0;
    const start = from.current;
    if (start === to || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      from.current = to;
      return setShown(to);
    }
    let raf;
    const t0 = performance.now();
    const tick = (t) => {
      const k = Math.min(1, (t - t0) / ms);
      const v = start + (to - start) * (1 - Math.pow(1 - k, 3));
      setShown(k < 1 ? Math.round(v) : to);
      if (k < 1) raf = requestAnimationFrame(tick);
      else from.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      from.current = to;
    };
  }, [value, ms]);
  return <>{format(shown)}</>;
}

export const fmtMoney = (n) =>
  n ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n) : '—';
export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const fmtSize = (b) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
export const timeAgo = (d) => {
  const s = Math.round((Date.now() - new Date(d)) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const days = Math.round(h / 24);
  return days < 7 ? `${days} day${days > 1 ? 's' : ''} ago` : fmtDate(d);
};
export const toInputDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');

// ── Campaign status ────────────────────────────────────────────────────────
export const CAMPAIGN_STATUS = {
  draft: 'Draft',
  sourcing: 'Sourcing creators',
  internal_review: 'Internal review',
  client_review: 'With client',
  live: 'Live',
  completed: 'Completed',
  cancelled: 'Cancelled',
};
export function StatusChip({ status }) {
  return (
    <span className={`st-chip st-${status}`}>
      <i />
      {CAMPAIGN_STATUS[status] || status}
    </span>
  );
}

export const PLATFORM_LABEL = {
  instagram: 'Instagram',
  youtube: 'YouTube',
  facebook: 'Facebook',
  x: 'X',
  linkedin: 'LinkedIn',
  snapchat: 'Snapchat',
  moj: 'Moj',
  josh: 'Josh',
  sharechat: 'ShareChat',
  other: 'Other',
};

// ── Side panel (right drawer on desktop, full sheet on phones) ─────────────
export function Panel({ title, subtitle, onClose, children, footer, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);
  return (
    <div className="pn-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className={`pn ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="pn-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="pn-x" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </header>
        <div className="pn-body">{children}</div>
        {footer && <footer className="pn-foot">{footer}</footer>}
      </aside>
    </div>
  );
}

// ── Form bits ──────────────────────────────────────────────────────────────
export function Field({ label, hint, error, full, children, required }) {
  return (
    <label className={`fx ${full ? 'full' : ''} ${error ? 'has-err' : ''}`}>
      <span className="fx-label">
        {label}
        {required && <b>*</b>}
      </span>
      {children}
      {error ? <span className="fx-err">{error}</span> : hint ? <span className="fx-hint">{hint}</span> : null}
    </label>
  );
}

export function Section({ title, icon, children, note }) {
  return (
    <fieldset className="fx-section">
      <legend>
        {icon && <Icon name={icon} size={16} />} {title}
      </legend>
      {note && <p className="fx-note">{note}</p>}
      <div className="fx-grid">{children}</div>
    </fieldset>
  );
}

export function ChipPicker({ options, value = [], onChange }) {
  const toggle = (v) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  return (
    <div className="chip-pick">
      {options.map(([v, l]) => (
        <button type="button" key={v} className={value.includes(v) ? 'on' : ''} onClick={() => toggle(v)} aria-pressed={value.includes(v)}>
          {value.includes(v) && <Icon name="check" size={14} />} {l}
        </button>
      ))}
    </div>
  );
}

// ── File drop zone (reads the file as a data URL for upload) ───────────────
const ACCEPT = '.pdf,.doc,.docx,.png,.jpg,.jpeg,.webp,application/pdf';
export const MAX_FILE = 10 * 1024 * 1024;
export const readFile = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('Could not read the file'));
    r.readAsDataURL(file);
  });

export function FileDrop({ label, file, onFile, existing, compact }) {
  const ref = useRef(null);
  const [over, setOver] = useState(false);
  const [err, setErr] = useState('');
  const pick = (f) => {
    setErr('');
    if (!f) return;
    if (f.size > MAX_FILE) return setErr('File is larger than 10 MB');
    if (!/\.(pdf|docx?|png|jpe?g|webp)$/i.test(f.name)) return setErr('Use a PDF, Word document or image');
    onFile(f);
  };
  return (
    <div
      className={`drop ${over ? 'over' : ''} ${file ? 'has' : ''} ${compact ? 'compact' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        pick(e.dataTransfer.files?.[0]);
      }}
      onClick={() => ref.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && ref.current?.click()}
    >
      <input ref={ref} type="file" accept={ACCEPT} hidden onChange={(e) => (pick(e.target.files?.[0]), (e.target.value = ''))} />
      <span className="drop-ic">
        <Icon name={file ? 'check' : 'upload'} size={20} />
      </span>
      <span className="drop-text">
        <strong>{file ? file.name : existing ? `Replace ${label}` : `Upload ${label}`}</strong>
        <span>{file ? fmtSize(file.size) : err || 'PDF, Word or image · up to 10 MB · drag & drop or click'}</span>
      </span>
      {file && (
        <button
          type="button"
          className="drop-x"
          onClick={(e) => {
            e.stopPropagation();
            onFile(null);
          }}
          aria-label="Remove file"
        >
          <Icon name="close" size={16} />
        </button>
      )}
      {err && !file && <span className="drop-err">{err}</span>}
    </div>
  );
}

// ── Progress meter (single hue; numbers always shown as text too) ──────────
export function Meter({ value, max, label, sub, tone = 'blue' }) {
  const pct = max ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const over = max && value > max;
  return (
    <div className="meter" title={`${fmtNum(value)} of ${fmtNum(max)} (${pct}%)`}>
      {(label || sub) && (
        <div className="meter-top">
          <span>{label}</span>
          <span className={over ? 'meter-over' : ''}>{sub ?? `${fmtNum(value)} / ${fmtNum(max)}`}</span>
        </div>
      )}
      <div className={`meter-track tone-${tone}`} role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max || 0}>
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ── Toast ──────────────────────────────────────────────────────────────────
export function useToast() {
  const [toast, setToast] = useState(null);
  const timer = useRef();
  const show = (msg, err) => {
    setToast({ msg, err });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 3000);
  };
  const node = toast && (
    <div className={`toast ${toast.err ? 'err' : ''}`} role="status">
      <Icon name={toast.err ? 'close' : 'check'} size={18} /> {toast.msg}
    </div>
  );
  return [show, node];
}

export function Empty({ icon = 'sparkles', title, text, action }) {
  return (
    <div className="empty-x">
      <span className="empty-ic">
        <Icon name={icon} size={26} />
      </span>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

// ── Creator (submission) status on a campaign ─────────────────────────────
export const SUB_STATUS = {
  submitted: 'In review',
  shortlisted: 'Shortlisted',
  rejected: 'Rejected',
  sent_to_client: 'With client',
  approved: 'Approved',
  declined: 'Declined',
};
export function SubChip({ status }) {
  return (
    <span className={`st-chip sub-${status}`}>
      <i />
      {SUB_STATUS[status] || status}
    </span>
  );
}
// follower counts the way Indian teams say them: 27K, 1.5L, 2.3Cr
// followers, views, likes: 950 · 12.5K · 1.2M · 3.4B
export const fmtCompact = (n) => {
  if (!n) return '—';
  const f = (v, unit) => `${Number(v.toFixed(v < 100 ? 1 : 0))}${unit}`;
  const a = Math.abs(n);
  if (a >= 1e9) return f(n / 1e9, 'B');
  if (a >= 999950) return f(n / 1e6, 'M');
  if (a >= 1e3) return f(n / 1e3, 'K');
  return String(Math.round(n));
};
// money in Indian units: ₹ amounts as 1.5L · 2.3Cr
export const fmtLakh = (n) => {
  if (!n) return '—';
  const f = (v, unit) => `${Number(v.toFixed(v < 10 ? 1 : 0))}${unit}`;
  if (Math.abs(n) >= 1e7) return f(n / 1e7, 'Cr');
  if (Math.abs(n) >= 1e5) return f(n / 1e5, 'L');
  if (Math.abs(n) >= 1e3) return f(n / 1e3, 'K');
  return String(n);
};
