import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import DienstCard from '../components/DienstCard.jsx';
import DownloadPlanningButtons from '../components/DownloadPlanningButtons.jsx';
import ListFilters from '../components/ListFilters.jsx';
import MasterDetail from '../components/MasterDetail.jsx';
import PlanningRoundSwitcher from '../components/PlanningRoundSwitcher.jsx';
import ServiceLine from '../components/ServiceLine.jsx';
import VoorWieDialog from '../components/VoorWieDialog.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../hooks/useApi.js';
import { needsVoorWiePopup, voorWieChoices } from '../utils/voorWie.js';
import { serviceTileStatus, tileGroups } from '../utils/tiles.js';
import { compareServicesByDateThenTime } from '../utils/formatDate.js';

function serviceStatus(s) {
  return serviceTileStatus(s);
}

export default function Planning({ variant = 'rooster' }) {
  const { personId, can, user } = useAuth();
  const [searchParams] = useSearchParams();
  const [filter, setFilter] = useState('');
  const [services, setServices] = useState([]);
  const [period, setPeriod] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [round, setRound] = useState(null);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [listFilters, setListFilters] = useState({ person: '', from: '', to: '' });
  const [kind, setKind] = useState('');
  const statusFromUrl = searchParams.get('status');
  const [statusFilter, setStatusFilter] = useState(
    statusFromUrl === 'full' || statusFromUrl === 'almost' || statusFromUrl === 'open' ? statusFromUrl : '',
  );
  const [onlyNoShow, setOnlyNoShow] = useState(false);
  const [people, setPeople] = useState([]);
  const [seasonCounts, setSeasonCounts] = useState({});
  const [assignQuery, setAssignQuery] = useState('');
  const cleared = useRef(false);
  const [selectedId, setSelectedId] = useState(null);
  const [children, setChildren] = useState([]);
  const [pendingId, setPendingId] = useState(null);
  const [mineOnly, setMineOnly] = useState(false);
  const [showAllRooster, setShowAllRooster] = useState(false);
  const detailTopRef = useRef(null);
  const isCommittee = can('beheer');
  const choices = useMemo(() => voorWieChoices(user, children), [user, children]);
  const roosterFiltered = Boolean(
    showAllRooster ||
      statusFilter ||
      mineOnly ||
      onlyNoShow ||
      listFilters.person.trim() ||
      listFilters.from ||
      listFilters.to,
  );

  const load = useCallback(() => {
    const params = {};
    // Dashboard/Open: geen “deze week”-blok meer; toon de actieve planningperiode.
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

  const loadRound = useCallback(() => {
    api.getPlanningRound().then(setRound).catch(() => {});
  }, []);

  useEffect(() => {
    loadRound();
  }, [loadRound]);

  useEffect(() => {
    load();
  }, [load]);

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

  useEffect(() => {
    const status = searchParams.get('status');
    if (status === 'full' || status === 'almost' || status === 'open') {
      setShowAllRooster(false);
      setStatusFilter(status);
    }
  }, [searchParams]);

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

  const enrollAs = async (serviceId, targetId, { assignTeamSpot = false } = {}) => {
    setError('');
    setMsg('');
    try {
      await api.createEnrollment({
        serviceId,
        personId: targetId,
        ignoreMatchBlock: isCommittee,
        assignTeamSpot: Boolean(assignTeamSpot && isCommittee),
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
              assignTeamSpot: Boolean(assignTeamSpot && isCommittee),
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
    return services
      .filter((s) => {
      if (s.active === false) return false;
      if (variant === 'open') {
        if (statusFilter) return serviceStatus(s) === statusFilter;
        return true;
      }
      if (mineOnly && !(s.enrollments || []).some((e) => Number(e.personId) === Number(personId))) return false;
      if (statusFilter && serviceStatus(s) !== statusFilter) return false;
      if (onlyNoShow && !(s.enrollments || []).some((e) => e.noShow)) return false;
      return true;
    })
      .sort(compareServicesByDateThenTime);
  }, [services, statusFilter, onlyNoShow, variant, mineOnly, personId]);

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
    // Zonder filter blijft het rooster leeg, ook op de telefoon (daar verbergt een
    // geselecteerde dienst de lijst, inclusief de tekst “Kies een filter”).
    if (variant === 'rooster' && !roosterFiltered) {
      if (selectedId != null) setSelectedId(null);
      return;
    }
    if (!shown.length) return;
    if (selectedId && shown.some((s) => s.id === selectedId)) return;
    if (cleared.current) return;
    setSelectedId(shown[0].id);
  }, [shown, selectedId, variant, roosterFiltered]);

  const pick = (id) => {
    cleared.current = false;
    setSelectedId(id);
    setAssignQuery('');
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      detailTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
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

  const reloadPlanningContext = () => {
    loadRound();
    load();
  };

  return (
    <div className="space-y-4" ref={detailTopRef}>
      {round?.label ? (
        <p className="text-xs font-bold uppercase text-vvl-accent">
          Periode: {round.label}
          {period?.from && period?.to ? ` · ${period.from} t/m ${period.to}` : ''}
        </p>
      ) : null}
      {isCommittee ? (
        <PlanningRoundSwitcher onActivated={reloadPlanningContext} />
      ) : null}
      {variant === 'open' ? (
        <p className="text-sm text-gray-700">
          Open plekken en aandachtspunten in de actieve planningperiode.
        </p>
      ) : null}
      {variant === 'rooster' ? (
        <div className="flex flex-wrap gap-2">
          {isCommittee ? (
            <button
              type="button"
              className="vvl-btn-outline min-h-[44px] text-center"
              disabled={updateBusy}
              onClick={updateFromMatches}
            >
              {updateBusy ? 'Bijwerken…' : 'Diensten bijwerken'}
            </button>
          ) : null}
          <DownloadPlanningButtons period={period} />
        </div>
      ) : null}

      {variant === 'open' ? (
        <ListFilters {...listFilters} onChange={setListFilters} hidePerson>
          <label className="block min-w-0">
            <span className="vvl-label">Soort</span>
            <select className="vvl-input" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Soort">
              <option value="">Alle</option>
              <option value="BAR">Bar</option>
              <option value="KITCHEN">Keuken</option>
            </select>
          </label>
        </ListFilters>
      ) : (
        <>
          <ListFilters
            {...listFilters}
            onChange={(next) => {
              setShowAllRooster(false);
              setListFilters(next);
            }}
          >
            <label className="block min-w-0">
              <span className="vvl-label">Status</span>
              <select
                className="vvl-input"
                value={statusFilter}
                onChange={(e) => {
                  setShowAllRooster(false);
                  setStatusFilter(e.target.value);
                }}
                aria-label="Status"
              >
                <option value="">—</option>
                <option value="open">Open</option>
                <option value="almost">Nog 1</option>
                <option value="full">Vol</option>
              </select>
            </label>
          </ListFilters>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={showAllRooster ? 'vvl-btn-primary text-xs' : 'vvl-btn-outline text-xs'}
              onClick={() => {
                setShowAllRooster(true);
                setStatusFilter('');
                setMineOnly(false);
                setOnlyNoShow(false);
                setListFilters({ person: '', from: '', to: '' });
              }}
            >
              Alles tonen
            </button>
            <button
              type="button"
              className={mineOnly ? 'vvl-btn-primary text-xs' : 'vvl-btn-outline text-xs'}
              onClick={() => {
                setShowAllRooster(false);
                setMineOnly((value) => !value);
              }}
            >
              {mineOnly ? 'Alle diensten' : 'Mijn diensten'}
            </button>
            <button
              type="button"
              className="vvl-btn-outline text-xs"
              onClick={() => {
                setShowAllRooster(false);
                showPast();
              }}
            >
              Voorbije diensten
            </button>
            <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={onlyNoShow}
                onChange={(e) => {
                  setShowAllRooster(false);
                  setOnlyNoShow(e.target.checked);
                }}
              />
              No-show
            </label>
          </div>
        </>
      )}

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
          variant === 'rooster' && !roosterFiltered ? (
            <p className="vvl-card text-sm text-gray-600">Kies een filter of klik Alles tonen.</p>
          ) : shown.length === 0 ? (
            <p className="vvl-card text-sm text-gray-600">
              {variant === 'open' ? 'Geen diensten in deze periode.' : 'Geen diensten in deze selectie.'}
            </p>
          ) : (
            <ul className="space-y-2">
              {shown.map((s) => (
                <li key={s.id}>
                  <ServiceLine
                    service={s}
                    selected={selectedId === s.id}
                    onSelect={() => pick(s.id)}
                    actionLabel={variant === 'open' ? 'Vrijwilliger kiezen' : undefined}
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
                onAssign={(personId, opts) => enrollAs(s.id, personId, opts)}
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

function WeekTiles({ counts, active, onToggle }) {
  return (
    <section className="space-y-2" data-testid="deze-week" aria-label="Overzicht deze week">
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
  const capacity = service.capacity;
  const teamOnlyLeft = Boolean(capacity) && capacity.personalOpen <= 0 && capacity.teamOpen > 0;
  const enrolledIds = new Set((service.enrollments || []).map((e) => e.personId));
  const q = query.trim().toLowerCase();
  const options =
    q.length < 2
      ? []
      : (people || [])
          .filter((p) => p.active !== false && !enrolledIds.has(p.id))
          .filter((p) => p.name.toLowerCase().includes(q))
          .slice(0, 25);
  const type = service.type === 'KITCHEN' ? 'Keuken' : 'Bar';
  const when = new Date(service.date).toLocaleDateString('nl-NL', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  return (
    <div className="vvl-card space-y-3">
      <header>
        <h2 className="text-xs font-bold uppercase tracking-wide text-vvl-accent">Vrijwilliger kiezen</h2>
        <p className="text-sm font-semibold text-gray-800">
          {when} · {service.time} · {type} · {occupancyFraction(service)}
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
      ) : null}
      {teamOnlyLeft ? (
        <p className="text-sm text-amber-900">
          De open plekken zijn teamplekken. De bardienstcoördinator vult ouders via Team. Als barcommissie kun je hier
          iemand op die teamplek zetten.
        </p>
      ) : null}
      <label className="block">
        <span className="vvl-label">Zoek naam</span>
        <input
          className="vvl-input"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Typ minstens 2 letters"
          autoFocus
        />
      </label>
      {q.length >= 2 ? (
        <ul className="space-y-2">
          {options.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-sm">
                {p.name}{' '}
                <span className="text-gray-500">{seasonCounts[p.id] ?? 0}×</span>
              </span>
              <button
                type="button"
                className="vvl-btn-primary shrink-0 px-3 text-xs"
                onClick={() => onAssign(p.id, { assignTeamSpot: teamOnlyLeft })}
              >
                Zet
              </button>
            </li>
          ))}
          {options.length === 0 ? <li className="text-sm text-gray-600">Geen namen.</li> : null}
        </ul>
      ) : null}
    </div>
  );
}
