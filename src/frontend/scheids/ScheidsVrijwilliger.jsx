import { useCallback, useEffect, useState } from 'react';
import { api } from '../hooks/useApi.js';
import { levelLabel } from './categories.js';
import { useRefereeFeature } from './feature.jsx';
import { formatSlotDate } from './format.js';

function SlotFacts({ slot }) {
  return (
    <>
      <p className="text-xs font-bold uppercase tracking-wide text-vvl-accent">
        Scheidsrechter · {levelLabel(slot.level)}
      </p>
      <p className="font-heading text-lg font-black uppercase">{formatSlotDate(slot.date)}</p>
      <p className="text-sm font-semibold">
        {slot.time}
        {slot.field ? ` · ${slot.field}` : ''}
      </p>
      <p className="text-sm">
        {slot.team} – {slot.opponent}
      </p>
    </>
  );
}

export function ScheidsMijn() {
  const { enabled } = useRefereeFeature();
  const [data, setData] = useState(null);
  const [swapMatchId, setSwapMatchId] = useState(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    if (!enabled) return Promise.resolve();
    return api
      .getRefereeMine()
      .then(setData)
      .catch(() => setData(null));
  }, [enabled]);

  useEffect(() => {
    load();
  }, [load]);

  if (!enabled || !data) return null;
  const mine = data.mine || [];
  const incoming = data.incoming || [];
  if (!mine.length && !incoming.length) return null;

  const act = async (work, ok) => {
    setMsg('');
    setError('');
    try {
      const next = await work();
      if (next?.mine) setData(next);
      else await load();
      setMsg(ok);
      setSwapMatchId(null);
    } catch (err) {
      setError(err.message || 'Mislukt');
    }
  };

  return (
    <section className="space-y-2" data-testid="scheids-mijn">
      {msg ? <p className="text-sm text-emerald-800">{msg}</p> : null}
      {error ? <p className="text-sm text-red-800">{error}</p> : null}
      {incoming.map((swap) => (
        <article key={swap.id} className="vvl-card space-y-2">
          <p className="text-sm font-semibold">{swap.fromName} wil ruilen</p>
          <p className="text-sm text-gray-700">
            {swap.team} · {swap.time} ↔ jouw plek
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="vvl-btn-primary"
              onClick={() => act(() => api.acceptRefereeSwap(swap.id), 'Ruil akkoord.')}
            >
              Akkoord
            </button>
            <button
              type="button"
              className="vvl-btn-outline"
              onClick={() => act(() => api.rejectRefereeSwap(swap.id), 'Ruil geweigerd.')}
            >
              Weigeren
            </button>
          </div>
        </article>
      ))}
      {mine.map((slot) => {
        const confirmed = slot.status === 'bevestigd';
        const options = (data.swapOptions || []).filter((option) => option.fromMatchId === slot.matchId);
        return (
          <article key={slot.matchId} className="vvl-card space-y-2" data-testid="scheids-mijn-kaart">
            <SlotFacts slot={slot} />
            <div className="flex flex-wrap gap-2">
              {confirmed ? (
                <span className="inline-flex min-h-11 items-center text-sm font-bold uppercase text-emerald-800">
                  Bevestigd
                </span>
              ) : (
                <button
                  type="button"
                  className="vvl-btn-primary"
                  data-testid="scheids-bevestigen"
                  onClick={() => act(() => api.confirmReferee(slot.matchId), 'Bevestigd.')}
                >
                  Bevestigen
                </button>
              )}
              <button
                type="button"
                className="vvl-btn-outline"
                data-testid="scheids-ruilen"
                onClick={() => setSwapMatchId((current) => (current === slot.matchId ? null : slot.matchId))}
              >
                Ruilen
              </button>
            </div>
            {swapMatchId === slot.matchId ? (
              options.length ? (
                <ul className="space-y-2">
                  {options.map((option) => (
                    <li key={option.toMatchId}>
                      <button
                        type="button"
                        className="vvl-btn-outline w-full text-xs"
                        onClick={() =>
                          act(
                            () => api.proposeRefereeSwap(slot.matchId, option.toMatchId),
                            `Ruilverzoek naar ${option.toName}.`,
                          )
                        }
                      >
                        {option.toName} · {option.toLabel}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-600">Geen ruil mogelijk.</p>
              )
            ) : null}
          </article>
        );
      })}
    </section>
  );
}

export function ScheidsOpen() {
  const { enabled } = useRefereeFeature();
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    if (!enabled) return Promise.resolve();
    return api
      .getRefereeMine()
      .then(setData)
      .catch(() => setData(null));
  }, [enabled]);

  useEffect(() => {
    load();
  }, [load]);

  if (!enabled || !data?.levels?.length) return null;
  const open = data.open || [];
  if (!open.length && !msg) return null;

  return (
    <section className="space-y-2" data-testid="scheids-open">
      {msg ? <p className="text-sm text-emerald-800">{msg}</p> : null}
      {error ? <p className="text-sm text-red-800">{error}</p> : null}
      {open.map((slot) => (
        <article key={slot.matchId} className="vvl-card space-y-2" data-testid="scheids-open-kaart">
          <SlotFacts slot={slot} />
          {slot.conflict ? (
            <p className="text-sm text-gray-700">{slot.conflict}</p>
          ) : (
            <button
              type="button"
              className="vvl-btn-primary"
              data-testid="scheids-ik-fluit"
              onClick={async () => {
                setMsg('');
                setError('');
                try {
                  const next = await api.claimReferee(slot.matchId);
                  if (next?.mine) setData(next);
                  else await load();
                  setMsg('Je fluit deze wedstrijd.');
                } catch (err) {
                  setError(err.message || 'Mislukt');
                }
              }}
            >
              Ik fluit
            </button>
          )}
        </article>
      ))}
    </section>
  );
}
