import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getToken } from '../hooks/useApi.js';

const CalendarFeatureContext = createContext({
  enabled: false,
  ready: false,
  refresh: async () => false,
});

export function CalendarFeatureProvider({ children }) {
  const [enabled, setEnabled] = useState(false);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const headers = {};
      const token = getToken();
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch('/api/calendar/status', { headers, cache: 'no-store' });
      const body = await res.json().catch(() => ({}));
      const on = res.ok && body.enabled === true;
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
    <CalendarFeatureContext.Provider value={{ enabled, ready, refresh }}>
      {children}
    </CalendarFeatureContext.Provider>
  );
}

export function useCalendarFeature() {
  return useContext(CalendarFeatureContext);
}
