import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { levelLabel } from './categories.js';
import { formatSlotDate } from './example.js';
import { claimConflict } from './planReferees.js';
import {
  acceptSwap,
  claimScheids,
  confirmScheids,
  proposeSwap,
  swapCandidates,
  useScheidsBoard,
  useScheidsState,
  viewerPerson,
} from './store.js';

function SlotFacts({ slot }) {
  return (
    <>
      <p className="text-xs font-bold uppercase tracking-wide text-vvl-accent">
        Scheidsrechter · {levelLabel(slot.level)}
        <span className="ml-2 text-gray-500">Voorbeeld</span>
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
  const { user } = useAuth();
  const board = useScheidsBoard();
  const scheids = useScheidsState();
  const me = viewerPerson(user, board.people);
  const [swapSlotId, setSwapSlotId] = useState('');
  const [msg, setMsg] = useState('');
  if (!scheids.enabled || !me) return null;

  const mine = board.slots.filter((slot) => slot.person?.email === me.email);
  const incoming = (scheids.swaps || []).filter((swap) => swap.toEmail === me.email && swap.status === 'wacht');
  if (!mine.length && !incoming.length) return null;
  const options = swapCandidates(me.email);

  return (
    <section className="space-y-2" data-testid="scheids-mijn">
      {msg ? <p className="text-sm text-emerald-800">{msg}</p> : null}
      {incoming.map((swap) => {
        const from = board.people.find((person) => person.email === swap.fromEmail);
        const theirs = board.slotById.get(swap.fromSlotId);
        return (
          <article key={swap.id} className="vvl-card space-y-2">
            <p className="text-sm font-semibold">{from?.name} wil ruilen</p>
            <p className="text-sm text-gray-700">
              {theirs ? `${theirs.team} · ${theirs.time}` : 'Plek'} ↔ jouw plek
            </p>
            <button
              type="button"
              className="vvl-btn-primary"
              onClick={() => {
                acceptSwap(swap.id, me.email);
                setMsg('Ruil akkoord.');
              }}
            >
              Akkoord
            </button>
          </article>
        );
      })}
      {mine.map((slot) => {
        const confirmed = slot.assignment?.status === 'bevestigd';
        const slotOptions = options.filter((option) => option.fromSlotId === slot.id);
        return (
          <article key={slot.id} className="vvl-card space-y-2" data-testid="scheids-mijn-kaart">
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
                  onClick={() => {
                    confirmScheids(slot.id, me.email);
                    setMsg('Bevestigd.');
                    setSwapSlotId('');
                  }}
                >
                  Bevestigen
                </button>
              )}
              <button
                type="button"
                className="vvl-btn-outline"
                data-testid="scheids-ruilen"
                onClick={() => setSwapSlotId((current) => (current === slot.id ? '' : slot.id))}
              >
                Ruilen
              </button>
            </div>
            {swapSlotId === slot.id ? (
              slotOptions.length ? (
                <ul className="space-y-2">
                  {slotOptions.map((option) => (
                    <li key={option.toSlotId}>
                      <button
                        type="button"
                        className="vvl-btn-outline w-full text-xs"
                        onClick={() => {
                          proposeSwap({
                            fromEmail: me.email,
                            toEmail: option.toEmail,
                            fromSlotId: slot.id,
                            toSlotId: option.toSlotId,
                          });
                          setSwapSlotId('');
                          setMsg(`Ruilverzoek naar ${option.toName}.`);
                        }}
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
  const { user } = useAuth();
  const board = useScheidsBoard();
  const me = viewerPerson(user, board.people);
  const [msg, setMsg] = useState('');
  const scheids = useScheidsState();
  if (!scheids.enabled || !me?.levels?.length) return null;
  const open = board.slots.filter((slot) => slot.open && me.levels.includes(slot.level));
  if (!open.length) return null;

  return (
    <section className="space-y-2" data-testid="scheids-open">
      {msg ? <p className="text-sm text-emerald-800">{msg}</p> : null}
      {open.map((slot) => {
        const conflict = claimConflict(me, slot, board.blocks);
        return (
          <article key={slot.id} className="vvl-card space-y-2" data-testid="scheids-open-kaart">
            <SlotFacts slot={slot} />
            {conflict ? (
              <p className="text-sm text-gray-700">{conflict}</p>
            ) : (
              <button
                type="button"
                className="vvl-btn-primary"
                data-testid="scheids-ik-fluit"
                onClick={() => {
                  const error = claimScheids(slot.id, me.email);
                  setMsg(error || 'Je fluit deze wedstrijd.');
                }}
              >
                Ik fluit
              </button>
            )}
          </article>
        );
      })}
    </section>
  );
}
