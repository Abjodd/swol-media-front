import { useEffect, useState } from 'react';
import { api } from '../../../api.js';
import { Panel, Field, Section, ChipPicker, FileDrop, PLATFORM_LABEL, readFile } from '../../../components/ui.jsx';

// Create a campaign: details + brief note + NDA + letter. Files upload right after the campaign is created.
export default function NewCampaign({ onClose, onCreated, presetClient }) {
  const [clients, setClients] = useState([]);
  const [f, setF] = useState({
    name: '',
    clientName: presetClient?.name || '',
    creatorsNeeded: '',
    platforms: ['instagram'],
    startDate: '',
    endDate: '',
    budget: '',
    objective: '',
    deliverables: '',
    brief: '',
  });
  const [nda, setNda] = useState(null);
  const [letter, setLetter] = useState(null);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [step, setStep] = useState(''); // progress text while saving
  // client picked from the dropdown ('' = none yet, '__new' = typing a new client)
  const [clientPick, setClientPick] = useState(presetClient?._id || '');

  useEffect(() => {
    api.listClients().then((d) => setClients(d.items)).catch(() => {});
  }, []);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const validate = () => {
    const e = {};
    if (!f.name.trim()) e.name = 'Give the campaign a name';
    if (!clientPick || !f.clientName.trim()) e.clientName = clientPick === '__new' ? 'Type the new client’s name' : 'Choose the client this campaign is for';
    if (!(parseInt(f.creatorsNeeded, 10) > 0)) e.creatorsNeeded = 'How many creators does this campaign need?';
    if (f.startDate && f.endDate && f.endDate < f.startDate) e.endDate = 'End date is before the start date';
    setErrors(e);
    return !Object.keys(e).length;
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!validate()) return;
    try {
      setStep('Creating campaign…');
      const { item } = await api.createCampaign({
        ...f,
        clientName: undefined,
        clientId: clientPick !== '__new' ? clientPick : undefined,
        newClientName: clientPick === '__new' ? f.clientName.trim() : undefined,
        creatorsNeeded: parseInt(f.creatorsNeeded, 10),
        budget: { amount: Number(f.budget) || 0 },
      });
      const failed = [];
      for (const [kind, file] of [['nda', nda], ['letter', letter]]) {
        if (!file) continue;
        setStep(`Uploading ${kind === 'nda' ? 'NDA' : 'letter'}…`);
        try {
          await api.uploadDocument(item._id, kind, file.name, await readFile(file));
        } catch {
          failed.push(kind === 'nda' ? 'NDA' : 'letter');
        }
      }
      onCreated(item, failed);
    } catch (err) {
      setError(err.message);
      setStep('');
    }
  };

  const pickClient = (id) => {
    setClientPick(id);
    const c = clients.find((x) => x._id === id);
    setF((prev) => ({ ...prev, clientName: c ? c.name : '' }));
  };

  return (
    <Panel
      title="New campaign"
      subtitle="Set it up, add the brief, NDA and letter — then assign vendors."
      onClose={onClose}
      wide
      footer={
        <>
          {error && <span className="pn-err">{error}</span>}
          {step && <span className="pn-step">{step}</span>}
          <button type="button" className="btn ghost" onClick={onClose} disabled={Boolean(step)}>
            Cancel
          </button>
          <button className="btn primary" form="new-campaign" disabled={Boolean(step)}>
            {step ? 'Saving…' : 'Create campaign'}
          </button>
        </>
      }
    >
      <form id="new-campaign" onSubmit={submit} noValidate>
        <Section title="Campaign" icon="campaigns">
          <Field label="Campaign name" required error={errors.name} full>
            <input value={f.name} onChange={set('name')} placeholder="e.g. Diwali Glow 2026" autoFocus />
          </Field>
          <Field label="Client" required error={errors.clientName} hint={clientPick === '__new' ? 'The client is created along with the campaign' : 'The brand this campaign is for'}>
            <select value={clientPick} onChange={(e) => pickClient(e.target.value)}>
              <option value="" disabled>
                Choose a client…
              </option>
              {presetClient && !clients.some((c) => c._id === presetClient._id) && <option value={presetClient._id}>{presetClient.name}</option>}
              {clients.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
              <option value="__new">+ New client…</option>
            </select>
            {clientPick === '__new' && <input className="org-new" value={f.clientName} onChange={set('clientName')} placeholder="New client name, e.g. Paper Boat" autoFocus />}
          </Field>
          <Field label="Creators needed" required error={errors.creatorsNeeded} hint="Total across all vendors">
            <input type="number" min="1" value={f.creatorsNeeded} onChange={set('creatorsNeeded')} placeholder="e.g. 200" inputMode="numeric" />
          </Field>
          <Field label="Start date">
            <input type="date" value={f.startDate} onChange={set('startDate')} />
          </Field>
          <Field label="End date" error={errors.endDate}>
            <input type="date" value={f.endDate} onChange={set('endDate')} />
          </Field>
          <Field label="Budget (₹)">
            <input type="number" min="0" value={f.budget} onChange={set('budget')} placeholder="e.g. 500000" inputMode="numeric" />
          </Field>
          <Field label="Deliverables" hint="Per creator">
            <input value={f.deliverables} onChange={set('deliverables')} placeholder="1 reel + 2 stories" />
          </Field>
          <Field label="Platforms" full>
            <ChipPicker options={Object.entries(PLATFORM_LABEL)} value={f.platforms} onChange={(platforms) => setF({ ...f, platforms })} />
          </Field>
        </Section>

        <Section title="Brief" icon="note">
          <Field label="Objective" full>
            <input value={f.objective} onChange={set('objective')} placeholder="e.g. Drive awareness for the new festive range" />
          </Field>
          <Field label="Brief note" full hint="What creators and vendors need to know — tone, dos & don’ts, key messages, timelines">
            <textarea rows={6} value={f.brief} onChange={set('brief')} placeholder="Write the campaign brief here…" />
          </Field>
        </Section>

        <Section title="Documents" icon="file">
          <div className="fx full">
            <span className="fx-label">NDA</span>
            <FileDrop label="NDA" file={nda} onFile={setNda} />
          </div>
          <div className="fx full">
            <span className="fx-label">Letter</span>
            <FileDrop label="letter" file={letter} onFile={setLetter} />
          </div>
        </Section>
      </form>
    </Panel>
  );
}
