import { useCallback, useEffect, useState } from 'react';
import { api } from '../hooks/useApi.js';
import { toDateInputValue } from '../utils/formatDate.js';

export function roundOptionLabel(round) {
  const dates =
    round.fromDate || round.toDate
      ? ` (${toDateInputValue(round.fromDate) || '—'} t/m ${toDateInputValue(round.toDate) || '—'})`
      : '';
  return `${round.label || 'Planning'}${dates}`;
}

/** Compact select + activate when multiple planning rounds exist (beheer). */
export default function PlanningRoundSwitcher({ onActivated }) {
  const [rounds, setRounds] = useState([]);
  const [activeId, setActiveId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    return api
      .getPlanningRounds()
      .then((list) => {
        setRounds(list);
        const active = list.find((r) => r.active) || list[0];
        setActiveId(active ? String(active.id) : '');
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onSelect = async (e) => {
    const id = e.target.value;
    if (!id || id === activeId) return;
    setBusy(true);
    setError('');
    try {
      await api.activatePlanningRound(id);
      setActiveId(id);
      await load();
      onActivated?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (rounds.length <= 1) return null;

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="block min-w-[12rem] flex-1">
        <span className="vvl-label">Planningperiode</span>
        <select
          className="vvl-input"
          value={activeId}
          disabled={busy}
          onChange={onSelect}
          aria-label="Actieve planningperiode"
        >
          {rounds.map((r) => (
            <option key={r.id} value={r.id}>
              {roundOptionLabel(r)}
            </option>
          ))}
        </select>
      </label>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
