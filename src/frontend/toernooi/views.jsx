import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { partChip, PitchFocus } from './Pitch.jsx';

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
      className={`rounded-sm px-3 py-2 text-sm font-semibold ${fit.ok ? 'text-gray-600' : 'bg-white text-red-800'}`}
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

export function compactTeam(name) {
  const match = /^(?:JO\d+|Senioren)-(\d+)\s+(.+)$/i.exec(String(name || ''));
  if (!match) return name;
  return `${match[2]} ${match[1]}`;
}

function Chip({ active, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full border px-3 py-1 text-xs font-bold transition duration-200 ${
        active ? 'border-black bg-black text-white' : 'border-vvl-border bg-white text-gray-600 hover:border-black hover:text-black'
      }`}
    >
      {children}
    </button>
  );
}

function ChipRow({ children }) {
  return <div className="flex gap-1.5 overflow-x-auto pb-0.5">{children}</div>;
}

export function useScheduleFilters() {
  const [pouleId, setPouleId] = useState('');
  const [teamId, setTeamId] = useState('');
  const [fieldId, setFieldId] = useState('');
  const [partId, setPartId] = useState('');
  const [matchId, setMatchId] = useState('');

  const selectMatch = (match) => {
    if (!match || match.id === matchId) {
      setMatchId('');
      return;
    }
    setMatchId(match.id);
  };

  const selectPart = (id) => {
    setMatchId('');
    setFieldId('');
    setPartId((current) => (current === id ? '' : id));
  };

  const selectField = (id) => {
    setMatchId('');
    setPartId('');
    setFieldId((current) => (current === id ? '' : id));
  };

  const reset = () => {
    setPouleId('');
    setTeamId('');
    setFieldId('');
    setPartId('');
    setMatchId('');
  };

  return {
    pouleId,
    teamId,
    fieldId,
    partId,
    matchId,
    setPouleId,
    setTeamId,
    selectMatch,
    selectPart,
    selectField,
    reset,
  };
}

function matchVisible(match, filters) {
  if (!match?.slot || !match.partId) return false;
  if (filters.partId && match.partId !== filters.partId) return false;
  if (filters.fieldId && match.part?.fieldId !== filters.fieldId) return false;
  if (filters.pouleId && match.pouleId !== filters.pouleId) return false;
  if (filters.teamId && match.homeId !== filters.teamId && match.awayId !== filters.teamId) return false;
  return true;
}

function buildRows(view, matches) {
  if (!matches.length) return [];
  const indexes = matches.map((match) => match.slotIndex);
  const from = Math.min(...indexes);
  const to = Math.max(...indexes);
  const rows = [];
  let breakShown = false;
  for (let index = from; index <= to; index += 1) {
    const slot = view.slots[index];
    if (!slot) continue;
    if (!breakShown && view.state.breakEnabled && slot.start >= timeToMin(view.state.breakStart) && index > from) {
      const end = addMinutes(view.state.breakStart, view.state.breakMinutes);
      rows.push({ type: 'break', id: `pauze-${index}`, label: `Pauze ${view.state.breakStart}–${end}` });
      breakShown = true;
    }
    const slotMatches = matches.filter((match) => match.slotIndex === index);
    if (slotMatches.length) rows.push({ type: 'slot', slot, matches: slotMatches });
  }
  return rows;
}

export function ScheduleFilters({ view, filters }) {
  return (
    <div className="space-y-2">
      <ChipRow>
        <Chip active={!filters.pouleId} onClick={() => filters.setPouleId('')}>
          Alles
        </Chip>
        {view.poules.map((poule) => (
          <Chip key={poule.id} active={filters.pouleId === poule.id} onClick={() => filters.setPouleId(filters.pouleId === poule.id ? '' : poule.id)}>
            {poule.name}
          </Chip>
        ))}
      </ChipRow>
      <ChipRow>
        {view.state.fields.map((field) => (
          <Chip key={field.id} active={filters.fieldId === field.id} onClick={() => filters.selectField(field.id)}>
            {field.name}
          </Chip>
        ))}
      </ChipRow>
      <ChipRow>
        {view.state.teams.map((team) => (
          <Chip key={team.id} active={filters.teamId === team.id} onClick={() => filters.setTeamId(filters.teamId === team.id ? '' : team.id)}>
            {compactTeam(team.name)}
          </Chip>
        ))}
      </ChipRow>
    </div>
  );
}

function MatchCard({ match, active, onSelect, showReferee, showScore, asButton }) {
  const body = (
    <>
      <span className="shrink-0 rounded-sm bg-black px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
        {partChip(match.part)}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight">
        {compactTeam(match.homeLabel)}
        <span className="px-1 font-normal text-gray-400">–</span>
        {compactTeam(match.awayLabel)}
      </span>
      {showScore && match.score ? (
        <span className="shrink-0 text-sm font-black tabular-nums">
          {match.score.home}–{match.score.away}
        </span>
      ) : (
        <span className="shrink-0 text-[11px] font-semibold text-gray-400">{match.pouleName || match.roundLabel}</span>
      )}
    </>
  );
  const meta = showReferee && match.refereeName ? (
    <p className="mt-1 pl-9 text-[11px] text-gray-500">{compactTeam(match.refereeName)}</p>
  ) : null;
  const className = `w-full rounded-sm border px-2.5 py-2 text-left transition duration-200 ${
    active ? 'border-black bg-white shadow-[0_10px_28px_rgba(0,0,0,0.08)]' : 'border-vvl-border bg-white hover:border-black'
  }`;
  if (!asButton) {
    return (
      <div className={className}>
        <div className="flex items-center gap-2">{body}</div>
        {meta}
      </div>
    );
  }
  return (
    <button type="button" className={className} data-testid={`match-${match.id}`} aria-pressed={active} onClick={() => onSelect?.(match)}>
      <div className="flex items-center gap-2">{body}</div>
      {meta}
    </button>
  );
}

export function MatchTimeline({ view, filters, showReferee = false, showScore = true, onSelectMatch, interactive = false }) {
  const partIds = new Set((view.parts || []).map((part) => part.id));
  const matches = view.matches.filter((match) => partIds.has(match.partId) && matchVisible(match, filters || {}));
  const rows = buildRows(view, matches);
  if (!rows.length) return <p className="py-6 text-sm text-gray-500">Geen wedstrijden.</p>;

  return (
    <div className="space-y-4" data-testid="schedule-list">
      {rows.map((row) =>
        row.type === 'break' ? (
          <p key={row.id} className="py-1 text-center text-[11px] font-bold uppercase tracking-[0.16em] text-gray-400">
            {row.label}
          </p>
        ) : (
          <div key={row.slot.index} className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-3">
            <p className="pt-2 text-xs font-bold tabular-nums text-gray-400">{row.slot.label}</p>
            <div className="space-y-1.5 border-l border-vvl-border pl-3">
              {row.matches.map((match) => (
                <MatchCard
                  key={match.id}
                  match={match}
                  active={interactive && filters?.matchId === match.id}
                  onSelect={onSelectMatch}
                  showReferee={showReferee}
                  showScore={showScore}
                  asButton={interactive}
                />
              ))}
            </div>
          </div>
        ),
      )}
    </div>
  );
}

export function ScheduleTable({ view, showReferee = true, showScore = true }) {
  return <MatchTimeline view={view} showReferee={showReferee} showScore={showScore} />;
}

export function ScheduleStage({ view, focusPartId = '', showReferee = false, showScore = true }) {
  const filters = useScheduleFilters();
  const selected = view.matches.find((match) => match.id === filters.matchId);
  const activePartId = selected?.partId || filters.partId || focusPartId || '';

  return (
    <PitchFocus view={view} activePartId={activePartId} activeFieldId={filters.fieldId} onSelectPart={filters.selectPart}>
      <ScheduleFilters view={view} filters={filters} />
      <MatchTimeline
        view={view}
        filters={filters}
        showReferee={showReferee}
        showScore={showScore}
        interactive
        onSelectMatch={filters.selectMatch}
      />
    </PitchFocus>
  );
}

const STANDING_HEADERS = [
  ['P', 'played'],
  ['S', 'gd'],
  ['PT', 'points'],
];

export function PouleBoards({ poules }) {
  if (!poules.length) return null;
  return (
    <div className="grid gap-3 md:grid-cols-2" data-testid="poules">
      {poules.map((poule) => (
        <section key={poule.id} className="min-w-0 overflow-hidden rounded-sm border border-vvl-border bg-white">
          <h2 className="border-b border-vvl-border px-3 py-2 text-xs font-black uppercase tracking-wide">{poule.name}</h2>
          <table className="w-full table-fixed text-left text-xs">
            <colgroup>
              <col />
              {STANDING_HEADERS.map(([label]) => (
                <col key={label} style={{ width: '14%' }} />
              ))}
            </colgroup>
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-gray-400">
                <th className="px-3 py-1 text-left font-bold" />
                {STANDING_HEADERS.map(([label]) => (
                  <th key={label} className="px-0 py-1 text-center font-bold">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {poule.table.map((row, index) => (
                <tr key={row.teamId} className="border-t border-vvl-border">
                  <td className="truncate px-3 py-1.5 text-sm font-semibold">
                    <span className="mr-1.5 text-[11px] font-bold text-gray-400">{index + 1}</span>
                    {compactTeam(row.name)}
                  </td>
                  {STANDING_HEADERS.map(([label, key]) => {
                    const value = key === 'gd' && row.gd > 0 ? `+${row.gd}` : row[key];
                    return (
                      <td key={label} className={`px-0 py-1.5 text-center tabular-nums ${label === 'PT' ? 'font-black' : ''}`}>
                        {value}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
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
    <div className="grid gap-6 lg:grid-cols-2" data-testid="bracket">
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
          <section key={category} className="space-y-3">
            <h2 className="text-xs font-black uppercase tracking-widest text-gray-400">{category}</h2>
            <div className="flex gap-4 overflow-x-auto">
              {rounds.map((round) => (
                <div key={round.round} className="flex min-w-[12rem] flex-1 flex-col justify-around gap-3">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">{round.label}</p>
                  {round.matches.map((match) => (
                    <div key={match.id} className="overflow-hidden rounded-sm border border-vvl-border bg-white text-sm">
                      <p className={`px-3 py-1.5 ${match.winnerId && match.winnerId === match.homeId ? 'font-black' : ''}`}>
                        {compactTeam(match.homeLabel)}
                        {match.score ? <span className="float-right tabular-nums">{match.score.home}</span> : null}
                      </p>
                      <p className={`border-t border-vvl-border px-3 py-1.5 ${match.winnerId && match.winnerId === match.awayId ? 'font-black' : ''}`}>
                        {compactTeam(match.awayLabel)}
                        {match.score ? <span className="float-right tabular-nums">{match.score.away}</span> : null}
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
