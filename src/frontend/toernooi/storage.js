import { useEffect, useMemo, useState } from 'react';
import { createExample, normalizeTournament, present } from './engine.js';

const KEY = 'vvl-toernooi-mockup-v1';

export function loadTournament() {
  if (typeof localStorage === 'undefined') return createExample();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return createExample();
    return normalizeTournament(JSON.parse(raw));
  } catch {
    return createExample();
  }
}

export function saveTournament(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* mockup blijft in het geheugen als opslaan niet lukt */
  }
}

export function useTournament() {
  const [state, setState] = useState(loadTournament);

  useEffect(() => {
    saveTournament(state);
  }, [state]);

  useEffect(() => {
    const onStorage = (event) => {
      if (event.key !== KEY || !event.newValue) return;
      try {
        setState(normalizeTournament(JSON.parse(event.newValue)));
      } catch {
        /* negeer een kapotte waarde */
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const view = useMemo(() => present(state), [state]);

  const replace = (next) => {
    setState((current) => {
      const value = typeof next === 'function' ? next(current) : next;
      saveTournament(value);
      return value;
    });
  };

  return { state, setState: replace, view };
}
