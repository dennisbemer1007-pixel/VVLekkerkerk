import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken } from '../hooks/useApi.js';
import { canonicalRole } from '../navConfig.js';

const AuthContext = createContext(null);

export function homePathForUser(user) {
  const features = user?.access?.can || [];
  const role = canonicalRole(user?.role);
  if (role === 'Admin' || role === 'Barcommissie') return '/open';
  if (role === 'Teamcoördinator') return '/team';
  if (features.includes('inschrijven')) return '/diensten';
  if (features.includes('beheer') || features.includes('dashboard')) return '/open';
  return '/diensten';
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return null;
    }
    try {
      const me = await api.me();
      setUser(me);
      return me;
    } catch {
      setToken(null);
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const onExpired = () => {
      setUser(null);
    };
    window.addEventListener('vvl-auth-expired', onExpired);
    return () => window.removeEventListener('vvl-auth-expired', onExpired);
  }, []);

  const login = async (email, password) => {
    const res = await api.login(email.trim(), password);
    setToken(res.token);
    const person = {
      ...res.person,
      access: res.person.access ?? { can: [], description: '' },
    };
    setUser(person);
    return person;
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch {
      /* ignore */
    }
    setToken(null);
    setUser(null);
  };

  const acceptInvite = async (token, data) => {
    const res = await api.acceptInvite(token, data);
    setToken(res.token);
    setUser(res.person);
    return res.person;
  };

  const can = useCallback((feature) => Boolean(user?.access?.can?.includes(feature)), [user]);
  const homePath = homePathForUser(user);

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      logout,
      acceptInvite,
      refresh,
      can,
      homePath,
      personId: user?.id ?? null,
      isLoggedIn: Boolean(user),
    }),
    [user, loading, refresh, can, homePath],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

/** Compat: oude useMe → auth gebruiker */
export function useMe() {
  const { personId, user } = useAuth();
  return {
    personId,
    setPersonId: () => {},
    user,
  };
}
