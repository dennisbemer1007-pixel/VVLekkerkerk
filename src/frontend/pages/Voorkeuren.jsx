import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { PageTitle } from '../components/PageHelp.jsx';
import { api } from '../hooks/useApi.js';
import { formatMatchDate } from '../utils/formatDate.js';
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

export default function Voorkeuren({ embedded = false }) {
  const { user, refresh } = useAuth();
  const [unavailable, setUnavailable] = useState([]);
  const [preferred, setPreferred] = useState([]);
  const [absences, setAbsences] = useState([]);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    setUnavailable(user.unavailableWeekdays || []);
    setPreferred(user.preferredSlots || []);
  }, [user]);

  useEffect(() => {
    api.getMyAbsences().then(setAbsences).catch(() => {});
  }, []);

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
      {embedded ? (
        <h2 className="font-heading text-base font-black uppercase">Voorkeuren</h2>
      ) : (
        <header>
          <PageTitle {...PAGE_HELP.voorkeuren}>Mijn voorkeuren</PageTitle>
          <p className="mt-1 text-sm text-gray-700">
            Geef aan wanneer je niet kunt staan, en welke dagdelen je voorkeur hebben.
          </p>
        </header>
      )}

      <form onSubmit={save} className="vvl-card space-y-6">
        <div>
          <h2 className="font-heading text-lg font-black uppercase">Niet beschikbaar</h2>
          <p className="mb-3 text-sm text-gray-700">Vaste weekdag(en) waarop je niet kunt.</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {WEEKDAYS.map((d) => (
              <li key={d.id}>
                <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
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
                <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
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

      <section className="vvl-card space-y-3">
        <h2 className="font-heading text-lg font-black uppercase">Mijn afwezigheid</h2>
        <p className="text-sm text-gray-700">
          Periodes waarin de barcommissie je niet automatisch inplant. Dit kun je zelf niet
          wijzigen — vraag de barcommissie om een periode toe te voegen of te verwijderen.
        </p>
        {absences.length === 0 ? (
          <p className="text-sm text-gray-600">Geen afwezigheidsperiodes geregistreerd.</p>
        ) : (
          <ul className="space-y-2">
            {absences.map((a) => (
              <li
                key={a.id}
                className="rounded-sm border border-vvl-border bg-vvl-muted p-3 text-sm"
              >
                {formatMatchDate(a.fromDate)} t/m {formatMatchDate(a.toDate)}
                {a.note ? <span className="block text-gray-700">{a.note}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="vvl-card space-y-2">
        <h2 className="font-heading text-lg font-black uppercase">Jouw gegevens</h2>
        <p className="text-sm text-gray-700">
          Download een kopie van je account, inschrijvingen en teamkoppelingen (AVG).
        </p>
        <button
          type="button"
          className="vvl-btn-outline text-xs"
          onClick={async () => {
            setError('');
            try {
              const data = await api.exportMyData();
              const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = 'vvl-mijn-gegevens.json';
              a.click();
              URL.revokeObjectURL(url);
              setMsg('Export gedownload.');
            } catch (err) {
              setError(err.message);
            }
          }}
        >
          Gegevens downloaden
        </button>
      </section>

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
