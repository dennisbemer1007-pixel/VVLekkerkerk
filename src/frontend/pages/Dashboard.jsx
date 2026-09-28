import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import StatusBadge from '../components/StatusBadge.jsx';
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

export default function Dashboard() {
  const { can } = useAuth();
  const [stats, setStats] = useState(null);
  const [weekServices, setWeekServices] = useState([]);
  const [periodServices, setPeriodServices] = useState([]);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState(null);

  useEffect(() => {
    Promise.all([
      api.getStats(),
      api.getServices({ filter: 'week' }),
      can('beheer') ? api.getPlanning({}) : Promise.resolve({ services: [] }),
    ])
      .then(([s, week, planning]) => {
        setStats(s);
        setWeekServices(week || []);
        setPeriodServices(planning?.services || week || []);
      })
      .catch((e) => setError(e.message));
  }, [can]);

  const counts = useMemo(() => {
    const list = periodServices.filter((s) => s.active !== false && !s.draft);
    return {
      full: list.filter((s) => serviceStatus(s) === 'full').length,
      almost: list.filter((s) => serviceStatus(s) === 'almost').length,
      open: list.filter((s) => serviceStatus(s) === 'open').length,
      list,
    };
  }, [periodServices]);

  const filteredServices = useMemo(() => {
    if (!statusFilter) return [];
    return counts.list.filter((s) => serviceStatus(s) === statusFilter);
  }, [counts.list, statusFilter]);

  const notSelf = stats?.notSelfEnrolled || [];
  const noShows = stats?.noShowPeople || [];
  const dutyStats = stats?.dutyStats || [];

  const splitByObligation = (people) => ({
    mandatory: people.filter((p) => p.obligation === 'FULL' || p.obligation === 'VR18'),
    voluntary: people.filter((p) => p.obligation !== 'FULL' && p.obligation !== 'VR18'),
  });

  const notSelfSplit = splitByObligation(notSelf);
  const noShowSplit = splitByObligation(noShows);

  const toggleFilter = (key) => setStatusFilter((cur) => (cur === key ? null : key));

  return (
    <div className="space-y-6">
      {error ? (
        <p className="rounded-sm border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>
      ) : null}

      <section className="space-y-3">
        <h2 className="font-heading text-base font-black uppercase">Deze week</h2>
        {weekServices.length === 0 ? (
          <p className="vvl-card text-sm text-gray-600">Geen diensten deze week.</p>
        ) : (
          <ul className="space-y-2">
            {weekServices.map((s) => {
              const st = serviceStatus(s);
              return (
                <li
                  key={s.id}
                  className="vvl-card flex min-h-[44px] flex-wrap items-center justify-between gap-2 py-3"
                >
                  <span className="text-sm font-semibold">
                    {new Date(s.date).toLocaleDateString('nl-NL', {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                    })}{' '}
                    · {s.time} · {s.location || (s.type === 'KITCHEN' ? 'Keuken' : 'Bar')}
                  </span>
                  <StatusBadge status={st} />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { key: 'full', label: 'Vol', count: counts.full, border: 'border-l-emerald-500' },
          { key: 'almost', label: 'Nog 1 nodig', count: counts.almost, border: 'border-l-amber-500' },
          { key: 'open', label: 'Open', count: counts.open, border: 'border-l-red-500' },
        ].map((tile) => (
          <button
            key={tile.key}
            type="button"
            onClick={() => toggleFilter(tile.key)}
            className={`vvl-card flex min-h-[44px] items-center justify-between border-l-4 ${tile.border} text-left transition hover:shadow-md ${
              statusFilter === tile.key ? 'ring-2 ring-vvl-primary' : ''
            }`}
          >
            <span className="font-bold">{tile.label}</span>
            <span className="text-2xl font-black">{tile.count}</span>
          </button>
        ))}
      </section>

      {statusFilter ? (
        <section className="space-y-2">
          <p className="text-xs font-bold uppercase text-vvl-accent">
            {statusFilter === 'full' ? 'Vol' : statusFilter === 'almost' ? 'Nog 1 nodig' : 'Open'} ·{' '}
            {filteredServices.length}
          </p>
          {filteredServices.length === 0 ? (
            <p className="vvl-card text-sm text-gray-600">Geen diensten.</p>
          ) : (
            <ul className="space-y-2">
              {filteredServices.map((s) => (
                <li key={s.id} className="vvl-card flex min-h-[44px] items-center justify-between gap-2 py-3 text-sm">
                  <Link className="font-semibold underline" to="/rooster">
                    {new Date(s.date).toLocaleDateString('nl-NL', {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                    })}{' '}
                    · {s.time}
                  </Link>
                  <StatusBadge status={serviceStatus(s)} />
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {can('beheer') ? (
        <section className="space-y-4">
          <h2 className="font-heading text-base font-black uppercase">Aandacht</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <AttentionBlock
              title="Niet zelf ingeschreven"
              mandatory={notSelfSplit.mandatory}
              voluntary={notSelfSplit.voluntary}
            />
            <AttentionBlock
              title="No-show gehad"
              mandatory={noShowSplit.mandatory}
              voluntary={noShowSplit.voluntary}
            />
          </div>
        </section>
      ) : null}

      {can('beheer') && dutyStats.length ? (
        <section className="space-y-3">
          <h2 className="font-heading text-base font-black uppercase">Dit seizoen</h2>
          <div className="vvl-card p-0">
            <table className="w-full table-fixed text-sm">
              <thead className="bg-vvl-secondary text-xs font-bold uppercase">
                <tr>
                  <th className="p-3 text-left">Naam</th>
                  <th className="p-3 text-left">Rol</th>
                  <th className="p-3 text-right">Diensten</th>
                </tr>
              </thead>
              <tbody>
                {dutyStats.map((p) => (
                  <tr key={p.id} className="border-t border-vvl-border">
                    <td className="p-3 font-semibold">{p.name}</td>
                    <td className="p-3">{p.role || OBLIGATION_SHORT[p.obligation] || '—'}</td>
                    <td className="p-3 text-right">{p.barThisSeason ?? p.barThisYear}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function AttentionBlock({ title, mandatory, voluntary }) {
  return (
    <div className="vvl-card space-y-3">
      <h3 className="font-heading text-sm font-black uppercase">{title}</h3>
      <PersonList heading="Verplicht" people={mandatory} />
      <PersonList heading="Vrijwillig" people={voluntary} />
    </div>
  );
}

function PersonList({ heading, people }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase text-vvl-accent">{heading}</p>
      {people.length === 0 ? (
        <p className="text-sm text-gray-600">Geen.</p>
      ) : (
        <ul className="divide-y divide-vvl-border">
          {people.map((p) => (
            <li key={p.id} className="flex min-h-[44px] items-center justify-between gap-2 py-2 text-sm">
              <span className="font-semibold">{p.name}</span>
              <span className="text-gray-600">{p.role || OBLIGATION_SHORT[p.obligation] || '—'}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
