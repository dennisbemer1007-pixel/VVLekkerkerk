import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../hooks/useApi.js';
import { dutchDate } from '../toernooi/views.jsx';

export default function ToernooiList() {
  const navigate = useNavigate();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const data = await api.listTournaments();
    setRows(data);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message || 'Laden mislukt'));
  }, []);

  async function create(seed) {
    setBusy(true);
    setError('');
    try {
      const created = await api.createTournament(seed);
      navigate(`/toernooi/${created.id}`);
    } catch (err) {
      setError(err.message || 'Aanmaken mislukt');
      setBusy(false);
    }
  }

  async function remove(id) {
    setError('');
    try {
      await api.deleteTournament(id);
      await load();
    } catch (err) {
      setError(err.message || 'Verwijderen mislukt');
    }
  }

  return (
    <div className="space-y-4" data-testid="toernooi-lijst">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-heading text-xl font-black uppercase">Toernooien</h1>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="vvl-btn-outline" disabled={busy} data-testid="toernooi-nieuw" onClick={() => create('empty')}>
            Nieuw
          </button>
          <button type="button" className="vvl-btn-primary" disabled={busy} data-testid="toernooi-voorbeeld" onClick={() => create('example')}>
            Voorbeeld
          </button>
        </div>
      </div>
      {error ? <p className="text-sm font-semibold text-red-800">{error}</p> : null}
      {rows == null ? <p className="text-sm text-gray-600">Laden…</p> : null}
      {rows && !rows.length ? <p className="text-sm text-gray-600">Nog geen toernooi.</p> : null}
      <ul className="divide-y divide-vvl-border border-y border-vvl-border bg-white">
        {(rows || []).map((row) => (
          <li key={row.id} className="flex items-center gap-3 px-3 py-2">
            <Link to={`/toernooi/${row.id}`} className="min-w-0 flex-1">
              <span className="block truncate font-bold">{row.name}</span>
              <span className="text-xs text-gray-500">{dutchDate(row.date)}</span>
            </Link>
            <button type="button" className="text-xs font-bold uppercase text-gray-400" onClick={() => remove(row.id)}>
              Wis
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
