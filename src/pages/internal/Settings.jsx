import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { ROLE_OPTIONS } from '../../config/dashboards.jsx';
import Avatar from '../../components/Avatar.jsx';
import Icon from '../../components/Icon.jsx';

const EMPTY = { name: '', email: '', company: '', role: 'vendor' };
const roleLabel = (r) => ROLE_OPTIONS.find((o) => o.value === r)?.label || r;
const fmt = (d) => (d ? new Date(d).toLocaleString() : '—');

export default function Settings() {
  const { user: me } = useAuth();
  // arriving from a client/vendor page ("Create login") preselects that company
  const location = useLocation();
  const preset = location.state?.orgId ? location.state : null;
  const [form, setForm] = useState(() => (preset ? { ...EMPTY, role: preset.role } : EMPTY));
  const [users, setUsers] = useState([]);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [issued, setIssued] = useState(null); // { user, password, kind }

  const load = () => api.listUsers().then((d) => setUsers(d.users)).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  // existing companies for the chosen account type (suggested while typing)
  const [orgs, setOrgs] = useState({ vendor: [], client: [] });
  const needsOrg = form.role === 'vendor' || form.role === 'client';
  useEffect(() => {
    if (!needsOrg) return;
    (form.role === 'vendor' ? api.listVendors() : api.listClients())
      .then((d) => setOrgs((o) => ({ ...o, [form.role]: d.items })))
      .catch(() => {});
  }, [form.role, needsOrg]);

  // which company is picked in the dropdown ('' = none, '__new' = typing a new one)
  const [orgPick, setOrgPick] = useState('');
  const [presetUsed, setPresetUsed] = useState(false);
  useEffect(() => {
    setOrgPick('');
  }, [form.role]);
  useEffect(() => {
    if (preset && !presetUsed && orgs[form.role]?.some((o) => o._id === preset.orgId)) {
      setPresetUsed(true);
      pickOrg(preset.orgId);
    }
  }, [orgs, form.role]);
  const pickOrg = (id) => {
    setOrgPick(id);
    if (id === '__new') return setForm((f) => ({ ...f, company: '' }));
    const o = orgs[form.role].find((x) => x._id === id);
    if (!o) return;
    // prefill the person from the company's saved contact, without overwriting anything typed
    setForm((f) => ({
      ...f,
      company: o.name,
      name: f.name || o.contact?.name || '',
      email: f.email || o.contact?.email || '',
    }));
  };

  const counts = useMemo(() => {
    const c = { all: users.length };
    users.forEach((u) => (c[u.role] = (c[u.role] || 0) + 1));
    return c;
  }, [users]);

  const visible = users.filter(
    (u) =>
      (filter === 'all' || u.role === filter) &&
      `${u.name} ${u.email} ${u.company}`.toLowerCase().includes(query.toLowerCase())
  );

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const onCreate = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const d = await api.createUser(form);
      setIssued({ ...d, kind: 'created' });
      setForm({ ...EMPTY, role: form.role });
      setOrgPick('');
      load();
      if (needsOrg) (form.role === 'vendor' ? api.listVendors() : api.listClients()).then((d) => setOrgs((o) => ({ ...o, [form.role]: d.items }))).catch(() => {});
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const onReset = async (u) => {
    if (!window.confirm(`Generate a new password for ${u.name}? Their old password will stop working.`)) return;
    try {
      const d = await api.resetPassword(u.id);
      setIssued({ ...d, kind: 'reset' });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const onToggle = async (u) => {
    try {
      await api.updateUser(u.id, { isActive: !u.isActive });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const onDelete = async (u) => {
    if (!window.confirm(`Delete ${u.name}'s account permanently?`)) return;
    try {
      await api.deleteUser(u.id);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="settings">
      <section className="card">
        <div className="card-head">
          <div>
            <h2>Generate login credentials</h2>
            <p className="muted">
              Create a login for a vendor, client or teammate. Vendors and clients are linked to their company — pick one you’ve already added (their saved contact fills in) or create a new one. A secure password is generated automatically.
            </p>
          </div>
        </div>

        <form className="grid-form" onSubmit={onCreate}>
          <label>
            Account type
            <select value={form.role} onChange={set('role')}>
              {ROLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Full name
            <input value={form.name} onChange={set('name')} placeholder="e.g. Priya Sharma" required />
          </label>
          <label>
            Email (login ID)
            <input type="email" value={form.email} onChange={set('email')} placeholder="name@company.com" required />
          </label>
          {needsOrg ? (
            <label>
              <span>
                {form.role === 'client' ? 'Brand / company' : 'Vendor company'} <b className="req">*</b>
              </span>
              <select value={orgPick} onChange={(e) => pickOrg(e.target.value)} required>
                <option value="" disabled>
                  {orgs[form.role].length ? `Choose a ${form.role === 'client' ? 'client' : 'vendor'}…` : 'Loading…'}
                </option>
                {orgs[form.role].map((o) => (
                  <option key={o._id} value={o._id}>
                    {o.name} — {o.userCount ? `${o.userCount} login${o.userCount === 1 ? '' : 's'}` : 'no login yet'}
                  </option>
                ))}
                <option value="__new">+ New {form.role === 'client' ? 'client' : 'vendor'}…</option>
              </select>
              {orgPick === '__new' && (
                <input
                  className="org-new"
                  value={form.company}
                  onChange={set('company')}
                  placeholder={form.role === 'client' ? 'New brand name, e.g. Glow Beauty' : 'New vendor name, e.g. PrintHouse Media'}
                  autoFocus
                  required
                />
              )}
            </label>
          ) : (
            <label>
              Company <span className="muted small">(optional)</span>
              <input value={form.company} onChange={set('company')} placeholder="e.g. Swol Media" />
            </label>
          )}
          <div className="form-actions">
            <button className="btn primary" disabled={busy}>
              {busy ? 'Generating…' : 'Generate password & create account'}
            </button>
          </div>
        </form>
        {error && <div className="alert error">{error}</div>}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Accounts</h2>
          <input
            className="search"
            placeholder="Search name, email, company"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="tabs-row">
          {['all', ...ROLE_OPTIONS.map((o) => o.value)].map((r) => (
            <button key={r} className={`pill ${filter === r ? 'active' : ''}`} onClick={() => setFilter(r)}>
              {r === 'all' ? 'All' : roleLabel(r)} <span>{counts[r] || 0}</span>
            </button>
          ))}
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Login ID</th>
                <th>Password</th>
                <th>Status</th>
                <th>Last login</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr>
                  <td colSpan={7} className="empty">
                    No accounts yet.
                  </td>
                </tr>
              )}
              {visible.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="user-cell">
                      <Avatar user={u} size={36} />
                      <div>
                        <strong>{u.name}</strong>
                        {u.company && <span className="muted small">{u.company}</span>}
                      </div>
                    </div>
                  </td>
                  <td data-label="Type">
                    <span className={`role role-${u.role}`}>{roleLabel(u.role)}</span>
                  </td>
                  <td data-label="Login ID" className="acc-id">{u.email}</td>
                  <td data-label="Password">
                    <PasswordCell key={`${u.id}-${u.passwordUpdatedAt}`} user={u} onReset={() => onReset(u)} />
                  </td>
                  <td data-label="Status">
                    <span className={`status ${u.isActive ? 'on' : 'off'}`}>{u.isActive ? 'Active' : 'Disabled'}</span>
                  </td>
                  <td data-label="Last login" className="small">{fmt(u.lastLoginAt)}</td>
                  <td className="row-actions">
                    <div>
                    {u.id !== me.id && (
                      <>
                        <button className="btn ghost sm ra" title="Edit password" onClick={() => setIssued({ user: u, password: '', kind: 'edit' })}>
                          <Icon name="key" size={16} /> <span className="ra-label">Edit password</span>
                        </button>
                        <button className="btn ghost sm ra" title="Generate a new password" onClick={() => onReset(u)}>
                          <Icon name="sparkles" size={16} /> <span className="ra-label">Generate new</span>
                        </button>
                        <button className="btn ghost sm ra" title={u.isActive ? 'Disable account' : 'Enable account'} onClick={() => onToggle(u)}>
                          <Icon name={u.isActive ? 'lock' : 'check'} size={16} /> <span className="ra-label">{u.isActive ? 'Disable' : 'Enable'}</span>
                        </button>
                        <button className="btn danger sm ra" title="Delete account" onClick={() => onDelete(u)}>
                          <Icon name="trash" size={16} /> <span className="ra-label">Delete</span>
                        </button>
                      </>
                    )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {issued && <CredentialModal issued={issued} onClose={() => setIssued(null)} onChanged={load} />}
    </div>
  );
}

function CredentialModal({ issued, onClose, onChanged }) {
  const [copied, setCopied] = useState('');
  const [password, setPassword] = useState(issued.password || '');
  const [editing, setEditing] = useState(issued.kind === 'edit');
  const [draft, setDraft] = useState('');
  const [show, setShow] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [kind, setKind] = useState(issued.kind);
  const { user } = issued;
  const loginUrl = window.location.origin;
  const shareText = `Hi ${user.name},\n\nHere are your Swol Media login details:\nLogin: ${loginUrl}\nEmail: ${user.email}\nPassword: ${password}\n\nPlease keep these safe.`;

  const copy = async (text, key) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(''), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  const startEdit = () => {
    setDraft(password);
    setError('');
    setEditing(true);
  };

  const save = async (e) => {
    e?.preventDefault();
    const value = draft.trim();
    if (value.length < 8) return setError('Password must be at least 8 characters');
    if (/\s/.test(value)) return setError('Password cannot contain spaces');
    setSaving(true);
    setError('');
    try {
      const d = await api.resetPassword(user.id, value);
      setPassword(d.password);
      setKind('edited');
      setEditing(false);
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const title = {
    created: 'Account created',
    reset: 'New password generated',
    edit: 'Set a new password',
    edited: 'Password updated',
  }[kind];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{editing ? 'Edit password' : title}</h2>
        <p className="muted">
          {editing
            ? `Type the password you want ${user.name} to use. Their old password stops working and they'll be signed out.`
            : "Copy this password now — for security it won't be shown again. You can edit it or set a new one any time."}
        </p>
        <dl className="cred">
          <dt>Name</dt>
          <dd>
            {user.name} <span className={`role role-${user.role}`}>{roleLabel(user.role)}</span>
          </dd>
          <dt>Email</dt>
          <dd>{user.email}</dd>
          <dt>Password</dt>
          {editing ? (
            <dd className="pw-edit">
              <form onSubmit={save}>
                <div className="pw-field">
                  <input
                    autoFocus
                    type={show ? 'text' : 'password'}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                  />
                  <button type="button" className="link-btn" onClick={() => setShow((v) => !v)}>
                    {show ? 'Hide' : 'Show'}
                  </button>
                </div>
                <div className="pw-edit-actions">
                  <button className="btn primary sm" disabled={saving}>
                    {saving ? 'Saving…' : 'Save password'}
                  </button>
                  {password && (
                    <button type="button" className="btn ghost sm" onClick={() => setEditing(false)}>
                      Cancel
                    </button>
                  )}
                </div>
              </form>
              {error && <div className="alert error">{error}</div>}
            </dd>
          ) : (
            <dd className="pw">
              <code>{password}</code>
              <button className="btn ghost sm" onClick={() => copy(password, 'pw')}>
                {copied === 'pw' ? 'Copied ✓' : 'Copy'}
              </button>
              <button className="btn ghost sm" onClick={startEdit}>
                Edit
              </button>
            </dd>
          )}
        </dl>
        <div className="modal-actions">
          {password && !editing && (
            <button className="btn ghost" onClick={() => copy(shareText, 'all')}>
              {copied === 'all' ? 'Copied ✓' : 'Copy full login message'}
            </button>
          )}
          <button className="btn primary" onClick={onClose}>
            {editing && !password ? 'Cancel' : 'Done'}
          </button>
        </div>
      </div>
    </div>
  );
}

// The login password Swol Media issued: hidden until revealed, with copy-to-clipboard.
// Passwords people set themselves aren't kept, so those show a prompt to generate a new one.
function PasswordCell({ user, onReset }) {
  const [state, setState] = useState({ shown: false, password: '', busy: false, note: user.passwordOnRecord === false ? (user.passwordSetBy === 'self' ? 'self' : 'missing') : '' });
  const [copied, setCopied] = useState('');

  const fetchIt = async () => {
    if (state.password) return state.password;
    setState((s) => ({ ...s, busy: true }));
    try {
      const d = await api.getUserPassword(user.id);
      setState((s) => ({ ...s, password: d.password, busy: false }));
      return d.password;
    } catch (e) {
      setState((s) => ({ ...s, busy: false, note: e.status === 409 ? e.data?.reason || 'missing' : '', err: e.status === 409 ? '' : e.message }));
      return null;
    }
  };
  const toggle = async () => {
    if (state.shown) return setState((s) => ({ ...s, shown: false }));
    if (await fetchIt()) setState((s) => ({ ...s, shown: true }));
  };
  const copy = async (what) => {
    const pw = await fetchIt();
    if (!pw) return;
    const text = what === 'both' ? `Login: ${window.location.origin}/login\nID: ${user.email}\nPassword: ${pw}` : pw;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(''), 1600);
    } catch {
      setState((s) => ({ ...s, shown: true }));
    }
  };

  if (state.note)
    return (
      <span className="pw-cell is-none">
        <span>{state.note === 'self' ? 'Changed by them' : 'Not on record'}</span>
        <button type="button" className="link-btn" onClick={onReset} title="Generate a new password you can share">
          Generate new
        </button>
      </span>
    );
  return (
    <span className="pw-cell">
      <code className={state.shown ? 'on' : ''}>{state.shown ? state.password : '••••••••••'}</code>
      <button type="button" className="pw-mini" onClick={toggle} disabled={state.busy} title={state.shown ? 'Hide' : 'Show password'} aria-label={state.shown ? 'Hide password' : 'Show password'}>
        <Icon name={state.shown ? 'eyeOff' : 'eye'} size={14} />
      </button>
      <button type="button" className={`pw-mini ${copied === 'pw' ? 'ok' : ''}`} onClick={() => copy('pw')} title="Copy password" aria-label="Copy password">
        <Icon name={copied === 'pw' ? 'check' : 'copy'} size={14} />
      </button>
      <button type="button" className={`pw-mini wide ${copied === 'both' ? 'ok' : ''}`} onClick={() => copy('both')} title="Copy login link, ID and password to send">
        {copied === 'both' ? 'Copied' : 'Copy login'}
      </button>
      {state.err && <em className="pw-err">{state.err}</em>}
    </span>
  );
}
