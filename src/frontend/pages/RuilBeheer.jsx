import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../hooks/useApi.js';
import { formatServiceDate, SERVICE_TYPE_LABEL } from '../utils/formatDate.js';

function serviceLabel(enrollment) {
  if (!enrollment?.service) return 'Onbekende dienst';
  const type = SERVICE_TYPE_LABEL[enrollment.service.type] || enrollment.service.type;
  return `${formatServiceDate(enrollment.service.date)} · ${enrollment.service.time} · ${type}`;
}

export default function RuilBeheer() {
  const [swaps, setSwaps] = useState([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const list = await api.getSwaps();
    setSwaps(list || []);
  }, []);

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);

  const committeeQueue = useMemo(
    () => swaps.filter((s) => s.status === 'PENDING_COMMITTEE'),
    [swaps],
  );

  const recent = useMemo(
    () => swaps.filter((s) => s.status !== 'PENDING_COMMITTEE').slice(0, 12),
    [swaps],
  );

  const run = async (fn, success) => {
    setBusy(true);
    setError('');
    setMsg('');
    try {
      await fn();
      setMsg(success);
      await load();
    } catch (e) {
      if (e.details?.code === 'MATCH_BLOCK' && e.details?.canOverride) {
        if (window.confirm(e.message)) {
          try {
            await fn(true);
            setMsg(success);
            await load();
          } catch (inner) {
            setError(inner.message);
          }
        }
      } else {
        setError(e.message);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-4">
      <p className="vvl-card text-sm text-gray-700">
        Nieuwe ruilverzoeken worden direct doorgevoerd zodra de andere persoon akkoord geeft.
        Goedkeuring van de barcommissie is niet meer nodig. Alle ruilacties verschijnen in het
        notificatiebelletje rechtsboven.
      </p>

      {msg ? (
        <p className="rounded-sm border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">{msg}</p>
      ) : null}
      {error ? (
        <p className="rounded-sm border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>
      ) : null}

      {committeeQueue.length > 0 ? (
        <div className="space-y-3">
          <h3 className="font-heading text-base font-black uppercase">Oude verzoeken ter goedkeuring</h3>
          {committeeQueue.map((swap) => (
            <article key={swap.id} className="vvl-card space-y-2">
              <p className="text-sm font-semibold">
                {swap.requester?.name} ↔ {swap.counterparty?.name}
              </p>
              <p className="text-sm text-gray-700">
                {swap.requester?.name}: {serviceLabel(swap.fromEnrollment)}
              </p>
              <p className="text-sm text-gray-700">
                {swap.counterparty?.name}: {serviceLabel(swap.toEnrollment)}
              </p>
              {swap.matchBlockWarning ? (
                <p className="text-sm text-amber-800">Let op: deze ruil raakt een wedstrijdblokkade.</p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="vvl-btn-primary text-xs"
                  disabled={busy}
                  onClick={() =>
                    run(
                      (ignoreMatchBlock) => api.approveSwap(swap.id, { ignoreMatchBlock }),
                      'Ruil goedgekeurd.',
                    )
                  }
                >
                  Goedkeuren
                </button>
                <button
                  type="button"
                  className="vvl-btn-outline text-xs"
                  disabled={busy}
                  onClick={() =>
                    run(() => api.rejectSwap(swap.id, { reason: 'Afgewezen door barcommissie' }), 'Ruil afgewezen.')
                  }
                >
                  Afwijzen
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      <div className="space-y-3">
        <h3 className="font-heading text-base font-black uppercase">Recente ruilverzoeken</h3>
        {recent.length === 0 ? (
          <p className="vvl-card text-sm text-gray-600">Nog geen recente ruilverzoeken.</p>
        ) : (
          recent.map((swap) => (
            <article key={swap.id} className="vvl-card space-y-1">
              <p className="text-xs font-bold uppercase text-vvl-accent">{swap.status}</p>
              <p className="text-sm font-semibold">
                {swap.requester?.name} ↔ {swap.counterparty?.name}
              </p>
              <p className="text-sm text-gray-700">{serviceLabel(swap.fromEnrollment)}</p>
              <p className="text-sm text-gray-700">{serviceLabel(swap.toEnrollment)}</p>
              {swap.rejectReason ? (
                <p className="text-sm text-red-800">Reden: {swap.rejectReason}</p>
              ) : null}
            </article>
          ))
        )}
      </div>
    </section>
  );
}
