import { useEffect, useRef, useState } from 'react';
import DesktopOnly from '../components/DesktopOnly.jsx';
import NlDateInput from '../components/NlDateInput.jsx';
import { api } from '../hooks/useApi.js';
import RefereeLevelField, { RefereeBadges } from '../scheids/RefereeLevelField.jsx';
import { levelsForPerson, savePersonLevels, useScheidsState } from '../scheids/store.js';
import { toDateInputValue } from '../utils/formatDate.js';

const ROLES = ['Vrijwilliger', 'Teamcoördinator', 'Barcommissie', 'Admin'];
const OBLIGATIONS = [
  { value: 'NONE', label: 'Geen (vrijwilliger)' },
  { value: 'FULL', label: 'Verplicht (min. 1× / 6 weken)' },
  { value: 'VR18', label: 'VR18+ (min. 1× / 12 weken)' },
];
const ACCOUNT_FILTERS = [
  { value: '', label: 'Alle' },
  { value: 'yes', label: 'Wel account' },
  { value: 'no', label: 'Geen account' },
];
const REFEREE_FILTERS = [
  { value: '', label: 'Alle' },
  { value: 'pupillen', label: 'Pupillen' },
  { value: 'junioren', label: 'Junioren' },
  { value: 'senioren', label: 'Senioren' },
  { value: 'none', label: 'Geen' },
];

const emptyForm = {
  name: '',
  email: '',
  phone: '',
  role: 'Vrijwilliger',
  obligation: 'NONE',
  teamId: '',
  exempted: false,
  exemptedUntil: '',
  guardianId: '',
  refereeLevels: [],
};

function IconButton({ title, onClick, children, tone = 'default', size = 'md' }) {
  const toneClass =
    tone === 'danger'
      ? 'text-red-800 border-red-300 hover:bg-red-50'
      : tone === 'warn'
        ? 'text-amber-800 border-amber-300 hover:bg-amber-50'
        : 'border-vvl-border hover:bg-vvl-secondary';
  const box = size === 'sm' ? 'h-8 w-8 text-sm' : 'h-11 w-11 text-base';
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`inline-flex shrink-0 items-center justify-center rounded-sm border bg-white ${box} ${toneClass}`}
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
    <div className="space-y-1 sm:col-span-2">
      <label className="vvl-label">Kind van / gekoppeld aan ouder</label>
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
    try {
      await api.deletePersonAbsence(personId, absenceId);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <section className="space-y-3 border-t border-vvl-border pt-3">
      <h3 className="font-heading text-base font-black uppercase">Afwezigheid</h3>
      <form onSubmit={submit} className="grid gap-2 sm:grid-cols-2">
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
        <div className="sm:col-span-2">
          <label className="vvl-label">Notitie</label>
          <input
            className="vvl-input min-h-[44px]"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            placeholder="bijv. vakantie"
          />
        </div>
        <button type="submit" className="vvl-btn-outline min-h-[44px] w-fit" disabled={busy}>
          {busy ? 'Bezig…' : 'Afwezigheid toevoegen'}
        </button>
      </form>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {absences.length === 0 ? (
        <p className="text-sm text-gray-600">Geen afwezigheid voor {personName || 'deze persoon'}.</p>
      ) : (
        <ul className="space-y-2">
          {absences.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>
                {toDateInputValue(a.fromDate)} t/m {toDateInputValue(a.toDate)}
                {a.note ? ` — ${a.note}` : ''}
              </span>
              <IconButton title="Verwijderen" tone="danger" size="sm" onClick={() => remove(a.id)}>
                🗑
              </IconButton>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function PersonImport({ onDone }) {
  const [csv, setCsv] = useState('');
  const [sendInvites, setSendInvites] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [rowErrors, setRowErrors] = useState([]);
  const [canCreateTeams, setCanCreateTeams] = useState(false);
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const clearResult = () => {
    setMsg('');
    setError('');
    setRowErrors([]);
    setCanCreateTeams(false);
  };

  const showImportError = (err, nextPending) => {
    const details = err.details || {};
    const rows = Array.isArray(details.invalidRows) ? details.invalidRows : [];
    setRowErrors(rows);
    setCanCreateTeams(Boolean(details.canCreateTeams));
    setPending(details.canCreateTeams ? nextPending : null);
    const teams = (details.unknownTeams || []).join(', ');
    setError([err.message, teams ? `Onbekende teams: ${teams}.` : ''].filter(Boolean).join(' '));
  };

  const finishImport = async (result) => {
    setPending(null);
    setCanCreateTeams(false);
    setRowErrors([]);
    setMsg(`${result.created} nieuw, ${result.updated} bijgewerkt${result.linked ? `, ${result.linked} gekoppeld` : ''}.`);
    await onDone?.();
  };

  const importXlsxFile = async (file, createMissingTeams = false) => {
    if (!file && !pending?.xlsxBase64) return;
    setBusy(true);
    clearResult();
    let base64 = pending?.xlsxBase64 || '';
    try {
      if (file) {
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error('Bestand lezen mislukt'));
          reader.readAsDataURL(file);
        });
        base64 = String(dataUrl).split(',')[1] || '';
      }
      await finishImport(await api.importPersonsXlsx({ xlsxBase64: base64, sendInvites, createMissingTeams }));
    } catch (err) {
      showImportError(err, { kind: 'xlsx', xlsxBase64: base64 });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const importCsv = async (createMissingTeams = false) => {
    setBusy(true);
    clearResult();
    try {
      const result = await api.importPersons({ csv, sendInvites, createMissingTeams });
      setCsv('');
      await finishImport(result);
    } catch (err) {
      showImportError(err, { kind: 'csv' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="vvl-card space-y-4">
      <h2 className="font-heading text-lg font-black uppercase">Import en export</h2>
      <ul className="space-y-3 text-sm text-gray-800">
        <li>
          <button
            type="button"
            className="vvl-btn-outline mb-1 text-xs min-h-[44px]"
            onClick={async () => {
              clearResult();
              try {
                downloadBlob(await api.downloadPersonTemplateXlsx(), 'vvl-personen-sjabloon.xlsx');
              } catch (err) {
                setError(err.message);
              }
            }}
          >
            Sjabloon downloaden
          </button>
          <p>
            Excel met mockdata én de teamnamen die al in de app staan (app is leidend). Staat in Excel
            “Lekkerkerk JO15-1” en in de app “JO15-1”? Dat mag; de import koppelt ze automatisch.
          </p>
        </li>
        <li>
          <button
            type="button"
            className="vvl-btn-outline mb-1 text-xs min-h-[44px]"
            onClick={async () => {
              clearResult();
              try {
                downloadBlob(await api.downloadPersonCsvExample(), 'voorbeeld-personen.csv');
              } catch (err) {
                setError(err.message);
              }
            }}
          >
            Voorbeeld-CSV downloaden
          </button>
          <p>
            Zelfde mockdata als platte CSV (puntkomma). Teamnamen JO15-1 / JO13-2 / JO11-1 moeten
            bestaan, of kies “ontbrekende teams aanmaken” als de app dat aanbiedt.
          </p>
        </li>
        <li>
          <button
            type="button"
            className="vvl-btn-outline mb-1 text-xs min-h-[44px]"
            onClick={async () => {
              clearResult();
              try {
                downloadBlob(await api.downloadPersonsExportXlsx(), 'vvl-personen-export.xlsx');
              } catch (err) {
                setError(err.message);
              }
            }}
          >
            Personen exporteren
          </button>
          <p>Alle huidige personen in hetzelfde Excel-bestand. Aanpassen en opnieuw importeren mag.</p>
        </li>
        <li>
          <label className="vvl-label">Ingevuld Excel-bestand importeren</label>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="vvl-input"
            onChange={(e) => importXlsxFile(e.target.files?.[0])}
          />
        </li>
      </ul>
      <form
        className="space-y-2 border-t border-vvl-border pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          importCsv(false);
        }}
      >
        <label className="vvl-label">Of plak een CSV</label>
        <textarea
          className="vvl-input min-h-[80px] font-mono text-xs"
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          placeholder="naam;email;telefoon;team;rol;verplichting"
          required
        />
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={sendInvites} onChange={(e) => setSendInvites(e.target.checked)} />
          Stuur meteen een uitnodigingsmail, als de mailserver aanstaat
        </label>
        <button type="submit" className="vvl-btn-outline w-fit min-h-[44px]" disabled={busy}>
          {busy ? 'Importeren…' : 'CSV importeren'}
        </button>
      </form>
      {canCreateTeams ? (
        <button
          type="button"
          className="vvl-btn-primary min-h-[44px] text-xs"
          disabled={busy}
          onClick={() => (pending?.kind === 'xlsx' ? importXlsxFile(null, true) : importCsv(true))}
        >
          Ontbrekende teams aanmaken en importeren
        </button>
      ) : null}
      {rowErrors.length ? (
        <ul className="space-y-1 text-sm text-red-800">
          {rowErrors.map((row) => (
            <li key={`${row.row}-${row.name}-${row.team}`}>
              Rij {row.row || '?'}: {row.name || 'zonder naam'}
              {row.team ? ` · team ${row.team}` : ''} — {row.error}
            </li>
          ))}
        </ul>
      ) : null}
      {msg ? <p className="text-sm text-emerald-800">{msg}</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}

export default function PersonenBeheer() {
  const scheids = useScheidsState();
  const [persons, setPersons] = useState([]);
  const [teams, setTeams] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState('');
  const [inviteResult, setInviteResult] = useState(null);
  const [copied, setCopied] = useState(false);
  const [copiedPersonId, setCopiedPersonId] = useState(null);
  const [showNameless, setShowNameless] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterName, setFilterName] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterTeam, setFilterTeam] = useState('');
  const [filterAccount, setFilterAccount] = useState('');
  const [filterReferee, setFilterReferee] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState('');
  const [seasonCounts, setSeasonCounts] = useState({});

  const load = async (includeNameless = showNameless) => {
    setError('');
    try {
      setPersons(await api.getPersons(true, { includeNameless }));
      setTeams(await api.getTeams());
      const stats = await api.getStats().catch(() => null);
      const map = {};
      for (const row of stats?.dutyStats || []) map[row.id] = row.barThisSeason ?? row.barThisYear ?? 0;
      setSeasonCounts(map);
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const closeForm = () => {
    setFormOpen(false);
    setEditId(null);
    setForm(emptyForm);
    // Houd inviteResult staan zodat de link op de pagina blijft tot je hem sluit.
  };

  const openAdd = () => {
    setEditId(null);
    setForm(emptyForm);
    setInviteResult(null);
    setCopied(false);
    setCopiedPersonId(null);
    setFormOpen(true);
  };

  const openEdit = (p) => {
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
      exemptedUntil: p.exemptedUntil || '',
      guardianId: p.guardianId ? String(p.guardianId) : '',
      refereeLevels: levelsForPerson(p, scheids),
    });
    setFormOpen(true);
  };

  const submit = async (e, mode = 'save') => {
    e.preventDefault();
    setError('');
    setInviteResult(null);
    setCopied(false);
    const email = form.email.trim();
    if (!editId && !email && !form.guardianId) {
      setError('Vul een e-mailadres in, of koppel aan een ouder.');
      return;
    }
    if (!editId && mode === 'invite' && !email) {
      setError('Vul een e-mailadres in om uit te nodigen.');
      return;
    }
    try {
      const { refereeLevels, ...formRest } = form;
      const data = {
        ...formRest,
        teamId: form.teamId || null,
        guardianId: form.guardianId || null,
      };
      if (editId) {
        await api.updatePerson(editId, data);
        if (scheids.enabled) savePersonLevels({ id: editId, email: data.email }, refereeLevels);
        closeForm();
      } else if (mode === 'invite') {
        const res = await api.invitePerson(data);
        setInviteResult(res);
        setCopied(false);
        setCopiedPersonId(null);
        // Houd de popup open zodat de link altijd te kopiëren is, ook als de mail ging.
        setForm(emptyForm);
        setEditId(null);
        setFormOpen(true);
      } else {
        await api.createPerson(data);
        closeForm();
      }
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const deletePerson = async (p) => {
    if (!window.confirm(`${p.name} verwijderen?`)) return;
    setError('');
    try {
      await api.deletePerson(p.id);
      setSelectedIds((ids) => ids.filter((id) => id !== p.id));
      if (editId === p.id) closeForm();
      await load();
    } catch (err) {
      if (/deactiveer|rooster-historie|historie/i.test(err.message || '')) {
        if (window.confirm(`${p.name} kan niet weg omdat er geschiedenis is. Nu deactiveren?`)) {
          try {
            await api.updatePerson(p.id, { active: false });
            setSelectedIds((ids) => ids.filter((id) => id !== p.id));
            if (editId === p.id) closeForm();
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

  const resend = async (p) => {
    setError('');
    setBulkMsg('');
    setInviteResult(null);
    try {
      const res = await api.resendInvite(p.id);
      setInviteResult(res);
      setCopied(false);
      setBulkMsg(
        res.emailSent
          ? `Uitnodiging verstuurd naar ${p.email}.`
          : `Geen e-mail verstuurd naar ${p.email}. ${res.emailError || 'Stuur de link handmatig of kopieer hieronder.'}`,
      );
      if (!res.emailSent) {
        setError(
          res.emailError ||
            'E-mail is niet verstuurd. Controleer Beheer → E-mail (SMTP) of deel de link handmatig.',
        );
      }
    } catch (err) {
      setError(`Uitnodiging opnieuw sturen mislukt: ${err.message}`);
    }
  };

  const filteredPersons = persons.filter((p) => {
    if (filterName.trim() && !p.name.toLowerCase().includes(filterName.trim().toLowerCase())) return false;
    if (filterRole && p.role !== filterRole) return false;
    if (filterTeam) {
      if (filterTeam === '__none__') {
        if (p.teamId) return false;
      } else if (String(p.teamId) !== filterTeam) return false;
    }
    if (filterAccount === 'yes' && !p.hasAccount) return false;
    if (filterAccount === 'no' && p.hasAccount) return false;
    if (scheids.enabled) {
      const levels = levelsForPerson(p, scheids);
      if (filterReferee === 'none' && levels.length) return false;
      if (filterReferee && filterReferee !== 'none' && !levels.includes(filterReferee)) return false;
    }
    return true;
  });

  const selectablePersons = filteredPersons.filter((p) => p.email && !p.hasAccount);
  const allSelected =
    selectablePersons.length > 0 && selectablePersons.every((p) => selectedIds.includes(p.id));

  const toggleSelectAll = (e) => {
    e?.stopPropagation?.();
    if (allSelected) setSelectedIds([]);
    else setSelectedIds(selectablePersons.map((p) => p.id));
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
      if (res.skippedNoEmail?.length) parts.push(`Geen e-mail: ${res.skippedNoEmail.join(', ')}.`);
      if (res.failed?.length) {
        parts.push(`Mislukt: ${res.failed.map((f) => `${f.name} (${f.reason})`).join(', ')}.`);
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

  const inviteUrlFor = (personOrResult) => {
    if (!personOrResult) return '';
    if (personOrResult.inviteLink) return personOrResult.inviteLink;
    if (personOrResult.inviteToken) {
      return `${window.location.origin}/uitnodiging/${personOrResult.inviteToken}`;
    }
    return '';
  };

  const mailtoFor = (person, link) => {
    if (!person?.email || !link) return '';
    return `mailto:${encodeURIComponent(person.email)}?subject=${encodeURIComponent(
      'Uitnodiging VVL Planning App',
    )}&body=${encodeURIComponent(
      `Hoi ${person.name},\n\nJe bent uitgenodigd voor de VVL Planning App van V.V. Lekkerkerk.\n\nMaak je account aan via deze link:\n${link}\n\nDe link is 14 dagen geldig.\n\nGroet,\nV.V. Lekkerkerk`,
    )}`;
  };

  const copyLink = async (link, personId = null) => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    if (personId != null) {
      setCopiedPersonId(personId);
      setCopied(false);
    } else {
      setCopied(true);
      setCopiedPersonId(null);
    }
  };

  const ensureInviteLink = async (p) => {
    setError('');
    try {
      const res = await api.resendInvite(p.id);
      setInviteResult(res);
      await load();
      return res;
    } catch (err) {
      setError(err.message);
      return null;
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="vvl-btn-primary min-h-11" onClick={openAdd}>
          Persoon toevoegen
        </button>
        <button
          type="button"
          className="vvl-btn-outline min-h-11"
          onClick={() => setFiltersOpen((v) => !v)}
        >
          {filtersOpen ? 'Filters sluiten' : 'Filters'}
        </button>
        <button
          type="button"
          className="vvl-btn-outline min-h-11 text-xs"
          onClick={toggleSelectAll}
          disabled={!selectablePersons.length}
        >
          {allSelected ? 'Selecteer niets' : 'Alles selecteren'}
        </button>
        <button
          type="button"
          className="vvl-btn-outline min-h-11 text-xs"
          disabled={bulkBusy || !selectedIds.length}
          onClick={sendBulkInvites}
        >
          {bulkBusy ? 'Versturen…' : `Uitnodigen (${selectedIds.length})`}
        </button>
      </div>

      {filtersOpen ? (
        <div className="vvl-card grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="vvl-label">Naam</label>
            <input className="vvl-input" value={filterName} onChange={(e) => setFilterName(e.target.value)} placeholder="Zoek op naam…" />
          </div>
          <div>
            <label className="vvl-label">Rol</label>
            <select className="vvl-input" value={filterRole} onChange={(e) => setFilterRole(e.target.value)}>
              <option value="">Alle</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="vvl-label">Team</label>
            <select className="vvl-input" value={filterTeam} onChange={(e) => setFilterTeam(e.target.value)}>
              <option value="">Alle</option>
              <option value="__none__">— geen team —</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="vvl-label">Account</label>
            <select className="vvl-input" value={filterAccount} onChange={(e) => setFilterAccount(e.target.value)}>
              {ACCOUNT_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>
          {scheids.enabled ? (
            <div>
              <label className="vvl-label">Scheidsrechter</label>
              <select className="vvl-input" value={filterReferee} onChange={(e) => setFilterReferee(e.target.value)} aria-label="Scheidsrechter">
                {REFEREE_FILTERS.map((f) => (
                  <option key={f.value || 'alle'} value={f.value}>{f.label}</option>
                ))}
              </select>
            </div>
          ) : null}
          <label className="flex items-center gap-2 text-sm font-semibold sm:col-span-2">
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
        </div>
      ) : null}

      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {bulkMsg ? <p className="text-sm text-emerald-800">{bulkMsg}</p> : null}
      {inviteResult && inviteUrlFor(inviteResult) && !formOpen ? (
        <div className="vvl-card space-y-2" data-testid="invite-link-banner">
          {inviteResult.emailSent ? (
            <p className="text-sm text-emerald-800">
              E-mail is verstuurd naar <strong>{inviteResult.person?.email}</strong>. De link blijft hieronder beschikbaar.
            </p>
          ) : (
            <p className="text-sm text-red-800" data-testid="invite-mail-failed">
              E-mail is <strong>niet</strong> verstuurd
              {inviteResult.emailError ? `: ${inviteResult.emailError}` : '.'} Kopieer de link of stuur via WhatsApp /
              je eigen e-mailprogramma.
            </p>
          )}
          <p className="break-all rounded-sm bg-vvl-muted p-3 text-xs font-mono">{inviteUrlFor(inviteResult)}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="vvl-btn-primary text-xs min-h-[44px]"
              onClick={() => copyLink(inviteUrlFor(inviteResult))}
            >
              {copied ? 'Gekopieerd!' : 'Kopieer link'}
            </button>
            {inviteResult.mailto || mailtoFor(inviteResult.person, inviteUrlFor(inviteResult)) ? (
              <a
                href={inviteResult.mailto || mailtoFor(inviteResult.person, inviteUrlFor(inviteResult))}
                className="vvl-btn-outline text-xs inline-flex items-center min-h-[44px]"
              >
                Open e-mailprogramma
              </a>
            ) : null}
            <button type="button" className="vvl-btn-outline text-xs min-h-[44px]" onClick={() => setInviteResult(null)}>
              Sluiten
            </button>
          </div>
        </div>
      ) : null}

      <div className="w-full min-w-0">
        <table className="w-full table-fixed text-sm">
          <thead className="bg-black text-left text-white">
            <tr>
              <th className="w-9 p-2">
                <input
                  type="checkbox"
                  className="h-5 w-5"
                  checked={allSelected}
                  disabled={!selectablePersons.length}
                  onChange={toggleSelectAll}
                  aria-label="Selecteer alles"
                />
              </th>
              <th className="p-2 font-bold">Naam</th>
              <th className="hidden w-36 p-2 font-bold md:table-cell">E-mail</th>
              <th className="hidden w-28 p-2 font-bold lg:table-cell">Telefoon</th>
              <th className="hidden w-24 p-2 font-bold sm:table-cell">Rol</th>
              <th className="hidden w-24 p-2 font-bold xl:table-cell">Team</th>
              <th className="hidden w-20 p-2 font-bold lg:table-cell">Vrijgest.</th>
              <th className="w-16 p-2 font-bold sm:w-20">Acc.</th>
              <th className="w-[5.5rem] p-2 font-bold"> </th>
            </tr>
          </thead>
          <tbody>
            {filteredPersons.map((p) => (
              <tr key={p.id} className="border-t border-vvl-border">
                <td className="p-2">
                  <input
                    type="checkbox"
                    className="h-5 w-5"
                    checked={selectedIds.includes(p.id)}
                    disabled={!p.email || p.hasAccount}
                    onChange={() => toggleSelect(p.id)}
                    aria-label={`Selecteer ${p.name}`}
                  />
                </td>
                <td className="p-2 font-semibold">
                  <span className="block truncate">
                    {p.name}
                    {!p.active ? ' (inactief)' : ''}
                  </span>
                  {scheids.enabled ? <RefereeBadges levels={levelsForPerson(p, scheids)} /> : null}
                  <span className="mt-0.5 block truncate text-xs font-normal text-gray-600 md:hidden">
                    {p.email || 'geen e-mail'}
                    {p.phone ? ` · ${p.phone}` : ''}
                    {p.exempted ? ' · vrijgesteld' : ''}
                  </span>
                </td>
                <td className="hidden truncate p-2 md:table-cell">{p.email || '—'}</td>
                <td className="hidden truncate p-2 lg:table-cell">{p.phone || '—'}</td>
                <td className="hidden truncate p-2 sm:table-cell">{p.role}</td>
                <td className="hidden truncate p-2 xl:table-cell">{p.team?.name || '—'}</td>
                <td className="hidden truncate p-2 lg:table-cell">{p.exempted ? 'Ja' : 'Nee'}</td>
                <td className="truncate p-2 text-xs sm:text-sm">
                  {p.hasAccount ? 'Wel' : p.invitePending ? 'Open' : 'Geen'}
                </td>
                <td className="p-1 sm:p-2">
                  <div className="flex flex-wrap justify-end gap-1">
                    <IconButton size="sm" title={`${p.name} bewerken`} onClick={() => openEdit(p)}>✏️</IconButton>
                    {!p.hasAccount && p.email ? (
                      <IconButton size="sm" title={`Uitnodiging sturen naar ${p.name}`} onClick={() => resend(p)}>✉️</IconButton>
                    ) : null}
                    <IconButton size="sm" title={`${p.name} verwijderen`} tone="danger" onClick={() => deletePerson(p)}>🗑️</IconButton>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredPersons.length === 0 ? (
          <p className="p-4 text-sm text-gray-600">Geen personen met deze filters.</p>
        ) : null}
      </div>

      <DesktopOnly>
        <PersonImport onDone={() => load(showNameless)} />
      </DesktopOnly>

      {formOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label={editId ? 'Persoon bewerken' : 'Persoon toevoegen'}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeForm();
          }}
        >
          <div className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-sm bg-white p-4 shadow-lg">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="font-heading text-lg font-black uppercase">
                {editId
                  ? 'Persoon bewerken'
                  : inviteResult
                    ? 'Uitnodiging klaar'
                    : 'Persoon toevoegen'}
              </h2>
              <button type="button" className="vvl-btn-outline text-xs" onClick={closeForm}>
                Sluiten
              </button>
            </div>
            {inviteResult && !editId ? (
              <div className="mb-3 space-y-2" data-testid="invite-link-after-create">
                <p className="text-sm text-gray-800">
                  {inviteResult.person?.name || 'Persoon'} is toegevoegd
                  {inviteResult.emailSent
                    ? `. Mail is verstuurd naar ${inviteResult.person?.email}.`
                    : '.'}{' '}
                  Deel de link hieronder (WhatsApp, mail of zelf tijdelijk inloggen).
                </p>
                {!inviteResult.emailSent ? (
                  <p className="text-sm text-red-800" data-testid="invite-mail-failed-create">
                    E-mail is <strong>niet</strong> verstuurd
                    {inviteResult.emailError ? `: ${inviteResult.emailError}` : '.'}
                  </p>
                ) : null}
                <p className="break-all rounded-sm bg-vvl-muted p-3 text-xs font-mono">
                  {inviteUrlFor(inviteResult)}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="vvl-btn-primary text-xs min-h-[44px]"
                    onClick={() => copyLink(inviteUrlFor(inviteResult))}
                  >
                    {copied ? 'Gekopieerd!' : 'Kopieer link'}
                  </button>
                  {mailtoFor(inviteResult.person, inviteUrlFor(inviteResult)) ? (
                    <a
                      href={mailtoFor(inviteResult.person, inviteUrlFor(inviteResult))}
                      className="vvl-btn-outline text-xs inline-flex items-center min-h-[44px]"
                    >
                      Open e-mailprogramma
                    </a>
                  ) : null}
                </div>
              </div>
            ) : null}
            <form
              onSubmit={(e) => submit(e, 'save')}
              className={`grid gap-3 sm:grid-cols-2 ${inviteResult && !editId ? 'hidden' : ''}`}
            >
              <div className="sm:col-span-2">
                <label className="vvl-label">Naam *</label>
                <input
                  className="vvl-input"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>
              <label className="flex items-center gap-2 text-sm font-semibold sm:col-span-2">
                <input
                  type="checkbox"
                  checked={form.exempted}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      exempted: e.target.checked,
                      exemptedUntil: e.target.checked ? form.exemptedUntil : '',
                    })
                  }
                />
                Vrijgesteld
              </label>
              {form.exempted ? (
                <div className="sm:col-span-2">
                  <label className="vvl-label">Vrijgesteld tot</label>
                  <NlDateInput
                    value={form.exemptedUntil}
                    onChange={(next) => setForm({ ...form, exemptedUntil: next })}
                    ariaLabel="Vrijgesteld tot"
                  />
                </div>
              ) : null}
              <div>
                <label className="vvl-label">E-mail {form.guardianId ? '' : '*'}</label>
                <input
                  type="email"
                  className="vvl-input"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required={!editId && !form.guardianId}
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
                <select className="vvl-input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="vvl-label">Team</label>
                <select className="vvl-input" value={form.teamId} onChange={(e) => setForm({ ...form, teamId: e.target.value })}>
                  <option value="">— Geen team —</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="vvl-label">Verplichting</label>
                <select
                  className="vvl-input"
                  value={form.obligation}
                  onChange={(e) => setForm({ ...form, obligation: e.target.value })}
                >
                  {OBLIGATIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              {scheids.enabled ? (
                <RefereeLevelField
                  value={form.refereeLevels}
                  onChange={(refereeLevels) => setForm({ ...form, refereeLevels })}
                />
              ) : null}
              {editId ? (
                <GuardianPicker
                  persons={persons}
                  value={form.guardianId}
                  onChange={(v) => setForm({ ...form, guardianId: v })}
                  excludeId={editId}
                />
              ) : null}
              {editId ? (
                <p className="text-xs text-gray-600 sm:col-span-2">
                  Dit seizoen: {seasonCounts[editId] ?? 0}×
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2 sm:col-span-2">
                {editId ? (
                  <button type="submit" className="vvl-btn-primary min-h-[44px]">
                    Opslaan
                  </button>
                ) : (
                  <>
                    <button type="submit" className="vvl-btn-primary min-h-[44px]">
                      Opslaan
                    </button>
                    <button
                      type="button"
                      className="vvl-btn-outline min-h-[44px]"
                      disabled={!form.email.trim()}
                      onClick={(e) => submit(e, 'invite')}
                    >
                      Opslaan en uitnodigen
                    </button>
                  </>
                )}
                <button type="button" className="vvl-btn-outline min-h-[44px]" onClick={closeForm}>
                  Annuleren
                </button>
              </div>
            </form>
            {editId ? (
              <PersonAbsencesEditor
                personId={editId}
                personName={persons.find((p) => p.id === editId)?.name || ''}
              />
            ) : null}
            {(() => {
              // Na toevoegen staat de link al bovenaan; hier alleen in het bewerkscherm.
              if (inviteResult && !editId) return null;
              const editing = editId ? persons.find((p) => p.id === editId) : null;
              const link =
                inviteUrlFor(inviteResult) ||
                (editing && !editing.hasAccount ? inviteUrlFor(editing) : '');
              const personForMail = inviteResult?.person || editing;
              if (!link && !(editing && editing.email && !editing.hasAccount)) return null;
              return (
                <div className="mt-4 space-y-2 border-t border-vvl-border pt-3" data-testid="invite-link-panel">
                  <h3 className="font-heading text-base font-black uppercase">Uitnodigingslink</h3>
                  {inviteResult?.emailSent ? (
                    <p className="text-sm text-emerald-800">
                      E-mail is verstuurd naar <strong>{inviteResult.person?.email}</strong>. De link blijft beschikbaar.
                    </p>
                  ) : inviteResult && inviteResult.emailSent === false ? (
                    <p className="text-sm text-red-800">
                      E-mail is <strong>niet</strong> verstuurd
                      {inviteResult.emailError ? `: ${inviteResult.emailError}` : '.'} Deel deze link via WhatsApp of
                      je eigen e-mailprogramma.
                    </p>
                  ) : (
                    <p className="text-sm text-gray-700">
                      Deel deze link via WhatsApp of e-mail. Geldig tot het account is aangemaakt.
                    </p>
                  )}
                  {link ? (
                    <>
                      <p className="break-all rounded-sm bg-vvl-muted p-3 text-xs font-mono">{link}</p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="vvl-btn-primary text-xs min-h-[44px]"
                          onClick={() => copyLink(link, editing?.id || null)}
                        >
                          {copied || copiedPersonId === editing?.id ? 'Gekopieerd!' : 'Kopieer link'}
                        </button>
                        {mailtoFor(personForMail, link) ? (
                          <a
                            href={mailtoFor(personForMail, link)}
                            className="vvl-btn-outline text-xs inline-flex items-center min-h-[44px]"
                          >
                            Open e-mailprogramma
                          </a>
                        ) : null}
                        {editing?.email && !editing.hasAccount ? (
                          <button
                            type="button"
                            className="vvl-btn-outline text-xs min-h-[44px]"
                            onClick={() => ensureInviteLink(editing)}
                          >
                            Opnieuw versturen
                          </button>
                        ) : null}
                      </div>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="vvl-btn-primary text-xs min-h-[44px]"
                      onClick={() => ensureInviteLink(editing)}
                    >
                      Uitnodigingslink maken
                    </button>
                  )}
                </div>
              );
            })()}
            {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
