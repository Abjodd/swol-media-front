import { useSyncExternalStore } from 'react';
import { api } from './api.js';

// Background creator uploads.
// A sheet of any size is sent in parts of CHUNK rows, one after another, while the person keeps using the app.
// Progress shows in the corner (UploadTray); pages listening for 'swol:creators-added' refresh their lists.
// The work lives in this browser tab, so closing or reloading the tab stops it (we warn before that happens).
const CHUNK = 200;
const RETRIES = 3;

let jobs = []; // newest first
const listeners = new Set();
const emit = () => {
  jobs = [...jobs];
  for (const fn of listeners) fn();
};
const subscribe = (fn) => (listeners.add(fn), () => listeners.delete(fn));
const snapshot = () => jobs;
export const useUploads = () => useSyncExternalStore(subscribe, snapshot, snapshot);

const running = () => jobs.some((j) => j.status === 'running');
// "Leave site? Changes you made may not be saved." while a sheet is still going up
window.addEventListener('beforeunload', (e) => {
  if (!running()) return;
  e.preventDefault();
  e.returnValue = '';
});

const announce = (job, done) => window.dispatchEvent(new CustomEvent('swol:creators-added', { detail: { campaignId: job.campaignId, done, job } }));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function update(job, patch) {
  Object.assign(job, patch);
  emit();
}

async function run(job) {
  update(job, { status: 'running', error: '' });
  const parts = Math.ceil(job.entries.length / CHUNK);
  while (job.part < parts) {
    const i = job.part;
    const body = {
      entries: job.entries.slice(i * CHUNK, (i + 1) * CHUNK),
      platform: job.platform,
      assignmentId: job.assignmentId,
      pricing: job.planId ? { ...job.pricing, planId: job.planId } : job.pricing,
      upload: { id: job.id, last: i === parts - 1, added: job.added },
    };
    let d;
    for (let attempt = 1; ; attempt++) {
      try {
        d = await api.addCampaignCreators(job.campaignId, body);
        break;
      } catch (err) {
        // the connection dropped or the server hiccuped: try this part again; anything else stops the upload
        const retry = (!err.status || err.status >= 500) && attempt < RETRIES;
        if (!retry) return update(job, { status: 'error', error: err.message || 'The upload stopped' });
        await wait(1500 * attempt);
      }
    }
    update(job, {
      part: i + 1,
      done: Math.min(job.entries.length, (i + 1) * CHUNK),
      added: job.added + d.added,
      noCost: job.noCost + (d.noCost || 0),
      skipped: [...job.skipped, ...(d.skipped || [])],
      conflicts: [...job.conflicts, ...(d.conflicts || [])],
      unmatched: [...new Set([...job.unmatched, ...(d.unmatchedVendors || [])])],
      planId: job.planId || d.pricing?.planId || null,
      pricingLabel: d.pricing?.label || job.pricingLabel,
      igQueued: job.igQueued + (d.instagram?.queued || 0),
      igOff: job.igOff || (d.instagram && !d.instagram.enabled && d.instagram.creators > 0),
    });
    // let an open campaign page show the new creators every few parts (not after every one — big lists)
    if ((i + 1) % 5 === 0 && i + 1 < parts) announce(job, false);
  }
  update(job, { status: 'done', finishedAt: Date.now() });
  announce(job, true);
}

// Start uploading in the background. Returns the job right away.
export function startUpload({ campaignId, campaignName, entries, platform, assignmentId, pricing }) {
  const job = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    campaignId,
    campaignName,
    entries,
    platform,
    assignmentId,
    pricing,
    total: entries.length,
    part: 0,
    done: 0,
    added: 0,
    noCost: 0,
    skipped: [],
    conflicts: [], // creators another vendor already has here — the vendor can offer a lower price
    unmatched: [],
    planId: null,
    pricingLabel: '',
    igQueued: 0,
    igOff: false,
    status: 'running',
    error: '',
  };
  jobs = [job, ...jobs];
  emit();
  run(job);
  return job;
}

// carry on from the part that failed
export const retryUpload = (id) => {
  const job = jobs.find((j) => j.id === id);
  if (job && job.status === 'error') run(job);
};

export const dismissUpload = (id) => {
  jobs = jobs.filter((j) => j.id !== id || j.status === 'running');
  emit();
};
