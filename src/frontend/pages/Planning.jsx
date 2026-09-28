import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import DienstCard from '../components/DienstCard.jsx';
import ListFilters from '../components/ListFilters.jsx';
import MasterDetail from '../components/MasterDetail.jsx';
import ServiceLine, { openSpots } from '../components/ServiceLine.jsx';
import VoorWieDialog from '../components/VoorWieDialog.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../hooks/useApi.js';
import { needsVoorWiePopup, voorWieChoices } from '../utils/voorWie.js';
import { serviceTileStatus, tileGroups } from '../utils/tiles.js';

function serviceStatus(s) {
  return serviceTileStatus(s);
}

export default function Planning({ variant = 'rooster' }) {
  const { personId, can, user } = useAuth();
  const [filter, setFilter] = useState('');
  const [services, setServices] = useState([]);
  const [period, setPeriod] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [round, setRound] = useState(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [excelBusy, setExcelBusy] = useState(false);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [listFilters, setListFilters] = useState({ person: '', from: '', to: '' });
  const [kind, setKind] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [onlyNoShow, setOnlyNoShow] = useState(false);
  const [people, setPeople] = useState([]);
  const [seasonCounts, setSeasonCounts] = useState({});
  const [assignQuery, setAssignQuery] = useState('');
  const cleared = useRef(false);
  const [selectedId, setSelectedId] = useState(null);
  const [children, setChildren] = useState([]);
  const [pendingId, setPendingId] = useState(null);
  const [weekServices, setWeekServices] = useState([]);
  const isCommittee = can('beheer');
  const choices = useMemo(() => voorWieChoices(user, children), [user, children]);

  const load = useCallback(() => {
    const params = {};
    if (variant !== 'open' && filter) params.filter = filter;
    if (kind) params.type = kind;
    if (filter === 'mine' && personId) params.personId = personId;
    if (listFilters.from) params.from = listFilters.from;
    if (listFilters.to) params.to = listFilters.to;
    if (listFilters.person.trim()) params.q = listFilters.person.trim();
    return api
      .getPlanning(params)
      .then((data) => {
        setServices(data.services ?? []);
        setPeriod(data.period ?? null);
      })
      .catch((e) => setError(e.message));
  }, [filter, personId, listFilters, variant, kind]);

  useEffect(() => {
    if (!isCommittee) return;
    api.getMyChildren().then(setChildren).catch(() => setChildren([]));
  }, [isCommittee]);

  useEffect(() => {
    api.getPlanningRound().then(setRound).catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (variant !== 'open') return undefined;
    const params = { filter: 'week' };
    if (kind) params.type = kind;
    api
      .getPlanning(params)
      .then((data) => setWeekServices(data.services || []))
      .catch(() => setWeekServices([]));
    return undefined;
  }, [variant, kind]);

  useEffect(() => {
    if (variant !== 'open' || !isCommittee) return undefined;
    api.getPersons(true).then(setPeople).catch(() => setPeople([]));
    api
      .getStats()
      .then((stats) => {
        const map = {};
        for (const row of stats?.dutyStats || []) map[row.id] = row.barThisSeason ?? row.barThisYear ?? 0;
        setSeasonCounts(map);
      })
      .catch(() => setSeasonCounts({}));
    return undefined;
  }, [variant, isCommittee]);

  const downloadPdf = async () => {
    setPdfBusy(true);
    setError('');
    try {
      // Komende 6 weken, actieve diensten — gelijk aan het planningsbeeld
      const from = new Date();
      from.setHours(0, 0, 0, 0);
      const to = new Date(from);
      to.setDate(to.getDate() + 6 * 7 - 1);
      to.setHours(23, 59, 59, 999);
      const blob = await api.downloadPlanningPdf({
        from: from.toISOString().slice(0, 10),
        to: to.toISOString().slice(0, 10),
        weeks: 6,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'vvl-rooster.pdf';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e.message);
    } finally {
      setPdfBusy(false);
    }
  };

  const downloadExcel = async () => {
    setExcelBusy(true);
    setError('');
    try {
      const params = period ? { from: period.from, to: period.to } : {};
      const blob = await api.downloadPlanningExcel(params);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'vvl-planning.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e.message);
    } finally {
      setExcelBusy(false);
    }
  };

  const updateFromMatches = async () => {
    setUpdateBusy(true);
    setError('');
    setMsg('');
    try {
      const res = await api.syncPlanningFromMatches();
      const parts = [];
      if (res.created) parts.push(`${res.created} dienst(en) toegevoegd`);
      if (res.updated) parts.push(`${res.updated} bijgewerkt`);
      if (res.removed) parts.push(`${res.removed} lege auto-dienst(en) verwijderd`);
      setMsg(
        parts.length
          ? `Planning bijgewerkt: ${parts.join(', ')}.`
          : 'Planning is al actueel volgens de dienstregels.',
      );
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setUpdateBusy(false);
    }
  };

  const enrollAs = async (serviceId, targetId) => {
    setError('');
    setMsg('');
    try {
      await api.createEnrollment({
        serviceId,
        personId: targetId,
        ignoreMatchBlock: isCommittee,
      });
      const who = children.find((c) => c.id === targetId);
      setMsg(who ? `${who.name} staat ingeschreven.` : `${user?.name || 'Je'} staat ingeschreven.`);
      await load();
    } catch (e) {
      if (e.code === 'MATCH_BLOCK' && isCommittee) {
        if (window.confirm(`${e.message} Toch inschrijven?`)) {
          try {
            await api.createEnrollment({
              serviceId,
              personId: targetId,
              ignoreMatchBlock: true,
            });
            setMsg(`${user?.name || 'Je'} staat ingeschreven.`);
            await load();
            return;
          } catch (err) {
            setError(err.message);
            return;
          }
        }
      }
      setError(e.message);
    }
  };

  const handleInschrijven = async (serviceId, mode) => {
    if (mode === 'expand') {
      setSelectedId(serviceId);
      return;
    }
    if (needsVoorWiePopup(choices)) {
      setPendingId(serviceId);
      setSelectedId(serviceId);
      return;
    }
    await enrollAs(serviceId, personId);
  };

  const handleUitschrijven = async (enrollmentId) => {
    setError('');
    setMsg('');
    try {
      await api.deleteEnrollment(enrollmentId);
      setMsg('Uitschrijving opgeslagen.');
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const groups = useMemo(() => tileGroups(services), [services]);

  const shown = useMemo(() => {
    return services.filter((s) => {
      if (variant === 'open') {
        if (statusFilter) return serviceStatus(s) === statusFilter;
        return serviceStatus(s) !== 'full';
      }
      if (statusFilter && serviceStatus(s) !== statusFilter) return false;
      if (onlyNoShow && !(s.enrollments || []).some((e) => e.noShow)) return false;
      return true;
    });
  }, [services, statusFilter, onlyNoShow, variant]);

  const counts = {
    full: groups.full.length,
    almost: groups.almost.length,
    open: groups.open.length,
  };

  const toggleTile = (key) => {
    cleared.current = false;
    setStatusFilter((current) => (current === key ? '' : key));
  };

  useEffect(() => {
    if (!shown.length) return;
    if (selectedId && shown.some((s) => s.id === selectedId)) return;
    if (cleared.current) return;
    setSelectedId(shown[0].id);
  }, [shown, selectedId]);

  const pick = (id) => {
    cleared.current = false;
    setSelectedId(id);
    setAssignQuery('');
  };

  const showPast = () => {
    const to = new Date();
    to.setDate(to.getDate() - 1);
    const from = new Date();
    from.setDate(from.getDate() - 42);
    const iso = (d) => d.toISOString().slice(0, 10);
    setListFilters((prev) => ({ ...prev, from: iso(from), to: iso(to) }));
    setOnlyNoShow(false);
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-heading text-xl font-black uppercase">{variant === 'open' ? 'Open' : 'Rooster'}</h1>
          {period ? (
            <p className="text-sm font-semibold text-gray-800">
              {period.from} t/m {period.to}
              {round?.official ? ' · officieel' : ''}
            </p>
          ) : null}
        </div>
        {variant === 'rooster' ? (
          <p className="text-sm font-semibold">
            Vol {counts.full} · Nog 1 {counts.almost} · Open {counts.open}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {isCommittee && variant === 'rooster' ? (
            <button
              type="button"
              className="vvl-btn-outline min-h-[44px] text-center"
              disabled={updateBusy}
              onClick={updateFromMatches}
            >
              {updateBusy ? 'Bijwerken…' : 'Diensten bijwerken'}
            </button>
          ) : null}
          {isCommittee && variant === 'rooster' ? (
            <Link to="/beheer?tab=diensten" className="vvl-btn-outline inline-flex min-h-[44px] items-center">
              + Dienst
            </Link>
          ) : null}
          {variant === 'rooster' ? (
            <>
              <button
                type="button"
                className="vvl-btn-outline min-h-[44px] text-center"
                disabled={excelBusy}
                onClick={downloadExcel}
              >
                {excelBusy ? 'Excel laden…' : 'Excel'}
              </button>
              <button
                type="button"
                className="vvl-btn-primary min-h-[44px] text-center"
                disabled={pdfBusy}
                onClick={downloadPdf}
              >
                {pdfBusy ? 'PDF laden…' : 'PDF rooster'}
              </button>
            </>
          ) : null}
        </div>
      </header>

      {variant === 'open' ? (
        <WeekTiles
          weekServices={weekServices}
          counts={counts}
          active={statusFilter}
          onToggle={toggleTile}
          onOpen={(service) => {
            const status = serviceStatus(service);
            if (status === 'full' || (statusFilter && statusFilter !== status)) setStatusFilter(status);
            pick(service.id);
          }}
        />
      ) : null}

      <ListFilters {...listFilters} onChange={setListFilters}>
        {variant === 'open' ? (
          <label className="block min-w-0">
            <span className="vvl-label">Soort</span>
            <select className="vvl-input" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Soort">
              <option value="">Alle</option>
              <option value="BAR">Bar</option>
              <option value="KITCHEN">Keuken</option>
            </select>
          </label>
        ) : (
          <label className="block min-w-0">
            <span className="vvl-label">Status</span>
            <select className="vvl-input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Status">
              <option value="">Alle</option>
              <option value="open">Open</option>
              <option value="almost">Nog 1</option>
              <option value="full">Vol</option>
            </select>
          </label>
        )}
      </ListFilters>
      {variant === 'rooster' ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="vvl-btn-outline text-xs" onClick={showPast}>
            Voorbije diensten
          </button>
          <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
            <input type="checkbox" className="h-5 w-5" checked={onlyNoShow} onChange={(e) => setOnlyNoShow(e.target.checked)} />
            No-show
          </label>
        </div>
      ) : null}

      {msg ? (
        <p className="rounded-sm border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
          {msg}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-sm border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>
      ) : null}

      <MasterDetail
        selected={selectedId}
        onBack={() => {
          cleared.current = true;
          setSelectedId(null);
        }}
        emptyDetail="Kies een dienst."
        list={
          shown.length === 0 ? (
            <p className="vvl-card text-sm text-gray-600">Geen diensten in deze periode.</p>
          ) : (
            <ul className="space-y-2">
              {shown.map((s) => (
                <li key={s.id}>
                  <ServiceLine
                    service={s}
                    selected={selectedId === s.id}
                    onSelect={() => pick(s.id)}
                    actionLabel={variant === 'open' ? 'Wijs toe' : undefined}
                    onAction={() => pick(s.id)}
                  />
                </li>
              ))}
            </ul>
          )
        }
        detail={shown
          .filter((s) => s.id === selectedId)
          .map((s) =>
            variant === 'open' ? (
              <AssignPanel
                key={s.id}
                service={s}
                people={people}
                seasonCounts={seasonCounts}
                query={assignQuery}
                onQuery={setAssignQuery}
                busy={false}
                onAssign={(person) => enrollAs(s.id, person)}
                onRemove={handleUitschrijven}
              />
            ) : (
              <DienstCard
                key={s.id}
                dienst={s}
                myPersonId={personId}
                showActions={isCommittee}
                committeeOverride={isCommittee}
                onInschrijven={isCommittee ? handleInschrijven : undefined}
                onUitschrijven={isCommittee ? handleUitschrijven : undefined}
              />
            ),
          )}
      />
      <VoorWieDialog
        open={Boolean(pendingId)}
        choices={choices}
        onClose={() => setPendingId(null)}
        onChoose={async (choice) => {
          const id = pendingId;
          setPendingId(null);
          await enrollAs(id, choice.id);
        }}
      />
    </div>
  );
}

const TILES = [
  { key: 'full', label: 'Vol', border: 'border-l-emerald-500' },
  { key: 'almost', label: 'Nog 1 nodig', border: 'border-l-amber-500' },
  { key: 'open', label: 'Open', border: 'border-l-red-500' },
];

function weekStatusLabel(status) {
  if (status === 'full') return 'Vol';
  if (status === 'almost') return 'Nog 1';
  return 'Open';
}

function WeekTiles({ weekServices, counts, active, onToggle, onOpen }) {
  return (
    <section className="space-y-2" data-testid="deze-week">
      <h2 className="text-xs font-bold uppercase tracking-wide text-vvl-accent">Deze week</h2>
      {weekServices.length === 0 ? (
        <p className="text-sm text-gray-600">Geen diensten deze week.</p>
      ) : (
        <ul className="max-h-32 divide-y divide-vvl-border overflow-y-auto rounded-sm border border-vvl-border bg-white">
          {weekServices.map((service) => {
            const status = serviceStatus(service);
            const when = new Date(service.date).toLocaleDateString('nl-NL', {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
            });
            const type = service.type === 'KITCHEN' ? 'Keuken' : 'Bar';
            return (
              <li key={service.id}>
                <button
                  type="button"
                  className="flex min-h-11 w-full items-center justify-between gap-2 px-3 text-left text-sm"
                  onClick={() => onOpen(service)}
                >
                  <span className="min-w-0 truncate">
                    {when} · {service.time} · {type}
                  </span>
                  <span className="shrink-0 text-xs font-bold uppercase">{weekStatusLabel(status)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="grid grid-cols-3 gap-2">
        {TILES.map((tile) => (
          <button
            key={tile.key}
            type="button"
            data-testid={`tegel-${tile.key}`}
            aria-pressed={active === tile.key}
            onClick={() => onToggle(tile.key)}
            className={`flex min-h-11 items-center justify-between gap-1 rounded-sm border border-vvl-border border-l-4 bg-white px-2 text-left ${tile.border} ${
              active === tile.key ? 'ring-2 ring-black' : ''
            }`}
          >
            <span className="text-[11px] font-bold uppercase leading-tight">{tile.label}</span>
            <span className="text-lg font-black leading-none">{counts[tile.key]}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function AssignPanel({ service, people, seasonCounts, query, onQuery, onAssign, onRemove }) {
  const enrolledIds = new Set((service.enrollments || []).map((e) => e.personId));
  const q = query.trim().toLowerCase();
  const options = (people || [])
    .filter((p) => p.active !== false && !enrolledIds.has(p.id))
    .filter((p) => !q || p.name.toLowerCase().includes(q))
    .slice(0, 8);
  const type = service.type === 'KITCHEN' ? 'Keuken' : 'Bar';
  const when = new Date(service.date).toLocaleDateString('nl-NL', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  return (
    <div className="vvl-card space-y-3">
      <header>
        <h2 className="font-heading text-lg font-black uppercase">Toewijzen</h2>
        <p className="text-sm text-gray-700">
          {when} · {service.time} · {type} · nog {openSpots(service)}
        </p>
      </header>
      {(service.enrollments || []).length ? (
        <ul className="space-y-1 text-sm">
          {service.enrollments.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-2">
              <span>{e.person?.name || '—'}</span>
              <button type="button" className="vvl-btn-outline px-3 text-xs" onClick={() => onRemove(e.id)}>
                Eruit
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-600">Nog niemand ingeschreven.</p>
      )}
      <label className="block">
        <span className="vvl-label">Zoek persoon</span>
        <input className="vvl-input" value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Naam" />
      </label>
      <ul className="space-y-2">
        {options.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate text-sm">
              {p.name}{' '}
              <span className="text-gray-500">{seasonCounts[p.id] ?? 0}× dit seizoen</span>
            </span>
            <button type="button" className="vvl-btn-primary shrink-0 px-3 text-xs" onClick={() => onAssign(p.id)}>
              Zet {p.name.split(' ')[0]}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
