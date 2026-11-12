import { useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from './Icon.jsx';
import { fmtNum } from './ui.jsx';
import { dismissUpload, retryUpload, useUploads } from '../uploads.js';
import OfferPanel from './OfferPanel.jsx';

// Vendors from the sheet's Vendor column that weren't on the campaign: added (and given a login if new)
function NewVendors({ list }) {
  const [copied, setCopied] = useState('');
  const copy = async (v) => {
    try {
      await navigator.clipboard.writeText(`Swol Media login\n${window.location.origin}/login\nID: ${v.login.email}\nPassword: ${v.login.password}`);
      setCopied(v.vendorId);
      setTimeout(() => setCopied(''), 1500);
    } catch {
      /* clipboard blocked */
    }
  };
  return (
    <div className="up-vendors">
      <p>
        <b>{list.length === 1 ? 'Vendor' : `${list.length} vendors`} from the sheet assigned to this campaign</b>
      </p>
      <ul>
        {list.map((v) => (
          <li key={v.vendorId}>
            <strong>
              {v.name}
              {v.newVendor && <em>new</em>}
            </strong>
            {v.login ? (
              <span className="up-login">
                <code>{v.login.email}</code>
                <code>{v.login.password}</code>
                <button type="button" className="up-copy" onClick={() => copy(v)}>
                  {copied === v.vendorId ? 'Copied' : 'Copy login'}
                </button>
              </span>
            ) : (
              <small>already has a login</small>
            )}
          </li>
        ))}
      </ul>
      {list.some((v) => v.login) && <small className="up-hint">Change the login ID or password any time in Settings.</small>}
    </div>
  );
}

// Top-right corner: creator uploads going on in the background, with their progress and, once done, what happened.
export default function UploadTray({ campaignPath = 'campaigns' }) {
  const jobs = useUploads();
  if (!jobs.length) return null;
  return (
    <div className="up-tray" aria-live="polite">
      {jobs.map((j) => (
        <UploadCard key={j.id} job={j} campaignPath={campaignPath} />
      ))}
    </div>
  );
}

function UploadCard({ job: j, campaignPath }) {
  const [open, setOpen] = useState(false);
  const [offering, setOffering] = useState(false);
  const pct = j.total ? Math.round((j.done / j.total) * 100) : 0;
  const running = j.status === 'running';
  const failed = j.status === 'error';
  const extra = j.skipped.length > 0 || j.unmatched.length > 0;
  return (
    <section className={`up-card is-${j.status}`}>
      <header>
        <span className={`up-dot ${j.status}`}>{running ? <span className="up-spin" /> : <Icon name={failed ? 'close' : 'check'} size={13} />}</span>
        <div className="up-title">
          <strong>{running ? 'Uploading creators' : failed ? 'Upload stopped' : 'Upload complete'}</strong>
          <Link to={`${campaignPath}/${j.campaignId}?tab=added`}>{j.campaignName}</Link>
        </div>
        {running ? <b className="up-pct">{pct}%</b> : (
          <button type="button" className="up-x" onClick={() => dismissUpload(j.id)} aria-label="Close">
            <Icon name="close" size={15} />
          </button>
        )}
      </header>

      <div className="up-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <span style={{ width: `${pct}%` }} />
      </div>
      <p className="up-sub">
        {fmtNum(j.done)} of {fmtNum(j.total)} rows · {fmtNum(j.added)} added
        {j.skipped.length ? ` · ${fmtNum(j.skipped.length)} skipped` : ''}
        {j.noCost ? ` · ${fmtNum(j.noCost)} without a cost` : ''}
        {j.conflicts.length ? ` · ${fmtNum(j.conflicts.length)} already on the campaign` : ''}
      </p>

      {running && (
        <p className="up-note">
          <Icon name="clock" size={14} /> Don’t refresh or close this tab until it finishes — you can keep using the app meanwhile.
        </p>
      )}
      {failed && (
        <div className="up-err">
          <p>{j.error}</p>
          <button type="button" className="btn primary sm" onClick={() => retryUpload(j.id)}>
            Continue upload
          </button>
        </div>
      )}
      {j.status === 'done' && (
        <p className="up-sub">
          {j.pricingLabel ? `${j.pricingLabel}. ` : ''}
          {j.igOff ? 'Instagram lookup is off (HIKERAPI_KEY isn’t set).' : j.igQueued ? `Fetching profile details for ${fmtNum(j.igQueued)} new creator${j.igQueued === 1 ? '' : 's'}.` : ''}
        </p>
      )}

      {j.vendors.length > 0 && <NewVendors list={j.vendors} />}

      {!running && j.conflicts.length > 0 && (
        <div className="up-offer">
          <p>
            <b>
              {fmtNum(j.conflicts.length)} creator{j.conflicts.length === 1 ? ' is' : 's are'} already on this campaign
            </b>{' '}
            from another vendor. Offer a lower price to take {j.conflicts.length === 1 ? 'it' : 'them'} over.
          </p>
          <button type="button" className="btn primary sm" onClick={() => setOffering(true)}>
            Offer a lower price
          </button>
        </div>
      )}
      {offering && <OfferPanel job={j} onClose={() => setOffering(false)} />}

      {!running && extra && (
        <>
          <button type="button" className="up-more" onClick={() => setOpen(!open)} aria-expanded={open}>
            {open ? 'Hide details' : 'Show what was skipped'} <Icon name="chevronDown" size={14} />
          </button>
          {open && (
            <div className="up-list">
              {j.unmatched.length > 0 && <p>Not on this campaign, so added as Swol Media: {j.unmatched.join(', ')}.</p>}
              <ul>
                {j.skipped.slice(0, 50).map((s, i) => (
                  <li key={i}>
                    <span>{s.input}</span> — {s.reason}
                  </li>
                ))}
                {j.skipped.length > 50 && <li>…and {fmtNum(j.skipped.length - 50)} more</li>}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
