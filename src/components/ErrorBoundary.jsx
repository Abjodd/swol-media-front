import { Component } from 'react';

// A screen that crashes shows this instead of taking the whole app down (which left a blank / black page).
// A screen whose file can't be downloaded (the site was updated while this tab was open) reloads once
// to pick up the new version.
const CHUNK = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk [\w-]+ failed|Unable to preload CSS/i;
const RELOAD_KEY = 'swol.reloadedAfterError';

export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[swol] screen crashed:', error, info?.componentStack);
    if (CHUNK.test(String(error?.message || error))) {
      let already = null;
      try {
        already = sessionStorage.getItem(RELOAD_KEY);
        sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
      } catch {
        /* storage blocked */
      }
      // reload at most once a minute, so a real outage doesn't loop
      if (!already || Date.now() - Number(already) > 60000) window.location.reload();
    }
  }

  componentDidUpdate(prev) {
    // moving to another page clears the error
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const chunk = CHUNK.test(String(error?.message || error));
    return (
      <div className={`crash ${this.props.full ? 'full' : ''}`} role="alert">
        <div className="crash-box">
          <strong>{chunk ? 'Swol Media was just updated' : 'Something went wrong on this screen'}</strong>
          <p>{chunk ? 'Reload to get the latest version.' : 'Your data is safe. Reload the page, or go back and try again.'}</p>
          {!chunk && <code>{String(error?.message || error).slice(0, 240)}</code>}
          <div className="crash-acts">
            <button type="button" className="btn primary sm" onClick={() => window.location.reload()}>
              Reload
            </button>
            {!chunk && (
              <button type="button" className="btn ghost sm" onClick={() => (window.location.href = '/dashboard')}>
                Back to dashboard
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
}
