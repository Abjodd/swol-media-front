// Per-tab sessions.
// Each browser tab keeps its own sign-in token in sessionStorage (survives refresh, private to the tab),
// so you can be signed in as different people in different tabs at the same time.
// A brand-new tab starts with the most recent sign-in (kept in localStorage) — handy for normal use —
// and from then on it's independent: signing in or out elsewhere doesn't change it.
const TAB_KEY = 'swol.session';
const LAST_KEY = 'swol.lastSession';

const read = (store, k) => {
  try {
    return store.getItem(k);
  } catch {
    return null;
  }
};
const write = (store, k, v) => {
  try {
    v == null ? store.removeItem(k) : store.setItem(k, v);
  } catch {
    /* storage unavailable (private mode etc.) */
  }
};

let memory = read(sessionStorage, TAB_KEY);
if (!memory) {
  memory = read(localStorage, LAST_KEY);
  if (memory) write(sessionStorage, TAB_KEY, memory);
}

export const session = {
  token: () => memory,
  set(token) {
    memory = token;
    write(sessionStorage, TAB_KEY, token);
    write(localStorage, LAST_KEY, token);
  },
  clear() {
    if (read(localStorage, LAST_KEY) === memory) write(localStorage, LAST_KEY, null);
    memory = null;
    write(sessionStorage, TAB_KEY, null);
  },
  // when this tab's sign-in runs out (ms since epoch), read from the token itself; null if unknown
  expiresAt() {
    try {
      const part = memory.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const exp = JSON.parse(atob(part)).exp;
      return exp ? exp * 1000 : null;
    } catch {
      return null;
    }
  },
  // the sign-in ran out (or was revoked): forget it and tell whoever listens (AuthProvider)
  expire() {
    if (!memory) return;
    this.clear();
    for (const fn of listeners) fn();
  },
  onExpire(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
const listeners = new Set();

// Where the API lives. Empty in development (Vite proxies /api); in production set VITE_API_URL to the
// server's address, e.g. https://swol-media-api.onrender.com
// `npm run dev` always talks to the local API through Vite's proxy (vite.config.js → localhost:5050),
// even if VITE_API_URL is set somewhere — set VITE_DEV_API_URL only to point local development elsewhere.
export const API_BASE = (import.meta.env.DEV ? import.meta.env.VITE_DEV_API_URL || '' : import.meta.env.VITE_API_URL || '')
  .trim()
  .replace(/\/+$/, '');

// For plain links (downloads, <img>) that can't send a header: point /api paths at the API, and add this tab's token
export const withSession = (url) => {
  if (!url) return url;
  if (url.startsWith('/api/')) url = API_BASE + url;
  if (!memory) return url;
  return `${url}${url.includes('?') ? '&' : '?'}t=${encodeURIComponent(memory)}`;
};
