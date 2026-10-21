import { useState } from 'react';
import { api } from '../api.js';
import { Panel, Field, PLATFORM_LABEL, timeAgo } from './ui.jsx';
import Icon from './Icon.jsx';
import { CreatorPhoto, Verified, creatorStats } from './SwipeDeck.jsx';

// Edit a creator's profile details — exactly what the client sees on the review card.
export default function CreatorForm({ creator: initial, onClose, onSaved, onFetched }) {
  const [creator, setCreator] = useState(initial);
  const [fetching, setFetching] = useState(false);
  const [f, setF] = useState({
    name: creator.name || '',
    avatarUrl: creator.avatarUrl || '',
    followers: creator.followers || '',
    following: creator.following || '',
    avgViews: creator.avgViews || '',
    avgLikes: creator.avgLikes || '',
    avgComments: creator.avgComments || '',
    engagementRate: creator.engagementRate || '',
    city: creator.city || '',
    state: creator.state || '',
    district: creator.district || '',
    commercial: creator.commercial || '',
    categories: (creator.categories || []).join(', '),
    bio: creator.bio || '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const preview = { ...creator, ...f, followers: +String(f.followers).replace(/[^\d]/g, '') || 0, following: +String(f.following).replace(/[^\d]/g, '') || 0, avgViews: +String(f.avgViews).replace(/[^\d]/g, '') || 0, engagementRate: parseFloat(f.engagementRate) || 0 };

  // a new creator's one-time Instagram lookup failed — try it once more (data that was fetched is never refreshed)
  const fetchIg = async () => {
    setError('');
    setFetching(true);
    try {
      const d = await api.fetchCreatorInstagram(creator._id);
      const k = d.item;
      setCreator(k);
      setF((x) => ({
        ...x,
        name: k.name || x.name,
        avatarUrl: k.avatarUrl || x.avatarUrl,
        followers: k.followers || x.followers,
        following: k.following || x.following,
        avgViews: k.avgViews || x.avgViews,
        avgLikes: k.avgLikes || x.avgLikes,
        avgComments: k.avgComments || x.avgComments,
        engagementRate: k.engagementRate || x.engagementRate,
        city: k.city || x.city,
        categories: (k.categories || []).join(', ') || x.categories,
        bio: k.bio || x.bio,
      }));
      onFetched?.(k);
    } catch (err) {
      setError(err.message);
      if (err.data?.item) setCreator(err.data.item);
    } finally {
      setFetching(false);
    }
  };
  const ig = creator.ig || {};
  const canRetry = creator.platform === 'instagram' && !ig.fetchedAt && ['error', 'limit', 'auth', 'disabled', 'queued'].includes(ig.status);
  const igLine =
    creator.platform !== 'instagram'
      ? null
      : ig.status === 'ok'
        ? `Fetched from Instagram ${timeAgo(ig.fetchedAt)} and saved${ig.sampled ? ` · averages from ${ig.sampled} recent posts` : ''}`
        : ig.status === 'private'
          ? `Private account — profile fetched ${timeAgo(ig.fetchedAt)}, no post averages`
          : ig.status === 'not_found'
            ? 'No Instagram account with this handle'
            : ig.status === 'queued'
              ? 'Waiting for the Instagram lookup…'
              : ig.status === 'disabled'
                ? 'Instagram lookup was off when this creator was added (no HIKERAPI_KEY)'
                : ig.error
                  ? `Instagram lookup failed: ${ig.error}`
                  : 'Added before Instagram lookup — details are entered by hand';

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const d = await api.updateCreator(creator._id, f);
      onSaved(d.item);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel
      title={
        <>
          {creator.name || `@${creator.handle}`} <Verified k={creator} />
        </>
      }
      subtitle={`${PLATFORM_LABEL[creator.platform]} · @${creator.handle}. These details appear on the card clients swipe through.`}
      onClose={onClose}
      footer={
        <>
          {error && <span className="pn-err">{error}</span>}
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" form="creator-form" disabled={busy}>
            {busy ? 'Saving…' : 'Save details'}
          </button>
        </>
      }
    >
      <form id="creator-form" onSubmit={submit} noValidate className="ac">
        {creator.platform === 'instagram' && (
          <div className={`cf-ig is-${ig.status || 'none'}`}>
            <span>
              <Icon name="sparkles" size={14} /> {igLine}
            </span>
            {canRetry && (
              <button type="button" className="btn ghost sm" onClick={fetchIg} disabled={fetching}>
                <Icon name="undo" size={14} /> {fetching ? 'Fetching…' : 'Retry'}
              </button>
            )}
          </div>
        )}
        <div className="cf-preview">
          <CreatorPhoto key={creator.avatarUrl} creator={preview} className="pc-photo" />
          <dl className="pc-stats">
            {creatorStats(preview).map(([l, v]) => (
              <div key={l}>
                <dd>{v}</dd>
                <dt>{l}</dt>
              </div>
            ))}
          </dl>
        </div>
        <div className="fx-grid">
          <Field label="Name" full>
            <input value={f.name} onChange={set('name')} />
          </Field>
          <Field label="Profile photo link" full hint="Paste an image link. Left empty, the client sees their public profile picture when one is available.">
            <input value={f.avatarUrl} onChange={set('avatarUrl')} placeholder="https://…" />
          </Field>
          <Field label="Followers">
            <input value={f.followers} onChange={set('followers')} inputMode="numeric" placeholder="e.g. 120000" />
          </Field>
          <Field label="Following">
            <input value={f.following} onChange={set('following')} inputMode="numeric" placeholder="e.g. 850" />
          </Field>
          <Field label="Avg views">
            <input value={f.avgViews} onChange={set('avgViews')} inputMode="numeric" placeholder="e.g. 45000" />
          </Field>
          <Field label="Avg likes">
            <input value={f.avgLikes} onChange={set('avgLikes')} inputMode="numeric" placeholder="e.g. 2400" />
          </Field>
          <Field label="Avg comments">
            <input value={f.avgComments} onChange={set('avgComments')} inputMode="numeric" placeholder="e.g. 60" />
          </Field>
          <Field label="Engagement %">
            <input value={f.engagementRate} onChange={set('engagementRate')} inputMode="decimal" placeholder="e.g. 4.2" />
          </Field>
          <Field label="Cost (latest)" hint="Their usual cost, e.g. 15,000 per reel. Campaign costs and prices are set in each campaign’s table.">
            <input value={f.commercial} onChange={set('commercial')} placeholder="15,000 per reel" />
          </Field>
          <Field label="City">
            <input value={f.city} onChange={set('city')} />
          </Field>
          <Field label="District">
            <input value={f.district} onChange={set('district')} />
          </Field>
          <Field label="State">
            <input value={f.state} onChange={set('state')} />
          </Field>
          <Field label="Genre" hint="Comma separated">
            <input value={f.categories} onChange={set('categories')} placeholder="Beauty, lifestyle" />
          </Field>
          <Field label="Bio" full hint={creator.platform === 'instagram' ? 'Filled from their Instagram bio when fetched' : undefined}>
            <textarea value={f.bio} onChange={set('bio')} maxLength={400} rows={4} placeholder="One or two lines about their content" />
          </Field>
        </div>
      </form>
    </Panel>
  );
}
