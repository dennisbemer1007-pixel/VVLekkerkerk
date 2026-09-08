import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import Avatar from '../components/Avatar.jsx';
import DienstCard from '../components/DienstCard.jsx';
import { PageTitle } from '../components/PageHelp.jsx';
import { api } from '../hooks/useApi.js';
import { SERVICE_TYPE_LABEL, todayInputValue, toDateInputValue } from '../utils/formatDate.js';
import { helpForBeheerTab } from '../utils/pageHelp.js';

const TABS = [
  { id: 'personen', label: 'Personen' },
  { id: 'diensten', label: 'Diensten' },
  { id: 'planning', label: 'Planning' },
  { id: 'teams', label: 'Teams' },
  { id: 'mail', label: 'E-mail' },
];

const ROLES = ['Vrijwilliger', 'Teamcoördinator', 'Coördinator', 'Bestuur'];

const OBLIGATIONS = [
  { value: 'NONE', label: 'Geen (vrijwilliger)' },
  { value: 'FULL', label: 'Verplicht (min. 1× / 6 weken)' },
  { value: 'HALF', label: 'Half verplicht (min. 3× / jaar)' },
];

const WEEKDAYS = [
  { id: 1, label: 'Ma' },
  { id: 2, label: 'Di' },
  { id: 3, label: 'Wo' },
  { id: 4, label: 'Do' },
  { id: 5, label: 'Vr' },
  { id: 6, label: 'Za' },
  { id: 0, label: 'Zo' },
];

const SLOT_OPTS = [
  { id: 'MORNING', label: 'Ochtend' },
  { id: 'AFTERNOON', label: 'Middag' },
  { id: 'EVENING', label: 'Avond' },
];

export default function Beheer({ mode = 'full' }) {
  const [searchParams] = useSearchParams();
  let tabs = TABS;
  if (mode === 'teams') tabs = TABS.filter((t) => t.id === 'teams');
  if (mode === 'invite') tabs = [{ id: 'personen', label: 'Uitnodigen' }];

  const tabFromUrl = searchParams.get('tab');
  const initialTab = tabs.some((t) => t.id === tabFromUrl) ? tabFromUrl : tabs[0]?.id || 'personen';
  const [tab, setTab] = useState(initialTab);

  useEffect(() => {
    if (tabFromUrl && tabs.some((t) => t.id === tabFromUrl)) {
      setTab(tabFromUrl);
    }
  }, [tabFromUrl]);

  const help = helpForBeheerTab(tab, mode);
  const title =
    mode === 'teams' ? 'Mijn team' : mode === 'invite' ? 'Ouders uitnodigen' : 'Beheer';

  return (
    <div className="space-y-6">
      <header>
        <PageTitle {...help}>{title}</PageTitle>
        <p className="mt-1 text-sm text-gray-700">
          {mode === 'teams'
            ? 'Schrijf ouders of teamleden in voor een bardienst.'
            : mode === 'invite'
              ? 'Nodig ouders uit per e-mail. Zij maken zelf een account via de link.'
              : 'Nodig mensen uit, maak een concept-planning uit wedstrijden, beheer diensten en teams.'}
        </p>
      </header>

      {tabs.length > 1 ? (
        <div className="flex flex-wrap gap-2 border-b border-vvl-border pb-3">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-full px-4 py-2 text-xs font-bold uppercase ${
                tab === t.id ? 'bg-vvl-primary text-white' : 'bg-white border border-vvl-primary'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      ) : null}

      {tab === 'personen' ? <PersonenBeheer /> : null}
      {tab === 'diensten' ? <DienstenBeheer /> : null}
      {tab === 'planning' ? <PlanningBeheer /> : null}
      {tab === 'teams' ? <TeamsBeheer /> : null}
      {tab === 'mail' ? <MailBeheer /> : null}
    </div>
  );
}

function PersonenBeheer() {
  const [persons, setPersons] = useState([]);
  const [teams, setTeams] = useState([]);
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    role: 'Vrijwilliger',
    obligation: 'NONE',
    teamId: '',
    unavailableWeekdays: [],
    preferredSlots: [],
  });
  const [editId, setEditId] = useState(null);
  const [error, setError] = useState('');
  const [inviteResult, setInviteResult] = useState(null);
  const [copied, setCopied] = useState(false);
  const [pwPersonId, setPwPersonId] = useState(null);
  const [pwValue, setPwValue] = useState('');
  const [pwMsg, setPwMsg] = useState('');

  const load = async () => {
    setError('');
    const errors = [];
    try {
      setPersons(await api.getPersons(true));
    } catch (e) {
      errors.push(`Personen: ${e.message}`);
    }
    try {
      setTeams(await api.getTeams());
    } catch (e) {
      errors.push(`Teams: ${e.message}`);
    }
    if (errors.length) setError(errors.join(' '));
  };

  useEffect(() => {
    load();
  }, []);

  const resetForm = () => {
    setEditId(null);
    setForm({
      name: '',
      email: '',
      phone: '',
      role: 'Vrijwilliger',
      obligation: 'NONE',
      teamId: '',
      unavailableWeekdays: [],
      preferredSlots: [],
    });
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setInviteResult(null);
    setCopied(false);
    try {
      const data = {
        ...form,
        teamId: form.teamId || null,
      };
      if (editId) {
        await api.updatePerson(editId, data);
      } else {
        const res = await api.invitePerson(data);
        setInviteResult(res);
      }
      resetForm();
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const startEdit = (p) => {
    setEditId(p.id);
    setInviteResult(null);
    setForm({
      name: p.name,
      email: p.email ?? '',
      phone: p.phone ?? '',
      role: p.role,
      obligation: p.obligation || (p.mandatoryBar ? 'FULL' : 'NONE'),
      teamId: p.teamId ? String(p.teamId) : '',
      unavailableWeekdays: p.unavailableWeekdays || [],
      preferredSlots: p.preferredSlots || [],
    });
  };

  const toggleActive = async (p) => {
    await api.updatePerson(p.id, { active: !p.active });
    await load();
  };

  const resend = async (p) => {
    setError('');
    try {
      const res = await api.resendInvite(p.id);
      setInviteResult(res);
    } catch (err) {
      setError(err.message);
    }
  };

  const copyLink = async () => {
    if (!inviteResult?.inviteLink) return;
    await navigator.clipboard.writeText(inviteResult.inviteLink);
    setCopied(true);
  };

  const savePassword = async (e) => {
    e.preventDefault();
    setPwMsg('');
    setError('');
    try {
      await api.setPersonPassword(pwPersonId, pwValue);
      setPwMsg('Wachtwoord opgeslagen.');
      setPwPersonId(null);
      setPwValue('');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <section className="space-y-4">
      <form onSubmit={submit} className="vvl-card grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <h2 className="sm:col-span-2 lg:col-span-3 font-heading text-lg font-black uppercase">
          {editId ? 'Persoon bewerken' : 'Uitnodigen per e-mail'}
        </h2>
        <p className="sm:col-span-2 lg:col-span-3 text-sm text-gray-700">
          E-mail en telefoon zijn alleen zichtbaar voor beheerders (Coördinator / Bestuur).
        </p>

        <div>
          <label className="vvl-label">Naam *</label>
          <input
            className="vvl-input"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </div>
        <div>
          <label className="vvl-label">E-mail *</label>
          <input
            type="email"
            className="vvl-input"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required={!editId}
            disabled={Boolean(editId)}
          />
        </div>
        <div>
          <label className="vvl-label">Telefoon</label>
          <input
            className="vvl-input"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
        </div>
        <div>
          <label className="vvl-label">Rol</label>
          <select
            className="vvl-input"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="vvl-label">Team (optioneel)</label>
          <select
            className="vvl-input"
            value={form.teamId}
            onChange={(e) => setForm({ ...form, teamId: e.target.value })}
          >
            <option value="">— Geen team —</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="vvl-label">Bardienst-verplichting</label>
          <select
            className="vvl-input"
            value={form.obligation}
            onChange={(e) => setForm({ ...form, obligation: e.target.value })}
          >
            {OBLIGATIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <p className="vvl-label mb-2">Niet beschikbaar (vaste dagen)</p>
          <div className="flex flex-wrap gap-3">
            {WEEKDAYS.map((d) => (
              <label key={d.id} className="flex items-center gap-1 text-sm font-semibold">
                <input
                  type="checkbox"
                  checked={form.unavailableWeekdays.includes(d.id)}
                  onChange={() => {
                    const has = form.unavailableWeekdays.includes(d.id);
                    setForm({
                      ...form,
                      unavailableWeekdays: has
                        ? form.unavailableWeekdays.filter((x) => x !== d.id)
                        : [...form.unavailableWeekdays, d.id],
                    });
                  }}
                />
                {d.label}
              </label>
            ))}
          </div>
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <p className="vvl-label mb-2">Voorkeur dagdeel</p>
          <div className="flex flex-wrap gap-3">
            {SLOT_OPTS.map((s) => (
              <label key={s.id} className="flex items-center gap-1 text-sm font-semibold">
                <input
                  type="checkbox"
                  checked={form.preferredSlots.includes(s.id)}
                  onChange={() => {
                    const has = form.preferredSlots.includes(s.id);
                    setForm({
                      ...form,
                      preferredSlots: has
                        ? form.preferredSlots.filter((x) => x !== s.id)
                        : [...form.preferredSlots, s.id],
                    });
                  }}
                />
                {s.label}
              </label>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-3">
          <button type="submit" className="vvl-btn-primary">
            {editId ? 'Opslaan' : 'Uitnodiging maken'}
          </button>
          {editId ? (
            <button type="button" className="vvl-btn-outline" onClick={resetForm}>
              Annuleren
            </button>
          ) : null}
        </div>
      </form>

      {inviteResult ? (
        <div className="vvl-card space-y-3 border-l-4 border-l-emerald-500">
          <h3 className="font-heading text-lg font-black uppercase">Uitnodiging klaar</h3>
          {inviteResult.emailSent ? (
            <p className="text-sm text-emerald-800">
              E-mail is verstuurd naar <strong>{inviteResult.person?.email}</strong>.
            </p>
          ) : (
            <p className="text-sm">
              Mailserver staat nog uit of is niet ingesteld
              {inviteResult.emailError && inviteResult.emailError !== 'not_configured'
                ? ` (${inviteResult.emailError})`
                : ''}
              . Kopieer de link of stuur handmatig. Stel e-mail in via Beheer → E-mail.
            </p>
          )}
          <p className="text-sm">
            Link voor <strong>{inviteResult.person?.email}</strong> (14 dagen geldig):
          </p>
          <p className="break-all rounded-sm bg-vvl-muted p-3 text-xs font-mono">
            {inviteResult.inviteLink}
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="vvl-btn-primary text-xs" onClick={copyLink}>
              {copied ? 'Gekopieerd!' : 'Kopieer link'}
            </button>
            <a href={inviteResult.mailto} className="vvl-btn-outline text-xs">
              Open e-mailprogramma
            </a>
          </div>
        </div>
      ) : null}

      {pwPersonId ? (
        <form onSubmit={savePassword} className="vvl-card grid gap-3 sm:grid-cols-2">
          <h3 className="sm:col-span-2 font-heading font-black uppercase">Wachtwoord instellen</h3>
          <div className="sm:col-span-2">
            <label className="vvl-label">Nieuw wachtwoord (min. 8 tekens)</label>
            <input
              type="password"
              className="vvl-input"
              value={pwValue}
              onChange={(e) => setPwValue(e.target.value)}
              minLength={8}
              required
            />
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <button type="submit" className="vvl-btn-primary text-xs">
              Opslaan
            </button>
            <button
              type="button"
              className="vvl-btn-outline text-xs"
              onClick={() => {
                setPwPersonId(null);
                setPwValue('');
              }}
            >
              Annuleren
            </button>
          </div>
        </form>
      ) : null}

      {pwMsg ? <p className="text-sm text-emerald-800">{pwMsg}</p> : null}

      {error ? (
        <div className="space-y-2">
          <p className="text-sm text-red-700">{error}</p>
          <button type="button" className="vvl-btn-outline text-xs" onClick={() => load()}>
            Opnieuw laden
          </button>
        </div>
      ) : null}

      <div className="overflow-x-auto vvl-card p-0">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-vvl-secondary text-xs font-bold uppercase">
            <tr>
              <th className="p-3 text-left">Naam</th>
              <th className="p-3 text-left">E-mail</th>
              <th className="p-3 text-left">Telefoon</th>
              <th className="p-3 text-left">Rol</th>
              <th className="p-3 text-left">Account</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {persons.map((p) => (
              <tr key={p.id} className="border-t border-vvl-border">
                <td className="p-3 font-semibold">
                  {p.name}
                  {p.obligation === 'FULL' ? ' *' : p.obligation === 'HALF' ? ' ½' : ''}
                </td>
                <td className="p-3">{p.email || '—'}</td>
                <td className="p-3">{p.phone || '—'}</td>
                <td className="p-3">
                  {p.role}
                  {p.team ? ` · ${p.team.name}` : ''}
                </td>
                <td className="p-3">
                  {!p.active
                    ? 'Inactief'
                    : p.hasAccount
                      ? 'Account actief'
                      : p.invitePending
                        ? 'Uitnodiging open'
                        : 'Geen account'}
                </td>
                <td className="p-3 space-x-2 whitespace-nowrap">
                  <button type="button" className="text-xs font-bold uppercase" onClick={() => startEdit(p)}>
                    Bewerk
                  </button>
                  {p.hasAccount ? (
                    <button
                      type="button"
                      className="text-xs font-bold uppercase"
                      onClick={() => {
                        setPwPersonId(p.id);
                        setPwValue('');
                        setPwMsg('');
                      }}
                    >
                      Wachtwoord
                    </button>
                  ) : null}
                  {!p.hasAccount && p.email ? (
                    <button type="button" className="text-xs font-bold uppercase" onClick={() => resend(p)}>
                      Link opnieuw
                    </button>
                  ) : null}
                  <button type="button" className="text-xs font-bold uppercase" onClick={() => toggleActive(p)}>
                    {p.active ? 'Deactiveer' : 'Activeer'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-600">
        * = verplichte bardienst. Contactgegevens alleen hier (beheer) zichtbaar.
      </p>
    </section>
  );
}

function DienstenBeheer() {
  const [services, setServices] = useState([]);
  const [persons, setPersons] = useState([]);
  const [form, setForm] = useState({
    type: 'BAR',
    date: todayInputValue(),
    time: '18:00 - 22:00',
    required: 2,
    note: '',
    active: true,
    draft: false,
    slot: 'EXTRA',
  });
  const [editId, setEditId] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [enrollPick, setEnrollPick] = useState({});

  const load = () =>
    Promise.all([
      api.getServices({ activeOnly: 'false', allDates: 'true', includeDraft: 'true' }),
      api.getPersons(true),
    ])
      .then(([s, p]) => {
        setServices(s);
        setPersons(p.filter((x) => x.active !== false));
      })
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  const reset = () => {
    setEditId(null);
    setForm({
      type: 'BAR',
      date: todayInputValue(),
      time: '18:00 - 22:00',
      required: 2,
      note: '',
      active: true,
      draft: false,
      slot: 'EXTRA',
    });
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setMsg('');
    try {
      const location = form.type === 'KITCHEN' ? 'Keuken' : 'Bar';
      const payload = { ...form, required: Number(form.required), location };
      if (editId) await api.updateService(editId, payload);
      else await api.createService(payload);
      reset();
      setMsg('Dienst opgeslagen. Je kunt ook datums in het verleden gebruiken (historiek).');
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const startEdit = (s) => {
    setEditId(s.id);
    setForm({
      type: s.type,
      date: toDateInputValue(s.date),
      time: s.time,
      required: s.required,
      note: s.note ?? '',
      active: s.active !== false,
      draft: Boolean(s.draft),
      slot: s.slot || 'EXTRA',
    });
  };

  const addPerson = async (serviceId) => {
    const personId = Number(enrollPick[serviceId]);
    if (!personId) return;
    setError('');
    setMsg('');
    try {
      await api.createEnrollment({ serviceId, personId });
      setEnrollPick({ ...enrollPick, [serviceId]: '' });
      setMsg('Persoon toegevoegd aan dienst.');
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const removeEnrollment = async (enrollmentId) => {
    setError('');
    setMsg('');
    try {
      await api.deleteEnrollment(enrollmentId);
      setMsg('Inschrijving verwijderd.');
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <section className="space-y-4">
      <form onSubmit={submit} className="vvl-card grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <h2 className="sm:col-span-2 lg:col-span-3 font-heading text-lg font-black uppercase">
          {editId ? 'Dienst bewerken' : 'Dienst toevoegen'}
        </h2>
        <p className="sm:col-span-2 lg:col-span-3 text-sm text-gray-700">
          Extra diensten, handmatige wijzigingen, of <strong>historische planning</strong> (datum in
          het verleden) zodat eerdere diensten meetellen in het overzicht.
        </p>
        <div>
          <label className="vvl-label">Type</label>
          <select
            className="vvl-input"
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
          >
            <option value="BAR">Bardienst (Bar)</option>
            <option value="KITCHEN">Keukendienst (Keuken)</option>
          </select>
        </div>
        <div>
          <label className="vvl-label">Datum</label>
          <input
            type="date"
            className="vvl-input"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            required
          />
        </div>
        <div>
          <label className="vvl-label">Tijd</label>
          <input
            className="vvl-input"
            value={form.time}
            onChange={(e) => setForm({ ...form, time: e.target.value })}
            required
          />
        </div>
        <div>
          <label className="vvl-label">Benodigde bezetting</label>
          <input
            type="number"
            min={1}
            className="vvl-input"
            value={form.required}
            onChange={(e) => setForm({ ...form, required: e.target.value })}
          />
        </div>
        <div>
          <label className="vvl-label">Opmerking</label>
          <input
            className="vvl-input"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
          />
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => setForm({ ...form, active: e.target.checked })}
          />
          Dienst actief
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            checked={form.draft}
            onChange={(e) => setForm({ ...form, draft: e.target.checked })}
          />
          Concept (nog niet open voor inschrijven)
        </label>
        <div className="flex gap-2 sm:col-span-2 lg:col-span-3">
          <button type="submit" className="vvl-btn-primary">
            {editId ? 'Opslaan' : 'Toevoegen'}
          </button>
          {editId ? (
            <button type="button" className="vvl-btn-outline" onClick={reset}>
              Annuleren
            </button>
          ) : null}
        </div>
      </form>

      {msg ? <p className="text-sm text-emerald-800">{msg}</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <div className="grid gap-4 md:grid-cols-2">
        {services.map((s) => {
          const enrolledIds = new Set((s.enrollments || []).map((e) => e.personId));
          return (
            <div key={s.id} className="space-y-2">
              <DienstCard
                dienst={s}
                adminMode
                onAdminRemoveEnrollment={removeEnrollment}
                headerActions={
                  <button
                    type="button"
                    className="vvl-btn-outline text-xs"
                    onClick={() => startEdit(s)}
                  >
                    Bewerk
                  </button>
                }
              />
              {!s.draft && s.active !== false ? (
                <div className="vvl-card flex flex-wrap items-end gap-2 py-3">
                  <div className="min-w-[180px] flex-1">
                    <label className="vvl-label">Persoon toevoegen (beheer)</label>
                    <select
                      className="vvl-input"
                      value={enrollPick[s.id] || ''}
                      onChange={(e) =>
                        setEnrollPick({ ...enrollPick, [s.id]: e.target.value })
                      }
                    >
                      <option value="">— Kies —</option>
                      {persons
                        .filter((p) => !enrolledIds.has(p.id))
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    className="vvl-btn-primary text-xs"
                    onClick={() => addPerson(s.id)}
                  >
                    Toevoegen
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function TeamsBeheer() {
  const [teams, setTeams] = useState([]);
  const [persons, setPersons] = useState([]);
  const [services, setServices] = useState([]);
  const [teamForm, setTeamForm] = useState({ name: '', coordinatorId: '', matchDurationMinutes: 90 });
  const [assign, setAssign] = useState({ serviceId: '', personId: '' });
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [editDuration, setEditDuration] = useState({});

  const load = () =>
    Promise.all([api.getTeams(), api.getPersons(), api.getServices({ filter: 'open' })])
      .then(([t, p, s]) => {
        setTeams(t);
        setPersons(p);
        setServices(s);
        const dur = {};
        for (const team of t) dur[team.id] = team.matchDurationMinutes ?? 90;
        setEditDuration(dur);
      })
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  const addTeam = async (e) => {
    e.preventDefault();
    try {
      await api.createTeam({
        name: teamForm.name,
        coordinatorId: teamForm.coordinatorId || null,
        matchDurationMinutes: Number(teamForm.matchDurationMinutes) || 90,
      });
      setTeamForm({ name: '', coordinatorId: '', matchDurationMinutes: 90 });
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const saveDuration = async (teamId) => {
    setError('');
    setMsg('');
    try {
      await api.updateTeam(teamId, {
        matchDurationMinutes: Number(editDuration[teamId]) || 90,
      });
      setMsg('Wedstrijdduur opgeslagen.');
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const assignMember = async (e) => {
    e.preventDefault();
    setMsg('');
    try {
      await api.createEnrollment({
        serviceId: Number(assign.serviceId),
        personId: Number(assign.personId),
      });
      setMsg('Lid ingeschreven voor dienst.');
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <section className="space-y-6">
      <form onSubmit={addTeam} className="vvl-card grid gap-3 sm:grid-cols-2">
        <h2 className="sm:col-span-2 font-heading text-lg font-black uppercase">Team toevoegen</h2>
        <div>
          <label className="vvl-label">Teamnaam</label>
          <input
            className="vvl-input"
            value={teamForm.name}
            onChange={(e) => setTeamForm({ ...teamForm, name: e.target.value })}
            placeholder="JO15-1"
            required
          />
        </div>
        <div>
          <label className="vvl-label">Teamcoördinator</label>
          <select
            className="vvl-input"
            value={teamForm.coordinatorId}
            onChange={(e) => setTeamForm({ ...teamForm, coordinatorId: e.target.value })}
          >
            <option value="">— Optioneel —</option>
            {persons.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="vvl-label">Wedstrijdduur (minuten)</label>
          <input
            type="number"
            min={1}
            className="vvl-input"
            value={teamForm.matchDurationMinutes}
            onChange={(e) =>
              setTeamForm({ ...teamForm, matchDurationMinutes: e.target.value })
            }
          />
        </div>
        <button type="submit" className="vvl-btn-primary sm:col-span-2 sm:w-fit">
          Team opslaan
        </button>
      </form>

      <div className="grid gap-3">
        {teams.map((t) => (
          <div key={t.id} className="vvl-card space-y-3">
            <h3 className="font-heading text-lg font-black uppercase">{t.name}</h3>
            <p className="text-sm text-gray-700">
              Coördinator: {t.coordinator?.name ?? '—'} · {t.members?.length ?? 0} leden
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label className="vvl-label">Wedstrijdduur (min)</label>
                <input
                  type="number"
                  min={1}
                  className="vvl-input w-28"
                  value={editDuration[t.id] ?? 90}
                  onChange={(e) =>
                    setEditDuration({ ...editDuration, [t.id]: e.target.value })
                  }
                />
              </div>
              <button
                type="button"
                className="vvl-btn-outline text-xs"
                onClick={() => saveDuration(t.id)}
              >
                Duur opslaan
              </button>
              <p className="text-xs text-gray-600 self-center">
                + 2 uur buffer na wedstrijd (geen KNVB-eindtijd)
              </p>
            </div>
            {t.members?.length ? (
              <ul className="mt-3 space-y-2">
                {t.members.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 text-sm">
                    <Avatar person={m} size="sm" />
                    <span className="font-semibold">{m.name}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-gray-500">Koppel ouders via Personen → team kiezen.</p>
            )}
          </div>
        ))}
      </div>

      <form onSubmit={assignMember} className="vvl-card grid gap-3 sm:grid-cols-2">
        <h2 className="sm:col-span-2 font-heading text-lg font-black uppercase">
          Coördinator: lid inschrijven
        </h2>
        <div>
          <label className="vvl-label">Open dienst</label>
          <select
            className="vvl-input"
            value={assign.serviceId}
            onChange={(e) => setAssign({ ...assign, serviceId: e.target.value })}
            required
          >
            <option value="">— Kies dienst —</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {SERVICE_TYPE_LABEL[s.type]} {new Date(s.date).toLocaleDateString('nl-NL')} {s.time}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="vvl-label">Persoon (ouder)</label>
          <select
            className="vvl-input"
            value={assign.personId}
            onChange={(e) => setAssign({ ...assign, personId: e.target.value })}
            required
          >
            <option value="">— Kies persoon —</option>
            {persons.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.team ? ` (${p.team.name})` : ''}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="vvl-btn-primary sm:col-span-2 sm:w-fit">
          Inschrijven voor lid
        </button>
      </form>

      {msg ? <p className="text-sm text-emerald-800">{msg}</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </section>
  );
}

function PlanningBeheer() {
  const [round, setRound] = useState(null);
  const [drafts, setDrafts] = useState([]);
  const [deadline, setDeadline] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () =>
    Promise.all([
      api.getPlanningRound(),
      api.getPlanning({ includeDraft: 'true' }),
    ])
      .then(([r, planning]) => {
        setRound(r);
        setDrafts((planning.services || []).filter((s) => s.draft));
        if (r?.volunteerDeadline) {
          setDeadline(toDateInputValue(r.volunteerDeadline));
        }
      })
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  const run = async (fn, okMsg) => {
    setBusy(true);
    setError('');
    setMsg('');
    try {
      const res = await fn();
      setMsg(okMsg(res));
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const statusLabel = {
    DRAFT: 'Concept',
    VOLUNTEER_OPEN: 'Vrijwilligers kunnen inschrijven',
    MANDATORY_OPEN: 'Verplichte fase',
    CLOSED: 'Afgerond',
  };

  return (
    <section className="space-y-4">
      <div className="vvl-card space-y-3">
        <h2 className="font-heading text-lg font-black uppercase">Planning vanuit wedstrijden</h2>
        <p className="text-sm text-gray-700">
          Na het inladen van{' '}
          <Link to="/wedstrijden" className="font-semibold underline">
            KNVB-wedstrijden
          </Link>{' '}
          maakt de app automatisch een <strong>bardienst</strong> per aftrap van een{' '}
          <strong>thuiswedstrijd</strong> (bijv. 09:00 → 09:00–12:00, bezetting 2). Meerdere
          wedstrijden op hetzelfde tijdstip delen één dienst. Op Planning kun je ook op Update
          drukken.
        </p>
        <p className="text-sm">
          Status:{' '}
          <strong>{statusLabel[round?.status] || round?.status || '—'}</strong>
          {round?.volunteerDeadline
            ? ` · deadline vrijwilligers: ${new Date(round.volunteerDeadline).toLocaleDateString('nl-NL')}`
            : ''}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="vvl-btn-primary"
            disabled={busy}
            onClick={() =>
              run(
                () => api.syncPlanningFromMatches({ required: 2 }),
                (r) =>
                  r.created
                    ? `Planning bijgewerkt: ${r.created} dienst(en) in ${r.slots ?? 0} tijdsblok(ken).`
                    : 'Geen nieuwe diensten — planning was al actueel.',
              )
            }
          >
            Planning bijwerken
          </button>
        </div>
      </div>

      <div className="vvl-card space-y-3">
        <h3 className="font-heading font-black uppercase">Publiceren & berichten</h3>
        <div>
          <label className="vvl-label">Inschrijven tot (vrijwilligers)</label>
          <input
            type="date"
            className="vvl-input max-w-xs"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="vvl-btn-primary"
            disabled={busy}
            onClick={() =>
              run(
                () => api.publishPlanning({ volunteerDeadline: deadline || undefined }),
                (r) => `${r.published} concept-dienst(en) gepubliceerd.`,
              )
            }
          >
            Concept publiceren
          </button>
          <button
            type="button"
            className="vvl-btn-outline"
            disabled={busy}
            onClick={() =>
              run(
                () => api.notifyVolunteers(),
                (r) =>
                  r.mail?.reason === 'not_configured'
                    ? 'Mail niet ingesteld — stel SMTP in bij E-mail.'
                    : `Bericht vrijwilligers: ${r.mail?.sent ?? 0} verstuurd.`,
              )
            }
          >
            Mail vrijwilligers
          </button>
          <button
            type="button"
            className="vvl-btn-outline"
            disabled={busy}
            onClick={() =>
              run(
                () => api.notifyMandatory(),
                (r) =>
                  r.mail?.reason === 'not_configured'
                    ? 'Mail niet ingesteld — stel SMTP in bij E-mail.'
                    : `Bericht verplichte: ${r.mail?.sent ?? 0} verstuurd.`,
              )
            }
          >
            Mail verplichte
          </button>
          <button
            type="button"
            className="vvl-btn-outline"
            disabled={busy}
            onClick={() =>
              run(
                () => api.fillMandatory(),
                (r) =>
                  `${r.filled} plek(ken) gevuld met verplichte van (bij voorkeur) hun team.`,
              )
            }
          >
            Vul open plekken (verplicht)
          </button>
        </div>
      </div>

      {msg ? <p className="text-sm text-emerald-800">{msg}</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <div>
        <h3 className="mb-2 font-heading font-black uppercase">
          Concept-diensten ({drafts.length})
        </h3>
        {drafts.length === 0 ? (
          <p className="text-sm text-gray-600">Nog geen concept. Maak eerst een voorstel.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {drafts.map((s) => (
              <DienstCard key={s.id} dienst={s} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

const MAIL_PRESETS = [
  {
    id: 'gmail',
    label: 'Gmail',
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    tip: 'Gebruik een Google “app-wachtwoord” (niet je normale wachtwoord).',
  },
  {
    id: 'outlook',
    label: 'Outlook / Microsoft 365',
    host: 'smtp.office365.com',
    port: 587,
    secure: false,
    tip: 'Gebruik je werk- of Outlook.com-account.',
  },
  {
    id: 'custom',
    label: 'Eigen server',
    host: '',
    port: 587,
    secure: false,
    tip: 'Vraag host, poort en inloggegevens aan je hosting of club-IT.',
  },
];

function MailBeheer() {
  const [form, setForm] = useState({
    enabled: false,
    host: '',
    port: 587,
    secure: false,
    user: '',
    password: '',
    fromEmail: '',
    fromName: 'V.V. Lekkerkerk',
  });
  const [passwordSet, setPasswordSet] = useState(false);
  const [testTo, setTestTo] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api
      .getMailSettings()
      .then((s) => {
        setForm({
          enabled: s.enabled,
          host: s.host || '',
          port: s.port || 587,
          secure: s.secure,
          user: s.user || '',
          password: '',
          fromEmail: s.fromEmail || '',
          fromName: s.fromName || 'V.V. Lekkerkerk',
        });
        setPasswordSet(s.passwordSet);
        setTestTo(s.fromEmail || '');
      })
      .catch((e) => setError(e.message));
  }, []);

  const applyPreset = (preset) => {
    setForm((f) => ({
      ...f,
      host: preset.host || f.host,
      port: preset.port,
      secure: preset.secure,
    }));
    setMsg(preset.tip);
  };

  const save = async (e) => {
    e.preventDefault();
    setError('');
    setMsg('');
    setLoading(true);
    try {
      const saved = await api.saveMailSettings(form);
      setPasswordSet(saved.passwordSet);
      setForm((f) => ({ ...f, password: '' }));
      setMsg(
        saved.isReady
          ? 'Opgeslagen. Uitnodigingen worden nu automatisch gemaild.'
          : 'Opgeslagen. Zet “E-mail versturen” aan en vul host + afzender in om te activeren.',
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const test = async () => {
    setError('');
    setMsg('');
    setLoading(true);
    try {
      const res = await api.testMail(testTo);
      setMsg(res.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="space-y-4">
      <div className="vvl-card space-y-2">
        <h2 className="font-heading text-lg font-black uppercase">Mailserver aansluiten</h2>
        <p className="text-sm text-gray-700">
          Vul hier je SMTP-gegevens in. Daarna stuurt de app uitnodigingen automatisch.
          Zonder mailserver kun je de deeplink nog steeds kopiëren.
        </p>
        <div className="flex flex-wrap gap-2 pt-2">
          {MAIL_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className="vvl-btn-outline text-xs"
              onClick={() => applyPreset(p)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={save} className="vvl-card grid gap-3 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-sm font-semibold sm:col-span-2">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
          />
          E-mail versturen inschakelen
        </label>

        <div>
          <label className="vvl-label">SMTP-host *</label>
          <input
            className="vvl-input"
            value={form.host}
            onChange={(e) => setForm({ ...form, host: e.target.value })}
            placeholder="smtp.gmail.com"
          />
        </div>
        <div>
          <label className="vvl-label">Poort *</label>
          <input
            type="number"
            className="vvl-input"
            value={form.port}
            onChange={(e) => setForm({ ...form, port: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className="vvl-label">Gebruikersnaam</label>
          <input
            className="vvl-input"
            value={form.user}
            onChange={(e) => setForm({ ...form, user: e.target.value })}
            placeholder="vaak hetzelfde als afzender"
            autoComplete="off"
          />
        </div>
        <div>
          <label className="vvl-label">
            Wachtwoord {passwordSet ? '(ingevuld — leeg laten = behouden)' : ''}
          </label>
          <input
            type="password"
            className="vvl-input"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder={passwordSet ? '••••••••' : ''}
            autoComplete="new-password"
          />
        </div>
        <div>
          <label className="vvl-label">Afzender e-mail *</label>
          <input
            type="email"
            className="vvl-input"
            value={form.fromEmail}
            onChange={(e) => setForm({ ...form, fromEmail: e.target.value })}
            placeholder="planning@vvlekkerkerk.nl"
          />
        </div>
        <div>
          <label className="vvl-label">Afzendernaam</label>
          <input
            className="vvl-input"
            value={form.fromName}
            onChange={(e) => setForm({ ...form, fromName: e.target.value })}
          />
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold sm:col-span-2">
          <input
            type="checkbox"
            checked={form.secure}
            onChange={(e) => setForm({ ...form, secure: e.target.checked })}
          />
          Beveiligde verbinding — alleen bij poort 465 (bij Gmail/587 uit laten)
        </label>
        <div className="sm:col-span-2">
          <button type="submit" className="vvl-btn-primary" disabled={loading}>
            {loading ? 'Bezig…' : 'Opslaan'}
          </button>
        </div>
      </form>

      <div className="vvl-card grid gap-3 sm:grid-cols-2">
        <h3 className="font-heading text-base font-black uppercase sm:col-span-2">Testmail</h3>
        <div>
          <label className="vvl-label">Stuur test naar</label>
          <input
            type="email"
            className="vvl-input"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            placeholder="jouw@email.nl"
          />
        </div>
        <div className="flex items-end">
          <button type="button" className="vvl-btn-outline" onClick={test} disabled={loading}>
            Verbinding testen
          </button>
        </div>
      </div>

      {msg ? (
        <p className="rounded-sm border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
          {msg}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-sm border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>
      ) : null}
    </section>
  );
}
