import { useEffect, useState } from 'react';
import { api } from '../hooks/useApi.js';
import { useCalendarFeature } from './feature.jsx';

async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

export default function AgendaKoppeling() {
  const { enabled, ready } = useCalendarFeature();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [copied, setCopied] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    api
      .getMyCalendar()
      .then((body) => {
        if (!cancelled) setData(body);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Agenda laden mislukt');
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  if (!ready || !enabled) return null;

  const copy = async (value, key) => {
    setError('');
    const ok = await copyText(value);
    if (!ok) {
      setError('Kopiëren lukt niet. Selecteer de link en kopieer hem zelf.');
      return;
    }
    setCopied(key);
  };

  const rotate = async () => {
    if (!window.confirm('Nieuwe link maken? De oude link stopt dan met werken.')) return;
    setBusy(true);
    setError('');
    setMsg('');
    try {
      const body = await api.rotateMyCalendar();
      setData(body);
      setCopied('');
      setMsg('Nieuwe link gemaakt. Zet hem opnieuw in je agenda.');
    } catch (err) {
      setError(err.message || 'Nieuwe link maken mislukt');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="vvl-card space-y-3" data-testid="agenda-koppeling">
      <h2 className="font-heading text-base font-black uppercase">Agenda</h2>
      <p className="text-sm text-gray-700">
        Wedstrijden en jouw diensten lopen vanzelf mee. De link is alleen voor jou.
      </p>
      {error ? <p className="text-sm text-red-800">{error}</p> : null}
      {msg ? <p className="text-sm text-emerald-800">{msg}</p> : null}
      {data ? (
        <>
          <a href={data.webcalUrl} className="vvl-btn-primary w-full" data-testid="agenda-webcal">
            Zet in mijn agenda
          </a>
          <a
            href={data.googleUrl}
            className="vvl-btn-outline w-full"
            target="_blank"
            rel="noreferrer"
            data-testid="agenda-google"
          >
            Google Agenda
          </a>
          <label className="block">
            <span className="vvl-label">Link</span>
            <input
              readOnly
              className="vvl-input text-xs"
              value={data.httpsUrl}
              aria-label="Agendalink"
              data-testid="agenda-link"
              onFocus={(event) => event.target.select()}
            />
          </label>
          <button
            type="button"
            className="vvl-btn-outline w-full"
            data-testid="agenda-kopieer"
            onClick={() => copy(data.httpsUrl, 'self')}
          >
            {copied === 'self' ? 'Link gekopieerd' : 'Kopieer link'}
          </button>
          <button
            type="button"
            className="min-h-11 text-sm font-semibold underline"
            data-testid="agenda-nieuwe-link"
            disabled={busy}
            onClick={rotate}
          >
            {busy ? 'Bezig…' : 'Nieuwe link maken'}
          </button>
          {data.teams?.length ? (
            <div className="space-y-2 border-t border-vvl-border pt-3">
              <p className="text-sm text-gray-700">Teamagenda: alleen wedstrijden, zonder namen.</p>
              {data.teams.map((team) => (
                <div key={team.id} className="space-y-2" data-testid={`agenda-team-${team.id}`}>
                  <p className="text-sm font-bold">{team.name}</p>
                  <a href={team.webcalUrl} className="vvl-btn-outline w-full text-xs">
                    Zet {team.name} in agenda
                  </a>
                  <button
                    type="button"
                    className="vvl-btn-outline w-full text-xs"
                    onClick={() => copy(team.httpsUrl, `team-${team.id}`)}
                  >
                    {copied === `team-${team.id}` ? 'Link gekopieerd' : `Kopieer ${team.name}`}
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-gray-600">Agenda laden…</p>
      )}
    </section>
  );
}

export function TeamAgendaRij({ link, onRotate }) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!link) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link.httpsUrl);
      setCopied(true);
    } catch {
      setError('Selecteer de link en kopieer hem zelf.');
    }
  };

  const rotate = async () => {
    if (!window.confirm('Nieuwe teamlink maken? De oude link stopt dan met werken.')) return;
    setBusy(true);
    setError('');
    try {
      await onRotate(link.id);
    } catch (err) {
      setError(err.message || 'Nieuwe link maken mislukt');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2" data-testid={`team-agenda-${link.id}`}>
      <p className="text-sm text-gray-700">Teamagenda: alleen wedstrijden, zonder namen.</p>
      <a href={link.webcalUrl} className="vvl-btn-outline w-full">
        Zet team in agenda
      </a>
      <button type="button" className="vvl-btn-outline w-full" onClick={copy}>
        {copied ? 'Link gekopieerd' : 'Kopieer teamlink'}
      </button>
      {link.canRotate ? (
        <button type="button" className="min-h-11 text-sm font-semibold underline" disabled={busy} onClick={rotate}>
          {busy ? 'Bezig…' : 'Nieuwe teamlink'}
        </button>
      ) : null}
      {error ? <p className="text-sm text-red-800">{error}</p> : null}
    </div>
  );
}
