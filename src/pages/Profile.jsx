import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { roleLabel } from '../config/dashboards.jsx';
import Avatar from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';

const fmtDate = (d, withTime) =>
  d
    ? new Date(d).toLocaleString(undefined, withTime
        ? { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }
        : { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';

// Crop the chosen image to a centred square and shrink it to 320px JPEG before upload.
function toSquareJpeg(file, size = 320) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(img.width, img.height);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.88));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That file could not be read as an image'));
    };
    img.src = url;
  });
}

function strength(pw) {
  if (!pw) return 0;
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
  return Math.max(1, Math.min(4, s));
}
const STRENGTH_LABEL = ['', 'Weak', 'Okay', 'Good', 'Strong'];

function PasswordInput({ label, value, onChange, autoComplete, placeholder }) {
  const [show, setShow] = useState(false);
  return (
    <label className="pf-field">
      {label}
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
      />
      <Icon name="key" size={17} />
      <button type="button" className="pw-eye" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}>
        <Icon name={show ? 'eyeOff' : 'eye'} size={17} />
      </button>
    </label>
  );
}

export default function Profile() {
  const { user, setUser } = useAuth();
  const { hash } = useLocation();
  const fileRef = useRef(null);
  const securityRef = useRef(null);
  const [toast, setToast] = useState(null);

  // details
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone || '');
  const [savingDetails, setSavingDetails] = useState(false);
  const [detailsErr, setDetailsErr] = useState('');
  const dirty = name.trim() !== user.name || phone.trim() !== (user.phone || '');

  // photo
  const [uploading, setUploading] = useState(false);

  // password
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pwErr, setPwErr] = useState('');
  const [savingPw, setSavingPw] = useState(false);
  const score = strength(next);

  useEffect(() => {
    if (hash === '#security') securityRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [hash]);

  const notify = (msg, err) => {
    setToast({ msg, err });
    clearTimeout(notify.t);
    notify.t = setTimeout(() => setToast(null), 2800);
  };

  const onPickPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return notify('Please choose an image file', true);
    if (file.size > 15 * 1024 * 1024) return notify('That image is over 15 MB', true);
    setUploading(true);
    try {
      const dataUrl = await toSquareJpeg(file);
      const d = await api.uploadAvatar(dataUrl);
      setUser(d.user);
      notify('Profile photo updated');
    } catch (err) {
      notify(err.message, true);
    } finally {
      setUploading(false);
    }
  };

  const onRemovePhoto = async () => {
    setUploading(true);
    try {
      const d = await api.removeAvatar();
      setUser(d.user);
      notify('Profile photo removed');
    } catch (err) {
      notify(err.message, true);
    } finally {
      setUploading(false);
    }
  };

  const onSaveDetails = async (e) => {
    e.preventDefault();
    setDetailsErr('');
    if (!name.trim()) return setDetailsErr('Name cannot be empty');
    setSavingDetails(true);
    try {
      const d = await api.updateMe({ name: name.trim(), phone: phone.trim() });
      setUser(d.user);
      notify('Details saved');
    } catch (err) {
      setDetailsErr(err.message);
    } finally {
      setSavingDetails(false);
    }
  };

  const onChangePassword = async (e) => {
    e.preventDefault();
    setPwErr('');
    if (!cur) return setPwErr('Enter your current password');
    if (next.length < 8) return setPwErr('New password must be at least 8 characters');
    if (/\s/.test(next)) return setPwErr('Password cannot contain spaces');
    if (next !== confirm) return setPwErr('The new passwords don’t match');
    setSavingPw(true);
    try {
      const d = await api.changePassword(cur, next);
      setUser(d.user);
      setCur('');
      setNext('');
      setConfirm('');
      notify('Password changed — other devices have been signed out');
    } catch (err) {
      setPwErr(err.message);
    } finally {
      setSavingPw(false);
    }
  };

  return (
    <div className="profile">
      {/* ── Header ───────────────────────────────────── */}
      <section className="pf-hero">
        <div className="pf-cover" />
        <div className="pf-body">
          <div className={`pf-photo ${uploading ? 'busy' : ''}`}>
            <Avatar user={user} size={128} />
            <button className="pf-photo-btn" onClick={() => fileRef.current?.click()} aria-label="Change photo" disabled={uploading}>
              <Icon name="camera" size={17} />
            </button>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/*" hidden onChange={onPickPhoto} />
          </div>
          <div className="pf-id">
            <h2>{user.name}</h2>
            <div className="pf-id-row">
              <em className={`role-chip role-${user.role}`}>{roleLabel(user.role)}</em>
              {user.company && (
                <span>
                  <Icon name="building" size={15} style={{ verticalAlign: '-2px', marginRight: 6 }} />
                  {user.company}
                </span>
              )}
              <span>
                <Icon name="mail" size={15} style={{ verticalAlign: '-2px', marginRight: 6 }} />
                {user.email}
              </span>
            </div>
          </div>
          <div className="pf-actions">
            <button className="btn primary" onClick={() => fileRef.current?.click()} disabled={uploading}>
              <Icon name="upload" size={17} /> {user.avatarUrl ? 'Change photo' : 'Upload photo'}
            </button>
            {user.avatarUrl && (
              <button className="btn ghost" onClick={onRemovePhoto} disabled={uploading}>
                <Icon name="trash" size={17} /> Remove
              </button>
            )}
          </div>
        </div>
      </section>

      <div className="pf-grid">
        {/* ── Details ─────────────────────────────────── */}
        <section className="card pf-card">
          <div className="pf-card-head">
            <span className="ic">
              <Icon name="user" />
            </span>
            <div>
              <h2>Your details</h2>
              <p>How you appear across Swol Media.</p>
            </div>
          </div>

          <form className="pf-form" onSubmit={onSaveDetails}>
            <label className="pf-field">
              Full name
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="name" />
              <Icon name="user" size={17} />
            </label>
            <label className="pf-field">
              Phone
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" autoComplete="tel" inputMode="tel" />
              <Icon name="phone" size={17} />
            </label>
            <label className="pf-field full">
              Email (login ID)
              <input value={user.email} readOnly />
              <Icon name="mail" size={17} />
              <span className="lock-tag">
                <Icon name="lock" size={12} /> Managed by Swol Media
              </span>
            </label>
            <label className="pf-field">
              Account type
              <input value={roleLabel(user.role)} readOnly />
              <Icon name="shield" size={17} />
            </label>
            <label className="pf-field">
              Company
              <input value={user.company || '—'} readOnly />
              <Icon name="building" size={17} />
            </label>

            {detailsErr && <div className="alert error full">{detailsErr}</div>}
            <div className="pf-form-actions">
              {dirty && (
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => {
                    setName(user.name);
                    setPhone(user.phone || '');
                  }}
                >
                  Discard
                </button>
              )}
              <button className="btn primary" disabled={!dirty || savingDetails}>
                {savingDetails ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </form>

          <div className="pf-stats">
            <div className="pf-stat">
              <span>Member since</span>
              <strong>{fmtDate(user.createdAt)}</strong>
            </div>
            <div className="pf-stat">
              <span>Last sign-in</span>
              <strong>{fmtDate(user.lastLoginAt, true)}</strong>
            </div>
            <div className="pf-stat">
              <span>Password changed</span>
              <strong>{fmtDate(user.passwordUpdatedAt)}</strong>
            </div>
          </div>
        </section>

        {/* ── Password ────────────────────────────────── */}
        <section className="card pf-card" id="security" ref={securityRef}>
          <div className="pf-card-head">
            <span className="ic">
              <Icon name="lock" />
            </span>
            <div>
              <h2>Password &amp; security</h2>
              <p>Changing it signs you out on other devices.</p>
            </div>
          </div>

          <form className="pf-pw" onSubmit={onChangePassword}>
            <PasswordInput label="Current password" value={cur} onChange={setCur} autoComplete="current-password" placeholder="••••••••" />
            <PasswordInput label="New password" value={next} onChange={setNext} autoComplete="new-password" placeholder="At least 8 characters" />
            {next && (
              <div>
                <div className={`pw-meter s${score}`}>
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
                <p className="pw-hint">
                  {STRENGTH_LABEL[score]} — mix upper & lower case, numbers and a symbol for a stronger password.
                </p>
              </div>
            )}
            <PasswordInput label="Confirm new password" value={confirm} onChange={setConfirm} autoComplete="new-password" placeholder="Type it again" />
            {confirm && next !== confirm && <p className="pw-hint" style={{ color: 'var(--danger)' }}>Passwords don’t match yet</p>}
            {pwErr && <div className="alert error">{pwErr}</div>}
            <button className="btn primary" disabled={savingPw || !cur || !next || !confirm}>
              <Icon name="lock" size={17} /> {savingPw ? 'Updating…' : 'Update password'}
            </button>
          </form>
        </section>
      </div>

      {toast && (
        <div className={`toast ${toast.err ? 'err' : ''}`} role="status">
          <Icon name={toast.err ? 'close' : 'check'} size={18} /> {toast.msg}
        </div>
      )}
    </div>
  );
}
