import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { LOGO_SRC } from '../components/Logo.jsx';

// One sign-in page for everyone — internal team, vendors, clients and creators.
export default function Login() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // This tab may already be signed in — offer to continue, or sign in with another account
  // (each tab keeps its own session, so other tabs aren't affected).
  const [switching, setSwitching] = useState(false);
  if (!loading && user && !switching) {
    return (
      <main className="signin">
        <Link to="/" className="signin-home">
          <svg width="26" height="10" viewBox="0 0 26 10" aria-hidden="true">
            <path d="M26 5H2M6 1L2 5l4 4" fill="none" stroke="currentColor" strokeWidth="1.2" />
          </svg>
          Home
        </Link>
        <div className="signin-form">
          <Link to="/" className="signin-brand" aria-label="Swol Media home">
            <img src={LOGO_SRC} alt="" />
            <span>Swol Media</span>
          </Link>
          <h1>Signed in</h1>
          <p className="signin-who">
            This tab is signed in as <strong>{user.name}</strong>
            <span>{user.email}</span>
          </p>
          <button type="button" className="signin-submit" onClick={() => navigate('/dashboard')}>
            Continue
            <svg width="26" height="10" viewBox="0 0 26 10" aria-hidden="true">
              <path d="M0 5h24M20 1l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
          <button type="button" className="signin-alt" onClick={() => setSwitching(true)}>
            Use another account in this tab
          </button>
          <p className="signin-note">Each tab keeps its own sign-in, so you can work as different people side by side.</p>
        </div>
      </main>
    );
  }

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email, password);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="signin">
      <Link to="/" className="signin-home">
        <svg width="26" height="10" viewBox="0 0 26 10" aria-hidden="true">
          <path d="M26 5H2M6 1L2 5l4 4" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </svg>
        Home
      </Link>

      <form className="signin-form" onSubmit={onSubmit}>
        <Link to="/" className="signin-brand" aria-label="Swol Media home">
          <img src={LOGO_SRC} alt="" />
          <span>Swol Media</span>
        </Link>

        <h1>Sign in</h1>

        <label className="signin-field">
          <span>Email</span>
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            required
          />
        </label>

        <label className="signin-field">
          <span>Password</span>
          <div className="signin-pw">
            <input
              type={showPw ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
            <button type="button" onClick={() => setShowPw((s) => !s)}>
              {showPw ? 'Hide' : 'Show'}
            </button>
          </div>
        </label>

        {error && <p className="signin-error">{error}</p>}

        <button className="signin-submit" disabled={busy}>
          {busy ? 'Signing in' : 'Continue'}
          <svg width="26" height="10" viewBox="0 0 26 10" aria-hidden="true">
            <path d="M0 5h24M20 1l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>

        <p className="signin-note">Access is issued by the Swol Media team.</p>
      </form>

      <p className="signin-foot">© {new Date().getFullYear()} Swol Media Entertainment</p>
    </main>
  );
}
