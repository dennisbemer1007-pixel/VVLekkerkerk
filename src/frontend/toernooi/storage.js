import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../hooks/useApi.js';
import { present } from './engine.js';

export function useTournament(id) {
  const [state, setState] = useState(null);
  const [publicToken, setPublicToken] = useState('');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const version = useRef(0);
  const dirty = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setError('');
    dirty.current = false;
    api
      .getTournament(id)
      .then((data) => {
        if (cancelled) return;
        setState(data.state);
        setPublicToken(data.publicToken || '');
        setReady(true);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || 'Toernooi laden mislukt');
        setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!dirty.current || !state) return undefined;
    const ticket = version.current + 1;
    version.current = ticket;
    const snapshot = state;
    const handle = setTimeout(async () => {
      dirty.current = false;
      try {
        const saved = await api.saveTournament(id, snapshot);
        if (version.current !== ticket || dirty.current) return;
        setState(saved.state);
        setPublicToken(saved.publicToken || '');
      } catch (err) {
        if (version.current === ticket) setError(err.message || 'Opslaan mislukt');
      }
    }, 450);
    return () => clearTimeout(handle);
  }, [state, id]);

  const view = useMemo(() => (state ? present(state) : null), [state]);

  const replace = (next) => {
    dirty.current = true;
    setError('');
    setState((current) => (typeof next === 'function' ? next(current) : next));
  };

  return { state, setState: replace, view, ready, error, publicToken, id };
}

export function usePublicTournament(token) {
  const [view, setView] = useState(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/tournaments/live/${encodeURIComponent(token)}`, { cache: 'no-store' });
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setView(null);
          setError(body.error || 'Niet gevonden');
        } else {
          setError('');
          setView(body.view);
        }
      } catch {
        if (!cancelled) setError('Geen verbinding');
      } finally {
        if (!cancelled) setReady(true);
      }
    }
    load();
    const timer = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [token]);

  return { view, ready, error };
}
