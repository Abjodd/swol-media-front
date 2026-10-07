import { useEffect, useState } from 'react';
import { api } from '../../../api.js';
import Icon from '../../../components/Icon.jsx';
import { Panel, Field, Section, fmtNum } from '../../../components/ui.jsx';

// Put a vendor on a campaign with the number of creators they must bring.
// Pick an existing vendor, or add a new one right here (full details can be filled in on the Vendors page).
export default function AssignVendor({ campaign, assignedIds, remaining, onClose, onAssigned }) {
  const [vendors, setVendors] = useState(null);
  const [mode, setMode] = useState('existing');
  const [vendorId, setVendorId] = useState('');
  const [nv, setNv] = useState({ name: '', contactName: '', email: '', phone: '' });
  const [quota, setQuota] = useState(remaining > 0 ? String(remaining) : '');
  const [deadline, setDeadline] = useState('');
  const [instructions, setInstructions] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .listVendors()
      .then((d) => {
        const free = d.items.filter((v) => v.status === 'active' && !assignedIds.includes(v._id));
        setVendors(free);
        if (!free.length) setMode('new');
      })
      .catch((e) => setError(e.message));
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setError('');
    const q = parseInt(quota, 10);
    if (mode === 'existing' && !vendorId) return setError('Choose a vendor');
    if (mode === 'new' && !nv.name.trim()) return setError('Enter the new vendor’s name');
    if (mode === 'new' && nv.email && !/^\S+@\S+\.\S+$/.test(nv.email)) return setError('Enter a valid email');
    if (!(q > 0)) return setError('Enter how many creators this vendor should bring');
    setSaving(true);
    try {
      const body = { quota: q, deadline: deadline || null, instructions };
      if (mode === 'existing') body.vendorId = vendorId;
      else body.newVendor = { name: nv.name.trim(), contact: { name: nv.contactName, email: nv.email, phone: nv.phone } };
      const d = await api.assignVendor(campaign._id, body);
      onAssigned(d);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  const q = parseInt(quota, 10) || 0;

  return (
    <Panel
      title="Assign a vendor"
      subtitle={`${campaign.name} · ${fmtNum(Math.max(0, remaining))} of ${fmtNum(campaign.creatorsNeeded)} creators still unassigned`}
      onClose={onClose}
      footer={
        <>
          {error && <span className="pn-err">{error}</span>}
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" form="assign-vendor" disabled={saving}>
            {saving ? 'Assigning…' : 'Assign vendor'}
          </button>
        </>
      }
    >
      <form id="assign-vendor" onSubmit={save} noValidate>
        <div className="seg full-w">
          <button type="button" className={mode === 'existing' ? 'on' : ''} onClick={() => setMode('existing')} disabled={vendors && !vendors.length}>
            Existing vendor
          </button>
          <button type="button" className={mode === 'new' ? 'on' : ''} onClick={() => setMode('new')}>
            <Icon name="plus" size={15} /> Add new vendor
          </button>
        </div>

        {mode === 'existing' ? (
          <Section title="Vendor" icon="vendors">
            {vendors === null ? (
              <p className="fx-note">Loading vendors…</p>
            ) : vendors.length === 0 ? (
              <p className="fx-note">Every active vendor is already on this campaign — add a new one.</p>
            ) : (
              <div className="pick-list full">
                {vendors.map((v) => (
                  <label key={v._id} className={`pick ${vendorId === v._id ? 'on' : ''}`}>
                    <input type="radio" name="vendor" value={v._id} checked={vendorId === v._id} onChange={() => setVendorId(v._id)} />
                    <span className="v-mono sm">{v.name.slice(0, 2).toUpperCase()}</span>
                    <span className="pick-text">
                      <strong>{v.name}</strong>
                      <span>
                        {[v.contact?.name, v.city].filter(Boolean).join(' · ') || 'No contact details'} · on {v.campaigns} campaign
                        {v.campaigns === 1 ? '' : 's'}
                      </span>
                    </span>
                    {vendorId === v._id && <Icon name="check" size={18} />}
                  </label>
                ))}
              </div>
            )}
          </Section>
        ) : (
          <Section title="New vendor" icon="building" note="Add PAN, GST and bank details later from the Vendors page.">
            <Field label="Vendor / agency name" required full>
              <input value={nv.name} onChange={(e) => setNv({ ...nv, name: e.target.value })} placeholder="e.g. Fresh Talent Co" autoFocus />
            </Field>
            <Field label="Contact person">
              <input value={nv.contactName} onChange={(e) => setNv({ ...nv, contactName: e.target.value })} placeholder="Full name" />
            </Field>
            <Field label="Phone">
              <input value={nv.phone} onChange={(e) => setNv({ ...nv, phone: e.target.value })} placeholder="+91 98765 43210" inputMode="tel" />
            </Field>
            <Field label="Email" full>
              <input type="email" value={nv.email} onChange={(e) => setNv({ ...nv, email: e.target.value })} placeholder="name@vendor.com" />
            </Field>
          </Section>
        )}

        <Section title="Creator target" icon="target">
          <Field
            label="Creators wanted from this vendor"
            required
            hint={
              remaining > 0
                ? q > remaining
                  ? `That's ${fmtNum(q - remaining)} more than the campaign still needs — fine if you want a buffer.`
                  : `${fmtNum(remaining - q)} will still be unassigned after this.`
                : 'The campaign target is already fully assigned — extra creators act as a buffer.'
            }
          >
            <input type="number" min="1" value={quota} onChange={(e) => setQuota(e.target.value)} placeholder="e.g. 50" inputMode="numeric" />
          </Field>
          <Field label="Deadline">
            <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </Field>
          <Field label="Instructions for this vendor" full>
            <textarea rows={3} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="e.g. Mumbai-based beauty creators, 50k–500k followers" />
          </Field>
        </Section>
      </form>
    </Panel>
  );
}
