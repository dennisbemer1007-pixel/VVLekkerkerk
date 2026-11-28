import { useCallback, useEffect, useState } from 'react';
import { api } from '../hooks/useApi.js';
import { formatSyncTime } from './SportlinkStatus.jsx';

const KIND_LABEL = {
  MOVED: 'Verplaatst',
  CANCELLED: 'Afgelast',
  RESTORED: 'Weer doorgaan',
  RETIMED: 'Nieuwe aanvangstijd',
};

const KIND_TONE = {
  MOVED: 'border-l-amber-500',
  CANCELLED: 'border-l-red-500',
  RESTORED: 'border-l-emerald-500',
  RETIMED: 'border-l-sky-500',
};

const ACTION_LABEL = {
  moved: 'verschoven',
  cancelled: 'vervalt',
  restored: 'weer actief',
  stays: 'blijft staan',
  protected: 'niet aangepast: controleer',
  conflict: 'conflict: controleer',
  retimed: 'tijd volgt dienstregel',
};

function day(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' });
}

function ChangeCard({ change, onAck }) {
  const needsAttention = change.servicesProtected > 0;
  return (
    <li
      className={`rounded-sm border border-vvl-border border-l-4 bg-white p-3 text-sm ${KIND_TONE[change.kind] || ''}`}
      data-testid={`sportlink-melding-${change.id}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold">
            {KIND_LABEL[change.kind] || change.kind}: {change.label}
          </p>
          <p className="text-gray-700">
            {day(change.oldDate)} {change.oldTime || ''}
            {change.kind === 'MOVED' || change.kind === 'RETIMED'
              ? ` → ${day(change.newDate)} ${change.newTime || ''}`
              : ''}
          </p>
        </div>
        <button type="button" className="vvl-btn-outline min-h-[44px] text-xs" onClick={() => onAck(change.id)}>
          Afgehandeld
        </button>
      </div>
      <p className="mt-1 text-gray-800">
        {change.servicesMoved} dienst(en) verschoven · {change.servicesCancelled} vervallen ·{' '}
        <span className={needsAttention ? 'font-bold text-red-800' : ''}>{change.servicesProtected} controleren</span>
        {change.mailsSent || change.mailsFailed
          ? ` · ${change.mailsSent} mail(s) verstuurd${change.mailsFailed ? `, ${change.mailsFailed} mislukt` : ''}`
          : ''}
      </p>
      {(change.detail || []).length ? (
        <ul className="mt-2 space-y-1 text-xs text-gray-700">
          {change.detail.map((d, i) => (
            <li key={`${d.serviceId}-${i}`}>
              {d.type === 'KITCHEN' ? 'Keuken' : 'Bar'} {d.time} ({d.enrolled} ingeschreven): {ACTION_LABEL[d.action] || d.action}
              {d.reason ? ` — ${d.reason}` : ''}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/** Dashboardmelding voor de barcommissie: verplaatste en afgelaste diensten door Sportlink. */
export default function SportlinkWijzigingen() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    return api
      .getSportlinkChanges()
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!data || (!data.enabled && data.pending.length === 0)) return null;

  const ack = async (id) => {
    await api.ackSportlinkChange(id).catch((e) => setError(e.message));
    await load();
  };
  const ackAll = async () => {
    await api.ackAllSportlinkChanges().catch((e) => setError(e.message));
    await load();
  };
  const sync = async () => {
    setBusy(true);
    setError('');
    try {
      await api.syncSportlink();
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="vvl-card space-y-3" data-testid="sportlink-wijzigingen">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-heading text-base font-black uppercase">Wijzigingen uit Sportlink</h2>
          <p className="text-xs text-gray-600">
            Laatste synchronisatie: {formatSyncTime(data.lastSyncAt)}
            {data.lastStatus === 'error' ? ' · mislukt' : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {data.enabled ? (
            <button type="button" className="vvl-btn-outline min-h-[44px] text-xs" disabled={busy} onClick={sync}>
              {busy ? 'Bezig…' : 'Nu synchroniseren'}
            </button>
          ) : null}
          {data.pending.length > 1 ? (
            <button type="button" className="vvl-btn-outline min-h-[44px] text-xs" onClick={ackAll}>
              Alles afgehandeld
            </button>
          ) : null}
        </div>
      </div>
      {error ? <p className="text-sm text-red-800">{error}</p> : null}
      {data.pending.length === 0 ? (
        <p className="text-sm text-gray-700">Geen openstaande meldingen.</p>
      ) : (
        <ul className="space-y-2">
          {data.pending.map((change) => (
            <ChangeCard key={change.id} change={change} onAck={ack} />
          ))}
        </ul>
      )}
    </section>
  );
}
