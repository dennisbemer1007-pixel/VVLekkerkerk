import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Avatar from '../components/Avatar.jsx';
import DienstCard from '../components/DienstCard.jsx';
import { PageTitle } from '../components/PageHelp.jsx';
import { api } from '../hooks/useApi.js';
import { SERVICE_TYPE_LABEL, todayInputValue, toDateInputValue } from '../utils/formatDate.js';
import { helpForBeheerTab } from '../utils/pageHelp.js';

import DienstregelsBeheer from './DienstregelsBeheer.jsx';
import ActiviteitenBeheer from './ActiviteitenBeheer.jsx';
import RuilBeheer from './RuilBeheer.jsx';

const TABS = [
  { id: 'personen', label: 'Personen' },
  { id: 'diensten', label: 'Diensten' },
  { id: 'planning', label: 'Planning' },
  { id: 'ruilen', label: 'Ruilen' },
  { id: 'regels', label: 'Dienstregels' },
  { id: 'activiteiten', label: 'Jaarplanning' },
  { id: 'teams', label: 'Teams' },
  { id: 'mail', label: 'E-mail' },
  { id: 'club', label: 'Club' },
];

const ROLES = ['Vrijwilliger', 'Teamcoördinator', 'Barcommissie', 'Admin'];

const OBLIGATIONS = [
  { value: 'NONE', label: 'Geen (vrijwilliger)' },
  { value: 'FULL', label: 'Verplicht (min. 1× / 6 weken)' },
  { value: 'VR18', label: 'VR18+ (min. 1× / 12 weken)' },
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
  { id: 'EVENING', label: 'Late middag/avond' },
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
              : 'Personen beheren, de 6-wekenplanning in stappen maken (Beheer → Planning), en ruilverzoeken goedkeuren.'}
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
      {tab === 'ruilen' ? <RuilBeheer /> : null}
      {tab === 'regels' ? <DienstregelsBeheer /> : null}
      {tab === 'activiteiten' ? <ActiviteitenBeheer /> : null}
      {tab === 'teams' ? <TeamsBeheer /> : null}
      {tab === 'mail' ? <MailBeheer /> : null}
      {tab === 'club' ? <ClubBeheer /> : null}
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
    exempted: false,
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
      exempted: false,
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
      exempted: Boolean(p.exempted),
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
          E-mail en telefoon zijn alleen zichtbaar voor beheerders (Barcommissie / Admin).
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
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            checked={form.exempted}
            onChange={(e) => setForm({ ...form, exempted: e.target.checked })}
          />
          Vrijgesteld (niet automatisch inplannen)
        </label>
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
                  {p.obligation === 'FULL' ? ' *' : p.obligation === 'VR18' ? ' VR18+' : ''}
                  {p.exempted ? ' (vrijgesteld)' : ''}
                  {p.personNumber ? (
                    <span className="block text-xs font-normal text-gray-500">{p.personNumber}</span>
                  ) : null}
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
                  {!p.active && (p.email || p.phone) ? (
                    <button
                      type="button"
                      className="text-xs font-bold uppercase text-red-800"
                      onClick={async () => {
                        if (!window.confirm(`Contact van ${p.name} nu wissen? Naam blijft in de planning staan.`)) {
                          return;
                        }
                        try {
                          await api.erasePersonContact(p.id);
                          await load();
                        } catch (e) {
                          setError(e.message);
                        }
                      }}
                    >
                      Wis contact
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-600">
        * = verplichte bardienst. Contactgegevens alleen hier (beheer) zichtbaar.
      </p>
      <PersonImport onDone={load} />
    </section>
  );
}

function PersonImport({ onDone }) {
  const [csv, setCsv] = useState('');
  const [sendInvites, setSendInvites] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    setError('');
    try {
      const result = await api.importPersons({ csv, sendInvites });
      setMsg(`${result.created} nieuw, ${result.updated} bijgewerkt.`);
      setCsv('');
      await onDone?.();
    } catch (err) {
      const extra = err.details?.unknownTeams?.length
        ? ` Onbekende teams: ${err.details.unknownTeams.join(', ')}.`
        : '';
      setError(`${err.message}${extra}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="vvl-card space-y-3">
      <h2 className="font-heading text-lg font-black uppercase">Personen importeren</h2>
      <p className="text-sm text-gray-700">
        CSV met kolommen <code>naam;email;telefoon;team;rol;verplichting</code>. Onbekende teams
        worden niet aangemaakt.
      </p>
      <textarea
        className="vvl-input min-h-[120px] font-mono text-xs"
        value={csv}
        onChange={(e) => setCsv(e.target.value)}
        placeholder="naam;email;telefoon;team;rol;verplichting"
        required
      />
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input
          type="checkbox"
          checked={sendInvites}
          onChange={(e) => setSendInvites(e.target.checked)}
        />
        Uitnodigingsmail sturen als SMTP aanstaat
      </label>
      <button type="submit" className="vvl-btn-outline w-fit" disabled={busy}>
        {busy ? 'Importeren…' : 'CSV importeren'}
      </button>
      {msg ? <p className="text-sm text-emerald-800">{msg}</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </form>
  );
}

function ClubBeheer() {
  const [club, setClub] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () =>
    api
      .getClubSettings()
      .then(setClub)
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  const run = async (fn, ok) => {
    setBusy(true);
    setError('');
    setMsg('');
    try {
      const res = await fn();
      setMsg(ok(res));
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-4">
      <div className="vvl-card space-y-3">
        <h2 className="font-heading text-lg font-black uppercase">Seizoen</h2>
        <p className="text-sm text-gray-700">
          Huidig seizoen: <strong>{club?.seasonLabel || '—'}</strong> (1 augustus t/m 31 juli).
          Rollover archiveert teamkoppelingen en start {club?.nextSeasonLabel || 'het volgende seizoen'}.
          Diensten en inhaaldiensten blijven staan.
        </p>
        <button
          type="button"
          className="vvl-btn-primary w-fit"
          disabled={busy}
          onClick={() => {
            if (
              !window.confirm(
                `Nieuw seizoen ${club?.nextSeasonLabel} starten? Teamkoppelingen van ${club?.seasonLabel} worden gearchiveerd.`,
              )
            ) {
              return;
            }
            run(
              () => api.rolloverSeason({ seasonLabel: club?.nextSeasonLabel }),
              (r) => `Seizoen ${r.oldLabel} → ${r.seasonLabel}.`,
            );
          }}
        >
          Nieuw seizoen starten
        </button>
      </div>
      <div className="vvl-card space-y-3">
        <h2 className="font-heading text-lg font-black uppercase">AVG</h2>
        <p className="text-sm text-gray-700">
          Auditlogs ouder dan {club?.auditRetainMonths || 24} maanden worden gewist. Contactgegevens
          van gedeactiveerde accounts na {club?.inactiveRetainMonths || 24} maanden. Roosterhistorie
          blijft.
        </p>
        <button
          type="button"
          className="vvl-btn-outline w-fit"
          disabled={busy}
          onClick={() =>
            run(
              () => api.privacyCleanup(),
              (r) => `${r.auditDeleted} auditregels, ${r.contactsCleared} contact(en) gewist.`,
            )
          }
        >
          Nu opschonen
        </button>
      </div>
      <div className="vvl-card space-y-2 text-sm text-gray-700">
        <h2 className="font-heading text-lg font-black uppercase">Hosting</h2>
        <p>
          Productie: Render Starter (of gelijkwaardig) met persistente schijf via <code>DATA_DIR</code>.
          Render Free is alleen demo — data verdwijnt bij slaapstand. Push en VoetbalAssist blijven
          geparkeerd.
        </p>
      </div>
      {msg ? <p className="text-sm text-emerald-800">{msg}</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
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
      type: s.type || 'BAR',
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
        if (err.details?.code === 'MATCH_BLOCK' && err.details?.canOverride) {
          if (window.confirm(err.message)) {
            try {
              await api.createEnrollment({ serviceId, personId, ignoreMatchBlock: true });
              setEnrollPick({ ...enrollPick, [serviceId]: '' });
              setMsg('Persoon toegevoegd (wedstrijdblokkade genegeerd, vastgelegd in audit).');
              await load();
              return;
            } catch (e2) {
              setError(e2.message);
              return;
            }
          }
        }
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
          Extra bar- of keukendiensten, handmatige wijzigingen, of <strong>historische planning</strong> (datum
          in het verleden) zodat eerdere diensten meetellen. Handmatige diensten worden niet
          overschreven door automatische regels.
        </p>
        <div>
          <label className="vvl-label">Type</label>
          <select
            className="vvl-input"
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
          >
            <option value="BAR">Bar</option>
            <option value="KITCHEN">Keuken</option>
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
                onNoShow={async (id) => {
                  try {
                    await api.markNoShow(id);
                    await load();
                  } catch (err) {
                    setError(err.message);
                  }
                }}
                onClearNoShow={async (id) => {
                  try {
                    await api.clearNoShow(id);
                    await load();
                  } catch (err) {
                    setError(err.message);
                  }
                }}
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
  const [teamForm, setTeamForm] = useState({
    name: '',
    coordinatorId: '',
    matchDurationMinutes: 90,
    availabilityUse: true,
    teamDutyUse: false,
    teamDutySlots: [],
  });
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
        availabilityUse: teamForm.availabilityUse,
        teamDutyUse: teamForm.teamDutyUse,
        teamDutySlots: teamForm.teamDutySlots,
      });
      setTeamForm({
        name: '',
        coordinatorId: '',
        matchDurationMinutes: 90,
        availabilityUse: true,
        teamDutyUse: false,
        teamDutySlots: [],
      });
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
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            checked={teamForm.availabilityUse}
            onChange={(e) => setTeamForm({ ...teamForm, availabilityUse: e.target.checked })}
          />
          Persoonlijke beschikbaarheid (wedstrijdblokkade)
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            checked={teamForm.teamDutyUse}
            onChange={(e) => setTeamForm({ ...teamForm, teamDutyUse: e.target.checked })}
          />
          Teamdienst bij thuiswedstrijd
        </label>
        {teamForm.teamDutyUse ? (
          <div className="sm:col-span-2 flex flex-wrap gap-3">
            {['MORNING', 'SECOND', 'LAST'].map((slot) => (
              <label key={slot} className="flex items-center gap-1 text-sm font-semibold">
                <input
                  type="checkbox"
                  checked={teamForm.teamDutySlots.includes(slot)}
                  onChange={() => {
                    const has = teamForm.teamDutySlots.includes(slot);
                    setTeamForm({
                      ...teamForm,
                      teamDutySlots: has
                        ? teamForm.teamDutySlots.filter((x) => x !== slot)
                        : [...teamForm.teamDutySlots, slot],
                    });
                  }}
                />
                {slot === 'MORNING' ? 'Ochtend' : slot === 'SECOND' ? 'Tweede shift' : 'Laatste shift'}
              </label>
            ))}
          </div>
        ) : null}
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
              {t.active === false ? ' · inactief' : ''}
            </p>
            <p className="text-xs text-gray-600">
              {t.availabilityUse !== false ? 'Beschikbaarheid' : 'Geen blokkade'}
              {t.teamDutyUse
                ? ` · teamdienst (${(t.teamDutySlots || []).join(', ') || 'geen shift'})`
                : ' · geen teamdienst'}
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
                Blokkade: thuis 1 uur voor/na, uit 2 uur voor/na (FO).
              </p>
            </div>
            <div className="flex flex-wrap gap-3 text-sm font-semibold">
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={t.availabilityUse !== false}
                  onChange={(e) =>
                    api.updateTeam(t.id, { availabilityUse: e.target.checked }).then(load)
                  }
                />
                Beschikbaarheid
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={Boolean(t.teamDutyUse)}
                  onChange={(e) =>
                    api.updateTeam(t.id, { teamDutyUse: e.target.checked }).then(load)
                  }
                />
                Teamdienst
              </label>
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

function PlanningStep({ number, title, children, done = false }) {
  return (
    <div
      className={`vvl-card space-y-3 border-l-4 ${
        done ? 'border-l-emerald-600' : 'border-l-vvl-primary'
      }`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-black ${
            done
              ? 'bg-emerald-600 text-white'
              : 'bg-vvl-primary text-white'
          }`}
          aria-hidden="true"
        >
          {number}
        </span>
        <h3 className="font-heading text-lg font-black uppercase">{title}</h3>
        {done ? (
          <span className="text-xs font-bold uppercase text-emerald-800">Klaar</span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function PlanningBeheer() {
  const [round, setRound] = useState(null);
  const [drafts, setDrafts] = useState([]);
  const [publishedOpen, setPublishedOpen] = useState(0);
  const [deadline, setDeadline] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () =>
    Promise.all([
      api.getPlanningRound(),
      api.getPlanning({ includeDraft: 'true' }),
      api.getPlanning({}),
    ])
      .then(([r, withDrafts, published]) => {
        setRound(r);
        setDrafts((withDrafts.services || []).filter((s) => s.draft));
        const open = (published.services || []).filter(
          (s) => !s.draft && (s.enrolled ?? s.enrollments?.length ?? 0) < (s.required ?? 0),
        );
        setPublishedOpen(open.length);
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
    DRAFT: 'Concept — nog niet gepubliceerd',
    VOLUNTEER_OPEN: 'Vrijwilligers kunnen inschrijven',
    MANDATORY_OPEN: 'Verplichte fase — automatisch vullen',
    CLOSED: 'Verplicht gevuld — maak nog officieel (stap 4)',
  };

  const isOfficial = Boolean(round?.official) || round?.status === 'OFFICIAL';
  const isPublished =
    isOfficial ||
    round?.status === 'VOLUNTEER_OPEN' ||
    round?.status === 'MANDATORY_OPEN' ||
    round?.status === 'CLOSED';
  const hasServices = drafts.length > 0 || isPublished || isOfficial;
  const step3Done =
    isOfficial || round?.status === 'CLOSED' || (isPublished && publishedOpen === 0);

  return (
    <section className="space-y-4">
      <div className="vvl-card space-y-3 bg-vvl-secondary/40">
        <h2 className="font-heading text-lg font-black uppercase">
          Zo maak je de barplanning
        </h2>
        <p className="text-sm text-gray-800">
          Volg de stappen hieronder van boven naar beneden. Eerst maakt de app de diensten
          aan, daarna kunnen vrijwilligers zich inschrijven, en tot slot schrijf je de
          <strong> verplichte mensen automatisch</strong> in op open plekken.
        </p>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-gray-800">
          <li>Diensten aanmaken uit regels + thuiswedstrijden</li>
          <li>Publiceren zodat mensen zich mogen inschrijven</li>
          <li>Open plekken automatisch vullen met verplichte leden</li>
          <li>Rooster officieel vastzetten</li>
        </ol>
        <p className="text-sm">
          Status nu:{' '}
          <strong>{statusLabel[round?.status] || round?.status || 'Nog geen ronde'}</strong>
          {round?.volunteerDeadline
            ? ` · deadline vrijwilligers: ${new Date(round.volunteerDeadline).toLocaleDateString('nl-NL')}`
            : ''}
        </p>
      </div>

      <PlanningStep number={1} title="Diensten aanmaken" done={hasServices}>
        <p className="text-sm text-gray-700">
          De app maakt bar- en keukendiensten voor de komende ±6 weken uit de
          <strong> dienstregels</strong> (Beheer → Dienstregels), plus{' '}
          <strong>thuiswedstrijden</strong> en activiteiten. Handmatige of vastgezette
          diensten blijven staan.
        </p>
        <p className="text-xs text-gray-600">
          Tip: importeer eerst wedstrijden via Wedstrijden, en controleer of personen
          de juiste verplichting hebben (Beheer → Personen).
        </p>
        <button
          type="button"
          className="vvl-btn-primary"
          disabled={busy}
          onClick={() =>
            run(
              () => api.syncPlanningFromMatches({ required: 2 }),
              (r) => {
                const parts = [];
                if (r.created) parts.push(`${r.created} dienst(en) aangemaakt`);
                if (r.updated) parts.push(`${r.updated} bijgewerkt`);
                if (r.removed) {
                  parts.push(
                    `${r.removed} dienst(en) verwijderd die niet meer bij de regels passen`,
                  );
                }
                return parts.length
                  ? `Stap 1 klaar: ${parts.join(', ')}. Ga door naar publiceren.`
                  : 'Stap 1: planning is al actueel volgens de dienstregels.';
              },
            )
          }
        >
          1. Diensten aanmaken / bijwerken
        </button>
      </PlanningStep>

      <PlanningStep number={2} title="Publiceren voor vrijwilligers" done={isPublished}>
        <p className="text-sm text-gray-700">
          Concept-diensten worden zichtbaar en vrijwilligers mogen zich inschrijven tot
          de deadline. Daarna vult de app (stap 3) de rest.
        </p>
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
            onClick={() => {
              if (deadline) {
                const parsed = new Date(`${deadline}T12:00:00`);
                if (Number.isNaN(parsed.getTime())) {
                  setError('Kies een geldige deadline-datum (of laat het veld leeg).');
                  return;
                }
              }
              run(
                () => api.publishPlanning({ volunteerDeadline: deadline || undefined }),
                (r) =>
                  `Stap 2 klaar: ${r.published} concept-dienst(en) gepubliceerd. Vrijwilligers kunnen nu inschrijven.`,
              );
            }}
          >
            2. Concept publiceren
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
            Optioneel: mail vrijwilligers
          </button>
        </div>
      </PlanningStep>

      <PlanningStep
        number={3}
        title="Verplichte mensen automatisch inschrijven"
        done={step3Done}
      >
        <p className="text-sm text-gray-700">
          Klik hieronder om open <strong>persoonlijke</strong> plekken te vullen met leden
          die verplicht zijn (1× / 6 weken), VR18+ of een inhaaldienst hebben. De app
          kiest eerlijk: eerst inhaal, dan verplicht, dan wie het minst/langst geleden
          heeft gestaan, rekening houdend met voorkeuren.
        </p>
        <p className="text-xs text-gray-600">
          Teamdiensten vult de teamcoördinator via <strong>Mijn team</strong> — die
          worden hier niet automatisch gevuld.
          {isPublished && publishedOpen > 0
            ? ` Er zijn nu ${publishedOpen} open dienst(en) met nog plek.`
            : null}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="vvl-btn-primary"
            disabled={busy || !isPublished}
            title={!isPublished ? 'Publiceer eerst de planning (stap 2)' : undefined}
            onClick={() =>
              run(
                () => api.fillMandatory(),
                (r) =>
                  `Stap 3: ${r.filled} persoonlijke plek(ken) automatisch ingeschreven. ${r.unfilled?.length ?? 0} verplichting(en) nog open.`,
              )
            }
          >
            3. Vul open plekken (verplicht)
          </button>
          <button
            type="button"
            className="vvl-btn-outline"
            disabled={busy || !isPublished}
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
            Optioneel: mail verplichte
          </button>
        </div>
        {!isPublished ? (
          <p className="text-xs font-semibold text-amber-800">
            Eerst stap 2 afronden — anders is er nog niets om te vullen.
          </p>
        ) : step3Done ? (
          <p className="text-xs font-semibold text-emerald-800">
            Open persoonlijke plekken zijn (zo ver mogelijk) gevuld. Ga door naar stap 4 als
            teamdiensten ook klaar zijn.
          </p>
        ) : null}
      </PlanningStep>

      <PlanningStep number={4} title="Officieel vastzetten" done={isOfficial}>
        <p className="text-sm text-gray-700">
          Vergrendelt de komende 6 weken. Alleen de barcommissie kan daarna nog
          in- of uitschrijven. Teamco’s moeten teamdiensten <strong>vóór</strong> deze
          stap hebben gevuld.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="vvl-btn-primary"
            disabled={busy || !isPublished || isOfficial}
            onClick={() => {
              if (
                !window.confirm(
                  'Officieel maken vergrendelt de komende 6 weken. Alleen de barcommissie kan daarna nog wijzigen. Doorgaan?',
                )
              ) {
                return;
              }
              run(
                () => api.markPlanningOfficial(),
                (r) => `Stap 4 klaar: officieel — ${r.locked} dienst(en) vergrendeld.`,
              );
            }}
          >
            4. Maak officieel
          </button>
          <button
            type="button"
            className="vvl-btn-outline"
            disabled={busy}
            onClick={() =>
              run(
                () => api.sendDutyReminders(),
                (r) =>
                  r.reason === 'not_configured'
                    ? 'Mail niet ingesteld — stel SMTP in bij E-mail.'
                    : `Herinneringen: ${r.sent ?? 0} verstuurd.`,
              )
            }
          >
            Herinneringen morgen
          </button>
        </div>
        {isOfficial ? (
          <p className="text-sm font-semibold text-emerald-900">Dit rooster is officieel.</p>
        ) : null}
      </PlanningStep>

      {msg ? (
        <p className="rounded-sm border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          {msg}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-sm border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <div>
        <h3 className="mb-2 font-heading font-black uppercase">
          Concept-diensten ({drafts.length})
        </h3>
        {drafts.length === 0 ? (
          <p className="text-sm text-gray-600">
            Nog geen concept-diensten. Klik op <strong>1. Diensten aanmaken / bijwerken</strong>{' '}
            hierboven. (Na publiceren verdwijnen concepten hier — je ziet ze dan op Planning.)
          </p>
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
