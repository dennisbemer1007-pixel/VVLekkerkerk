import { useEffect, useMemo, useState } from 'react';
import BrandMark from '../components/BrandMark.jsx';
import { PitchFocus } from '../toernooi/Pitch.jsx';
import { useTournament } from '../toernooi/storage.js';
import { BracketView, MatchTimeline, PouleBoards, compactTeam, dutchDate, matchesForTeam, nextMatchFor } from '../toernooi/views.jsx';

export default function ToernooiLive() {
  const { view } = useTournament();
  const teams = view.state.teams;
  const [teamId, setTeamId] = useState(teams[0]?.id || '');
  const [pickedId, setPickedId] = useState('');
  const [partId, setPartId] = useState('');
  const selected = teams.some((team) => team.id === teamId) ? teamId : teams[0]?.id || '';
  const upcoming = useMemo(() => nextMatchFor(view, selected), [view, selected]);
  const played = useMemo(() => matchesForTeam(view, selected).filter((match) => match.score), [view, selected]);
  const last = played.at(-1);
  const picked = view.matches.find((match) => match.id === pickedId);
  const glowPart = picked?.partId || partId || upcoming?.part?.id || '';

  useEffect(() => {
    setPickedId('');
    setPartId('');
  }, [selected]);

  const mine = view.poules.filter((poule) => poule.teams.some((team) => team.id === selected));
  const rest = view.poules.filter((poule) => !poule.teams.some((team) => team.id === selected));

  return (
    <div className="min-h-screen bg-vvl-muted">
      <header className="sticky top-0 z-30 bg-black text-white">
        <div className="flex h-14 items-center px-4">
          <BrandMark to="/mockup/toernooi/live" compact />
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-4" data-testid="toernooi-live">
        <PitchFocus
          view={view}
          activePartId={glowPart}
          onSelectPart={(id) => {
            setPickedId('');
            setPartId((current) => (current === id ? '' : id));
          }}
        >
          <div>
            <h1 className="break-words font-heading text-[1.35rem] font-black uppercase leading-none tracking-tight md:text-3xl">{view.state.name}</h1>
            <p className="mt-1 text-sm text-gray-500">{dutchDate(view.state.date)}</p>
          </div>

          <label className="block max-w-sm">
            <span className="vvl-label">Mijn team</span>
            <select className="vvl-input" value={selected} data-testid="mijn-team" onChange={(event) => setTeamId(event.target.value)}>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </label>

          <section className="rounded-sm border border-black bg-white px-4 py-3" data-testid="volgende-wedstrijd">
            {upcoming ? (
              <button type="button" className="w-full text-left" onClick={() => setPickedId(upcoming.id)}>
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-gray-400">Volgende</p>
                <p className="mt-1 text-2xl font-black tracking-tight">
                  {upcoming.slot.label}
                  <span className="ml-2 text-base font-bold text-gray-400">{upcoming.part?.name?.replace(/^Veld\s*/i, '')}</span>
                </p>
                <p className="mt-1 font-semibold">
                  {compactTeam(upcoming.homeLabel)}
                  <span className="px-1 text-gray-400">–</span>
                  {compactTeam(upcoming.awayLabel)}
                </p>
              </button>
            ) : (
              <>
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-gray-400">Klaar</p>
                {last ? (
                  <p className="mt-1 text-2xl font-black leading-tight">
                    {compactTeam(last.homeLabel)} {last.score.home}–{last.score.away} {compactTeam(last.awayLabel)}
                  </p>
                ) : (
                  <p className="mt-1 font-semibold">Nog geen uitslag.</p>
                )}
              </>
            )}
          </section>

          <PouleBoards poules={mine} />
          {rest.length ? (
            <details>
              <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.16em] text-gray-400">Andere poules</summary>
              <div className="mt-3">
                <PouleBoards poules={rest} />
              </div>
            </details>
          ) : null}
          <details>
            <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.16em] text-gray-400">Knock-out</summary>
            <div className="mt-4">
              <BracketView matches={view.matches} />
            </div>
          </details>
          <MatchTimeline
            view={view}
            filters={{ partId, matchId: pickedId || upcoming?.id || '' }}
            interactive
            showScore
            onSelectMatch={(match) => {
              setPartId('');
              setPickedId((current) => (current === match.id ? '' : match.id));
            }}
          />
        </PitchFocus>
      </main>
    </div>
  );
}
