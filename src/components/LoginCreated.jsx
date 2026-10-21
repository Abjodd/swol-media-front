import { useState } from 'react';
import Icon from './Icon.jsx';

// Shown once after adding a brand or vendor: the login that was created for them.
// The password is also kept in Settings → Accounts, where it can be viewed or changed later.
export default function LoginCreated({ login, company, role }) {
  const [copied, setCopied] = useState('');
  const site = window.location.origin;
  const message = `Hi ${login.name.split(' ')[0] || ''}, here's your Swol Media login${company ? ` for ${company}` : ''}:\n\n${site}/login\nLogin ID: ${login.email}\nPassword: ${login.password}\n\nYou can change your password after signing in.`;
  const copy = async (what, text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(''), 1600);
    } catch {
      /* clipboard blocked */
    }
  };
  return (
    <div className="lc">
      <span className="lc-ic">
        <Icon name="key" size={20} />
      </span>
      <h3>{role === 'vendor' ? 'Vendor' : 'Brand'} added — their login is ready</h3>
      <p>Share these with {login.name}. The password is also kept in Settings → Accounts, where you can see or change it any time.</p>
      <dl className="lc-rows">
        <div>
          <dt>Login ID</dt>
          <dd>
            <code>{login.email}</code>
            <button type="button" className={`pw-mini ${copied === 'id' ? 'ok' : ''}`} onClick={() => copy('id', login.email)} aria-label="Copy login ID">
              <Icon name={copied === 'id' ? 'check' : 'copy'} size={14} />
            </button>
          </dd>
        </div>
        <div>
          <dt>Password</dt>
          <dd>
            <code>{login.password}</code>
            <button type="button" className={`pw-mini ${copied === 'pw' ? 'ok' : ''}`} onClick={() => copy('pw', login.password)} aria-label="Copy password">
              <Icon name={copied === 'pw' ? 'check' : 'copy'} size={14} />
            </button>
          </dd>
        </div>
      </dl>
      <button type="button" className="btn ghost" onClick={() => copy('all', message)}>
        <Icon name={copied === 'all' ? 'check' : 'copy'} size={15} /> {copied === 'all' ? 'Copied' : 'Copy login message'}
      </button>
    </div>
  );
}
