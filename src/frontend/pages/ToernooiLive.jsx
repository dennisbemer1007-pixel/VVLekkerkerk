import { useMemo, useState } from 'react';
import BrandMark from '../components/BrandMark.jsx';
import { useTournament } from '../toernooi/storage.js';
import { BracketView, PouleBoards, ScheduleTable, dutchDate, matchesForTeam, nextMatchFor } from '../toernooi/views.jsx';

export default function ToernooiLive() {
  const { view } = useTournament();
  const teams = view.state.teams;
  const [teamId, setTeamId] = useState(teams[0]?.id || '');
  const selected = teams.some((team) => team.id === teamId) ? teamId : teams[0]?.id || '';
  const upcoming = useMemo(() => nextMatchFor(view, selected), [view, selected]);
  const played = useMemo(() => matchesForTeam(view, selected).filter((match) => match.score), [view, selected]);
  const last = played.at(-1);

  return (
    <div className="min-h-screen bg-vvl-muted">
      <header className="sticky top-0 z-20 bg-black text-white">
        <div className="flex h-14 items-center px-4">
          <BrandMark to="/mockup/toernooi/live" compact />
        </div>
      </header>
      <main className="mx-auto max-w-lg space-y-4 px-4 py-4" data-testid="toernooi-live">
        <div>
          <h1 className="page-title">{view.state.name}</h1>
          <p className="text-sm font-semibold text-gray-600">{dutchDate(view.state.date)}</p>
        </div>

        <label className="block">
          <span className="vvl-label">Mijn team</span>
          <select className="vvl-input" value={selected} data-testid="mijn-team" onChange={(event) => setTeamId(event.target.value)}>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </label>

        <section className="vvl-card space-y-1" data-testid="volgende-wedstrijd">
          {upcoming ? (
            <>
              <p className="text-xs font-bold uppercase text-gray-500">Volgende</p>
              <p className="text-2xl font-black">
                {upcoming.slot.label} · {upcoming.part?.name}
              </p>
              <p className="font-semibold">
                {upcoming.homeLabel}
                <span className="text-gray-500"> – </span>
                {upcoming.awayLabel}
              </p>
            </>
          ) : (
            <>
              <p className="text-xs font-bold uppercase text-gray-500">Klaar</p>
              {last ? (
                <p className="text-2xl font-black leading-tight">
                  {last.homeLabel} {last.score.home}–{last.score.away} {last.awayLabel}
                </p>
              ) : (
                <p className="font-semibold">Nog geen uitslag.</p>
              )}
            </>
          )}
        </section>

        <PouleBoards poules={view.poules.filter((poule) => poule.teams.some((team) => team.id === selected))} />
        <PouleBoards poules={view.poules.filter((poule) => !poule.teams.some((team) => team.id === selected))} />
        <BracketView matches={view.matches} />
        <ScheduleTable view={view} showReferee={false} />
      </main>
    </div>
  );
}
