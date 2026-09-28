import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../hooks/useApi.js';
import { isAdminRoleName } from '../navConfig.js';

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
          <div className="flex flex-col gap-2 border-t border-vvl-border p-3">
            <button type="button" className="vvl-btn-outline w-full" data-testid="opschonen-cancel" onClick={onClose}>
              {result ? 'Sluiten' : 'Annuleren'}
            </button>
            {result ? null : (
              <button
                type="submit"
                data-testid="opschonen-submit"
                disabled={!ready || busy || !preview}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-red-700 px-5 text-sm font-bold uppercase tracking-wide text-white disabled:opacity-40"
              >
                {busy ? 'Bezig…' : 'Definitief opschonen'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Instellingen() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const admin = isAdminRoleName(user?.role);

  return (
    <div className="space-y-4">
      <h1 className="font-heading text-xl font-black uppercase">Instellingen</h1>
      <ul className="space-y-2">
        {LINKS.map((item) => (
          <li key={item.to}>
            <Link to={item.to} className="vvl-btn-primary w-full">
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
      {admin ? (
        <section
          className="space-y-3 rounded-sm border-2 border-red-700 bg-red-50 p-4"
          data-testid="opschonen-blok"
        >
          <h2 className="font-heading text-sm font-black uppercase text-red-800">Omgeving opschonen</h2>
          <p className="text-sm text-red-950">
            Dit wist diensten, inschrijvingen, ruilen, wedstrijden en alle personen zonder barcommissie- of adminrol, voor de officiële livegang.
          </p>
          <button
            type="button"
            data-testid="opschonen-open"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-red-700 px-5 text-sm font-bold uppercase tracking-wide text-white"
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
