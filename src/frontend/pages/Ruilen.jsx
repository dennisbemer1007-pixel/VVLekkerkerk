import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageTitle } from '../components/PageHelp.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../hooks/useApi.js';
import { formatServiceDate, SERVICE_TYPE_LABEL } from '../utils/formatDate.js';
import { PAGE_HELP } from '../utils/pageHelp.js';

const STATUS_LABEL = {
  PENDING_PEER: 'Wacht op de andere persoon',
  PENDING_COMMITTEE: 'Wacht op de barcommissie',
  APPROVED: 'Goedgekeurd',
  REJECTED: 'Afgewezen',
  CANCELLED: 'Ingetrokken',
};

function serviceLabel(enrollment) {
  if (!enrollment?.service) return 'Onbekende dienst';
  const type = SERVICE_TYPE_LABEL[enrollment.service.type] || enrollment.service.type;
  return `${formatServiceDate(enrollment.service.date)} · ${enrollment.service.time} · ${type}`;
}

function personName(enrollment) {
  return enrollment?.person?.name || 'Onbekend';
}

export default function Ruilen() {
  const { user } = useAuth();
  const [mine, setMine] = useState([]);
  const [others, setOthers] = useState([]);
  const [swaps, setSwaps] = useState([]);
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [toQuery, setToQuery] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [candidates, list] = await Promise.all([api.getSwapCandidates(), api.getSwaps()]);
    setMine(candidates.mine || []);
    setOthers(candidates.others || []);
    setSwaps(list || []);
  }, []);

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);

  const pendingMine = useMemo(
    () => swaps.filter((s) => ['PENDING_PEER', 'PENDING_COMMITTEE'].includes(s.status)),
    [swaps],
  );

  const filteredOthers = useMemo(() => {
    const q = toQuery.trim().toLowerCase();
    if (!q) return others;
    return others.filter((enrollment) => {
      const hay = `${personName(enrollment)} ${serviceLabel(enrollment)}`.toLowerCase();
      return hay.includes(q);
    });
  }, [others, toQuery]);

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

  const submit = (e) => {
    e.preventDefault();
    if (!fromId || !toId) {
      setError('Kies jouw dienst en de dienst waarmee je wilt ruilen.');
      return;
    }
    run(() => api.createSwap({ fromEnrollmentId: Number(fromId), toEnrollmentId: Number(toId) }), 'Ruilverzoek verstuurd. De andere persoon moet eerst akkoord geven.');
  };

  return (
    <div className="space-y-6">
      <header>
        <PageTitle {...PAGE_HELP.ruilen}>Ruilen</PageTitle>
        <p className="mt-1 text-sm text-gray-700">
          Ingelogd als <strong>{user?.name}</strong>. Je ruilt twee bestaande persoonlijke diensten.
          Er ontstaat geen open plek. Teamdiensten gaan via de teamcoördinator.
        </p>
      </header>

      {msg ? (
        <p className="rounded-sm border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">{msg}</p>
      ) : null}
      {error ? (
        <p className="rounded-sm border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>
      ) : null}

      <form onSubmit={submit} className="vvl-card space-y-4">
        <h2 className="font-heading text-lg font-black uppercase">Nieuw ruilverzoek</h2>
        <div>
          <label className="vvl-label">Jouw dienst</label>
          <select className="vvl-input" value={fromId} onChange={(e) => setFromId(e.target.value)} required>
            <option value="">Kies een van jouw komende diensten</option>
            {mine.map((enrollment) => (
              <option key={enrollment.id} value={enrollment.id}>
                {serviceLabel(enrollment)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="vvl-label">Dienst van iemand anders</label>
          <input
            className="vvl-input mb-2"
            value={toQuery}
            onChange={(e) => setToQuery(e.target.value)}
            placeholder="Zoek op naam, datum of tijd"
          />
          <select className="vvl-input" value={toId} onChange={(e) => setToId(e.target.value)} required>
            <option value="">Kies de dienst waarmee je wilt ruilen</option>
            {filteredOthers.map((enrollment) => (
              <option key={enrollment.id} value={enrollment.id}>
                {personName(enrollment)} · {serviceLabel(enrollment)}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-600">
            {filteredOthers.length} van {others.length} diensten
            {toQuery ? ' (gefilterd)' : ''}
          </p>
        </div>
        <button type="submit" className="vvl-btn" disabled={busy || !mine.length || !others.length}>
          Ruilverzoek sturen
        </button>
        {!mine.length ? (
          <p className="text-sm text-gray-600">Je hebt geen komende persoonlijke dienst om te ruilen.</p>
        ) : null}
      </form>

      <section className="space-y-3">
        <h2 className="font-heading text-lg font-black uppercase">Jouw verzoeken</h2>
        {pendingMine.length === 0 && swaps.length === 0 ? (
          <p className="vvl-card text-sm text-gray-600">Nog geen ruilverzoeken.</p>
        ) : null}
        {(pendingMine.length ? pendingMine : swaps.slice(0, 8)).map((swap) => {
          const asCounterparty = swap.counterpartyId === user?.id;
          const asRequester = swap.requesterId === user?.id;
          return (
            <article key={swap.id} className="vvl-card space-y-2">
              <p className="text-xs font-bold uppercase text-vvl-accent">{STATUS_LABEL[swap.status] || swap.status}</p>
              <p className="text-sm">
                {swap.requester?.name} wil ruilen met {swap.counterparty?.name}
              </p>
              <p className="text-sm text-gray-700">{serviceLabel(swap.fromEnrollment)}</p>
              <p className="text-sm text-gray-700">{serviceLabel(swap.toEnrollment)}</p>
              <div className="flex flex-wrap gap-2">
                {asCounterparty && swap.status === 'PENDING_PEER' ? (
                  <>
                    <button
                      type="button"
                      className="vvl-btn text-xs"
                      disabled={busy}
                      onClick={() => run(() => api.acceptSwap(swap.id), 'Je hebt akkoord gegeven. Nu de barcommissie.')}
                    >
                      Akkoord
                    </button>
                    <button
                      type="button"
                      className="vvl-btn-outline text-xs"
                      disabled={busy}
                      onClick={() => run(() => api.rejectSwap(swap.id), 'Ruilverzoek afgewezen.')}
                    >
                      Weigeren
                    </button>
                  </>
                ) : null}
                {(asRequester || asCounterparty) && ['PENDING_PEER', 'PENDING_COMMITTEE'].includes(swap.status) ? (
                  <button
                    type="button"
                    className="vvl-btn-outline text-xs"
                    disabled={busy}
                    onClick={() => run(() => api.cancelSwap(swap.id), 'Ruilverzoek ingetrokken.')}
                  >
                    Intrekken
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
