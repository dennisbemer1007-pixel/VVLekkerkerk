import { useEffect, useMemo, useState } from 'react';
import CsvMatchImport from '../components/CsvMatchImport.jsx';
import { PageTitle } from '../components/PageHelp.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../hooks/useApi.js';
import {
  formatMatchDate,
  isFutureMatchDate,
  todayInputValue,
  toDateInputValue,
} from '../utils/formatDate.js';
import { PAGE_HELP } from '../utils/pageHelp.js';

export default function Wedstrijden() {
  const { can } = useAuth();
  const isAdmin = can('beheer');
  const [matches, setMatches] = useState([]);
  const [teams, setTeams] = useState([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [filters, setFilters] = useState({
    date: '',
    team: '',
    matchNumber: '',
    playLevel: '',
  });
  const [form, setForm] = useState({
    date: todayInputValue(),
    time: '',
    home: true,
    opponent: '',
    note: '',
    teamId: '',
    matchNumber: '',
    playLevel: '',
  });

  const load = () =>
    Promise.all([api.getMatches(), api.getTeams()])
      .then(([m, t]) => {
        setMatches(m);
        setTeams(t);
      })
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  const playLevels = useMemo(() => {
    const set = new Set();
    for (const m of matches) {
      if (m.playLevel) set.add(m.playLevel);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'nl'));
  }, [matches]);

  const filtered = useMemo(() => {
    const qNr = filters.matchNumber.trim().toLowerCase();
    const dateFilter = filters.date;
    return matches.filter((m) => {
      if (!showAll && !isFutureMatchDate(m.date)) return false;
      if (dateFilter && toDateInputValue(m.date) !== dateFilter) return false;
      if (filters.team) {
        const teamId = String(m.teamId ?? m.team?.id ?? '');
        if (teamId !== String(filters.team)) return false;
      }
      if (qNr && !String(m.matchNumber || '').toLowerCase().includes(qNr)) return false;
      if (filters.playLevel && (m.playLevel || '') !== filters.playLevel) return false;
      return true;
    });
  }, [matches, filters, showAll]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setMsg('');
    try {
      await api.createMatch({
        ...form,
        teamId: form.teamId || null,
        time: form.time || null,
        matchNumber: form.matchNumber || null,
        playLevel: form.playLevel || null,
      });
      setForm({
        date: todayInputValue(),
        time: '',
        home: true,
        opponent: '',
        note: '',
        teamId: '',
        matchNumber: '',
        playLevel: '',
      });
      setMsg('Wedstrijd opgeslagen.');
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async (id) => {
    try {
      await api.deleteMatch(id);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <PageTitle {...PAGE_HELP.wedstrijden}>Wedstrijden</PageTitle>
        <p className="mt-1 text-sm text-gray-700">
          Overzicht van alle clubwedstrijden. Standaard zie je alleen komende wedstrijden.
        </p>
      </header>

      <div className="vvl-card space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="vvl-label">Datum</label>
            <input
              type="date"
              className="vvl-input"
              value={filters.date}
              onChange={(e) => setFilters({ ...filters, date: e.target.value })}
            />
          </div>
          <div>
            <label className="vvl-label">Team</label>
            <select
              className="vvl-input"
              value={filters.team}
              onChange={(e) => setFilters({ ...filters, team: e.target.value })}
            >
              <option value="">Alle teams</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="vvl-label">Wedstrijdnummer</label>
            <input
              className="vvl-input"
              value={filters.matchNumber}
              onChange={(e) => setFilters({ ...filters, matchNumber: e.target.value })}
              placeholder="Zoek nummer"
            />
          </div>
          <div>
            <label className="vvl-label">Spelniveau</label>
            <select
              className="vvl-input"
              value={filters.playLevel}
              onChange={(e) => setFilters({ ...filters, playLevel: e.target.value })}
            >
              <option value="">Alle niveaus</option>
              {playLevels.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            checked={showAll}
            onChange={(e) => setShowAll(e.target.checked)}
          />
          Toon alle wedstrijden (inclusief gespeelde)
        </label>
        <p className="text-xs text-gray-600">
          {filtered.length} van {matches.length} wedstrijd(en)
          {showAll ? '' : ' · alleen toekomstig'}
        </p>
      </div>

      {msg ? (
        <p className="rounded-sm border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
          {msg}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-sm border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>
      ) : null}

      <div className="overflow-x-auto vvl-card p-0">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-vvl-secondary text-xs font-bold uppercase">
            <tr>
              <th className="p-3 text-left">Datum</th>
              <th className="p-3 text-left">Tijd</th>
              <th className="p-3 text-left">Team</th>
              <th className="p-3 text-left">Thuis/uit</th>
              <th className="p-3 text-left">Tegenstander</th>
              <th className="p-3 text-left">Nr.</th>
              <th className="p-3 text-left">Spelniveau</th>
              <th className="p-3 text-left">Type</th>
              {isAdmin ? <th className="p-3 text-right">Actie</th> : null}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td className="p-4 text-sm text-gray-600" colSpan={isAdmin ? 9 : 8}>
                  Geen wedstrijden voor deze filters.
                </td>
              </tr>
            ) : (
              filtered.map((m) => (
                <tr key={m.id} className="border-t border-vvl-border">
                  <td className="p-3 whitespace-nowrap">{formatMatchDate(m.date)}</td>
                  <td className="p-3">{m.time || '—'}</td>
                  <td className="p-3 font-semibold">{m.team?.name || '—'}</td>
                  <td className="p-3">{m.home ? 'Thuis' : 'Uit'}</td>
                  <td className="p-3">{m.opponent || '—'}</td>
                  <td className="p-3">{m.matchNumber || '—'}</td>
                  <td className="p-3">{m.playLevel || '—'}</td>
                  <td className="p-3">{m.matchType || '—'}</td>
                  {isAdmin ? (
                    <td className="p-3 text-right">
                      <button
                        type="button"
                        className="text-xs font-bold uppercase text-red-700"
                        onClick={() => remove(m.id)}
                      >
                        Verwijder
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {isAdmin ? (
        <>
          <form onSubmit={submit} className="vvl-card grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <h2 className="sm:col-span-2 lg:col-span-3 font-heading text-lg font-black uppercase">
              Wedstrijd toevoegen
            </h2>
            <div>
              <label className="vvl-label">Datum</label>
              <input
                type="date"
                className="vvl-input"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="vvl-label">Tijd</label>
              <input
                type="time"
                className="vvl-input"
                value={form.time}
                onChange={(e) => setForm({ ...form, time: e.target.value })}
              />
            </div>
            <div>
              <label className="vvl-label">Team</label>
              <select
                className="vvl-input"
                value={form.teamId}
                onChange={(e) => setForm({ ...form, teamId: e.target.value })}
              >
                <option value="">— Kies team —</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="vvl-label">Tegenstander</label>
              <input
                className="vvl-input"
                value={form.opponent}
                onChange={(e) => setForm({ ...form, opponent: e.target.value })}
                placeholder="Optioneel"
              />
            </div>
            <div>
              <label className="vvl-label">Wedstrijdnummer</label>
              <input
                className="vvl-input"
                value={form.matchNumber}
                onChange={(e) => setForm({ ...form, matchNumber: e.target.value })}
                placeholder="Optioneel"
              />
            </div>
            <div>
              <label className="vvl-label">Spelniveau</label>
              <input
                className="vvl-input"
                value={form.playLevel}
                onChange={(e) => setForm({ ...form, playLevel: e.target.value })}
                placeholder="Optioneel"
              />
            </div>
            <label className="flex items-center gap-2 text-sm font-semibold sm:col-span-2 lg:col-span-3">
              <input
                type="checkbox"
                checked={form.home}
                onChange={(e) => setForm({ ...form, home: e.target.checked })}
              />
              Thuiswedstrijd
            </label>
            <button type="submit" className="vvl-btn-primary sm:w-fit">
              Wedstrijd opslaan
            </button>
          </form>

          <CsvMatchImport onImported={load} />
        </>
      ) : null}
    </div>
  );
}
