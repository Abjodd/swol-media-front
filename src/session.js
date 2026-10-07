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
};

// Where the API lives. Empty in development (Vite proxies /api); in production set VITE_API_URL to the
// server's address, e.g. https://swol-media-api.onrender.com
export const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

// For plain links (downloads, <img>) that can't send a header: point /api paths at the API, and add this tab's token
export const withSession = (url) => {
  if (!url) return url;
  if (url.startsWith('/api/')) url = API_BASE + url;
  if (!memory) return url;
  return `${url}${url.includes('?') ? '&' : '?'}t=${encodeURIComponent(memory)}`;
};
