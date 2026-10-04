import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import BeheerNavButtons from '../components/BeheerNavButtons.jsx';
import DownloadPlanningButtons from '../components/DownloadPlanningButtons.jsx';
import PlanningRoundSwitcher from '../components/PlanningRoundSwitcher.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../hooks/useApi.js';
import { occupancyStatus } from '../utils/formatDate.js';

const OBLIGATION_SHORT = {
  NONE: 'vrijwillig',
  FULL: 'verplicht',
  VR18: 'VR18+',
};

function serviceStatus(s) {
  return s.status ?? occupancyStatus(s.enrolled ?? s.enrollments?.length ?? 0, s.required ?? 2);
}

export default function Dashboard({ focus = 'week' }) {
  const { can } = useAuth();
  const [stats, setStats] = useState(null);
  const [periodServices, setPeriodServices] = useState([]);
  const [period, setPeriod] = useState(null);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({ person: '' });

  const loadPlanningPeriod = () => {
    if (!can('beheer')) return Promise.resolve();
    return api
      .getPlanning({})
      .then((planning) => {
        setPeriodServices(planning?.services || []);
        setPeriod(planning?.period ?? null);
      })
      .catch((e) => setError(e.message));
  };

  useEffect(() => {
    Promise.all([
      api.getStats(),
      can('beheer') ? api.getPlanning({}) : Promise.resolve({ services: [] }),
    ])
      .then(([s, planning]) => {
        setStats(s);
        setPeriodServices(planning?.services || []);
        setPeriod(planning?.period ?? null);
      })
      .catch((e) => setError(e.message));
  }, [can]);

  useEffect(() => {
    if (focus !== 'aandacht') return undefined;
    const hash = window.location.hash.replace('#', '');
    if (!hash) return undefined;
    const node = document.getElementById(hash);
    node?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return undefined;
  }, [focus, stats]);

  const counts = useMemo(() => {
    const list = periodServices.filter((s) => s.active !== false && !s.draft);
    return {
      full: list.filter((s) => serviceStatus(s) === 'full').length,
      almost: list.filter((s) => serviceStatus(s) === 'almost').length,
      open: list.filter((s) => serviceStatus(s) === 'open').length,
    };
  }, [periodServices]);

  const notSelf = (stats?.notSelfEnrolled || []).filter(
    (p) => p.obligation === 'FULL' || p.obligation === 'VR18',
  );
  const noShows = (stats?.noShowPeople || []).filter(
    (p) => p.obligation === 'FULL' || p.obligation === 'VR18',
  );

  const byQuery = (people) =>
    people.filter((p) => {
      const q = filters.person.trim().toLowerCase();
      if (q && !`${p.name || ''} ${p.team?.name || ''} ${p.teamName || ''}`.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });

  const notSelfList = byQuery(notSelf);
  const noShowList = byQuery(noShows);

  if (focus === 'aandacht') {
    return (
      <div className="space-y-4">
        <BeheerNavButtons />
        <h1 className="font-heading text-xl font-black uppercase">Aandacht</h1>
        <p className="text-sm text-gray-700">
          Verplichte vrijwilligers (1× in deze planningsperiode) en VR18+ (1× per 12 weken) die extra
          aandacht nodig hebben.
        </p>
        {error ? <p className="text-sm text-red-800">{error}</p> : null}
        <label className="block max-w-sm">
          <span className="vvl-label">Naam</span>
          <input
            className="vvl-input"
            value={filters.person}
            onChange={(e) => setFilters({ person: e.target.value })}
            placeholder="Zoek op naam"
          />
        </label>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <AttentionBlock
            id="niet-ingepland"
            title="Niet ingepland"
            text="Verplicht, maar in deze planning nog nergens gezet (niet zelf, niet automatisch, niet door de barcommissie)."
            people={notSelfList}
          />
          <AttentionBlock
            id="no-show"
            title="No-show gehad"
            text="Verplicht en minstens één keer niet komen opdagen."
            people={noShowList}
            showNoShowMeta
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error ? (
        <p className="rounded-sm border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>
      ) : null}

      {can('beheer') ? <PlanningRoundSwitcher onActivated={loadPlanningPeriod} /> : null}

      <div className="flex flex-wrap items-center gap-2">
        <DownloadPlanningButtons period={period} />
      </div>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { key: 'full', label: 'Vol', count: counts.full, border: 'border-l-emerald-500' },
          { key: 'almost', label: 'Nog 1', count: counts.almost, border: 'border-l-amber-500' },
          { key: 'open', label: 'Open', count: counts.open, border: 'border-l-red-500' },
        ].map((tile) => (
          <Link
            key={tile.key}
            to={`/meer?tab=diensten&status=${tile.key}`}
            data-testid={`tegel-${tile.key}`}
            className={`vvl-card flex min-h-[44px] items-center justify-between border-l-4 ${tile.border} text-left transition hover:shadow-md`}
          >
            <span className="font-bold">{tile.label}</span>
            <span className="text-2xl font-black">{tile.count}</span>
          </Link>
        ))}
      </section>

      {can('beheer') ? (
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Link
            to="/aandacht#niet-ingepland"
            data-testid="tegel-niet-ingepland"
            className="vvl-card flex min-h-[44px] items-center justify-between border-l-4 border-l-sky-500 text-left transition hover:shadow-md"
          >
            <span className="font-bold">Niet ingepland</span>
            <span className="text-2xl font-black">{notSelf.length}</span>
          </Link>
          <Link
            to="/aandacht#no-show"
            data-testid="tegel-no-show"
            className="vvl-card flex min-h-[44px] items-center justify-between border-l-4 border-l-rose-500 text-left transition hover:shadow-md"
          >
            <span className="font-bold">No-show gehad</span>
            <span className="text-2xl font-black">{noShows.length}</span>
          </Link>
        </section>
      ) : null}
    </div>
  );
}

function AttentionBlock({ id, title, text, people, showNoShowMeta = false }) {
  return (
    <div className="vvl-card space-y-3" id={id}>
      <h3 className="font-heading text-sm font-black uppercase">{title}</h3>
      {text ? <p className="text-sm text-gray-700">{text}</p> : null}
      <PersonList people={people} showNoShowMeta={showNoShowMeta} />
    </div>
  );
}

function PersonList({ people, showNoShowMeta = false }) {
  return (
    <div>
      {people.length === 0 ? (
        <p className="text-sm text-gray-600">Geen.</p>
      ) : (
        <ul className="divide-y divide-vvl-border">
          {people.map((p) => (
            <li key={p.id} className="flex min-h-[44px] items-center justify-between gap-2 py-2 text-sm">
              <Link to="/mensen" className="font-semibold underline">
                {p.name}
              </Link>
              <span className="text-right text-gray-600">
                {showNoShowMeta && p.noShowCount
                  ? `${p.noShowCount}×${
                      p.lastNoShowDate
                        ? ` · ${new Date(p.lastNoShowDate).toLocaleDateString('nl-NL')}`
                        : ''
                    }`
                  : OBLIGATION_SHORT[p.obligation] || p.role || '—'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
