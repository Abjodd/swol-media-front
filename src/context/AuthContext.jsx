import { createContext, useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { session } from '../session.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // sign-ins last 12 hours: when this tab's runs out, send it to the sign-in page
  useEffect(() => {
    const off = session.onExpire(() => {
      setUser(null);
      navigate('/login?expired=1', { replace: true });
    });
    return off;
  }, [navigate]);
  useEffect(() => {
    if (!user) return undefined;
    const check = () => {
      const at = session.expiresAt();
      if (at && Date.now() >= at) session.expire();
    };
    const at = session.expiresAt();
    const t = at ? setTimeout(check, Math.min(Math.max(0, at - Date.now()) + 500, 2 ** 31 - 1)) : null;
    // timers pause while a laptop sleeps — check again whenever the tab comes back
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    return () => {
      clearTimeout(t);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
    };
  }, [user]);

  useEffect(() => {
    api
      .me()
      .then((d) => setUser(d.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const d = await api.login(email, password);
    setUser(d.user);
    return d.user;
  };

  // signs out this tab only — other tabs keep their own sessions
  const logout = async () => {
    await api.logout().catch(() => {});
    setUser(null);
  };

  // setUser lets pages (e.g. Profile) push fresh user data so the sidebar/top bar update instantly
  return <AuthContext.Provider value={{ user, setUser, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
