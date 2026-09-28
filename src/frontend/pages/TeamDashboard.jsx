import { useCallback, useEffect, useState } from 'react';
import DienstCard from '../components/DienstCard.jsx';
import ListFilters from '../components/ListFilters.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../hooks/useApi.js';
import { formatMatchDate, SERVICE_TYPE_LABEL } from '../utils/formatDate.js';
import { includesPerson, withinDates } from '../utils/listFilter.js';

export default function TeamDashboard() {
  const { personId } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [parentName, setParentName] = useState({});
  const [assign, setAssign] = useState({});
  const [edit, setEdit] = useState(null);
  const [replaceWith, setReplaceWith] = useState({});
  const [section, setSection] = useState('diensten');
  const [teamId, setTeamId] = useState('');
  const [filters, setFilters] = useState({ person: '', from: '', to: '' });
  const [obligation, setObligation] = useState('');
  const [venue, setVenue] = useState('');

  const OBLIGATION_SHORT = {
    NONE: '—',
    FULL: 'verplicht',
    VR18: 'VR18+',
  };

  const load = useCallback(() => {
    return api
      .getTeamDashboard()
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const addParent = async (teamId) => {
    setError('');
    setMsg('');
    try {
      const name = String(parentName[teamId] || '').trim();
      if (!name) {
        setError('Vul de naam van de ouder in.');
        return;
      }
      const res = await api.addTeamParent(teamId, { name });
      setParentName((prev) => ({ ...prev, [teamId]: '' }));
      setMsg(
        res.message ||
          `${name} staat nu op de teamlijst. Je kunt deze ouder op een teamdienst zetten.`,
      );
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const saveParent = async (teamId) => {
    setError('');
    setMsg('');
    const name = String(edit?.name || '').trim();
    if (!edit?.id || !name) {
      setError('Vul de naam van de ouder in.');
      return;
    }
    try {
      await api.updateTeamParent(teamId, edit.id, { name });
      setEdit(null);
      setMsg('Naam bijgewerkt.');
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const removeParent = async (team, member) => {
    setError('');
    setMsg('');
    if (!window.confirm(`${member.name} verwijderen uit ${team.name}?`)) return;
    try {
      await api.deleteTeamParent(team.id, member.id);
      setMsg(`${member.name} is verwijderd.`);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const replaceParent = async (enrollmentId) => {
    setError('');
    setMsg('');
    const personId = Number(replaceWith[enrollmentId]);
    if (!personId) {
      setError('Kies de andere ouder.');
      return;
    }
    try {
      await api.reassignEnrollment(enrollmentId, { personId });
      setReplaceWith((prev) => ({ ...prev, [enrollmentId]: '' }));
      setMsg('Ouder op de teamdienst gewijzigd.');
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const fillSpot = async (team, e) => {
    e.preventDefault();
    setError('');
    setMsg('');
    const row = assign[team.id] || {};
    try {
      await api.createEnrollment({
        serviceId: Number(row.serviceId),
        personId: Number(row.personId),
        forTeamId: team.id,
      });
      setMsg('Ouder ingevuld op de teamdienst.');
      setAssign((prev) => ({ ...prev, [team.id]: { serviceId: '', personId: '' } }));
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <h1 className="font-heading text-xl font-black uppercase">Team</h1>
        <p className="text-sm text-gray-700">Seizoen {data?.seasonLabel || '—'}</p>
        {(data?.teams || []).length > 1 ? (
          <label className="block">
            <span className="vvl-label">Team</span>
            <select className="vvl-input" value={teamId} onChange={(e) => setTeamId(e.target.value)} aria-label="Team">
              <option value="">Alle teams</option>
              {data.teams.map((team) => (
                <option key={team.id} value={team.id}>{team.name}</option>
              ))}
            </select>
          </label>
        ) : null}
        <div className="grid grid-cols-3 gap-2">
          {[
            ['diensten', 'Teamdiensten'],
            ['ouders', 'Ouders'],
            ['wedstrijden', 'Wedstrijden'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={section === id ? 'vvl-btn-primary px-2 text-xs' : 'vvl-btn-outline px-2 text-xs'}
              onClick={() => setSection(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <ListFilters {...filters} onChange={setFilters} personLabel={section === 'wedstrijden' ? 'Tegenstander' : 'Persoon'}>
          {section === 'ouders' ? (
            <label className="block min-w-0">
              <span className="vvl-label">Verplichting</span>
              <select className="vvl-input" value={obligation} onChange={(e) => setObligation(e.target.value)} aria-label="Verplichting">
                <option value="">Alle</option>
                <option value="FULL">Verplicht</option>
                <option value="VR18">VR18+</option>
                <option value="NONE">Vrijwillig</option>
              </select>
            </label>
          ) : null}
          {section === 'wedstrijden' ? (
            <label className="block min-w-0">
              <span className="vvl-label">Thuis/uit</span>
              <select className="vvl-input" value={venue} onChange={(e) => setVenue(e.target.value)} aria-label="Thuis of uit">
                <option value="">Alle</option>
                <option value="home">Thuis</option>
                <option value="away">Uit</option>
              </select>
            </label>
          ) : null}
        </ListFilters>
      </header>

      {msg ? (
        <p className="rounded-sm border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">{msg}</p>
      ) : null}
      {error ? (
        <p className="rounded-sm border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>
      ) : null}

      {(data?.teams || []).length === 0 ? (
        <p className="vvl-card text-sm text-gray-600">
          Je bent nog niet gekoppeld als bardienstcoördinator. Vraag de barcommissie om je team in te stellen.
        </p>
      ) : (
        (data.teams || []).filter((team) => !teamId || String(team.id) === String(teamId)).map((team) => {
          const form = assign[team.id] || { serviceId: '', personId: '' };
          const members = (team.members || []).filter(
            (m) => includesPerson(m.name, filters.person) && (!obligation || m.obligation === obligation),
          );
          const teamServices = (team.teamServices || []).filter((s) => {
            if (!withinDates(s.date, filters.from, filters.to)) return false;
            if (!filters.person.trim()) return true;
            const names = (s.enrollments || []).map((e) => e.person?.name).join(' ');
            return includesPerson(`${names} ${team.name}`, filters.person);
          });
          const openTeamServices = teamServices.filter((s) => (s.teamOpen ?? 0) > 0);
          const matches = (team.upcomingMatches || []).filter((m) => {
            if (!withinDates(m.date, filters.from, filters.to)) return false;
            if (venue === 'home' && !m.home) return false;
            if (venue === 'away' && m.home) return false;
            return includesPerson(`${m.opponent || ''} ${team.name}`, filters.person);
          });
          return (
            <section key={team.id} className="vvl-card space-y-4">
              <div>
                <h2 className="font-heading text-lg font-black uppercase">{team.name}</h2>
                <p className="text-sm text-gray-700">
                  {team.members.length} ouders/leden
                  {team.teamDutyUse ? ' · teamdienst bij thuiswedstrijd' : ' · geen teamdienst'}
                </p>
              </div>

              <div className={section === 'ouders' ? '' : 'hidden'}>
                <h3 className="text-xs font-bold uppercase text-vvl-accent">Ouders</h3>
                <ul className="mt-2 space-y-2 md:hidden">
                  {members.map((m) => (
                    <li key={m.id} className="rounded-sm border border-vvl-border p-3 text-sm">
                      <p className="font-semibold">{m.name}</p>
                      <p className="text-xs text-gray-600">
                        {OBLIGATION_SHORT[m.obligation] || '—'} · 6 wkn {m.stood6w ?? m.barLast6Weeks ?? 0} · jaar{' '}
                        {m.stoodYear ?? m.barThisYear ?? 0}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button type="button" className="vvl-btn-outline text-xs" onClick={() => setEdit({ id: m.id, name: m.name })}>
                          Wijzigen
                        </button>
                        {!m.hasAccount && !m.email ? (
                          <button type="button" className="vvl-btn-outline text-xs" onClick={() => removeParent(team, m)}>
                            Verwijderen
                          </button>
                        ) : null}
                      </div>
                      {edit?.id === m.id ? (
                        <div className="mt-2 flex gap-2">
                          <input className="vvl-input" value={edit.name} onChange={(e) => setEdit({ id: m.id, name: e.target.value })} />
                          <button type="button" className="vvl-btn-primary text-xs" onClick={() => saveParent(team.id)}>
                            Opslaan
                          </button>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
                <div className="mt-2 hidden md:block">
                  <table className="w-full text-sm">
                    <thead className="bg-vvl-secondary text-xs font-bold uppercase">
                      <tr>
                        <th className="p-3 text-left">Naam</th>
                        <th className="p-3 text-left">Team</th>
                        <th className="p-3 text-left">Verplichting</th>
                        <th className="p-3 text-right">6 weken</th>
                        <th className="p-3 text-right">Dit jaar</th>
                        <th className="p-3 text-right">Teamdiensten</th>
                        <th className="p-3 text-left"> </th>
                      </tr>
                    </thead>
                    <tbody>
                      {members.map((m) => (
                        <tr key={m.id} className="border-t border-vvl-border">
                          <td className="p-3 font-semibold">
                            {edit?.id === m.id ? (
                              <input
                                className="vvl-input"
                                value={edit.name}
                                onChange={(e) => setEdit({ id: m.id, name: e.target.value })}
                              />
                            ) : (
                              m.name
                            )}
                          </td>
                          <td className="p-3">{team.name}</td>
                          <td className="p-3">{OBLIGATION_SHORT[m.obligation] || '—'}</td>
                          <td className="p-3 text-right">{m.stood6w ?? m.barLast6Weeks ?? 0}</td>
                          <td className="p-3 text-right">{m.stoodYear ?? m.barThisYear ?? 0}</td>
                          <td className="p-3 text-right">{m.teamDutyCount || 0}</td>
                          <td className="p-3">
                            <div className="flex flex-nowrap gap-2">
                              {edit?.id === m.id ? (
                                <>
                                  <button type="button" className="vvl-btn-primary px-3 text-xs" onClick={() => saveParent(team.id)}>
                                    Opslaan
                                  </button>
                                  <button type="button" className="vvl-btn-outline px-3 text-xs" onClick={() => setEdit(null)}>
                                    Annuleren
                                  </button>
                                </>
                              ) : (
                                <button type="button" className="vvl-btn-outline px-3 text-xs" onClick={() => setEdit({ id: m.id, name: m.name })}>
                                  Wijzigen
                                </button>
                              )}
                              {!m.hasAccount && !m.email ? (
                                <button type="button" className="vvl-btn-outline px-3 text-xs" onClick={() => removeParent(team, m)}>
                                  Verwijderen
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-xs text-gray-600">
                  6 weken en dit jaar tellen alle bardiensten, inclusief teamdiensten. Ouders met een account
                  verwijder je niet hier; dat doet de barcommissie.
                </p>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  addParent(team.id);
                }}
                className={`flex flex-wrap items-end gap-2 ${section === 'ouders' ? '' : 'hidden'}`}
              >
                <div className="min-w-0 flex-1">
                  <label className="vvl-label">Ouder toevoegen (alleen naam)</label>
                  <input
                    className="vvl-input"
                    value={parentName[team.id] || ''}
                    onChange={(e) => setParentName((prev) => ({ ...prev, [team.id]: e.target.value }))}
                    placeholder="Voor- en achternaam"
                  />
                </div>
                <button type="submit" className="vvl-btn-primary">
                  Toevoegen
                </button>
              </form>

              {section === 'wedstrijden' ? (
                <div>
                  <h3 className="text-xs font-bold uppercase text-vvl-accent">Komende wedstrijden</h3>
                  {matches.length === 0 ? (
                    <p className="mt-1 text-sm text-gray-600">Geen wedstrijden voor dit filter.</p>
                  ) : (
                  <ul className="mt-1 text-sm text-gray-700">
                    {matches.map((m) => (
                      <li key={m.id}>
                        {formatMatchDate(m.date)} {m.time || ''} · {m.home ? 'thuis' : 'uit'} vs{' '}
                        {m.opponent || '—'}
                      </li>
                    ))}
                  </ul>
                  )}
                </div>
              ) : null}

              {section === 'diensten' && openTeamServices.length ? (
                <form onSubmit={(e) => fillSpot(team, e)} className="grid gap-3 sm:grid-cols-2">
                  <h3 className="sm:col-span-2 font-heading text-base font-black uppercase">
                    Ouder op teamdienst zetten
                  </h3>
                  <div>
                    <label className="vvl-label">Open teamplek</label>
                    <select
                      className="vvl-input"
                      value={form.serviceId}
                      onChange={(e) => setAssign((prev) => ({ ...prev, [team.id]: { ...form, serviceId: e.target.value } }))}
                      required
                    >
                      <option value="">— Kies dienst —</option>
                      {openTeamServices.map((s) => (
                        <option key={s.id} value={s.id}>
                          {SERVICE_TYPE_LABEL[s.type]} {new Date(s.date).toLocaleDateString('nl-NL')} {s.time}{' '}
                          ({s.teamOpen} open)
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="vvl-label">Ouder / lid</label>
                    <select
                      className="vvl-input"
                      value={form.personId}
                      onChange={(e) => setAssign((prev) => ({ ...prev, [team.id]: { ...form, personId: e.target.value } }))}
                      required
                    >
                      <option value="">— Kies naam —</option>
                      {team.members.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.teamDutyCount || 0}× gestaan)
                        </option>
                      ))}
                    </select>
                  </div>
                  <button type="submit" className="vvl-btn-primary sm:col-span-2 sm:w-fit">
                    Naam invullen
                  </button>
                </form>
              ) : section === 'diensten' ? (
                <p className="text-sm text-gray-600">
                  Geen open teamdienst-plekken in deze planningsperiode. Die ontstaan automatisch als
                  dit team thuis speelt.
                </p>
              ) : null}

              {section === 'diensten' && teamServices.length ? (
                <div className="grid gap-3 md:grid-cols-1">
                  {teamServices.map((s) => {
                    const named = (s.enrollments || []).filter(
                      (e) => e.kind === 'TEAM' && Number(e.forTeamId || e.forTeam?.id) === Number(team.id),
                    );
                    return (
                      <div key={s.id} className="space-y-2">
                        <DienstCard dienst={s} myPersonId={personId} />
                        {named.map((e) => (
                          <form
                            key={e.id}
                            className="flex flex-wrap items-end gap-2"
                            onSubmit={(ev) => {
                              ev.preventDefault();
                              replaceParent(e.id);
                            }}
                          >
                            <div className="min-w-[180px] flex-1">
                              <label className="vvl-label">{e.person?.name} wijzigen naar</label>
                              <select
                                className="vvl-input"
                                value={replaceWith[e.id] || ''}
                                onChange={(ev) =>
                                  setReplaceWith((prev) => ({ ...prev, [e.id]: ev.target.value }))
                                }
                                required
                              >
                                <option value="">— Andere ouder —</option>
                                {team.members
                                  .filter((m) => m.id !== e.personId)
                                  .map((m) => (
                                    <option key={m.id} value={m.id}>
                                      {m.name}
                                    </option>
                                  ))}
                              </select>
                            </div>
                            <button type="submit" className="vvl-btn-outline text-xs">
                              Andere ouder
                            </button>
                          </form>
                        ))}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </section>
          );
        })
      )}
    </div>
  );
}
