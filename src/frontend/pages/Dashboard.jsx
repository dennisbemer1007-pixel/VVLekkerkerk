import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import StatCard from '../components/StatCard.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { PageTitle } from '../components/PageHelp.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../hooks/useApi.js';
import { occupancyStatus } from '../utils/formatDate.js';
import { PAGE_HELP } from '../utils/pageHelp.js';

const FEATURE_LABELS = {
  dashboard: 'Dashboard',
  inschrijven: 'Inschrijven',
  planning: 'Planning & PDF',
  wedstrijden: 'Wedstrijden',
  voorkeuren: 'Voorkeuren',
  teams: 'Teamleden inschrijven',
  beheer: 'Beheer & uitnodigen',
};

const OBLIGATION_SHORT = {
  NONE: '',
  FULL: 'verplicht',
  HALF: 'half verplicht',
};

export default function Dashboard() {
  const { user, can } = useAuth();
  const [stats, setStats] = useState(null);
  const [services, setServices] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.getStats(), api.getServices({ filter: 'week' })])
      .then(([s, list]) => {
        setStats(s);
        setServices(list.slice(0, 6));
      })
      .catch((e) => setError(e.message));
  }, []);

  const underQuota = (stats?.dutyStats || []).filter((p) => p.underQuota);
  const notSelf = stats?.notSelfEnrolled || [];

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <PageTitle {...PAGE_HELP.dashboard}>Dashboard</PageTitle>
        <p className="text-sm text-gray-700">
          Welkom {user?.name}. Groen = vol, geel = nog 1 nodig, rood = open.
        </p>
      </header>

      <section className="vvl-card space-y-2 border-l-4 border-l-vvl-primary">
        <p className="text-xs font-bold uppercase text-vvl-accent">Jouw rechten</p>
        <p className="font-heading text-xl font-black uppercase">{user?.role}</p>
        <p className="text-sm text-gray-700">{user?.access?.description}</p>
        <ul className="flex flex-wrap gap-2 pt-1">
          {(user?.access?.can || []).map((c) => (
            <li
              key={c}
              className="rounded-full border border-vvl-primary px-3 py-1 text-xs font-bold uppercase"
            >
              {FEATURE_LABELS[c] || c}
            </li>
          ))}
        </ul>
      </section>

      {error ? (
        <p className="rounded-sm border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>
      ) : null}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Actieve personen" value={stats?.personCount ?? '—'} to="/beheer?tab=personen" />
        <StatCard title="Actieve diensten" value={stats?.serviceCount ?? '—'} to="/planning" />
        <StatCard
          title="Bezettingsgraad"
          value={stats ? `${stats.occupancyRate}%` : '—'}
          subtitle="Van benodigde plekken ingevuld"
          to="/planning"
        />
        <StatCard title="Inschrijvingen" value={stats?.enrollmentCount ?? '—'} to="/inschrijven" />
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Link
          to="/planning"
          className="vvl-card flex items-center justify-between border-l-4 border-l-emerald-500 transition hover:shadow-md"
        >
          <span className="font-bold">Vol</span>
          <span className="text-2xl font-black">{stats?.full ?? '—'}</span>
        </Link>
        <Link
          to="/inschrijven?filter=open"
          className="vvl-card flex items-center justify-between border-l-4 border-l-amber-500 transition hover:shadow-md"
        >
          <span className="font-bold">Nog 1 nodig</span>
          <span className="text-2xl font-black">{stats?.almost ?? '—'}</span>
        </Link>
        <Link
          to="/inschrijven?filter=open"
          className="vvl-card flex items-center justify-between border-l-4 border-l-red-500 transition hover:shadow-md"
        >
          <span className="font-bold">Open</span>
          <span className="text-2xl font-black">{stats?.open ?? '—'}</span>
        </Link>
      </section>

      <section className="flex flex-wrap gap-2">
        {can('inschrijven') ? (
          <Link to="/inschrijven" className="vvl-btn-primary">
            Inschrijven
          </Link>
        ) : null}
        {can('planning') ? (
          <Link to="/planning" className="vvl-btn-outline">
            Planning &amp; PDF
          </Link>
        ) : null}
        {can('wedstrijden') ? (
          <Link to="/wedstrijden" className="vvl-btn-outline">
            Wedstrijden
          </Link>
        ) : null}
        {can('voorkeuren') ? (
          <Link to="/voorkeuren" className="vvl-btn-outline">
            Mijn voorkeuren
          </Link>
        ) : null}
        {can('beheer') ? (
          <Link to="/beheer" className="vvl-btn-outline">
            Beheer
          </Link>
        ) : null}
        {can('teams') && !can('beheer') ? (
          <>
            <Link to="/teams" className="vvl-btn-outline">
              Mijn team
            </Link>
            <Link to="/uitnodigen" className="vvl-btn-outline">
              Ouders uitnodigen
            </Link>
          </>
        ) : null}
      </section>

      {can('beheer') && stats?.dutyStats ? (
        <section className="space-y-3">
          <h2 className="font-heading text-xl font-black uppercase">Wie heeft gestaan</h2>
          <p className="text-sm text-gray-700">
            Aantal bardiensten: laatste 6 weken en dit kalenderjaar. Rood = onder quota.
          </p>
          {underQuota.length ? (
            <p className="text-sm font-semibold text-red-800">
              Onder quota: {underQuota.map((p) => p.name).join(', ')}
            </p>
          ) : null}
          <div className="overflow-x-auto vvl-card p-0">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-vvl-secondary text-xs font-bold uppercase">
                <tr>
                  <th className="p-3 text-left">Naam</th>
                  <th className="p-3 text-left">Team</th>
                  <th className="p-3 text-left">Verplichting</th>
                  <th className="p-3 text-right">6 weken</th>
                  <th className="p-3 text-right">Dit jaar</th>
                </tr>
              </thead>
              <tbody>
                {stats.dutyStats.map((p) => (
                  <tr
                    key={p.id}
                    className={`border-t border-vvl-border ${p.underQuota ? 'bg-red-50' : ''}`}
                  >
                    <td className="p-3 font-semibold">{p.name}</td>
                    <td className="p-3">{p.team || '—'}</td>
                    <td className="p-3">{OBLIGATION_SHORT[p.obligation] || '—'}</td>
                    <td className="p-3 text-right">{p.barLast6Weeks}</td>
                    <td className="p-3 text-right">{p.barThisYear}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {can('beheer') && stats?.planningRound ? (
        <section className="space-y-3">
          <h2 className="font-heading text-xl font-black uppercase">Niet zelf ingeschreven</h2>
          <p className="text-sm text-gray-700">
            Actieve personen zonder zelf-inschrijving in de huidige planningsronde
            {stats.planningRound.fromDate
              ? ` (${new Date(stats.planningRound.fromDate).toLocaleDateString('nl-NL')} – ${new Date(stats.planningRound.toDate).toLocaleDateString('nl-NL')})`
              : ''}
            .
          </p>
          {notSelf.length === 0 ? (
            <p className="vvl-card text-sm text-gray-600">
              Iedereen heeft zichzelf minstens één keer ingeschreven, of er is nog geen ronde.
            </p>
          ) : (
            <ul className="vvl-card divide-y divide-vvl-border p-0">
              {notSelf.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                  <span className="font-semibold">{p.name}</span>
                  <span className="text-gray-600">
                    {[p.team, OBLIGATION_SHORT[p.obligation]].filter(Boolean).join(' · ') || '—'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="font-heading text-xl font-black uppercase">Deze week</h2>
        {services.length === 0 ? (
          <p className="vvl-card text-sm text-gray-600">Geen diensten deze week.</p>
        ) : (
          <ul className="space-y-2">
            {services.map((s) => {
              const st =
                s.status ??
                occupancyStatus(s.enrollments?.length ?? 0, s.required ?? 2);
              return (
                <li key={s.id} className="vvl-card flex flex-wrap items-center justify-between gap-2 py-3">
                  <span className="text-sm font-semibold">
                    {new Date(s.date).toLocaleDateString('nl-NL', {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                    })}{' '}
                    · {s.time} · {s.location}
                  </span>
                  <StatusBadge status={st} />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
