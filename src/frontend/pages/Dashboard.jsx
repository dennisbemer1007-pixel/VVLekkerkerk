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
  ruilen: 'Ruilen',
  teams: 'Mijn team',
  beheer: 'Beheer & uitnodigen',
};

const OBLIGATION_SHORT = {
  NONE: '',
  FULL: 'verplicht',
  VR18: 'VR18+',
};

export default function Dashboard() {
  const { user, can } = useAuth();
  const [stats, setStats] = useState(null);
  const [services, setServices] = useState([]);
  const [error, setError] = useState('');
  const [controlView, setControlView] = useState(null);

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
  const controls = stats?.controls;
  const summary = controls?.summary;

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <PageTitle {...PAGE_HELP.dashboard}>Dashboard</PageTitle>
        <p className="text-sm text-gray-700">
          Welkom {user?.name}. De kernvraag: <strong>wat moet er nog geregeld worden?</strong>
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

      {can('beheer') && summary ? (
        <section className="space-y-3">
          <h2 className="font-heading text-xl font-black uppercase">Wat is nog niet geregeld?</h2>
          <Link
            to="/beheer?tab=planning"
            className="vvl-card flex items-center justify-between border-l-4 border-l-vvl-primary transition hover:shadow-md"
          >
            <span>
              <span className="block text-xs font-bold uppercase text-vvl-accent">
                Barplanning maken
              </span>
              <span className="text-sm text-gray-600">
                4 stappen: diensten aanmaken → publiceren → verplichte mensen automatisch
                inschrijven → officieel
              </span>
            </span>
            <span className="text-sm font-bold uppercase text-vvl-primary">Naar Planning →</span>
          </Link>
          <Link
            to="/beheer?tab=ruilen"
            className={`vvl-card flex items-center justify-between border-l-4 transition hover:shadow-md ${
              stats?.pendingSwapCount
                ? 'border-l-vvl-accent'
                : 'border-l-gray-400'
            }`}
          >
            <span>
              <span className="block text-xs font-bold uppercase text-vvl-accent">
                Ruilverzoeken voor de barcommissie
              </span>
              <span className="text-sm text-gray-600">
                Na akkoord van beide personen keur je goed via Beheer → Ruilen
              </span>
            </span>
            <span className="font-heading text-3xl font-black">{stats?.pendingSwapCount ?? 0}</span>
          </Link>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <button
              type="button"
              onClick={() => setControlView(controlView === 'open' ? null : 'open')}
              className="vvl-card text-left border-l-4 border-l-red-500 transition hover:shadow-md"
            >
              <p className="text-xs font-bold uppercase text-vvl-accent">Open diensten</p>
              <p className="font-heading text-3xl font-black">{summary.openServiceCount}</p>
              <p className="text-sm text-gray-600">
                {summary.fullyStaffed}/{summary.serviceCount} volledig bezet
              </p>
            </button>
            <button
              type="button"
              onClick={() => setControlView(controlView === 'obligations' ? null : 'obligations')}
              className="vvl-card text-left border-l-4 border-l-amber-500 transition hover:shadow-md"
            >
              <p className="text-xs font-bold uppercase text-vvl-accent">Verplichtingen open</p>
              <p className="font-heading text-3xl font-black">{summary.unfilledObligationCount}</p>
              <p className="text-sm text-gray-600">Nog niet ingedeeld</p>
            </button>
            <button
              type="button"
              onClick={() => setControlView(controlView === 'makeup' ? null : 'makeup')}
              className="vvl-card text-left border-l-4 border-l-vvl-primary transition hover:shadow-md"
            >
              <p className="text-xs font-bold uppercase text-vvl-accent">Inhaaldiensten</p>
              <p className="font-heading text-3xl font-black">{summary.makeupDueCount}</p>
              <p className="text-sm text-gray-600">Openstaand</p>
            </button>
            <button
              type="button"
              onClick={() => setControlView(controlView === 'gaps' ? null : 'gaps')}
              className="vvl-card text-left border-l-4 border-l-gray-500 transition hover:shadow-md"
            >
              <p className="text-xs font-bold uppercase text-vvl-accent">Waarom niet ingepland</p>
              <p className="font-heading text-3xl font-black">{summary.assignmentGapCount}</p>
              <p className="text-sm text-gray-600">Toelichting</p>
            </button>
          </div>
          <p className="text-xs text-gray-600">
            {summary.enrolledPersonCount} personen ingepland in deze planningsperiode.
          </p>

          {controlView === 'open' ? (
            <div className="overflow-x-auto vvl-card p-0">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="bg-vvl-secondary text-xs font-bold uppercase">
                  <tr>
                    <th className="p-3 text-left">Datum</th>
                    <th className="p-3 text-left">Tijd</th>
                    <th className="p-3 text-left">Type</th>
                    <th className="p-3 text-right">Nodig</th>
                    <th className="p-3 text-right">Ingevuld</th>
                    <th className="p-3 text-right">Open</th>
                  </tr>
                </thead>
                <tbody>
                  {(controls.openServices || []).map((s) => (
                    <tr key={s.id} className="border-t border-vvl-border">
                      <td className="p-3">
                        <Link className="font-semibold underline" to="/beheer?tab=diensten">
                          {new Date(s.date).toLocaleDateString('nl-NL')}
                        </Link>
                      </td>
                      <td className="p-3">{s.time}</td>
                      <td className="p-3">
                        {s.type === 'KITCHEN' ? 'Keuken' : 'Bar'}
                        {s.kind === 'TEAM' ? ' · team' : ''}
                      </td>
                      <td className="p-3 text-right">{s.required}</td>
                      <td className="p-3 text-right">{s.enrolled}</td>
                      <td className="p-3 text-right font-semibold">{s.open}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {controlView === 'obligations' || controlView === 'gaps' ? (
            <div className="overflow-x-auto vvl-card p-0">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-vvl-secondary text-xs font-bold uppercase">
                  <tr>
                    <th className="p-3 text-left">Persoon</th>
                    <th className="p-3 text-left">Type</th>
                    <th className="p-3 text-right">Ingepland</th>
                    <th className="p-3 text-right">Inhaal</th>
                    <th className="p-3 text-right">Nog nodig</th>
                    <th className="p-3 text-left">Reden</th>
                  </tr>
                </thead>
                <tbody>
                  {(controlView === 'gaps' ? controls.assignmentGaps : controls.unfilledObligations).map(
                    (p) => (
                      <tr key={p.id} className="border-t border-vvl-border">
                        <td className="p-3 font-semibold">{p.name}</td>
                        <td className="p-3">{OBLIGATION_SHORT[p.obligation] || p.obligation}</td>
                        <td className="p-3 text-right">{p.planned}</td>
                        <td className="p-3 text-right">{p.makeupDue}</td>
                        <td className="p-3 text-right">{p.stillNeeded}</td>
                        <td className="p-3 text-gray-700">{p.reason || '—'}</td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          ) : null}

          {controlView === 'makeup' ? (
            <ul className="vvl-card divide-y divide-vvl-border p-0">
              {(controls.makeupDue || []).map((p) => (
                <li key={p.id} className="flex flex-wrap justify-between gap-2 px-4 py-3 text-sm">
                  <span className="font-semibold">{p.name}</span>
                  <span>
                    {p.makeupDue} inhaaldienst{p.makeupDue === 1 ? '' : 'en'} · nog nodig {p.stillNeeded}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Actieve personen"
          value={stats?.personCount ?? '—'}
          to={can('beheer') ? '/beheer?tab=personen' : '/planning'}
        />
        <StatCard title="Actieve diensten" value={stats?.serviceCount ?? '—'} to="/planning" />
        <StatCard
          title="Bezettingsgraad"
          value={stats ? `${stats.occupancyRate}%` : '—'}
          subtitle="Van benodigde plekken ingevuld"
          to="/planning"
        />
        <StatCard
          title="Inschrijvingen"
          value={stats?.enrollmentCount ?? '—'}
          to={can('inschrijven') ? '/inschrijven' : '/planning'}
        />
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
          to={can('inschrijven') ? '/inschrijven?filter=open' : '/planning'}
          className="vvl-card flex items-center justify-between border-l-4 border-l-amber-500 transition hover:shadow-md"
        >
          <span className="font-bold">Nog 1 nodig</span>
          <span className="text-2xl font-black">{stats?.almost ?? '—'}</span>
        </Link>
        <Link
          to={can('inschrijven') ? '/inschrijven?filter=open' : '/planning'}
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
        {can('beheer') ? (
          <Link to="/beheer" className="vvl-btn-outline">
            Beheer
          </Link>
        ) : null}
          {can('teams') && !can('beheer') ? (
            <Link to="/teams" className="vvl-btn-outline">
              Mijn team
            </Link>
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
