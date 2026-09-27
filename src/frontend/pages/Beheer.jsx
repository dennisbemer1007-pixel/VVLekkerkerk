import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Avatar from '../components/Avatar.jsx';
import DienstCard from '../components/DienstCard.jsx';
import { PageTitle } from '../components/PageHelp.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../hooks/useApi.js';
import {
  SERVICE_TYPE_LABEL,
  defaultPlanningEndInput,
  todayInputValue,
  toDateInputValue,
} from '../utils/formatDate.js';
import { helpForBeheerTab } from '../utils/pageHelp.js';
import { scrollToForm } from '../utils/scrollToForm.js';

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

export default function Beheer({ mode = 'full' }) {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  let tabs = TABS;
  if (mode === 'teams') tabs = TABS.filter((t) => t.id === 'teams');
  if (mode === 'invite') tabs = [{ id: 'personen', label: 'Uitnodigen' }];

  // Admin heeft dezelfde pagina’s al in de topnavigatie.
  const tabsInTopNav =
    mode === 'full' && (user?.role === 'Admin' || user?.role === 'Bestuur');

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
    mode === 'teams'
      ? 'Mijn team'
      : mode === 'invite'
        ? 'Ouders uitnodigen'
        : tabsInTopNav
          ? tabs.find((t) => t.id === tab)?.label || 'Beheer'
          : 'Beheer';

  return (
    <div className="space-y-6">
      <header>
        <PageTitle {...help}>{title}</PageTitle>
        <p className="mt-1 text-sm text-gray-700">
          {mode === 'teams'
            ? 'Schrijf ouders of teamleden in voor een bardienst.'
            : mode === 'invite'
              ? 'Nodig ouders uit per e-mail. Zij maken zelf een account via de link.'
              : 'Personen beheren en een planning voor een zelf gekozen periode maken. Ruilverzoeken zie je via het notificatiebelletje.'}
        </p>
      </header>

      {tabs.length > 1 && !tabsInTopNav ? (
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

const ACCOUNT_FILTERS = [
  { value: '', label: 'Alle' },
  { value: 'yes', label: 'Wel account' },
  { value: 'no', label: 'Geen account' },
];

function IconButton({ title, onClick, children, tone = 'default', type = 'button' }) {
  const toneClass =
    tone === 'danger'
      ? 'text-red-800 border-red-300 hover:bg-red-50'
      : tone === 'warn'
        ? 'text-amber-800 border-amber-300 hover:bg-amber-50'
        : 'border-vvl-border hover:bg-vvl-secondary';
  return (
    <button
      type={type}
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-sm border bg-white text-base ${toneClass}`}
    >
      {children}
      <span className="sr-only">{title}</span>
    </button>
  );
}

function GuardianPicker({ persons, value, onChange, excludeId }) {
  const [query, setQuery] = useState('');
  const options = persons
    .filter((p) => p.id !== excludeId)
    .filter((p) => !query.trim() || p.name.toLowerCase().includes(query.trim().toLowerCase()))
    .slice(0, 60);
  const selected = persons.find((p) => String(p.id) === String(value));

  return (
    <div className="space-y-1">
      <label className="vvl-label">Hoort bij (optioneel)</label>
      <input
        className="vvl-input"
        placeholder="Zoek op naam om te koppelen…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <select className="vvl-input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">— Geen —</option>
        {selected && !options.some((o) => o.id === selected.id) ? (
          <option value={selected.id}>{selected.name}</option>
        ) : null}
        {options.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <p className="text-xs text-gray-600">
        Voor personen zonder eigen account (bijv. kinderen) die aan een ander account hangen.
        E-mail is dan niet verplicht.
      </p>
    </div>
  );
}

function PersonAbsencesEditor({ personId, personName }) {
  const [absences, setAbsences] = useState([]);
  const [form, setForm] = useState({ fromDate: '', toDate: '', note: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => {
    api
      .getPersonAbsences(personId)
      .then(setAbsences)
      .catch((e) => setError(e.message));
  };

  useEffect(() => {
    setAbsences([]);
    setError('');
    if (personId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personId]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.fromDate || !form.toDate) {
      setError('Vul begin- en einddatum in.');
      return;
    }
    setBusy(true);
    try {
      await api.createPersonAbsence(personId, form);
      setForm({ fromDate: '', toDate: '', note: '' });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (absenceId) => {
    if (!window.confirm('Deze afwezigheidsperiode verwijderen?')) return;
    setError('');
    try {
      await api.deletePersonAbsence(personId, absenceId);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <section className="vvl-card space-y-4">
      <h2 className="font-heading text-lg font-black uppercase">
        Afwezigheid{personName ? ` — ${personName}` : ''}
      </h2>
      <p className="text-sm text-gray-700">
        Periodes waarin deze persoon niet automatisch wordt ingepland (vakantie, langdurige
        afwezigheid, etc.).
      </p>

      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="vvl-label">Van</label>
          <input
            type="date"
            className="vvl-input min-h-[44px]"
            value={form.fromDate}
            onChange={(e) => setForm({ ...form, fromDate: e.target.value })}
            required
          />
        </div>
        <div>
          <label className="vvl-label">Tot en met</label>
          <input
            type="date"
            className="vvl-input min-h-[44px]"
            value={form.toDate}
            onChange={(e) => setForm({ ...form, toDate: e.target.value })}
            required
          />
        </div>
        <div className="sm:col-span-2 lg:col-span-1">
          <label className="vvl-label">Notitie (optioneel)</label>
          <input
            className="vvl-input min-h-[44px]"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            placeholder="bijv. vakantie"
          />
        </div>
        <div className="flex items-end lg:col-span-1">
          <button type="submit" className="vvl-btn-primary min-h-[44px] w-full" disabled={busy}>
            {busy ? 'Bezig…' : 'Toevoegen'}
          </button>
        </div>
      </form>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      {absences.length === 0 ? (
        <p className="text-sm text-gray-600">Geen afwezigheidsperiodes.</p>
      ) : (
        <ul className="space-y-2">
          {absences.map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-vvl-border p-3 text-sm"
            >
              <span>
                {toDateInputValue(a.fromDate)} t/m {toDateInputValue(a.toDate)}
                {a.note ? ` — ${a.note}` : ''}
              </span>
              <IconButton title="Verwijderen" tone="danger" onClick={() => remove(a.id)}>
                🗑
              </IconButton>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PersonenBeheer() {
  const formRef = useRef(null);
  const bulkRef = useRef(null);
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
    guardianId: '',
    unavailableWeekdays: [],
    preferredSlots: [],
  });
  const [editId, setEditId] = useState(null);
  const [error, setError] = useState('');
  const [inviteResult, setInviteResult] = useState(null);
  const [copied, setCopied] = useState(false);
  const [showNameless, setShowNameless] = useState(false);

  // Kolomfilters
  const [filterName, setFilterName] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterTeam, setFilterTeam] = useState('');
  const [filterAccount, setFilterAccount] = useState('');

  // Bulk-linkverzending
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState('');
  const [exportBusy, setExportBusy] = useState(false);

  const load = async (includeNameless = showNameless) => {
    setError('');
    const errors = [];
    try {
      setPersons(await api.getPersons(true, { includeNameless }));
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
      guardianId: '',
      unavailableWeekdays: [],
      preferredSlots: [],
    });
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setInviteResult(null);
    setCopied(false);
    const email = form.email.trim();
    if (!editId && !email && !form.guardianId) {
      setError('Vul een e-mailadres in, of kies "Hoort bij".');
      return;
    }
    try {
      const data = {
        ...form,
        teamId: form.teamId || null,
        guardianId: form.guardianId || null,
      };
      if (editId) {
        await api.updatePerson(editId, data);
      } else if (email) {
        const res = await api.invitePerson(data);
        setInviteResult(res);
      } else {
        await api.createPerson(data);
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
      guardianId: p.guardianId ? String(p.guardianId) : '',
      unavailableWeekdays: p.unavailableWeekdays || [],
      preferredSlots: p.preferredSlots || [],
    });
    scrollToForm(formRef);
  };

  const toggleActive = async (p) => {
    if (p.active && !window.confirm(`${p.name} deactiveren?`)) return;
    await api.updatePerson(p.id, { active: !p.active });
    await load();
  };

  const deletePerson = async (p) => {
    if (!window.confirm(`${p.name} definitief verwijderen? Dit kan niet ongedaan gemaakt worden.`)) {
      return;
    }
    setError('');
    try {
      await api.deletePerson(p.id);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const resend = async (p) => {
    setSelectedIds([p.id]);
    setBulkMsg('');
    requestAnimationFrame(() => scrollToForm(bulkRef));
  };

  const copyLink = async () => {
    if (!inviteResult?.inviteLink) return;
    await navigator.clipboard.writeText(inviteResult.inviteLink);
    setCopied(true);
  };

  const filteredPersons = persons.filter((p) => {
    if (filterName.trim() && !p.name.toLowerCase().includes(filterName.trim().toLowerCase())) {
      return false;
    }
    if (filterRole && p.role !== filterRole) return false;
    if (filterTeam) {
      if (filterTeam === '__none__') {
        if (p.teamId) return false;
      } else if (String(p.teamId) !== filterTeam) {
        return false;
      }
    }
    if (filterAccount === 'yes' && !p.hasAccount) return false;
    if (filterAccount === 'no' && p.hasAccount) return false;
    return true;
  });

  const activeFilters = [
    filterName.trim() ? { key: 'name', label: `Naam: “${filterName.trim()}”`, clear: () => setFilterName('') } : null,
    filterRole ? { key: 'role', label: `Rol: ${filterRole}`, clear: () => setFilterRole('') } : null,
    filterTeam
      ? {
          key: 'team',
          label: `Team: ${filterTeam === '__none__' ? '— geen —' : teams.find((t) => String(t.id) === filterTeam)?.name || filterTeam}`,
          clear: () => setFilterTeam(''),
        }
      : null,
    filterAccount
      ? {
          key: 'account',
          label: `Account: ${ACCOUNT_FILTERS.find((f) => f.value === filterAccount)?.label}`,
          clear: () => setFilterAccount(''),
        }
      : null,
  ].filter(Boolean);

  const clearAllFilters = () => {
    setFilterName('');
    setFilterRole('');
    setFilterTeam('');
    setFilterAccount('');
  };

  const selectablePersons = filteredPersons.filter((p) => p.email && !p.hasAccount);
  const allSelected =
    selectablePersons.length > 0 && selectablePersons.every((p) => selectedIds.includes(p.id));

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds((ids) => ids.filter((id) => !selectablePersons.some((p) => p.id === id)));
    } else {
      setSelectedIds((ids) => [...new Set([...ids, ...selectablePersons.map((p) => p.id)])]);
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  };

  const sendBulkInvites = async () => {
    if (!selectedIds.length) return;
    setBulkBusy(true);
    setBulkMsg('');
    setError('');
    try {
      const res = await api.bulkInvitePersons(selectedIds);
      const parts = [];
      if (res.sent?.length) parts.push(`Verstuurd naar: ${res.sent.join(', ')}.`);
      if (res.skippedNoEmail?.length) {
        parts.push(`Overgeslagen (geen e-mail): ${res.skippedNoEmail.join(', ')}.`);
      }
      if (res.failed?.length) {
        parts.push(
          `Mislukt: ${res.failed.map((f) => `${f.name} (${f.reason})`).join(', ')}.`,
        );
      }
      setBulkMsg(parts.join(' ') || 'Niets te versturen.');
      setSelectedIds([]);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBulkBusy(false);
    }
  };

  const downloadTemplate = async () => {
    setError('');
    try {
      const blob = await api.downloadPersonTemplateXlsx();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'vvl-personen-sjabloon.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    }
  };

  const downloadExport = async () => {
    setExportBusy(true);
    setError('');
    try {
      const blob = await api.downloadPersonsExportXlsx();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'vvl-personen-export.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    } finally {
      setExportBusy(false);
    }
  };

  return (
    <section className="space-y-4">
      <form
        ref={formRef}
        onSubmit={submit}
        className="vvl-card grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        <h2 className="sm:col-span-2 lg:col-span-3 font-heading text-lg font-black uppercase">
          {editId ? 'Persoon bewerken' : 'Persoon toevoegen'}
        </h2>
        <p className="sm:col-span-2 lg:col-span-3 text-sm text-gray-700">
          E-mail en telefoon zijn alleen zichtbaar voor beheerders (Barcommissie / Admin). Vul
          e-mail in om een uitnodiging te versturen, of kies "Hoort bij" voor iemand zonder eigen
          account (dan is e-mail niet verplicht).
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
          <label className="vvl-label">E-mail {form.guardianId ? '' : '*'}</label>
          <input
            type="email"
            className="vvl-input"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required={!editId && !form.guardianId}
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
        <GuardianPicker
          persons={persons}
          value={form.guardianId}
          onChange={(v) => setForm({ ...form, guardianId: v })}
          excludeId={editId}
        />
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            checked={form.exempted}
            onChange={(e) => setForm({ ...form, exempted: e.target.checked })}
          />
          Vrijgesteld (niet automatisch inplannen)
        </label>
        <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-3">
          <button type="submit" className="vvl-btn-primary min-h-[44px]">
            {editId ? 'Opslaan' : 'Toevoegen / uitnodigen'}
          </button>
          {editId ? (
            <button type="button" className="vvl-btn-outline min-h-[44px]" onClick={resetForm}>
              Annuleren
            </button>
          ) : null}
        </div>
      </form>

      {editId ? (
        <PersonAbsencesEditor
          personId={editId}
          personName={persons.find((p) => p.id === editId)?.name || ''}
        />
      ) : null}

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
            <button type="button" className="vvl-btn-primary text-xs min-h-[44px]" onClick={copyLink}>
              {copied ? 'Gekopieerd!' : 'Kopieer link'}
            </button>
            <a href={inviteResult.mailto} className="vvl-btn-outline text-xs inline-flex items-center min-h-[44px]">
              Open e-mailprogramma
            </a>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="space-y-2">
          <p className="text-sm text-red-700">{error}</p>
          <button type="button" className="vvl-btn-outline text-xs min-h-[44px]" onClick={() => load()}>
            Opnieuw laden
          </button>
        </div>
      ) : null}

      <div className="vvl-card space-y-3">
        <h2 className="font-heading text-base font-black uppercase">Filters</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="vvl-label">Naam</label>
            <input
              className="vvl-input"
              value={filterName}
              onChange={(e) => setFilterName(e.target.value)}
              placeholder="Zoek op naam…"
            />
          </div>
          <div>
            <label className="vvl-label">Rol</label>
            <select className="vvl-input" value={filterRole} onChange={(e) => setFilterRole(e.target.value)}>
              <option value="">Alle</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="vvl-label">Team</label>
            <select className="vvl-input" value={filterTeam} onChange={(e) => setFilterTeam(e.target.value)}>
              <option value="">Alle</option>
              <option value="__none__">— geen team —</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="vvl-label">Account</label>
            <select
              className="vvl-input"
              value={filterAccount}
              onChange={(e) => setFilterAccount(e.target.value)}
            >
              {ACCOUNT_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        {activeFilters.length ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold uppercase text-gray-600">Actieve filters:</span>
            {activeFilters.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={f.clear}
                className="inline-flex items-center gap-1 rounded-full border border-vvl-primary bg-vvl-secondary px-3 py-1 text-xs font-semibold"
              >
                {f.label} ✕
              </button>
            ))}
            <button type="button" className="text-xs font-bold uppercase underline" onClick={clearAllFilters}>
              Wis alle filters
            </button>
          </div>
        ) : null}
      </div>

      <div className="overflow-x-auto vvl-card p-0">
        <table className="w-full text-sm">
          <thead className="bg-vvl-secondary text-xs font-bold uppercase">
            <tr>
              <th className="p-3 text-left">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  disabled={!selectablePersons.length}
                  title="Selecteer alle (met e-mail, zonder account)"
                />
              </th>
              <th className="p-3 text-left">Naam</th>
              <th className="p-3 text-left">Rol</th>
              <th className="p-3 text-left">Team</th>
              <th className="p-3 text-left">Verplichting</th>
              <th className="p-3 text-left">E-mail</th>
              <th className="p-3 text-left">Telefoon</th>
              <th className="p-3 text-left">Hoort bij</th>
              <th className="p-3 text-left">Account</th>
              <th className="p-3 text-left">Acties</th>
            </tr>
          </thead>
          <tbody>
            {filteredPersons.map((p) => (
              <tr key={p.id} className="border-t border-vvl-border align-top">
                <td className="p-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(p.id)}
                    disabled={!p.email || p.hasAccount}
                    onChange={() => toggleSelect(p.id)}
                    title={
                      !p.email
                        ? 'Geen e-mail'
                        : p.hasAccount
                          ? 'Heeft al een account'
                          : 'Selecteer voor uitnodiging'
                    }
                  />
                </td>
                <td className="p-3 font-semibold">
                  {p.name}
                  {p.exempted ? ' (vrijgesteld)' : ''}
                  {!p.active ? ' (inactief)' : ''}
                  {p.personNumber ? (
                    <span className="block text-xs font-normal text-gray-500">{p.personNumber}</span>
                  ) : null}
                </td>
                <td className="p-3">{p.role}</td>
                <td className="p-3">{p.team?.name || '—'}</td>
                <td className="p-3">{p.obligationLabel}</td>
                <td className="p-3">{p.email || '—'}</td>
                <td className="p-3">{p.phone || '—'}</td>
                <td className="p-3">{p.guardianName || '—'}</td>
                <td className="p-3">
                  {p.hasAccount ? 'Wel' : p.invitePending ? 'Wel (uitnodiging open)' : 'Geen'}
                </td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-1">
                    <IconButton title={`${p.name} bewerken`} onClick={() => startEdit(p)}>
                      ✏️
                    </IconButton>
                    {!p.hasAccount && p.email ? (
                      <IconButton title={`Link opnieuw versturen naar ${p.name}`} onClick={() => resend(p)}>
                        ✉️
                      </IconButton>
                    ) : null}
                    <IconButton
                      title={p.active ? `${p.name} deactiveren` : `${p.name} activeren`}
                      tone="warn"
                      onClick={() => toggleActive(p)}
                    >
                      {p.active ? '⛔' : '✅'}
                    </IconButton>
                    {!p.active && (p.email || p.phone) ? (
                      <IconButton
                        title={`Contact van ${p.name} wissen (AVG)`}
                        tone="warn"
                        onClick={async () => {
                          if (
                            !window.confirm(`Contact van ${p.name} nu wissen? Naam blijft in de planning staan.`)
                          ) {
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
                        🧹
                      </IconButton>
                    ) : null}
                    <IconButton title={`${p.name} verwijderen`} tone="danger" onClick={() => deletePerson(p)}>
                      🗑️
                    </IconButton>
                  </div>
                </td>
              </tr>
            ))}
            {filteredPersons.length === 0 ? (
              <tr>
                <td colSpan={10} className="p-4 text-center text-sm text-gray-600">
                  Geen personen gevonden met deze filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-600">
        Contactgegevens alleen hier (beheer) zichtbaar. Ouders die een coördinator alleen op naam
        zet (zonder e-mail) staan hier niet, zodat iemand met een account niet twee keer voorkomt.
        Die namen beheer je via Mijn team.
      </p>
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input
          type="checkbox"
          checked={showNameless}
          onChange={(e) => {
            setShowNameless(e.target.checked);
            load(e.target.checked);
          }}
        />
        Toon ook namen zonder account
      </label>

      <div ref={bulkRef} className="vvl-card space-y-3">
        <h2 className="font-heading text-lg font-black uppercase">Uitnodigingslink versturen</h2>
        <p className="text-sm text-gray-700">
          Selecteer een of meer personen met e-mail zonder account (bovenaan de tabel of hieronder)
          en verstuur de uitnodigingslink via de ingestelde mailtekst (Beheer → E-mail). Personen
          zonder e-mail worden overgeslagen en na versturen apart gemeld.
        </p>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold">{selectedIds.length} geselecteerd</span>
          <button
            type="button"
            className="vvl-btn-outline text-xs min-h-[44px]"
            onClick={toggleSelectAll}
            disabled={!selectablePersons.length}
          >
            {allSelected ? 'Selecteer niets' : 'Selecteer alles (met e-mail, geen account)'}
          </button>
          <button
            type="button"
            className="vvl-btn-primary text-xs min-h-[44px]"
            disabled={bulkBusy || !selectedIds.length}
            onClick={sendBulkInvites}
          >
            {bulkBusy ? 'Versturen…' : 'Verstuur uitnodiging(en)'}
          </button>
        </div>
        {selectedIds.length ? (
          <ul className="flex flex-wrap gap-2 text-xs">
            {selectedIds.map((id) => {
              const p = persons.find((x) => x.id === id);
              if (!p) return null;
              return (
                <li key={id} className="rounded-full border border-vvl-border px-3 py-1">
                  {p.name}
                </li>
              );
            })}
          </ul>
        ) : null}
        {bulkMsg ? <p className="text-sm text-emerald-800">{bulkMsg}</p> : null}
      </div>

      <div className="vvl-card space-y-3">
        <h2 className="font-heading text-lg font-black uppercase">Import / export (Excel)</h2>
        <p className="text-sm text-gray-700">
          Download het sjabloon voor de juiste kolommen en toegestane waarden, of exporteer alle
          huidige personen in dezelfde structuur (her-importeerbaar).
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="vvl-btn-outline text-xs min-h-[44px]" onClick={downloadTemplate}>
            Template downloaden
          </button>
          <button
            type="button"
            className="vvl-btn-outline text-xs min-h-[44px]"
            onClick={downloadExport}
            disabled={exportBusy}
          >
            {exportBusy ? 'Exporteren…' : 'Exporteren'}
          </button>
        </div>
      </div>

      <PersonImport onDone={() => load(showNameless)} />
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
      <h2 className="font-heading text-lg font-black uppercase">Personen importeren (CSV)</h2>
      <p className="text-sm text-gray-700">
        CSV met kolommen <code>naam;email;telefoon;team;rol;verplichting</code>. Onbekende teams
        worden niet aangemaakt. Verplichting: geen, verplicht of VR18. Liever Excel? Gebruik
        hierboven "Template downloaden" en "Exporteren".
      </p>
      <button
        type="button"
        className="vvl-btn-outline text-xs min-h-[44px]"
        onClick={async () => {
          setError('');
          try {
            const blob = await api.downloadPersonCsvExample();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'voorbeeld-personen.csv';
            a.click();
            URL.revokeObjectURL(url);
          } catch (err) {
            setError(err.message);
          }
        }}
      >
        Voorbeeld-CSV downloaden
      </button>
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
      <button type="submit" className="vvl-btn-outline w-fit min-h-[44px]" disabled={busy}>
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
  const formRef = useRef(null);
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
  const [personSearch, setPersonSearch] = useState({});
  const [dateFrom, setDateFrom] = useState(todayInputValue());
  const [dateTo, setDateTo] = useState('');

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

  const filteredServices = useMemo(() => {
    const from = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
    const to = dateTo ? new Date(`${dateTo}T23:59:59`) : null;
    return services.filter((s) => {
      const d = new Date(s.date);
      if (from && d < from) return false;
      if (to && d > to) return false;
      // Standaard: alleen toekomstig (vanaf vandaag) als geen tot-filter en from = vandaag
      if (!dateTo && dateFrom === todayInputValue() && d < from) return false;
      return true;
    });
  }, [services, dateFrom, dateTo]);

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
    scrollToForm(formRef);
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
      <form
        ref={formRef}
        onSubmit={submit}
        className="vvl-card grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
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

      <div className="vvl-card grid gap-3 sm:grid-cols-2">
        <div>
          <label className="vvl-label">Van</label>
          <input
            type="date"
            className="vvl-input min-h-[44px]"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>
        <div>
          <label className="vvl-label">Tot</label>
          <input
            type="date"
            className="vvl-input min-h-[44px]"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
        <p className="sm:col-span-2 text-xs text-gray-600">
          Standaard vanaf vandaag. Leeg de tot-datum of zet van vroeger om oude diensten te zoeken.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {filteredServices.map((s) => {
          const enrolledIds = new Set((s.enrollments || []).map((e) => e.personId));
          const search = (personSearch[s.id] || '').trim().toLowerCase();
          const personOptions = persons
            .filter((p) => !enrolledIds.has(p.id))
            .filter((p) => !search || p.name.toLowerCase().includes(search));
          return (
            <div key={s.id} className="space-y-2">
              <DienstCard
                dienst={s}
                adminMode
                allowNoShow
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
                    className="vvl-btn-outline min-h-[44px] text-xs"
                    onClick={() => startEdit(s)}
                  >
                    Bewerk
                  </button>
                }
              />
              {!s.draft && s.active !== false ? (
                <div className="vvl-card flex flex-wrap items-end gap-2 py-3">
                  <div className="min-w-[180px] flex-1 space-y-2">
                    <label className="vvl-label">Persoon toevoegen</label>
                    <input
                      className="vvl-input min-h-[44px]"
                      placeholder="Zoek op naam…"
                      value={personSearch[s.id] || ''}
                      onChange={(e) =>
                        setPersonSearch({ ...personSearch, [s.id]: e.target.value })
                      }
                    />
                    <select
                      className="vvl-input min-h-[44px]"
                      value={enrollPick[s.id] || ''}
                      onChange={(e) =>
                        setEnrollPick({ ...enrollPick, [s.id]: e.target.value })
                      }
                    >
                      <option value="">— Kies —</option>
                      {personOptions.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    className="vvl-btn-primary min-h-[44px] text-xs"
                    onClick={() => addPerson(s.id)}
                  >
                    Toevoegen
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
        {filteredServices.length === 0 ? (
          <p className="vvl-card text-sm text-gray-600 md:col-span-2">
            Geen diensten in dit datumbereik.
          </p>
        ) : null}
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
  const [editing, setEditing] = useState(null);

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

  const saveTeam = async (e) => {
    e.preventDefault();
    if (!editing?.id) return;
    setError('');
    setMsg('');
    try {
      await api.updateTeam(editing.id, {
        name: editing.name,
        coordinatorId: editing.coordinatorId || null,
      });
      setMsg('Team bijgewerkt. Ouders en de coördinator blijven aan dit team gekoppeld.');
      setEditing(null);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const removeTeam = async (team) => {
    setError('');
    setMsg('');
    const ok = window.confirm(
      `${team.name} verwijderen?\n\nOuders met een account blijven in de personenlijst, maar zijn niet meer aan dit team gekoppeld.\nOuders zonder account en zonder dienst verdwijnen.\nOuders zonder account die al een dienst hebben gedraaid blijven in de historie, maar niet meer op het team.`,
    );
    if (!ok) return;
    try {
      const res = await api.deleteTeam(team.id);
      setMsg(
        `${team.name} verwijderd. ${res.removedParents || 0} ouder(s) zonder dienst weg, ${res.keptAccounts || 0} account(s) bewaard${res.keptHistory ? `, ${res.keptHistory} in de historie` : ''}.`,
      );
      setEditing(null);
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
          Persoonlijke beschikbaarheid: wedstrijd van dit team blokkeert inschrijven
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            checked={teamForm.teamDutyUse}
            onChange={(e) => setTeamForm({ ...teamForm, teamDutyUse: e.target.checked })}
          />
          Teamdienst bij thuiswedstrijd (jeugd: ouders vullen de bardienstcoördinator in)
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
                {slot === 'MORNING'
                  ? 'Ochtend 07:30–12:00'
                  : slot === 'SECOND'
                    ? 'Middag 12:00–16:30'
                    : 'Avond 16:30–19:30'}
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
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="font-heading text-lg font-black uppercase">{t.name}</h3>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="vvl-btn-outline text-xs"
                  onClick={() =>
                    setEditing({
                      id: t.id,
                      name: t.name,
                      coordinatorId: t.coordinator?.id ? String(t.coordinator.id) : '',
                    })
                  }
                >
                  Wijzigen
                </button>
                <button
                  type="button"
                  className="text-xs font-bold uppercase text-red-800"
                  onClick={() => removeTeam(t)}
                >
                  Verwijderen
                </button>
              </div>
            </div>
            {editing?.id === t.id ? (
              <form onSubmit={saveTeam} className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="vvl-label">Teamnaam</label>
                  <input
                    className="vvl-input"
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="vvl-label">Bardienstcoördinator</label>
                  <select
                    className="vvl-input"
                    value={editing.coordinatorId}
                    onChange={(e) => setEditing({ ...editing, coordinatorId: e.target.value })}
                  >
                    <option value="">— Geen —</option>
                    {persons.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="sm:col-span-2 text-xs text-gray-600">
                  Hernoemen (bijvoorbeeld O12 naar O13) houdt dezelfde ouders en coördinator.
                  Een vrijwilliger die je als coördinator kiest, krijgt de rol Teamcoördinator.
                </p>
                <div className="flex gap-2">
                  <button type="submit" className="vvl-btn-primary text-xs">
                    Opslaan
                  </button>
                  <button type="button" className="vvl-btn-outline text-xs" onClick={() => setEditing(null)}>
                    Annuleren
                  </button>
                </div>
              </form>
            ) : null}
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
  const [fromDate, setFromDate] = useState(todayInputValue());
  const [toDate, setToDate] = useState(() => defaultPlanningEndInput());
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const periodPayload = () => ({ from: fromDate, to: toDate });

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
        if (r?.fromDate) setFromDate(toDateInputValue(r.fromDate));
        if (r?.toDate) setToDate(toDateInputValue(r.toDate));
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
          Volg de stappen van boven naar beneden. Je kiest zelf de periode (bijvoorbeeld oktober tot
          december). De app deelt per bardienst de teamplekken in bij <strong>één</strong> jeugdteam
          dat <strong>thuis</strong> speelt (wie het minst heeft gestaan), laat vrijwilligers de
          open plekken vullen, en plant daarna verplichte mensen in.
        </p>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-gray-800">
          <li>Kies de periode en maak diensten aan (inclusief jeugd-teamdiensten)</li>
          <li>Publiceren zodat mensen zich mogen inschrijven</li>
          <li>Open (niet-team) plekken vullen met verplichte leden; coördinator vult ouders</li>
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
          Kies de periode waarvoor je wilt plannen (bijvoorbeeld 1 oktober t/m 31 december).
          De app gebruikt de <strong>standaard dienstregels</strong> van de club, plus
          thuiswedstrijden en activiteiten. Per dienstregel staat het aantal plekken vast. Speelt
          er jeugd thuis, dan krijgt <strong>één team</strong> de teamplekken — het team dat dit
          seizoen het minst heeft gestaan. Standaard:
        </p>
        <ul className="list-disc pl-5 text-sm text-gray-700">
          <li>O8 t/m O12, 07:30–12:00: 3 plekken, waarvan 2 voor één thuisspelend team</li>
          <li>O13 t/m O17, 12:00–16:30: 3 plekken, waarvan 2 voor één thuisspelend team</li>
          <li>O13 t/m O17, 16:30–19:30: 2 plekken, waarvan 1 voor één thuisspelend team</li>
        </ul>
        <p className="text-xs text-gray-600">
          Leeftijdsgroep en aantal teamplekken pas je aan via Beheer → Dienstregels. Tip: importeer
          eerst wedstrijden via Wedstrijden. Ontbrekende jeugdteams worden bij import automatisch
          aangemaakt.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 max-w-xl">
          <div>
            <label className="vvl-label">Van</label>
            <input
              type="date"
              className="vvl-input"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="vvl-label">Tot en met</label>
            <input
              type="date"
              className="vvl-input"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              required
            />
          </div>
        </div>
        <button
          type="button"
          className="vvl-btn-primary"
          disabled={busy}
          onClick={() =>
            run(
              () => api.syncPlanningFromMatches(periodPayload()),
              (r) => {
                const parts = [];
                if (r.created) parts.push(`${r.created} dienst(en) aangemaakt`);
                if (r.updated) parts.push(`${r.updated} bijgewerkt`);
                if (r.teamDuties) parts.push(`${r.teamDuties} met jeugd-teamdienst`);
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
                () => api.publishPlanning({ volunteerDeadline: deadline || undefined, ...periodPayload() }),
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
          Klik hieronder om open <strong>vrijwilligersplekken</strong> te vullen met leden
          die verplicht zijn (1× / 6 weken), VR18+ of een inhaaldienst hebben. Teamplekken
          (O8–O17 thuis) blijven staan voor de bardienstcoördinator, die de namen van ouders invult.
        </p>
        <p className="text-xs text-gray-600">
          Teamdiensten vult de bardienstcoördinator via <strong>Mijn team</strong>.
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
                () => api.fillMandatory(periodPayload()),
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
          Dit zet het rooster vast, zodat de lijst in de kantine hetzelfde blijft als in de app.
          Vrijwilligers kunnen zich daarna niet meer zelf in- of uitschrijven. Onderling ruilen
          blijft mogelijk als beide personen akkoord zijn. De barcommissie kan nog wijzigen. De
          bardienstcoördinator kan een teamdienst nog op naam zetten. Accounts krijgen de mail “de
          planning is klaar” als de mailserver aanstaat. Officieel maken kun je later weer
          terugdraaien.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="vvl-btn-primary"
            disabled={busy || !isPublished || isOfficial}
            onClick={() => {
              if (
                !window.confirm(
                  'Officieel maken zet deze periode vast. Vrijwilligers kunnen daarna niet meer zelf in- of uitschrijven. Onderling ruilen blijft mogelijk als beide akkoord zijn. De barcommissie en de bardienstcoördinator (voor teamdiensten) kunnen nog wijzigen. Doorgaan?',
                )
              ) {
                return;
              }
              run(
                () => api.markPlanningOfficial(periodPayload()),
                (r) => `Stap 4 klaar: officieel — ${r.locked} dienst(en) vergrendeld.`,
              );
            }}
          >
            4. Maak officieel
          </button>
          {isOfficial ? (
            <button
              type="button"
              className="vvl-btn-outline"
              disabled={busy}
              onClick={() => {
                if (
                  !window.confirm(
                    'Officieel terugdraaien ontgrendelt de diensten weer. Vrijwilligers mogen dan opnieuw in- en uitschrijven. Doorgaan?',
                  )
                ) {
                  return;
                }
                run(
                  () => api.unmarkPlanningOfficial(periodPayload()),
                  (r) =>
                    `Officieel teruggedraaid — ${r.unlocked} dienst(en) ontgrendeld. Vrijwilligersfase is weer open.`,
                );
              }}
            >
              Officieel terugdraaien
            </button>
          ) : null}
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
            Herinneringen over 2 dagen
          </button>
        </div>
        {isOfficial ? (
          <p className="text-sm font-semibold text-emerald-900">
            Dit rooster is officieel. Met “Officieel terugdraaien” zet je de vergrendeling weer uit.
          </p>
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
    templates: {
      invite: { subject: '', body: '' },
      scheduled: { subject: '', body: '' },
      reminder: { subject: '', body: '' },
      planningReady: { subject: '', body: '' },
    },
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
          templates: s.templates || form.templates,
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
          Vul hier je SMTP-gegevens in. Daarna stuurt de app uitnodigingen, een bevestiging bij
          inplannen, een herinnering twee dagen van tevoren en “planning klaar” bij officieel maken.
          Zonder mailserver kun je de deeplink nog steeds kopiëren. Push en WhatsApp zitten er niet in.
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
        <div className="sm:col-span-2 space-y-4 border-t border-vvl-border pt-4">
          <h3 className="font-heading text-base font-black uppercase">E-mailteksten</h3>
          <p className="text-xs text-gray-600">
            Placeholders: {'{naam}'}, {'{datum}'}, {'{tijd}'}, {'{dienst}'}, {'{link}'}. Leeg opslaan
            kan niet per ongeluk de standaard wissen: een lege tekst valt terug op de standaard.
          </p>
          {[
            ['invite', 'Uitnodiging'],
            ['scheduled', 'Bevestiging bij inplannen'],
            ['reminder', 'Herinnering, twee dagen van tevoren'],
            ['planningReady', 'Planning klaar'],
          ].map(([key, label]) => (
            <div key={key} className="space-y-2">
              <p className="text-sm font-bold">{label}</p>
              <input
                className="vvl-input"
                value={form.templates?.[key]?.subject || ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    templates: {
                      ...form.templates,
                      [key]: { ...form.templates?.[key], subject: e.target.value },
                    },
                  })
                }
                placeholder="Onderwerp"
              />
              <textarea
                className="vvl-input min-h-[120px] font-mono text-xs"
                value={form.templates?.[key]?.body || ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    templates: {
                      ...form.templates,
                      [key]: { ...form.templates?.[key], body: e.target.value },
                    },
                  })
                }
              />
            </div>
          ))}
        </div>
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
