import { useState } from 'react';
import { api } from '../api.js';
import LoginCreated from './LoginCreated.jsx';
import { Panel, Field, Section } from './ui.jsx';

const RULES = {
  email: [/^\S+@\S+\.\S+$/, 'Enter a valid email'],
  phone: [/^[+\d][\d\s()-]{5,19}$/, 'Enter a valid phone number'],
  gstNumber: [/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, 'GSTIN is 15 characters, e.g. 07ABCDE1234F1Z5'],
};

const blank = { name: '', industry: '', website: '', status: 'active', contact: { name: '', email: '', phone: '' }, gstNumber: '', billingAddress: '', notes: '' };

// Add or edit a client (brand). Their logins are created in Settings; their campaigns hang off this record.
export default function ClientForm({ client, onClose, onSaved }) {
  const [created, setCreated] = useState(null); // { item, login } after adding — shows the new login
  const editing = Boolean(client?._id);
  const [f, setF] = useState(() => ({ ...blank, ...(client || {}), contact: { ...blank.contact, ...(client?.contact || {}) } }));
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const set = (path, upper) => (e) => {
    const v = upper ? e.target.value.toUpperCase() : e.target.value;
    setF((prev) => {
      const [a, b] = path.split('.');
      return b ? { ...prev, [a]: { ...prev[a], [b]: v } } : { ...prev, [a]: v };
    });
  };

  const save = async (e) => {
    e.preventDefault();
    setError('');
    const errs = {};
    if (!f.name.trim()) errs.name = 'Client name is required';
    if (!editing && !f.contact.email.trim()) errs.email = 'Needed — this is their login ID';
    else if (f.contact.email && !RULES.email[0].test(f.contact.email.trim())) errs.email = RULES.email[1];
    if (f.contact.phone && !RULES.phone[0].test(f.contact.phone.trim())) errs.phone = RULES.phone[1];
    if (f.gstNumber && !RULES.gstNumber[0].test(f.gstNumber.trim())) errs.gstNumber = RULES.gstNumber[1];
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    const body = {
      name: f.name.trim(),
      industry: f.industry.trim(),
      website: f.website.trim(),
      status: f.status,
      contact: { name: f.contact.name.trim(), email: f.contact.email.trim().toLowerCase(), phone: f.contact.phone.trim() },
      gstNumber: f.gstNumber.trim(),
      billingAddress: f.billingAddress.trim(),
      notes: f.notes,
    };
    try {
      const d = editing ? await api.updateClient(client._id, body) : await api.createClient(body);
      if (!editing && d.login) {
        setCreated(d);
        setSaving(false);
      } else onSaved(d.item, editing);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <Panel
      title={editing ? `Edit ${client.name}` : 'Add client'}
      subtitle={created ? '' : editing ? 'The brand you run campaigns for.' : 'The brand you run campaigns for. Their login is created when you add them.'}
      onClose={onClose}
      footer={
        created ? (
          <button type="button" className="btn primary" onClick={() => onSaved(created.item, false)}>
            Done
          </button>
        ) : (
        <>
          {error && <span className="pn-err">{error}</span>}
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" form="client-form" disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Add client'}
          </button>
        </>
        )
      }
    >
      {created ? (
        <LoginCreated login={created.login} company={created.item.name} role="client" />
      ) : (
      <form id="client-form" onSubmit={save} noValidate>
        <Section title="Brand" icon="building">
          <Field label="Client name" required error={errors.name} full>
            <input value={f.name} onChange={set('name')} placeholder="e.g. Paper Boat" autoFocus />
          </Field>
          <Field label="Industry">
            <input value={f.industry} onChange={set('industry')} placeholder="e.g. Beverages" />
          </Field>
          <Field label="Website">
            <input value={f.website} onChange={set('website')} placeholder="paperboatdrinks.com" />
          </Field>
          {editing && (
            <Field label="Status">
              <select value={f.status} onChange={set('status')}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </Field>
          )}
        </Section>
        <Section title="Main contact" icon="user" note={editing ? 'More logins can be added in Settings.' : 'Their login is created with this email and a random password — you can change it later in Settings.'}>
          <Field label="Name">
            <input value={f.contact.name} onChange={set('contact.name')} placeholder="e.g. Ananya Rao" />
          </Field>
          <Field label={editing ? 'Email' : 'Email (login ID)'} required={!editing} error={errors.email}>
            <input type="email" value={f.contact.email} onChange={set('contact.email')} placeholder="ananya@brand.com" />
          </Field>
          <Field label="Phone" error={errors.phone}>
            <input value={f.contact.phone} onChange={set('contact.phone')} placeholder="+91 98xxxxxxxx" inputMode="tel" />
          </Field>
        </Section>
        <Section title="Billing" icon="file">
          <Field label="GSTIN" error={errors.gstNumber}>
            <input className="mono" value={f.gstNumber} onChange={set('gstNumber', true)} placeholder="27ABCDE1234F1Z5" maxLength={15} />
          </Field>
          <Field label="Billing address" full>
            <textarea rows={3} value={f.billingAddress} onChange={set('billingAddress')} placeholder="Registered billing address" />
          </Field>
          <Field label="Notes" full>
            <textarea rows={3} value={f.notes} onChange={set('notes')} placeholder="Anything the team should know" />
          </Field>
        </Section>
      </form>
      )}
    </Panel>
  );
}
