import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

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
