import { useState } from 'react';
import { api } from '../api.js';
import LoginCreated from './LoginCreated.jsx';
import { Panel, Field, Section, ChipPicker, PLATFORM_LABEL } from './ui.jsx';

// Mirrors the server-side checks so mistakes show up before saving
const RULES = {
  email: [/^\S+@\S+\.\S+$/, 'Enter a valid email'],
  phone: [/^[+\d][\d\s()-]{5,19}$/, 'Enter a valid phone number'],
  pincode: [/^\d{6}$/, 'PIN code should be 6 digits'],
  pan: [/^[A-Z]{5}[0-9]{4}[A-Z]$/, 'PAN looks like ABCDE1234F'],
  gstNumber: [/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, 'GSTIN is 15 characters, e.g. 07ABCDE1234F1Z5'],
  accountNumber: [/^\d{6,20}$/, 'Account number should be 6–20 digits'],
  ifsc: [/^[A-Z]{4}0[A-Z0-9]{6}$/, 'IFSC looks like HDFC0001234'],
  upiId: [/^[\w.-]{2,}@[\w.-]{2,}$/, 'UPI ID looks like name@bank'],
};

const blank = {
  name: '',
  status: 'active',
  contact: { name: '', email: '', phone: '' },
  address: '',
  city: '',
  state: '',
  pincode: '',
  pan: '',
  gstNumber: '',
  bank: { accountHolder: '', accountNumber: '', ifsc: '', bankName: '', branch: '', accountType: '' },
  upiId: '',
  platforms: [],
  categories: [],
  notes: '',
};

const fromVendor = (v) => ({
  ...blank,
  ...v,
  contact: { ...blank.contact, ...(v?.contact || {}) },
  bank: { ...blank.bank, ...(v?.bank || {}) },
  platforms: v?.platforms || [],
  categories: v?.categories || [],
});

export default function VendorForm({ vendor, onClose, onSaved }) {
  const [created, setCreated] = useState(null); // { item, login } after adding — shows the new login
  const [f, setF] = useState(() => fromVendor(vendor));
  const [cats, setCats] = useState((vendor?.categories || []).join(', '));
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const editing = Boolean(vendor?._id);

  const set = (path, upper) => (e) => {
    const v = upper ? e.target.value.toUpperCase() : e.target.value;
    setF((prev) => {
      const next = { ...prev };
      const [a, b] = path.split('.');
      if (b) next[a] = { ...prev[a], [b]: v };
      else next[a] = v;
      return next;
    });
  };

  const validate = () => {
    const e = {};
    if (!f.name.trim()) e.name = 'Vendor name is required';
    const check = (key, value) => {
      if (value && !RULES[key][0].test(value.trim())) e[key] = RULES[key][1];
    };
    if (!editing && !f.contact.email.trim()) e.email = 'Needed — this is their login ID';
    else check('email', f.contact.email);
    check('phone', f.contact.phone);
    check('pincode', f.pincode);
    check('pan', f.pan);
    check('gstNumber', f.gstNumber);
    check('accountNumber', f.bank.accountNumber);
    check('ifsc', f.bank.ifsc);
    check('upiId', f.upiId);
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async (e) => {
    e.preventDefault();
    setError('');
    if (!validate()) return setError('Please fix the highlighted fields');
    setSaving(true);
    const payload = {
      ...f,
      categories: cats.split(',').map((c) => c.trim()).filter(Boolean),
    };
    for (const k of ['_id', 'nameKey', 'createdAt', 'updatedAt', '__v', 'createdBy', 'userCount', 'campaigns', 'quota']) delete payload[k];
    try {
      const d = editing ? await api.updateVendor(vendor._id, payload) : await api.createVendor(payload);
      if (!editing && d.login) {
        setCreated(d);
        setSaving(false);
      } else onSaved(d.item, editing);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel
      title={editing ? `Edit ${vendor.name}` : 'Add vendor'}
      subtitle="Company, contact, tax and bank details. Bank & tax details are only visible to the internal team."
      onClose={onClose}
      wide
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
          <button className="btn primary" form="vendor-form" disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Add vendor'}
          </button>
        </>
        )
      }
    >
      {created ? (
        <LoginCreated login={created.login} company={created.item.name} role="vendor" />
      ) : (
      <form id="vendor-form" onSubmit={save} noValidate>
        <Section title="Company" icon="building">
          <Field label="Vendor / agency name" required error={errors.name} full>
            <input value={f.name} onChange={set('name')} placeholder="e.g. PrintHouse Media" autoFocus />
          </Field>
          <Field label="Status">
            <select value={f.status} onChange={set('status')}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </Field>
          <Field label="Categories" hint="Comma separated, e.g. fashion, tech, food">
            <input value={cats} onChange={(e) => setCats(e.target.value)} placeholder="fashion, beauty" />
          </Field>
          <Field label="Platforms their creators are on" full>
            <ChipPicker options={Object.entries(PLATFORM_LABEL)} value={f.platforms} onChange={(platforms) => setF({ ...f, platforms })} />
          </Field>
        </Section>

        <Section title="Contact" icon="user" note={editing ? undefined : 'Their login is created with this email and a random password — you can change it later in Settings.'}>
          <Field label="Contact person">
            <input value={f.contact.name} onChange={set('contact.name')} placeholder="Full name" />
          </Field>
          <Field label={editing ? 'Email' : 'Email (login ID)'} required={!editing} error={errors.email}>
            <input type="email" value={f.contact.email} onChange={set('contact.email')} placeholder="name@vendor.com" />
          </Field>
          <Field label="Phone" error={errors.phone}>
            <input value={f.contact.phone} onChange={set('contact.phone')} placeholder="+91 98765 43210" inputMode="tel" />
          </Field>
          <Field label="Address" full>
            <input value={f.address} onChange={set('address')} placeholder="Office address" />
          </Field>
          <Field label="City">
            <input value={f.city} onChange={set('city')} placeholder="Mumbai" />
          </Field>
          <Field label="State">
            <input value={f.state} onChange={set('state')} placeholder="Maharashtra" />
          </Field>
          <Field label="PIN code" error={errors.pincode}>
            <input value={f.pincode} onChange={set('pincode')} placeholder="400001" inputMode="numeric" maxLength={6} />
          </Field>
        </Section>

        <Section title="Tax details" icon="file" note="Internal team only">
          <Field label="PAN" error={errors.pan}>
            <input value={f.pan} onChange={set('pan', true)} placeholder="ABCDE1234F" maxLength={10} className="mono" />
          </Field>
          <Field label="GSTIN" error={errors.gstNumber}>
            <input value={f.gstNumber} onChange={set('gstNumber', true)} placeholder="07ABCDE1234F1Z5" maxLength={15} className="mono" />
          </Field>
        </Section>

        <Section title="Bank account" icon="bank" note="Internal team only — used for vendor payouts">
          <Field label="Account holder name">
            <input value={f.bank.accountHolder} onChange={set('bank.accountHolder')} placeholder="As per bank records" />
          </Field>
          <Field label="Account type">
            <select value={f.bank.accountType} onChange={set('bank.accountType')}>
              <option value="">Select</option>
              <option value="current">Current</option>
              <option value="savings">Savings</option>
            </select>
          </Field>
          <Field label="Account number" error={errors.accountNumber}>
            <input value={f.bank.accountNumber} onChange={set('bank.accountNumber')} placeholder="50100123456789" inputMode="numeric" className="mono" />
          </Field>
          <Field label="IFSC" error={errors.ifsc}>
            <input value={f.bank.ifsc} onChange={set('bank.ifsc', true)} placeholder="HDFC0001234" maxLength={11} className="mono" />
          </Field>
          <Field label="Bank name">
            <input value={f.bank.bankName} onChange={set('bank.bankName')} placeholder="HDFC Bank" />
          </Field>
          <Field label="Branch">
            <input value={f.bank.branch} onChange={set('bank.branch')} placeholder="Connaught Place" />
          </Field>
          <Field label="UPI ID" error={errors.upiId}>
            <input value={f.upiId} onChange={set('upiId')} placeholder="vendor@okhdfcbank" />
          </Field>
        </Section>

        <Section title="Notes" icon="note">
          <Field label="Internal notes" full>
            <textarea rows={3} value={f.notes} onChange={set('notes')} placeholder="Anything the team should know" />
          </Field>
        </Section>
      </form>
      )}
    </Panel>
  );
}
