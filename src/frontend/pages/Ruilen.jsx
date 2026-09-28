import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import ListFilters from '../components/ListFilters.jsx';
import MasterDetail from '../components/MasterDetail.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../hooks/useApi.js';
import { formatServiceDate, SERVICE_TYPE_LABEL } from '../utils/formatDate.js';
import { withinDates } from '../utils/listFilter.js';

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

export default function Ruilen({ scope = 'mine', title = 'Ruilen', mode = 'list', basePath = '/ruilen' }) {
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
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [filters, setFilters] = useState({ person: '', from: '', to: '' });
  const [status, setStatus] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  const load = useCallback(async () => {
    const params = {};
    if (scope === 'mine') params.scope = 'mine';
    if (filters.person.trim()) params.q = filters.person.trim();
    if (filters.from) params.from = filters.from;
    if (filters.to) params.to = filters.to;
    const [candidates, list] = await Promise.all([api.getSwapCandidates(), api.getSwaps(params)]);
    setMine(candidates.mine || []);
    setOthers(candidates.others || []);
    setSwaps(list || []);
  }, [scope, filters]);

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);

  const visibleSwaps = useMemo(
    () => swaps.filter((s) => !status || s.status === status),
    [swaps, status],
  );

  const filteredOthers = useMemo(() => {
    const q = `${toQuery} ${filters.person}`.trim().toLowerCase();
    return others.filter((enrollment) => {
      if (filters.from || filters.to) {
        if (!withinDates(enrollment.service?.date, filters.from, filters.to)) return false;
      }
      if (!q) return true;
      const hay = `${personName(enrollment)} ${serviceLabel(enrollment)}`.toLowerCase();
      return hay.includes(q);
    });
  }, [others, toQuery, filters]);

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
    <div className="space-y-6">
      <header>
        <h1 className="font-heading text-xl font-black uppercase">{title}</h1>
      </header>
      <ListFilters {...filters} onChange={setFilters}>
        {mode === 'list' ? (
          <label className="block min-w-0">
            <span className="vvl-label">Status</span>
            <select className="vvl-input" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
              <option value="">Alle</option>
              <option value="PENDING_PEER">Wacht op de ander</option>
              <option value="PENDING_COMMITTEE">Wacht op de barcommissie</option>
              <option value="APPROVED">Geruild</option>
              <option value="REJECTED">Afgewezen</option>
              <option value="CANCELLED">Ingetrokken</option>
            </select>
          </label>
        ) : null}
      </ListFilters>

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
        <button type="submit" className="vvl-btn-primary" disabled={busy || !mine.length || !others.length}>
          Ruilverzoek sturen
        </button>
        {!mine.length ? (
          <p className="text-sm text-gray-600">Je hebt geen komende persoonlijke dienst om te ruilen.</p>
        ) : null}
      </form>
      ) : null}

      {mode === 'list' ? (
      <MasterDetail
        selected={selectedId}
        onBack={() => setSelectedId(null)}
        emptyDetail="Kies een ruilverzoek."
        list={
          visibleSwaps.length === 0 ? (
            <p className="vvl-card text-sm text-gray-600">Nog geen ruilverzoeken.</p>
          ) : (
            <ul className="space-y-2">
              {visibleSwaps.map((swap) => (
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
        detail={visibleSwaps.filter((swap) => swap.id === selectedId).map((swap) => {
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
