import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { SIZE_LABEL } from './engine.js';

export function dutchDate(iso) {
  if (!iso) return '';
  const [year, month, day] = String(iso).split('-').map(Number);
  if (!year || !month || !day) return iso;
  return new Date(year, month - 1, day).toLocaleDateString('nl-NL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

export function liveUrl() {
  if (typeof window === 'undefined') return '/mockup/toernooi/live';
  return `${window.location.origin}/mockup/toernooi/live`;
}

export function FitBanner({ fit }) {
  return (
    <p
      className={`vvl-card text-sm font-semibold ${fit.ok ? '' : 'border-red-700 text-red-800'}`}
      data-testid="fit-status"
      role={fit.ok ? 'status' : 'alert'}
    >
      {fit.text}
    </p>
  );
}

export function QrBlock({ value, size = 168, caption = 'Live' }) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    let cancelled = false;
    QRCode.toString(value, {
      type: 'svg',
      margin: 1,
      color: { dark: '#000000', light: '#ffffff' },
    })
      .then((markup) => {
        if (!cancelled) setSvg(markup);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [value]);

  return (
    <div className="inline-flex flex-col items-center gap-1 bg-white p-2" data-testid="qr-live">
      {svg ? (
        <div className="[&_svg]:h-full [&_svg]:w-full" style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <div style={{ width: size, height: size }} className="bg-vvl-muted" />
      )}
      <p className="text-xs font-bold uppercase tracking-wide">{caption}</p>
    </div>
  );
}

function cellKey(slotIndex, partId) {
  return `${slotIndex}:${partId}`;
}

export function ScheduleTable({ view, showReferee = true, showScore = true }) {
  const used = view.matches.map((match) => match.slotIndex).filter((index) => index != null);
  if (!used.length) return <p className="vvl-card text-sm">Geen wedstrijden.</p>;
  const from = Math.min(...used);
  const to = Math.max(...used);
  const slots = view.slots.slice(from, to + 1);
  const byCell = new Map();
  view.matches.forEach((match) => {
    if (match.slotIndex == null || !match.partId) return;
    byCell.set(cellKey(match.slotIndex, match.partId), match);
  });
  let breakShown = false;
  const rows = [];
  slots.forEach((slot) => {
    if (!breakShown && view.state.breakEnabled && slot.start >= timeToMin(view.state.breakStart) && slot.index > from) {
      const end = addMinutes(view.state.breakStart, view.state.breakMinutes);
      rows.push({ type: 'break', id: 'pauze', label: `Pauze ${view.state.breakStart}–${end}` });
      breakShown = true;
    }
    rows.push({ type: 'slot', slot });
  });

  return (
    <div className="overflow-x-auto border border-vvl-border bg-white" data-testid="schedule-grid">
      <table className="w-full border-collapse text-left text-xs">
        <thead>
          <tr className="bg-black text-white">
            <th className="sticky left-0 z-10 bg-black px-2 py-2 font-bold">Tijd</th>
            {view.parts.map((part) => (
              <th key={part.id} className="min-w-[7.25rem] px-2 py-2 font-bold">
                {part.name}
                <span className="mt-0.5 block font-normal text-white/70">{SIZE_LABEL[part.size]}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) =>
            row.type === 'break' ? (
              <tr key={row.id}>
                <td colSpan={view.parts.length + 1} className="bg-vvl-muted px-2 py-2 text-center font-bold uppercase">
                  {row.label}
                </td>
              </tr>
            ) : (
              <tr key={row.slot.index} className="border-t border-vvl-border">
                <th className="sticky left-0 z-10 bg-white px-2 py-2 font-bold">{row.slot.label}</th>
                {view.parts.map((part) => {
                  const match = byCell.get(cellKey(row.slot.index, part.id));
                  if (!match) return <td key={part.id} className="px-2 py-2 text-gray-300" />;
                  return (
                    <td key={part.id} className="px-2 py-2 align-top">
                      <p className="font-bold">{match.homeLabel}</p>
                      <p className="font-bold">{match.awayLabel}</p>
                      <p className="mt-1 text-[11px] text-gray-600">
                        {match.pouleName || match.roundLabel}
                        {showScore && match.score ? ` · ${match.score.home}–${match.score.away}` : ''}
                        {showReferee && match.refereeName ? ` · fluit ${shortName(match.refereeName)}` : ''}
                      </p>
                    </td>
                  );
                })}
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}

function timeToMin(value) {
  const [h, m] = String(value || '0:0').split(':').map(Number);
  return h * 60 + m;
}

function addMinutes(value, minutes) {
  const total = timeToMin(value) + (Number(minutes) || 0);
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function shortName(name) {
  return String(name || '').replace(/^(JO\d+|Senioren)-\d+\s+/i, '');
}

const STANDING_HEADERS = ['P', 'W', 'G', 'V', 'DV', 'DT', 'S', 'PT'];

export function PouleBoards({ poules }) {
  if (!poules.length) return null;
  return (
    <div className="grid gap-3 md:grid-cols-2" data-testid="poules">
      {poules.map((poule) => (
        <section key={poule.id} className="vvl-card min-w-0 overflow-hidden p-0">
          <h2 className="border-b border-vvl-border px-3 py-2 text-sm font-black uppercase">{poule.name}</h2>
          <div className="overflow-x-auto">
            <table className="w-full table-fixed text-left text-xs">
              <colgroup>
                <col />
                {STANDING_HEADERS.map((label) => (
                  <col key={label} style={{ width: '8%' }} />
                ))}
              </colgroup>
              <thead>
                <tr className="text-[10px] uppercase text-gray-500">
                  <th className="px-2 py-1 text-left font-bold" />
                  {STANDING_HEADERS.map((label) => (
                    <th key={label} className="px-0 py-1 text-center font-bold">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {poule.table.map((row) => {
                  const values = [row.played, row.won, row.drawn, row.lost, row.gf, row.ga, row.gd, row.points];
                  return (
                    <tr key={row.teamId} className="border-t border-vvl-border">
                      <td className="break-words px-2 py-1 text-left text-sm font-semibold leading-tight">{row.name}</td>
                      {values.map((value, index) => (
                        <td
                          key={STANDING_HEADERS[index]}
                          className={`px-0 py-1 text-center tabular-nums ${
                            STANDING_HEADERS[index] === 'PT' ? 'font-black' : ''
                          }`}
                        >
                          {value}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}

export function BracketView({ matches }) {
  const knockout = matches.filter((match) => match.phase === 'knockout' && match.slotIndex != null);
  const categories = [];
  knockout.forEach((match) => {
    if (!categories.includes(match.category)) categories.push(match.category);
  });
  if (!categories.length) return null;
  return (
    <div className="grid gap-4 lg:grid-cols-2" data-testid="bracket">
      {categories.map((category) => {
        const own = knockout.filter((match) => match.category === category);
        const rounds = [];
        own.forEach((match) => {
          let round = rounds.find((item) => item.round === match.round);
          if (!round) {
            round = { round: match.round, label: match.roundLabel, matches: [] };
            rounds.push(round);
          }
          round.matches.push(match);
        });
        rounds.sort((a, b) => a.round - b.round);
        return (
          <section key={category} className="space-y-2">
            <h2 className="text-sm font-black uppercase">{category}</h2>
            <div className="flex gap-3 overflow-x-auto">
              {rounds.map((round) => (
                <div key={round.round} className="flex min-w-[11rem] flex-1 flex-col justify-around gap-3">
                  <p className="text-[11px] font-bold uppercase text-gray-500">{round.label}</p>
                  {round.matches.map((match) => (
                    <div key={match.id} className="border border-vvl-border bg-white text-sm">
                      <p className={`px-2 py-1 ${match.winnerId && match.winnerId === match.homeId ? 'font-black' : ''}`}>
                        {match.homeLabel}
                        {match.score ? <span className="float-right">{match.score.home}</span> : null}
                      </p>
                      <p className={`border-t border-vvl-border px-2 py-1 ${match.winnerId && match.winnerId === match.awayId ? 'font-black' : ''}`}>
                        {match.awayLabel}
                        {match.score ? <span className="float-right">{match.score.away}</span> : null}
                      </p>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function matchesForTeam(view, teamId) {
  return view.matches
    .filter((match) => match.slot && (match.homeId === teamId || match.awayId === teamId))
    .sort((a, b) => (a.slotIndex ?? 0) - (b.slotIndex ?? 0));
}

export function nextMatchFor(view, teamId) {
  return matchesForTeam(view, teamId).find((match) => !match.score) || null;
}
