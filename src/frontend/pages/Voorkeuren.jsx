import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { PageTitle } from '../components/PageHelp.jsx';
import { api } from '../hooks/useApi.js';
import { PAGE_HELP } from '../utils/pageHelp.js';

const WEEKDAYS = [
  { id: 1, label: 'Maandag' },
  { id: 2, label: 'Dinsdag' },
  { id: 3, label: 'Woensdag' },
  { id: 4, label: 'Donderdag' },
  { id: 5, label: 'Vrijdag' },
  { id: 6, label: 'Zaterdag' },
  { id: 0, label: 'Zondag' },
];

const SLOTS = [
  { id: 'MORNING', label: 'Ochtend' },
  { id: 'AFTERNOON', label: 'Middag' },
  { id: 'EVENING', label: 'Late middag/avond' },
];

export default function Voorkeuren() {
  const { user, refresh } = useAuth();
  const [unavailable, setUnavailable] = useState([]);
  const [preferred, setPreferred] = useState([]);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    setUnavailable(user.unavailableWeekdays || []);
    setPreferred(user.preferredSlots || []);
  }, [user]);

  const toggleDay = (day) => {
    setUnavailable((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  };

  const toggleSlot = (slot) => {
    setPreferred((prev) =>
      prev.includes(slot) ? prev.filter((s) => s !== slot) : [...prev, slot],
    );
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMsg('');
    setError('');
    try {
      await api.updateMyPreferences({
        unavailableWeekdays: unavailable,
        preferredSlots: preferred,
      });
      await refresh();
      setMsg('Voorkeuren opgeslagen.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <PageTitle {...PAGE_HELP.voorkeuren}>Mijn voorkeuren</PageTitle>
        <p className="mt-1 text-sm text-gray-700">
          Geef aan wanneer je <strong>niet</strong> kunt staan, en welke dagdelen je voorkeur hebben.
          De planning gebruikt dit bij het automatisch vullen van open plekken.
        </p>
      </header>

      <form onSubmit={save} className="vvl-card space-y-6">
        <div>
          <h2 className="font-heading text-lg font-black uppercase">Niet beschikbaar</h2>
          <p className="mb-3 text-sm text-gray-700">Vaste weekdag(en) waarop je niet kunt.</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {WEEKDAYS.map((d) => (
              <li key={d.id}>
                <label className="flex items-center gap-2 text-sm font-semibold">
                  <input
                    type="checkbox"
                    checked={unavailable.includes(d.id)}
                    onChange={() => toggleDay(d.id)}
                  />
                  {d.label}
                </label>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="font-heading text-lg font-black uppercase">Voorkeur dagdeel</h2>
          <p className="mb-3 text-sm text-gray-700">
            Optioneel. Leeg = geen voorkeur. Anders: bij voorkeur deze dagdelen.
          </p>
          <ul className="flex flex-wrap gap-4">
            {SLOTS.map((s) => (
              <li key={s.id}>
                <label className="flex items-center gap-2 text-sm font-semibold">
                  <input
                    type="checkbox"
                    checked={preferred.includes(s.id)}
                    onChange={() => toggleSlot(s.id)}
                  />
                  {s.label}
                </label>
              </li>
            ))}
          </ul>
        </div>

        {user?.obligation && user.obligation !== 'NONE' ? (
          <p className="text-sm text-gray-700">
            Jouw verplichting: <strong>{user.obligationLabel || user.obligation}</strong>
            {user.team?.name ? ` · team ${user.team.name}` : ''}.
          </p>
        ) : null}

        <button type="submit" className="vvl-btn-primary" disabled={saving}>
          {saving ? 'Opslaan…' : 'Opslaan'}
        </button>
      </form>

      {msg ? (
        <p className="rounded-sm border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
          {msg}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-sm border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>
      ) : null}
    </div>
  );
}
