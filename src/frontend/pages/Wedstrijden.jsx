import { useEffect, useMemo, useState } from 'react';
import BeheerNavButtons from '../components/BeheerNavButtons.jsx';
import CsvMatchImport from '../components/CsvMatchImport.jsx';
import NlDateInput from '../components/NlDateInput.jsx';
import DesktopOnly from '../components/DesktopOnly.jsx';
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

const emptyForm = {
  date: todayInputValue(),
  time: '',
  home: true,
  opponent: '',
  note: '',
  teamId: '',
};

export default function Wedstrijden() {
  const { can } = useAuth();
  const isAdmin = can('beheer');
  const [matches, setMatches] = useState([]);
  const [teams, setTeams] = useState([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [filters, setFilters] = useState({
    team: '',
    from: '',
    to: '',
  });

  const load = () => {
    const params = {};
    if (filters.from) params.from = filters.from;
    if (filters.to) params.to = filters.to;
    return Promise.all([api.getMatches(params), api.getTeams()])
      .then(([m, t]) => {
        setMatches(m);
        setTeams(t);
      })
      .catch((e) => setError(e.message));
  };

  useEffect(() => {
    load();
  }, [filters.from, filters.to]);

  const filtered = useMemo(() => {
    return matches.filter((m) => {
      if (!showAll && !isFutureMatchDate(m.date)) return false;
      if (filters.from || filters.to) {
        const day = toDateInputValue(m.date);
        if (filters.from && day < filters.from) return false;
        if (filters.to && day > filters.to) return false;
      }
      if (filters.team) {
        const teamId = String(m.teamId ?? m.team?.id ?? '');
        if (teamId !== String(filters.team)) return false;
      }
      return true;
    });
  }, [matches, filters, showAll]);

  const closeForm = () => {
    setFormOpen(false);
    setEditId(null);
    setForm({ ...emptyForm, date: todayInputValue() });
  };

  const openAdd = () => {
    setEditId(null);
    setForm({ ...emptyForm, date: todayInputValue() });
    setFormOpen(true);
  };

  const openEdit = (m) => {
    setEditId(m.id);
    setForm({
      date: toDateInputValue(m.date),
      time: m.time || '',
      home: Boolean(m.home),
      opponent: m.opponent || '',
      note: m.note || '',
      teamId: m.teamId ? String(m.teamId) : m.team?.id ? String(m.team.id) : '',
    });
    setFormOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setMsg('');
    try {
      const payload = {
        ...form,
        teamId: form.teamId || null,
        time: form.time || null,
      };
      if (editId) {
        await api.updateMatch(editId, payload);
        setMsg('Wedstrijd bijgewerkt.');
      } else {
        const created = await api.createMatch(payload);
        setMsg(
          created?.planningCreated
            ? 'Wedstrijd opgeslagen. De bardienst voor dit dagdeel staat in de planning.'
            : 'Wedstrijd opgeslagen.',
        );
      }
      closeForm();
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
      {isAdmin ? <BeheerNavButtons /> : null}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <PageTitle {...PAGE_HELP.wedstrijden}>Wedstrijden</PageTitle>
          <p className="mt-1 text-sm text-gray-700">
            Overzicht van alle clubwedstrijden. Standaard zie je alleen komende wedstrijden.
          </p>
        </div>
        {isAdmin ? (
          <button type="button" className="vvl-btn-primary min-h-11" onClick={openAdd}>
            + Wedstrijd
          </button>
        ) : null}
      </header>

      <div className="vvl-card space-y-4">
        <p className="text-sm text-gray-700">Filter op team en periode. Standaard alleen komende wedstrijden.</p>
        <div className="grid gap-3 sm:grid-cols-3">
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
            <label className="vvl-label">Van</label>
            <NlDateInput value={filters.from} onChange={(next) => setFilters({ ...filters, from: next })} ariaLabel="Periode van" />
          </div>
          <div>
            <label className="vvl-label">Tot</label>
            <NlDateInput value={filters.to} onChange={(next) => setFilters({ ...filters, to: next })} ariaLabel="Periode tot" />
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

      <ul className="space-y-2 md:hidden">
        {filtered.map((m) => (
          <li key={m.id} className="vvl-card text-sm">
            <p className="font-semibold">
              {formatMatchDate(m.date)} · {m.team?.name || '—'}
            </p>
            <p>
              {m.time || '—'} · {m.home ? 'Thuis' : 'Uit'} vs {m.opponent || '—'}
            </p>
            {isAdmin ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {isFutureMatchDate(m.date) ? (
                  <button type="button" className="vvl-btn-outline text-xs" onClick={() => openEdit(m)}>
                    Bewerk
                  </button>
                ) : null}
                <button type="button" className="vvl-btn-outline text-xs" onClick={() => remove(m.id)}>
                  Verwijder
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="vvl-card hidden p-0 md:block">
        <table className="w-full text-sm">
          <thead className="bg-vvl-secondary text-xs font-bold uppercase">
            <tr>
              <th className="p-3 text-left">Datum</th>
              <th className="p-3 text-left">Tijd</th>
              <th className="p-3 text-left">Team</th>
              <th className="p-3 text-left">Thuis/uit</th>
              <th className="p-3 text-left">Tegenstander</th>
              <th className="p-3 text-left">Type</th>
              {isAdmin ? <th className="p-3 text-right">Actie</th> : null}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td className="p-4 text-sm text-gray-600" colSpan={isAdmin ? 7 : 6}>
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
                  <td className="p-3">{m.matchType || '—'}</td>
                  {isAdmin ? (
                    <td className="p-3 text-right">
                      <div className="flex justify-end gap-2">
                        {isFutureMatchDate(m.date) ? (
                          <button type="button" className="vvl-btn-outline px-3 text-xs" onClick={() => openEdit(m)}>
                            Bewerk
                          </button>
                        ) : null}
                        <button type="button" className="vvl-btn-outline px-3 text-xs" onClick={() => remove(m.id)}>
                          Verwijder
                        </button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {isAdmin && formOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label={editId ? 'Wedstrijd bewerken' : 'Wedstrijd toevoegen'}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeForm();
          }}
        >
          <div className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-sm bg-white p-4 shadow-lg">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="font-heading text-lg font-black uppercase">
                {editId ? 'Wedstrijd bewerken' : 'Wedstrijd toevoegen'}
              </h2>
              <button type="button" className="vvl-btn-outline text-xs" onClick={closeForm}>
                Sluiten
              </button>
            </div>
            <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
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
              <div className="sm:col-span-2">
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
              <div className="sm:col-span-2">
                <label className="vvl-label">Tegenstander</label>
                <input
                  className="vvl-input"
                  value={form.opponent}
                  onChange={(e) => setForm({ ...form, opponent: e.target.value })}
                  placeholder="Optioneel"
                />
              </div>
              <label className="flex items-center gap-2 text-sm font-semibold sm:col-span-2">
                <input
                  type="checkbox"
                  checked={form.home}
                  onChange={(e) => setForm({ ...form, home: e.target.checked })}
                />
                Thuiswedstrijd
              </label>
              <div className="flex flex-wrap gap-2 sm:col-span-2">
                <button type="submit" className="vvl-btn-primary min-h-[44px]">
                  {editId ? 'Opslaan' : 'Wedstrijd opslaan'}
                </button>
                <button type="button" className="vvl-btn-outline min-h-[44px]" onClick={closeForm}>
                  Annuleren
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {isAdmin ? (
        <DesktopOnly>
          <CsvMatchImport onImported={load} />
        </DesktopOnly>
      ) : null}
    </div>
  );
}
