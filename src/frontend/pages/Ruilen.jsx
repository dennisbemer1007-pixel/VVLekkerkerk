import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import MasterDetail from '../components/MasterDetail.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../hooks/useApi.js';
import { formatServiceDate, SERVICE_TYPE_LABEL } from '../utils/formatDate.js';

const STATUS_LABEL = {
  PENDING_PEER: 'Wacht op de andere persoon',
  PENDING_COMMITTEE: 'Wacht op de barcommissie (oud verzoek)',
  APPROVED: 'Goedgekeurd — geruild',
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

export default function Ruilen({ scope = 'mine', mode = 'list', basePath = '/ruilen' }) {
  const { user } = useAuth();
  const [mine, setMine] = useState([]);
  const [others, setOthers] = useState([]);
  const [swaps, setSwaps] = useState([]);
  const [children, setChildren] = useState([]);
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [toQuery, setToQuery] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  const load = useCallback(async () => {
    const params = {};
    if (scope === 'mine') params.scope = 'mine';
    const [candidates, list, kids] = await Promise.all([
      api.getSwapCandidates(),
      api.getSwaps(params),
      api.getMyChildren().catch(() => []),
    ]);
    setMine(candidates.mine || []);
    setOthers(candidates.others || []);
    setSwaps(list || []);
    setChildren(Array.isArray(kids) ? kids : []);
  }, [scope]);

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);

  const householdIds = useMemo(
    () => [user?.id, ...children.map((child) => child.id)].filter(Boolean).map(Number),
    [user?.id, children],
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
    run(
      () => api.createSwap({ fromEnrollmentId: Number(fromId), toEnrollmentId: Number(toId) }),
      'Ruilverzoek verstuurd. De andere persoon krijgt een notificatie en moet akkoord geven.',
    );
  };

  const confirmReject = (swapId) => {
    const reason = rejectReason.trim();
    if (!reason) {
      setError('Geef een reden bij weigering van de ruiling.');
      return;
    }
    run(
      () => api.rejectSwap(swapId, { reason }),
      'Ruilverzoek afgewezen. De aanvrager krijgt een notificatie.',
    ).then(() => {
      setRejectingId(null);
      setRejectReason('');
    });
  };

  return (
    <div className="space-y-4">
      {msg ? (
        <p className="rounded-sm border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">{msg}</p>
      ) : null}
      {error ? (
        <p className="rounded-sm border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>
      ) : null}

      {mode === 'list' ? (
        <Link to={`${basePath}/nieuw`} className="vvl-btn-primary inline-flex">
          Nieuw ruilverzoek
        </Link>
      ) : (
        <Link to={basePath} className="vvl-btn-outline inline-flex text-xs">
          Terug naar ruilen
        </Link>
      )}

      {mode === 'new' ? (
      <form onSubmit={submit} className="vvl-card space-y-4">
        <h2 className="font-heading text-lg font-black uppercase">Nieuw ruilverzoek</h2>
        <div>
          <label className="vvl-label">Jouw dienst (die je afgeeft)</label>
          <select className="vvl-input" value={fromId} onChange={(e) => setFromId(e.target.value)} required>
            <option value="">Kies een van jouw komende diensten</option>
            {mine.map((enrollment) => (
              <option key={enrollment.id} value={enrollment.id}>
                {Number(enrollment.personId) === Number(user?.id)
                  ? serviceLabel(enrollment)
                  : `${personName(enrollment)} · ${serviceLabel(enrollment)}`}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="vvl-label">Dienst die je ervoor terugkrijgt</label>
          <input
            className="vvl-input mb-2"
            value={toQuery}
            onChange={(e) => setToQuery(e.target.value)}
            placeholder="Zoek op naam, datum of tijd"
          />
          <select className="vvl-input" value={toId} onChange={(e) => setToId(e.target.value)} required>
            <option value="">Kies de dienst van iemand anders</option>
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
        <button type="submit" className="vvl-btn-primary" disabled={busy || !mine.length || !others.length}>
          Ruilverzoek sturen
        </button>
        {!mine.length ? (
          <p className="text-sm text-gray-600">Jij of je kind heeft geen komende persoonlijke dienst om te ruilen.</p>
        ) : null}
      </form>
      ) : null}

      {mode === 'list' ? (
      <MasterDetail
        selected={selectedId}
        onBack={() => setSelectedId(null)}
        emptyDetail="Kies een ruilverzoek."
        list={
          swaps.length === 0 ? (
            <p className="vvl-card text-sm text-gray-600">Nog geen ruilverzoeken.</p>
          ) : (
            <ul className="space-y-2">
              {swaps.map((swap) => (
                <li key={swap.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(swap.id)}
                    className="min-h-11 w-full rounded-sm border border-vvl-border bg-white px-3 py-3 text-left"
                  >
                    <span className="block text-xs font-bold uppercase text-vvl-accent">
                      {STATUS_LABEL[swap.status] || swap.status}
                    </span>
                    <span className="block text-sm">
                      {swap.requester?.name} · {swap.counterparty?.name}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )
        }
        detail={swaps.filter((swap) => swap.id === selectedId).map((swap) => {
          const asCounterparty = householdIds.includes(Number(swap.counterpartyId));
          const asRequester = householdIds.includes(Number(swap.requesterId));
          return (
            <article key={swap.id} className="vvl-card space-y-2">
              <p className="text-xs font-bold uppercase text-vvl-accent">{STATUS_LABEL[swap.status] || swap.status}</p>
              <p className="text-sm">
                {swap.requester?.name} wil ruilen met {swap.counterparty?.name}
              </p>
              <div className="space-y-1 rounded-sm border border-vvl-border bg-vvl-muted/40 p-3 text-sm">
                <p>
                  <span className="font-bold">Afgeven:</span> {serviceLabel(swap.fromEnrollment)}
                  {swap.fromEnrollment?.person?.name ? ` (${swap.fromEnrollment.person.name})` : ''}
                </p>
                <p>
                  <span className="font-bold">Terugkrijgen:</span> {serviceLabel(swap.toEnrollment)}
                  {swap.toEnrollment?.person?.name ? ` (${swap.toEnrollment.person.name})` : ''}
                </p>
              </div>
              {swap.rejectReason ? (
                <p className="text-sm text-red-800">Reden weigering: {swap.rejectReason}</p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {asCounterparty && swap.status === 'PENDING_PEER' ? (
                  <>
                    <button
                      type="button"
                      className="vvl-btn-primary text-xs"
                      disabled={busy}
                      onClick={() =>
                        run(
                          (ignoreMatchBlock) => api.acceptSwap(swap.id, { ignoreMatchBlock }),
                          'Akkoord gegeven. De ruiling is doorgevoerd.',
                        )
                      }
                    >
                      Akkoord
                    </button>
                    {rejectingId === swap.id ? null : (
                      <button
                        type="button"
                        className="vvl-btn-outline text-xs"
                        disabled={busy}
                        onClick={() => {
                          setRejectingId(swap.id);
                          setRejectReason('');
                          setError('');
                        }}
                      >
                        Weigeren
                      </button>
                    )}
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
              {asCounterparty && swap.status === 'PENDING_PEER' && rejectingId === swap.id ? (
                <div className="space-y-2 border-t border-vvl-border pt-3">
                  <label className="vvl-label" htmlFor={`reject-${swap.id}`}>
                    Reden voor weigering
                  </label>
                  <textarea
                    id={`reject-${swap.id}`}
                    className="vvl-input min-h-[80px]"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Leg kort uit waarom je niet wilt ruilen"
                    maxLength={500}
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="vvl-btn-primary text-xs"
                      disabled={busy}
                      onClick={() => confirmReject(swap.id)}
                    >
                      Weigering versturen
                    </button>
                    <button
                      type="button"
                      className="vvl-btn-outline text-xs"
                      disabled={busy}
                      onClick={() => {
                        setRejectingId(null);
                        setRejectReason('');
                      }}
                    >
                      Annuleren
                    </button>
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
      />
      ) : null}
    </div>
  );
}
