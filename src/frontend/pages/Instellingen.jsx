import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import SettingsNavList from '../components/SettingsNavList.jsx';
import { api } from '../hooks/useApi.js';
import { isAdminRoleName } from '../navConfig.js';
import { useTournamentFeature } from '../toernooi/feature.jsx';
import { useRefereeFeature } from '../scheids/feature.jsx';
import { useCalendarFeature } from '../agenda/feature.jsx';
import SportlinkStatus from '../components/SportlinkStatus.jsx';

const LINKS = [
  { to: '/beheer?tab=regels', label: 'Dienstregels' },
  { to: '/beheer?tab=activiteiten', label: 'Jaarplanning' },
  { to: '/beheer?tab=mail', label: 'E-mail' },
  { to: '/beheer?tab=club', label: 'Club & privacy' },
];

function confirmReady(value) {
  return String(value || '').trim().toLowerCase() === 'opschonen';
}

function CountList({ title, rows }) {
  return (
    <div>
      <h3 className="text-xs font-bold uppercase tracking-wide text-vvl-accent">{title}</h3>
      <ul className="mt-1 divide-y divide-vvl-border">
        {(rows || []).map((row) => (
          <li key={row.key} className="flex items-baseline justify-between gap-3 py-1 text-sm">
            <span className="min-w-0">{row.label}</span>
            <span className="shrink-0 font-bold tabular-nums">{row.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function OpschonenDialog({ onClose }) {
  const [preview, setPreview] = useState(null);
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const ready = confirmReady(confirm);

  useEffect(() => {
    let cancelled = false;
    api
      .previewOpschonen()
      .then((data) => {
        if (!cancelled) setPreview(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Voorbeeld laden mislukt');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(event) {
    event.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError('');
    try {
      const data = await api.opschonen(confirm);
      setResult(data);
    } catch (err) {
      setError(err.message || 'Opschonen mislukt');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-hidden bg-black/60 p-3 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="opschonen-title"
      data-testid="opschonen-dialog"
    >
      <div className="flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-sm bg-white shadow-lg">
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            <h2 id="opschonen-title" className="font-heading text-lg font-black uppercase">
              Omgeving opschonen
            </h2>
            {result ? (
              <p className="text-sm text-gray-800" data-testid="opschonen-resultaat">
                {result.message}
              </p>
            ) : (
              <>
                {preview ? (
                  <>
                    <CountList title="Dit wordt gewist" rows={preview.wissen} />
                    <CountList title="Dit blijft staan" rows={preview.blijft} />
                  </>
                ) : (
                  <p className="text-sm text-gray-600">Aantallen laden…</p>
                )}
                <label className="block">
                  <span className="vvl-label">Typ OPSCHONEN om te bevestigen</span>
                  <input
                    className="vvl-input"
                    data-testid="opschonen-confirm"
                    value={confirm}
                    autoComplete="off"
                    autoCapitalize="characters"
                    onChange={(event) => setConfirm(event.target.value)}
                  />
                </label>
              </>
            )}
            {error ? <p className="text-sm font-semibold text-red-700">{error}</p> : null}
          </div>
          <div className="flex flex-col gap-2 border-t border-vvl-border p-3 sm:flex-row-reverse">
            {result ? null : (
              <button
                type="submit"
                data-testid="opschonen-submit"
                disabled={!ready || busy || !preview}
                className="inline-flex min-h-11 flex-1 items-center justify-center rounded-sm bg-red-700 px-5 text-sm font-bold uppercase tracking-wide text-white disabled:opacity-40"
              >
                {busy ? 'Bezig…' : 'Definitief opschonen'}
              </button>
            )}
            <button type="button" className="vvl-btn-outline flex-1" data-testid="opschonen-cancel" onClick={onClose}>
              {result ? 'Sluiten' : 'Annuleren'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TestMailBlok({ defaultTo = '' }) {
  const [to, setTo] = useState(defaultTo || '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [ready, setReady] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getMailStatus()
      .then((status) => {
        if (cancelled) return;
        setReady(Boolean(status.isReady));
        setTo((current) => current || status.fromEmail || defaultTo || '');
      })
      .catch(() => {
        if (!cancelled) setReady(false);
      });
    return () => {
      cancelled = true;
    };
  }, [defaultTo]);

  async function sendTest() {
    setBusy(true);
    setMsg('');
    setError('');
    try {
      const res = await api.testMail(to);
      setMsg(res.message || `Testmail verstuurd naar ${to}.`);
    } catch (err) {
      setError(err.message || 'Testmail mislukt.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3 border-t border-vvl-border pt-6" data-testid="instellingen-testmail">
      <h2 className="text-xs font-bold uppercase tracking-wide text-vvl-accent">Testmail</h2>
      <p className="text-sm text-gray-700">
        Stuur één testmail naar jezelf. SMTP stel je in via{' '}
        <a className="underline" href="/beheer?tab=mail">
          Beheer → E-mail
        </a>
        .
        {ready === false ? (
          <span className="mt-1 block text-amber-900">
            Mail staat nu uit of is onvolledig — de test zal falen tot je SMTP opslaat.
          </span>
        ) : null}
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="block min-w-0 flex-1">
          <span className="vvl-label">Stuur test naar</span>
          <input
            type="email"
            className="vvl-input"
            data-testid="instellingen-testmail-to"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="jouw@email.nl"
          />
        </label>
        <button
          type="button"
          className="vvl-btn-primary min-h-11"
          data-testid="instellingen-testmail-send"
          disabled={busy || !to.trim()}
          onClick={sendTest}
        >
          {busy ? 'Bezig…' : 'Stuur testmail'}
        </button>
      </div>
      {msg ? (
        <p className="rounded-sm border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">{msg}</p>
      ) : null}
      {error ? (
        <p className="rounded-sm border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>
      ) : null}
    </section>
  );
}

function ToernooiSwitch() {
  const { enabled, refresh } = useTournamentFeature();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function toggle() {
    setBusy(true);
    setError('');
    try {
      await api.setTournamentsEnabled(!enabled);
      await refresh();
    } catch (err) {
      setError(err.message || 'Opslaan mislukt');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3 border-t border-vvl-border pt-6" data-testid="toernooien-schakelaar">
      <h2 className="text-xs font-bold uppercase tracking-wide text-vvl-accent">Toernooien</h2>
      <p className="text-sm text-gray-700">
        Uit staat er geen menu, geen pagina en de API antwoordt 404. Aan maakt toernooien, het schema en de live-pagina beschikbaar.
      </p>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        data-testid="toernooien-switch"
        disabled={busy}
        onClick={toggle}
        className={`inline-flex min-h-11 items-center gap-3 rounded-sm border px-4 text-sm font-bold uppercase tracking-wide ${
          enabled ? 'border-black bg-black text-white' : 'border-vvl-border bg-white text-gray-700'
        }`}
      >
        <span className={`h-3 w-3 rounded-full ${enabled ? 'bg-white' : 'bg-gray-300'}`} />
        {enabled ? 'Aan' : 'Uit'}
      </button>
      {error ? <p className="text-sm font-semibold text-red-800">{error}</p> : null}
    </section>
  );
}

function AgendaSchakelaar() {
  const { refresh } = useCalendarFeature();
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .getClubSettings()
      .then((club) => setEnabled(Boolean(club.calendarEnabled)))
      .catch((err) => setError(err.message || 'Laden mislukt'));
  }, []);

  async function toggle() {
    setBusy(true);
    setError('');
    try {
      const club = await api.setCalendarEnabled(!enabled);
      setEnabled(Boolean(club.calendarEnabled));
      await refresh();
    } catch (err) {
      setError(err.message || 'Opslaan mislukt');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="vvl-card space-y-2" data-testid="agenda-schakelaar">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-base font-black uppercase">Agenda-koppeling</h2>
          <p className="text-sm text-gray-700">Uit verbergt de knop en de link. De API antwoordt dan 404.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Agenda-koppeling"
          data-testid="agenda-schakelaar-knop"
          disabled={busy}
          onClick={toggle}
          className="inline-flex min-h-11 items-center gap-2"
        >
          <span className="text-xs font-bold uppercase tracking-wide">{enabled ? 'Aan' : 'Uit'}</span>
          <span className={`relative h-7 w-12 rounded-full ${enabled ? 'bg-black' : 'bg-vvl-border'}`}>
            <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white ${enabled ? 'left-5' : 'left-0.5'}`} />
          </span>
        </button>
      </div>
      {error ? <p className="text-sm font-semibold text-red-800">{error}</p> : null}
    </div>
  );
}

function SportlinkBlok() {
  const [settings, setSettings] = useState(null);
  const [clientId, setClientId] = useState('');
  const [clubName, setClubName] = useState('');
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .getSportlinkSettings()
      .then((s) => {
        setSettings(s);
        setClubName(s.clubName || '');
      })
      .catch((err) => setError(err.message || 'Laden mislukt'));
  }, []);

  async function save(data, okMessage) {
    setBusy(true);
    setError('');
    setMsg('');
    try {
      const next = await api.saveSportlinkSettings(data);
      setSettings(next);
      setClientId('');
      setMsg(okMessage);
    } catch (err) {
      setError(err.message || 'Opslaan mislukt');
    } finally {
      setBusy(false);
    }
  }

  async function syncNow() {
    setSyncing(true);
    setError('');
    setMsg('');
    try {
      const res = await api.syncSportlink();
      setSettings(res.settings);
      setMsg(res.report?.status === 'error' ? '' : 'Synchronisatie klaar.');
      if (res.report?.status === 'error') setError(res.report.errors?.[0] || 'Synchroniseren mislukt');
    } catch (err) {
      setError(err.message || 'Synchroniseren mislukt');
    } finally {
      setSyncing(false);
    }
  }

  const enabled = Boolean(settings?.enabled);

  return (
    <div className="vvl-card space-y-3" data-testid="sportlink-blok">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-base font-black uppercase">Sportlink-koppeling</h2>
          <p className="text-sm text-gray-700">
            Leest elke nacht (rond 04:00) het thuisprogramma van je club uit Sportlink Club.Dataservice. Nieuwe
            wedstrijden komen erbij, verplaatste en afgelaste wedstrijden worden bijgewerkt. Er wordt nooit iemand
            automatisch ingedeeld.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Sportlink-koppeling"
          data-testid="sportlink-schakelaar"
          disabled={busy || !settings}
          onClick={() => save({ enabled: !enabled }, !enabled ? 'Koppeling staat aan.' : 'Koppeling staat uit.')}
          className="inline-flex min-h-11 items-center gap-2"
        >
          <span className="text-xs font-bold uppercase tracking-wide">{enabled ? 'Aan' : 'Uit'}</span>
          <span className={`relative h-7 w-12 rounded-full ${enabled ? 'bg-black' : 'bg-vvl-border'}`}>
            <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white ${enabled ? 'left-5' : 'left-0.5'}`} />
          </span>
        </button>
      </div>

      <label className="block">
        <span className="vvl-label">Sportlink Client ID</span>
        <input
          className="vvl-input"
          data-testid="sportlink-client-id"
          type="password"
          autoComplete="off"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          placeholder={settings?.clientIdSet ? '•••••••• (opgeslagen, leeg laten om te behouden)' : 'Code uit Sportlink Club'}
        />
        <span className="mt-1 block text-xs text-gray-600">
          Te vinden in Sportlink Club onder Koppelingen → Club.Dataservice. We slaan hem versleuteld op en tonen hem
          nergens meer.
        </span>
      </label>

      <label className="block">
        <span className="vvl-label">Clubnaam zoals Sportlink die gebruikt</span>
        <input
          className="vvl-input"
          data-testid="sportlink-clubnaam"
          value={clubName}
          onChange={(e) => setClubName(e.target.value)}
          placeholder="Lekkerkerk"
        />
        <span className="mt-1 block text-xs text-gray-600">
          Hiermee herkennen we eigen teams (bijvoorbeeld &quot;Lekkerkerk JO12-1&quot;). Leeg = Lekkerkerk.
        </span>
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="vvl-btn-outline min-h-11"
          data-testid="sportlink-opslaan"
          disabled={busy || !settings}
          onClick={() =>
            save(
              { clubName, ...(clientId.trim() ? { clientId: clientId.trim() } : {}) },
              'Instellingen opgeslagen.',
            )
          }
        >
          {busy ? 'Bezig…' : 'Opslaan'}
        </button>
        <button
          type="button"
          className="vvl-btn-primary min-h-11"
          data-testid="sportlink-sync-nu"
          disabled={syncing || !enabled || !settings?.clientIdSet}
          onClick={syncNow}
        >
          {syncing ? 'Bezig met synchroniseren…' : 'Nu synchroniseren'}
        </button>
      </div>
      {!enabled ? (
        <p className="text-xs text-gray-600">Zet de koppeling aan (met een Client ID) om te kunnen synchroniseren.</p>
      ) : null}

      {settings ? <SportlinkStatus settings={settings} /> : null}
      {msg ? <p className="text-sm font-semibold text-emerald-800">{msg}</p> : null}
      {error ? <p className="text-sm font-semibold text-red-800">{error}</p> : null}
    </div>
  );
}

function ScheidsSchakelaar() {
  const { refresh } = useRefereeFeature();
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .getClubSettings()
      .then((club) => setEnabled(Boolean(club.refereesEnabled)))
      .catch((err) => setError(err.message || 'Laden mislukt'));
  }, []);

  async function toggle() {
    setBusy(true);
    setError('');
    try {
      const club = await api.setRefereesEnabled(!enabled);
      setEnabled(Boolean(club.refereesEnabled));
      await refresh();
    } catch (err) {
      setError(err.message || 'Opslaan mislukt');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="vvl-card space-y-2" data-testid="scheids-schakelaar">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-base font-black uppercase">Scheidsrechters</h2>
          <p className="text-sm text-gray-700">Uit verbergt alles. De API antwoordt dan 404.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Scheidsrechters"
          data-testid="scheids-schakelaar-knop"
          disabled={busy}
          onClick={toggle}
          className="inline-flex min-h-11 items-center gap-2"
        >
          <span className="text-xs font-bold uppercase tracking-wide">{enabled ? 'Aan' : 'Uit'}</span>
          <span className={`relative h-7 w-12 rounded-full ${enabled ? 'bg-black' : 'bg-vvl-border'}`}>
            <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white ${enabled ? 'left-5' : 'left-0.5'}`} />
          </span>
        </button>
      </div>
      {error ? <p className="text-sm font-semibold text-red-800">{error}</p> : null}
    </div>
  );
}

export default function Instellingen() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const admin = isAdminRoleName(user?.role);

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="font-heading text-xl font-black uppercase">Instellingen</h1>
        <p className="mt-1 text-sm text-vvl-accent">Beheer clubinstellingen en planningregels.</p>
      </div>

      {admin ? <ScheidsSchakelaar /> : null}
      {admin ? <AgendaSchakelaar /> : null}
      {admin ? <SportlinkBlok /> : null}

      <SettingsNavList items={LINKS} />

      {admin ? <ToernooiSwitch /> : null}

      {admin ? <TestMailBlok defaultTo={user?.email || ''} /> : null}

      {admin ? (
        <section className="space-y-3 border-t border-vvl-border pt-6" data-testid="opschonen-blok">
          <h2 className="text-xs font-bold uppercase tracking-wide text-vvl-accent">Omgeving opschonen</h2>
          <p className="text-sm text-gray-700">
            Dit wist diensten, inschrijvingen, ruilen, wedstrijden, teams (incl. speeltijden),
            jaarplanning en alle personen zonder barcommissie- of adminrol, voor de officiële
            livegang. Admin- en barcommissie-accounts, mailteksten, clubinstellingen en
            dienstregels blijven.
          </p>
          <button
            type="button"
            data-testid="opschonen-open"
            className="inline-flex min-h-11 items-center justify-center rounded-sm border border-red-700 px-4 text-sm font-semibold uppercase tracking-wide text-red-800 transition hover:bg-red-50"
            onClick={() => setOpen(true)}
          >
            Omgeving opschonen
          </button>
        </section>
      ) : null}
      {open ? <OpschonenDialog onClose={() => setOpen(false)} /> : null}
    </div>
  );
}
