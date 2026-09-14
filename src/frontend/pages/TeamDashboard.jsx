import { useCallback, useEffect, useState } from 'react';
import DienstCard from '../components/DienstCard.jsx';
import { PageTitle } from '../components/PageHelp.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../hooks/useApi.js';
import { formatMatchDate, SERVICE_TYPE_LABEL } from '../utils/formatDate.js';
import { PAGE_HELP } from '../utils/pageHelp.js';

export default function TeamDashboard() {
  const { personId } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [assign, setAssign] = useState({ serviceId: '', personId: '' });

  const load = useCallback(() => {
    return api
      .getTeamDashboard()
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setMsg('');
    try {
      await api.createEnrollment({
        serviceId: Number(assign.serviceId),
        personId: Number(assign.personId),
      });
      setMsg('Lid ingeschreven.');
      setAssign({ serviceId: '', personId: '' });
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const members = (data?.teams || []).flatMap((t) =>
    (t.members || []).map((m) => ({ ...m, teamName: t.name })),
  );

  return (
    <div className="space-y-6">
      <header>
        <PageTitle {...PAGE_HELP.teams}>Mijn team</PageTitle>
        <p className="mt-1 text-sm text-gray-700">
          Seizoen {data?.seasonLabel || '—'}. Vul teamdiensten, schrijf ouders in op open plekken
          en zie wie nog een persoonlijke verplichting open heeft.
        </p>
      </header>

      {msg ? (
        <p className="rounded-sm border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">{msg}</p>
      ) : null}
      {error ? (
        <p className="rounded-sm border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>
      ) : null}

      {(data?.teams || []).length === 0 ? (
        <p className="vvl-card text-sm text-gray-600">
          Je bent nog niet gekoppeld als teamcoördinator. Vraag de barcommissie om je team in te stellen.
        </p>
      ) : (
        (data.teams || []).map((team) => (
          <section key={team.id} className="vvl-card space-y-3">
            <h2 className="font-heading text-lg font-black uppercase">{team.name}</h2>
            <p className="text-sm text-gray-700">
              {team.members.length} leden
              {team.teamDutyUse ? ' · teamdienst bij thuiswedstrijd' : ' · geen teamdienst'}
            </p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {team.members.map((m) => (
                <li key={m.id} className="text-sm">
                  <span className="font-semibold">{m.name}</span>
                  {m.stillNeeded > 0 ? (
                    <span className="ml-2 text-red-800">nog {m.stillNeeded} in te vullen</span>
                  ) : (
                    <span className="ml-2 text-gray-500">verplichting ok</span>
                  )}
                </li>
              ))}
            </ul>
            {team.upcomingMatches.length ? (
              <div>
                <h3 className="text-xs font-bold uppercase text-vvl-accent">Komende wedstrijden</h3>
                <ul className="mt-1 text-sm text-gray-700">
                  {team.upcomingMatches.map((m) => (
                    <li key={m.id}>
                      {formatMatchDate(m.date)} {m.time || ''} · {m.home ? 'thuis' : 'uit'} vs{' '}
                      {m.opponent || '—'}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {team.teamServices.length ? (
              <div className="grid gap-3 md:grid-cols-2">
                {team.teamServices.map((s) => (
                  <DienstCard key={s.id} dienst={s} myPersonId={personId} />
                ))}
              </div>
            ) : null}
          </section>
        ))
      )}

      <form onSubmit={submit} className="vvl-card grid gap-3 sm:grid-cols-2">
        <h2 className="sm:col-span-2 font-heading text-lg font-black uppercase">Lid inschrijven</h2>
        <div>
          <label className="vvl-label">Open dienst</label>
          <select
            className="vvl-input"
            value={assign.serviceId}
            onChange={(e) => setAssign({ ...assign, serviceId: e.target.value })}
            required
          >
            <option value="">— Kies dienst —</option>
            {(data?.openPersonal || []).map((s) => (
              <option key={s.id} value={s.id}>
                {SERVICE_TYPE_LABEL[s.type]} {new Date(s.date).toLocaleDateString('nl-NL')} {s.time}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="vvl-label">Persoon</label>
          <select
            className="vvl-input"
            value={assign.personId}
            onChange={(e) => setAssign({ ...assign, personId: e.target.value })}
            required
          >
            <option value="">— Kies persoon —</option>
            {members.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.teamName})
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="vvl-btn-primary sm:col-span-2 sm:w-fit">
          Inschrijven
        </button>
      </form>
    </div>
  );
}
