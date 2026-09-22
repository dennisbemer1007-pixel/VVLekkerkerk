import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import DienstCard from '../components/DienstCard.jsx';
import FilterChips from '../components/FilterChips.jsx';
import { PageTitle } from '../components/PageHelp.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../hooks/useApi.js';
import { PAGE_HELP } from '../utils/pageHelp.js';

export default function Inschrijven() {
  const { personId, user } = useAuth();
  const [searchParams] = useSearchParams();
  const initialFilter = searchParams.get('filter') ?? '';
  const [filter, setFilter] = useState(initialFilter);
  const [services, setServices] = useState([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [openId, setOpenId] = useState(null);
  const [exportBusy, setExportBusy] = useState(false);

  const load = useCallback(() => {
    const params = { filter: filter || undefined };
    if (filter === 'mine' && personId) params.personId = personId;
    return api
      .getServices(params)
      .then(setServices)
      .catch((e) => setError(e.message));
  }, [filter, personId]);

  useEffect(() => {
    const q = searchParams.get('filter');
    if (q === 'mine') setFilter('mine');
    else if (q !== null && q !== '') setFilter('');
  }, [searchParams]);

  useEffect(() => {
    if (filter && filter !== 'mine' && filter !== '') setFilter('');
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const handleInschrijven = async (serviceId, mode) => {
    if (mode === 'expand') {
      setOpenId((id) => (id === serviceId ? null : serviceId));
      return;
    }
    setMsg('');
    setError('');
    try {
      await api.createEnrollment({ serviceId, personId });
      setMsg('Je bent ingeschreven. Bedankt!');
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleUitschrijven = async (enrollmentId) => {
    setMsg('');
    try {
      await api.deleteEnrollment(enrollmentId);
      setMsg('Je bent uitgeschreven.');
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const downloadData = async () => {
    setExportBusy(true);
    setError('');
    try {
      const blob = await api.downloadMyDataExcel();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'vvl-mijn-gegevens.xlsx';
      a.click();
      URL.revokeObjectURL(url);
      setMsg('Je gegevens zijn gedownload als Excel-bestand.');
    } catch (e) {
      setError(e.message);
    } finally {
      setExportBusy(false);
    }
  };

  const grouped = useMemo(() => {
    const list =
      filter === 'open'
        ? services.filter((s) => (s.capacity?.personalOpen ?? Math.max(0, (s.required ?? 0) - (s.enrolled ?? 0))) > 0)
        : services;
    const map = new Map();
    for (const s of list) {
      const key = new Date(s.date).toLocaleDateString('nl-NL', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      });
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(s);
    }
    return [...map.entries()];
  }, [services, filter]);

  return (
    <div className="space-y-6">
      <header>
        <PageTitle {...PAGE_HELP.inschrijven}>Inschrijven</PageTitle>
        <p className="mt-1 text-sm text-gray-700">
          Ingelogd als <strong>{user?.name}</strong>. Standaard zie je alle komende diensten —
          ook die waarop je al staat. Klik op een regel voor de namen, of schrijf je direct in.
        </p>
      </header>

      <FilterChips value={filter} onChange={setFilter} showMine />

      {msg ? (
        <p className="rounded-sm border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">{msg}</p>
      ) : null}
      {error ? (
        <p className="rounded-sm border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>
      ) : null}

      {grouped.length === 0 ? (
        <p className="vvl-card text-sm text-gray-600">Geen diensten gevonden voor dit filter.</p>
      ) : (
        <div className="space-y-5">
          {grouped.map(([day, list]) => (
            <section key={day} className="space-y-2">
              <h2 className="font-heading text-sm font-black uppercase text-vvl-accent">{day}</h2>
              {list.map((s) =>
                openId === s.id ? (
                  <DienstCard
                    key={s.id}
                    dienst={s}
                    myPersonId={personId}
                    showActions
                    onInschrijven={handleInschrijven}
                    onUitschrijven={handleUitschrijven}
                  />
                ) : (
                  <DienstCard
                    key={s.id}
                    dienst={s}
                    myPersonId={personId}
                    showActions
                    compact
                    onInschrijven={handleInschrijven}
                    onUitschrijven={handleUitschrijven}
                  />
                ),
              )}
            </section>
          ))}
        </div>
      )}

      <section className="vvl-card space-y-2">
        <h2 className="font-heading text-lg font-black uppercase">Jouw gegevens</h2>
        <p className="text-sm text-gray-700">
          Download een kopie van je account en inschrijvingen (AVG). Het bestand open je in Excel;
          geen JSON.
        </p>
        <button type="button" className="vvl-btn-outline text-xs" disabled={exportBusy} onClick={downloadData}>
          {exportBusy ? 'Laden…' : 'Gegevens downloaden (Excel)'}
        </button>
      </section>
    </div>
  );
}
