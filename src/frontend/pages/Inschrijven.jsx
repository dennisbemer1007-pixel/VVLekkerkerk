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
  const [children, setChildren] = useState([]);
  const [childName, setChildName] = useState('');
  const [actAs, setActAs] = useState('');

  const loadChildren = useCallback(() => {
    api.getMyChildren().then(setChildren).catch(() => setChildren([]));
  }, []);

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
    loadChildren();
  }, [load, loadChildren]);

  const handleInschrijven = async (serviceId, mode) => {
    if (mode === 'expand') {
      setOpenId((id) => (id === serviceId ? null : serviceId));
      return;
    }
    setMsg('');
    setError('');
    try {
      const targetId = Number(actAs) || personId;
      await api.createEnrollment({ serviceId, personId: targetId });
      const child = children.find((c) => c.id === targetId);
      setMsg(child ? `${child.name} is ingeschreven.` : 'Je bent ingeschreven. Bedankt!');
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

      <form
        className="vvl-card space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setError('');
          setMsg('');
          try {
            const created = await api.addMyChild({ name: childName });
            setChildName('');
            setActAs(String(created.id));
            setMsg(`${created.name} is toegevoegd. Je kunt dit kind nu inschrijven zonder e-mailadres.`);
            await loadChildren();
          } catch (err) {
            setError(err.message);
          }
        }}
      >
        <h2 className="font-heading text-base font-black uppercase">Kind zonder e-mail</h2>
        <p className="text-sm text-gray-700">
          Een kind hoeft geen eigen account. Jij schrijft het kind in vanuit dit account. Het kind
          komt niet op de personenlijst van de barcommissie.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[220px] flex-1">
            <label className="vvl-label">Naam van het kind</label>
            <input
              className="vvl-input"
              value={childName}
              onChange={(e) => setChildName(e.target.value)}
              placeholder="Voor- en achternaam"
              required
            />
          </div>
          <button type="submit" className="vvl-btn-primary">
            Kind toevoegen
          </button>
        </div>
        {children.length ? (
          <div className="space-y-2">
            <label className="vvl-label">Inschrijven als</label>
            <select className="vvl-input max-w-md" value={actAs} onChange={(e) => setActAs(e.target.value)}>
              <option value="">Mijzelf ({user?.name})</option>
              {children.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <ul className="text-sm">
              {children.map((c) => (
                <li key={c.id} className="flex items-center gap-3">
                  <span>{c.name}</span>
                  <button
                    type="button"
                    className="text-xs font-bold uppercase text-red-800"
                    onClick={async () => {
                      if (!window.confirm(`${c.name} verwijderen?`)) return;
                      setError('');
                      try {
                        await api.deleteMyChild(c.id);
                        if (String(actAs) === String(c.id)) setActAs('');
                        setMsg(`${c.name} is verwijderd.`);
                        await loadChildren();
                        await load();
                      } catch (err) {
                        setError(err.message);
                      }
                    }}
                  >
                    Verwijderen
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </form>

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
                    myPersonId={Number(actAs) || personId}
                    showActions
                    onInschrijven={handleInschrijven}
                    onUitschrijven={handleUitschrijven}
                  />
                ) : (
                  <DienstCard
                    key={s.id}
                    dienst={s}
                    myPersonId={Number(actAs) || personId}
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
