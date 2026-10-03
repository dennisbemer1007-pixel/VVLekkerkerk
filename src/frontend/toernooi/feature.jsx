import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getToken } from '../hooks/useApi.js';

const TournamentFeatureContext = createContext({
  enabled: false,
  ready: false,
  refresh: async () => false,
});

export function TournamentFeatureProvider({ children }) {
  const [enabled, setEnabled] = useState(false);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const headers = {};
      const token = getToken();
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch('/api/tournaments/status', { headers, cache: 'no-store' });
      const on = res.ok;
      setEnabled(on);
      setReady(true);
      return on;
    } catch {
      setEnabled(false);
      setReady(true);
      return false;
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <TournamentFeatureContext.Provider value={{ enabled, ready, refresh }}>
      {children}
    </TournamentFeatureContext.Provider>
  );
}

export function useTournamentFeature() {
  return useContext(TournamentFeatureContext);
}

export function useTournamentsEnabled() {
  return useTournamentFeature().enabled;
}
