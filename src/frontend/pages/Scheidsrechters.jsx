import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import BeheerNavButtons from '../components/BeheerNavButtons.jsx';
import { api } from '../hooks/useApi.js';
import { levelLabel } from '../scheids/categories.js';
import { useRefereeFeature } from '../scheids/feature.jsx';
import { formatSlotDate } from '../scheids/format.js';

function RefereeSelect({ slot, onChange }) {
  return (
    <select
      className="vvl-input"
      aria-label={`Scheidsrechter ${slot.team}`}
      value={slot.person?.id || ''}
      onChange={(event) => onChange(slot.matchId, event.target.value)}
    >
      <option value="">Open</option>
      {(slot.options || []).map((person) => (
        <option key={person.id} value={person.id}>
          {person.name}
        </option>
      ))}
    </select>
  );
}

export default function Scheidsrechters() {
  const { enabled, ready } = useRefereeFeature();
  const [board, setBoard] = useState(null);
  const [error, setError] = useState('');
  const [date, setDate] = useState('');
  const [level, setLevel] = useState('');
  const [onlyOpen, setOnlyOpen] = useState(false);

  const load = useCallback(() => {
    return api
      .getRefereeOverview()
      .then((data) => {
        setBoard(data);
        setError('');
      })
      .catch((err) => setError(err.message || 'Laden mislukt'));
  }, []);

  useEffect(() => {
    if (enabled) load();
  }, [enabled, load]);

  const dates = useMemo(() => [...new Set((board?.slots || []).map((slot) => slot.date))], [board]);
  if (!ready) return <p className="text-sm text-gray-600">Laden…</p>;
  if (!enabled) return <Navigate to="/meer" replace />;

  const filtered = (board?.slots || []).filter((slot) => {
    if (date && slot.date !== date) return false;
    if (level && slot.level !== level) return false;
    if (onlyOpen && !slot.open) return false;
    return true;
  });

  const changeSlot = async (matchId, personId) => {
    setError('');
    try {
      setBoard(await api.assignReferee(matchId, personId || null));
    } catch (err) {
      setError(err.message || 'Opslaan mislukt');
    }
  };

  return (
    <div className="space-y-4" data-testid="scheids-overzicht">
      <BeheerNavButtons />
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="font-heading text-xl font-black uppercase">Scheidsrechters</h1>
        <button
          type="button"
          className="vvl-btn-outline ml-auto"
          onClick={async () => {
            setError('');
            try {
              setBoard(await api.planReferees());
            } catch (err) {
              setError(err.message || 'Plannen mislukt');
            }
          }}
        >
          Opnieuw plannen
        </button>
      </div>
      {error ? <p className="text-sm text-red-800">{error}</p> : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <label>
          <span className="vvl-label">Datum</span>
          <select className="vvl-input" value={date} onChange={(event) => setDate(event.target.value)} aria-label="Datum">
            <option value="">Alle</option>
            {dates.map((value) => (
              <option key={value} value={value}>
                {formatSlotDate(value)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="vvl-label">Niveau</span>
          <select className="vvl-input" value={level} onChange={(event) => setLevel(event.target.value)} aria-label="Niveau">
            <option value="">Alle</option>
            <option value="pupillen">Pupillen</option>
            <option value="junioren">Junioren</option>
            <option value="senioren">Senioren</option>
          </select>
        </label>
        <label className="flex min-h-11 items-end gap-2 pb-2 text-sm font-semibold">
          <input
            type="checkbox"
            className="h-5 w-5"
            checked={onlyOpen}
            onChange={(event) => setOnlyOpen(event.target.checked)}
          />
          Alleen open
        </label>
      </div>

      <div className="space-y-2">
        <p className="vvl-label">Nodig</p>
        <div className="flex flex-wrap gap-2">
          {(board?.categories || []).map((category) => (
            <button
              key={category.key}
              type="button"
              aria-pressed={category.needed}
              className={`min-h-11 rounded-full border-2 px-3 text-xs font-bold uppercase ${
                category.needed ? 'border-vvl-primary bg-vvl-primary text-white' : 'border-vvl-border bg-white text-gray-500'
              }`}
              onClick={async () => {
                setError('');
                try {
                  setBoard(await api.setRefereeCategory(category.key, !category.needed));
                } catch (err) {
                  setError(err.message || 'Opslaan mislukt');
                }
              }}
            >
              {category.key}
            </button>
          ))}
        </div>
      </div>

      <ul className="space-y-2 md:hidden">
        {filtered.map((slot) => (
          <li key={slot.matchId} className="vvl-card space-y-2 text-sm" data-testid={`scheids-kaart-${slot.matchId}`}>
            <p className="font-semibold">
              {formatSlotDate(slot.date)} · {slot.time}
            </p>
            <p>
              {slot.team} – {slot.opponent}
            </p>
            <p className="text-gray-700">{levelLabel(slot.level)}</p>
            <RefereeSelect slot={slot} onChange={changeSlot} />
          </li>
        ))}
      </ul>

      <div className="vvl-card hidden p-0 md:block">
        <table className="w-full text-sm">
          <thead className="bg-vvl-secondary text-xs font-bold uppercase">
            <tr>
              <th className="p-3 text-left">Datum</th>
              <th className="p-3 text-left">Tijd</th>
              <th className="p-3 text-left">Wedstrijd</th>
              <th className="p-3 text-left">Niveau</th>
              <th className="p-3 text-left">Scheidsrechter</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td className="p-4 text-gray-600" colSpan={5}>
                  Geen wedstrijden.
                </td>
              </tr>
            ) : (
              filtered.map((slot) => (
                <tr key={slot.matchId} className="border-t border-vvl-border" data-testid={`scheids-rij-${slot.matchId}`}>
                  <td className="p-3 whitespace-nowrap">{formatSlotDate(slot.date)}</td>
                  <td className="p-3 whitespace-nowrap">{slot.time}</td>
                  <td className="p-3 font-semibold">
                    {slot.team} – {slot.opponent}
                  </td>
                  <td className="p-3">{levelLabel(slot.level)}</td>
                  <td className="p-3">
                    <RefereeSelect slot={slot} onChange={changeSlot} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
