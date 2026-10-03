import { useParams, useSearchParams } from 'react-router-dom';
import FieldEditor, { PitchFocus } from '../toernooi/Pitch.jsx';
import {
  CATEGORIES,
  createExample,
  partsForField,
  resizeFields,
  resizeTeams,
  unusedFullFields,
  withPouleMode,
} from '../toernooi/engine.js';
import { useTournament } from '../toernooi/storage.js';
import {
  BracketView,
  FitBanner,
  PouleBoards,
  QrBlock,
  ScheduleStage,
  compactTeam,
  dutchDate,
  liveUrl,
  useScheduleFilters,
} from '../toernooi/views.jsx';

const STEPS = [
  { id: 'velden', label: 'Velden' },
  { id: 'teams', label: 'Teams' },
  { id: 'tijd', label: 'Tijd' },
  { id: 'diensten', label: 'Diensten' },
  { id: 'fluiten', label: 'Fluiten' },
  { id: 'schema', label: 'Schema' },
  { id: 'pdf', label: 'PDF' },
  { id: 'dag', label: 'Dag' },
];

const SIZE_SHORT = { quarter: 'kwart', half: 'half', full: 'heel' };

function NumberField({ label, value, min, max, onChange, testId }) {
  return (
    <label className="block">
      <span className="vvl-label">{label}</span>
      <input
        className="vvl-input w-24"
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        data-testid={testId}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
      />
    </label>
  );
}

function CategorySelect({ value, onChange, label = 'Categorie' }) {
  return (
    <select
      className="h-11 bg-transparent px-1 text-xs font-bold uppercase outline-none"
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {CATEGORIES.map((category) => (
        <option key={category.id} value={category.id}>
          {category.id}
        </option>
      ))}
    </select>
  );
}

function Segment({ options, value, onChange, label }) {
  return (
    <div className="flex rounded-sm border border-vvl-border bg-white p-0.5" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          className={`min-h-10 flex-1 rounded-sm px-2 text-xs font-bold uppercase tracking-wide transition duration-200 ${
            value === option.id ? 'bg-black text-white' : 'text-gray-500 hover:text-black'
          }`}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export default function ToernooiWizard() {
  const { id } = useParams();
  const { state, setState, view, ready, error, publicToken } = useTournament(id);
  const [params, setParams] = useSearchParams();
  const requested = params.get('stap') || 'velden';
  const index = Math.max(0, STEPS.findIndex((step) => step.id === requested));
  const step = STEPS[index];

  if (!ready) return <p className="text-sm text-gray-600">Laden…</p>;
  if (error && !state) return <p className="text-sm font-semibold text-red-800">{error}</p>;
  if (!state || !view) return null;

  const go = (id) => {
    const next = new URLSearchParams(params);
    next.set('stap', id);
    setParams(next, { replace: true });
  };

  return (
    <div className="space-y-6" data-testid={`toernooi-step-${step.id}`}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="break-words font-heading text-[1.35rem] font-black uppercase leading-none tracking-tight md:text-3xl">{state.name || 'Toernooi'}</h1>
          <p className="mt-1 text-sm text-gray-500">{dutchDate(state.date)}</p>
        </div>
        <button type="button" className="vvl-btn-outline shrink-0 text-xs" onClick={() => setState(createExample())}>
          Voorbeeld
        </button>
      </div>

      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1" role="tablist" aria-label="Stappen">
        {STEPS.map((item, itemIndex) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={item.id === step.id}
            className={`min-h-10 shrink-0 rounded-full px-3 text-xs font-bold uppercase tracking-wide transition duration-200 ${
              item.id === step.id ? 'bg-black text-white' : 'bg-white text-gray-500 hover:text-black'
            }`}
            onClick={() => go(item.id)}
          >
            {itemIndex + 1} {item.label}
          </button>
        ))}
      </div>

      {step.id === 'velden' ? <StepVelden state={state} setState={setState} view={view} /> : null}
      {step.id === 'teams' ? <StepTeams state={state} setState={setState} view={view} /> : null}
      {step.id === 'tijd' ? <StepTijd state={state} setState={setState} view={view} /> : null}
      {step.id === 'diensten' ? <StepDiensten state={state} setState={setState} view={view} /> : null}
      {step.id === 'fluiten' ? <StepFluiten state={state} setState={setState} view={view} /> : null}
      {step.id === 'schema' ? <StepSchema view={view} /> : null}
      {step.id === 'pdf' ? <StepPdf view={view} tournamentId={id} publicToken={publicToken} /> : null}
      {step.id === 'dag' ? <StepDag state={state} setState={setState} view={view} publicToken={publicToken} /> : null}

      <div className="flex gap-2">
        {index > 0 ? (
          <button type="button" className="vvl-btn-outline" onClick={() => go(STEPS[index - 1].id)}>
            Terug
          </button>
        ) : null}
        {index < STEPS.length - 1 ? (
          <button type="button" className="vvl-btn-primary" onClick={() => go(STEPS[index + 1].id)}>
            Volgende
          </button>
        ) : null}
      </div>
    </div>
  );
}

function StepVelden({ state, setState, view }) {
  const fields = state.fields.map((field) => ({ ...field, parts: partsForField(field) }));
  const idle = unusedFullFields(state, view.matches);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-6">
        <label className="block min-w-[16rem] flex-1">
          <span className="vvl-label">Naam</span>
          <input className="vvl-input" value={state.name} onChange={(event) => setState({ ...state, name: event.target.value })} />
        </label>
        <NumberField
          label="Velden"
          value={state.fields.length}
          min={1}
          max={8}
          testId="aantal-velden"
          onChange={(count) => setState({ ...state, fields: resizeFields(state.fields, count) })}
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {fields.map((field) => (
          <FieldEditor
            key={field.id}
            field={field}
            onChange={(next) =>
              setState({
                ...state,
                fields: state.fields.map((item) => (item.id === field.id ? { ...item, ...next, parts: undefined } : item)),
              })
            }
          />
        ))}
      </div>
      {idle.map((field) => (
        <p key={field.id} className="text-sm font-semibold text-gray-700" data-testid={`veld-leeg-${field.id}`}>
          {field.name} blijft leeg. Deel het veld in helften of kwarten.
        </p>
      ))}
    </div>
  );
}

function StepTeams({ state, setState, view }) {
  const setMode = (mode) => {
    if (mode === state.categoryMode) return;
    if (mode === 'poule') setState(withPouleMode(state));
    else setState({ ...state, categoryMode: 'team' });
  };

  const setTeam = (id, patch) => {
    setState({
      ...state,
      teams: state.teams.map((team) => (team.id === id ? { ...team, ...patch } : team)),
    });
  };

  const moveTeam = (teamId, pouleId) => {
    const base = state.categoryMode === 'poule' ? state : withPouleMode(state);
    setState({
      ...base,
      teams: base.teams.map((team) => (team.id === teamId ? { ...team, pouleId } : team)),
    });
  };

  const groups = [];
  state.teams.forEach((team) => {
    let group = groups.find((item) => item.category === team.category);
    if (!group) {
      group = { category: team.category, teams: [] };
      groups.push(group);
    }
    group.teams.push(team);
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <NumberField
          label="Teams"
          value={state.teams.length}
          min={2}
          max={32}
          testId="aantal-teams"
          onChange={(count) =>
            setState({
              ...state,
              teams: resizeTeams(state.teams, count, (index) => ({
                id: `t-extra-${index}-${Date.now().toString(36)}`,
                name: `Team ${index + 1}`,
                category: state.teams.at(-1)?.category || 'JO9',
                pouleId: state.teams.at(-1)?.pouleId || state.poules[0]?.id || '',
              })),
            })
          }
        />
        <div className="min-w-[16rem] flex-1">
          <Segment
            label="Categorie"
            value={state.categoryMode}
            onChange={setMode}
            options={[
              { id: 'team', label: 'Per team' },
              { id: 'poule', label: 'Per poule' },
            ]}
          />
        </div>
      </div>

      {state.categoryMode === 'poule' ? (
        <PouleEditors state={state} setState={setState} />
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.category}>
              <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-gray-400">
                {group.category}
                <span className="ml-2 normal-case tracking-normal">{SIZE_SHORT[CATEGORIES.find((item) => item.id === group.category)?.size]}</span>
              </h2>
              <ul className="mt-2 divide-y divide-vvl-border border-y border-vvl-border bg-white">
                {group.teams.map((team) => (
                  <li key={team.id} className="flex items-center gap-2 pr-1">
                    <input
                      className="h-11 min-w-0 flex-1 bg-transparent px-3 text-sm font-semibold outline-none"
                      aria-label="Teamnaam"
                      value={team.name}
                      onChange={(event) => setTeam(team.id, { name: event.target.value })}
                    />
                    <CategorySelect value={team.category} onChange={(category) => setTeam(team.id, { category })} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {state.categoryMode === 'team' ? (
        <div className="grid gap-3 md:grid-cols-2">
          {view.poules.map((poule) => (
            <section
              key={poule.id}
              className="rounded-sm border border-dashed border-vvl-border bg-white p-2"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const teamId = event.dataTransfer.getData('text/plain');
                if (teamId) moveTeam(teamId, poule.id);
              }}
            >
              <h3 className="px-1 text-[11px] font-bold uppercase tracking-[0.16em] text-gray-400">{poule.name}</h3>
              <ul>
                {poule.teams.map((team) => (
                  <li
                    key={team.id}
                    draggable
                    onDragStart={(event) => event.dataTransfer.setData('text/plain', team.id)}
                    className="flex cursor-grab items-center gap-2"
                  >
                    <span className="min-w-0 flex-1 truncate px-1 text-sm font-semibold">{team.name}</span>
                    <select
                      className="h-10 bg-transparent px-1 text-xs font-bold outline-none"
                      aria-label={`Poule van ${team.name}`}
                      value={poule.id}
                      onChange={(event) => moveTeam(team.id, event.target.value)}
                    >
                      {view.poules.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {view.poules.map((poule) => (
            <p key={poule.id} className="rounded-full border border-vvl-border bg-white px-3 py-1 text-xs font-bold">
              {poule.name}
              <span className="ml-1 font-semibold text-gray-400">{poule.teams.length}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function PouleEditors({ state, setState }) {
  const setPouleCount = (count) => {
    const total = Math.max(1, Math.min(8, count));
    let poules = state.poules.slice(0, total);
    while (poules.length < total) {
      const index = poules.length;
      poules = [
        ...poules,
        { id: `p-${index}-${Date.now().toString(36)}`, name: `Poule ${String.fromCharCode(65 + index)}`, category: 'JO11' },
      ];
    }
    const keep = new Set(poules.map((poule) => poule.id));
    setState({
      ...state,
      poules,
      teams: state.teams.map((team) => ({
        ...team,
        pouleId: keep.has(team.pouleId) ? team.pouleId : poules[0].id,
      })),
    });
  };

  return (
    <div className="space-y-4">
      <NumberField label="Poules" value={state.poules.length || 1} min={1} max={8} onChange={setPouleCount} />
      {state.poules.map((poule) => (
        <section
          key={poule.id}
          className="space-y-2"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const teamId = event.dataTransfer.getData('text/plain');
            if (!teamId) return;
            setState({
              ...state,
              teams: state.teams.map((item) => (item.id === teamId ? { ...item, pouleId: poule.id } : item)),
            });
          }}
        >
          <div className="flex items-center gap-2">
            <input
              className="vvl-input font-bold"
              aria-label="Poulenaam"
              value={poule.name}
              onChange={(event) =>
                setState({
                  ...state,
                  poules: state.poules.map((item) => (item.id === poule.id ? { ...item, name: event.target.value } : item)),
                })
              }
            />
            <CategorySelect
              value={poule.category}
              label={`Categorie ${poule.name}`}
              onChange={(category) =>
                setState({
                  ...state,
                  poules: state.poules.map((item) => (item.id === poule.id ? { ...item, category } : item)),
                })
              }
            />
          </div>
          <ul className="divide-y divide-vvl-border border-y border-vvl-border bg-white">
            {state.teams
              .filter((team) => team.pouleId === poule.id)
              .map((team) => (
                <li
                  key={team.id}
                  draggable
                  onDragStart={(event) => event.dataTransfer.setData('text/plain', team.id)}
                  className="flex cursor-grab items-center gap-2"
                >
                  <input
                    className="h-11 min-w-0 flex-1 bg-transparent px-3 text-sm font-semibold outline-none"
                    aria-label="Teamnaam"
                    value={team.name}
                    onChange={(event) =>
                      setState({
                        ...state,
                        teams: state.teams.map((item) => (item.id === team.id ? { ...item, name: event.target.value } : item)),
                      })
                    }
                  />
                  <select
                    className="h-11 bg-transparent px-2 text-xs font-bold outline-none"
                    aria-label={`Poule van ${team.name}`}
                    value={team.pouleId}
                    onChange={(event) =>
                      setState({
                        ...state,
                        teams: state.teams.map((item) => (item.id === team.id ? { ...item, pouleId: event.target.value } : item)),
                      })
                    }
                  >
                    {state.poules.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function StepTijd({ state, setState, view }) {
  const set = (patch) => setState({ ...state, ...patch });
  return (
    <div className="max-w-3xl space-y-6">
      <Segment
        label="Opzet"
        value={state.format}
        onChange={(format) => set({ format })}
        options={[
          { id: 'poules', label: 'Poules' },
          { id: 'knockout', label: 'Sudden death' },
          { id: 'poules-knockout', label: 'Poules + knock-out' },
        ]}
      />
      {state.format === 'poules-knockout' ? (
        <NumberField label="Doorgaan" value={state.advance} min={1} max={4} onChange={(advance) => set({ advance })} />
      ) : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="vvl-label">Datum</span>
          <input className="vvl-input" type="date" value={state.date} onChange={(event) => set({ date: event.target.value })} />
        </label>
        <label className="block">
          <span className="vvl-label">Start</span>
          <input className="vvl-input" type="time" value={state.startTime} onChange={(event) => set({ startTime: event.target.value })} />
        </label>
        <label className="block">
          <span className="vvl-label">Einde</span>
          <input className="vvl-input" type="time" value={state.endTime} onChange={(event) => set({ endTime: event.target.value })} />
        </label>
        <NumberField label="Minuten" value={state.matchMinutes} min={5} max={90} onChange={(matchMinutes) => set({ matchMinutes })} />
        <NumberField label="Wissel" value={state.changeoverMinutes} min={0} max={30} onChange={(changeoverMinutes) => set({ changeoverMinutes })} />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <button
          type="button"
          className={state.breakEnabled ? 'vvl-btn-primary' : 'vvl-btn-outline'}
          onClick={() => set({ breakEnabled: !state.breakEnabled })}
        >
          Pauze
        </button>
        {state.breakEnabled ? (
          <>
            <label className="block">
              <span className="vvl-label">Vanaf</span>
              <input className="vvl-input w-32" type="time" value={state.breakStart} onChange={(event) => set({ breakStart: event.target.value })} />
            </label>
            <NumberField label="Minuten" value={state.breakMinutes} min={5} max={120} onChange={(breakMinutes) => set({ breakMinutes })} />
          </>
        ) : null}
      </div>
      <FitBanner fit={view.fit} />
    </div>
  );
}

function StepDiensten({ state, setState, view }) {
  const set = (patch) => setState({ ...state, ...patch });
  return (
    <div className="max-w-xl space-y-6">
      <div className="flex flex-wrap gap-6">
        <NumberField label="Bar" value={state.barShifts} min={0} max={8} onChange={(barShifts) => set({ barShifts })} />
        <NumberField label="Keuken" value={state.kitchenShifts} min={0} max={8} onChange={(kitchenShifts) => set({ kitchenShifts })} />
      </div>
      <ul className="divide-y divide-vvl-border border-y border-vvl-border bg-white">
        {view.shifts.map((shift) => (
          <li key={shift.id} className="flex items-center justify-between gap-3 px-3 py-3 text-sm">
            <span className="font-bold">{shift.name}</span>
            <span className="tabular-nums text-gray-500">
              {shift.start}–{shift.end}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StepFluiten({ state, setState, view }) {
  const filters = useScheduleFilters();
  const choose = (mode) => {
    if (mode === 'manual') {
      const manualReferees = {};
      view.matches.forEach((match) => {
        if (match.refereeId) manualReferees[match.id] = match.refereeId;
      });
      setState({ ...state, refereeMode: 'manual', manualReferees });
      return;
    }
    setState({ ...state, refereeMode: 'auto' });
  };

  const scheduled = view.matches.filter((match) => match.slot);
  const selected = scheduled.find((match) => match.id === filters.matchId);

  return (
    <PitchFocus view={view} activePartId={selected?.partId || filters.partId} onSelectPart={filters.selectPart}>
      <Segment
        label="Fluiten"
        value={state.refereeMode}
        onChange={choose}
        options={[
          { id: 'auto', label: 'Teams fluiten elkaar' },
          { id: 'manual', label: 'Zelf' },
        ]}
      />
      <div className="space-y-1.5">
        {scheduled
          .filter((match) => !filters.partId || match.partId === filters.partId)
          .map((match) => {
            const active = match.id === filters.matchId;
            return (
              <div
                key={match.id}
                className={`grid gap-2 rounded-sm border bg-white px-3 py-2 transition duration-200 md:grid-cols-[4.5rem_minmax(0,1fr)_12rem] md:items-center ${
                  active ? 'border-black shadow-[0_10px_28px_rgba(0,0,0,0.08)]' : 'border-vvl-border'
                }`}
              >
                <button type="button" className="text-left" onClick={() => filters.selectMatch(match)}>
                  <span className="text-xs font-bold tabular-nums text-gray-400">{match.slot?.label}</span>
                  <span className="mt-0.5 block truncate text-sm font-semibold md:hidden">
                    {compactTeam(match.homeLabel)} – {compactTeam(match.awayLabel)}
                  </span>
                </button>
                <button type="button" className="hidden truncate text-left text-sm font-semibold md:block" onClick={() => filters.selectMatch(match)}>
                  {compactTeam(match.homeLabel)}
                  <span className="px-1 font-normal text-gray-400">–</span>
                  {compactTeam(match.awayLabel)}
                </button>
                {state.refereeMode === 'manual' ? (
                  <select
                    className="vvl-input h-9 text-xs"
                    aria-label={`Scheidsrechter ${match.homeLabel}`}
                    value={state.manualReferees[match.id] || ''}
                    onChange={(event) =>
                      setState({
                        ...state,
                        manualReferees: { ...state.manualReferees, [match.id]: event.target.value },
                      })
                    }
                  >
                    <option value="">—</option>
                    {state.teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-xs font-semibold text-gray-500">{match.refereeName ? compactTeam(match.refereeName) : '—'}</span>
                )}
              </div>
            );
          })}
      </div>
    </PitchFocus>
  );
}

function StepSchema({ view }) {
  const knockout = view.matches.some((match) => match.phase === 'knockout' && match.slotIndex != null);
  return (
    <div className="space-y-8">
      {view.fit.ok ? null : <FitBanner fit={view.fit} />}
      {view.unplaced.length ? (
        <p className="text-sm font-semibold text-red-800">{view.unplaced.length} niet ingepland.</p>
      ) : null}
      <ScheduleStage view={view} showReferee />
      <PouleBoards poules={view.poules} />
      {knockout ? (
        <details className="group">
          <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.16em] text-gray-400">Knock-out</summary>
          <div className="mt-4">
            <BracketView matches={view.matches} />
          </div>
        </details>
      ) : null}
    </div>
  );
}

function StepPdf({ view, tournamentId, publicToken }) {
  const url = liveUrl(publicToken);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <a className="vvl-btn-primary" href={`/toernooi/${tournamentId}/afdruk`} target="_blank" rel="noreferrer">
          Afdrukken
        </a>
        <QrBlock value={url} caption="Voor de bar" />
      </div>
      <iframe title="Afdrukvoorbeeld" src={`/toernooi/${tournamentId}/afdruk`} className="h-[75vh] w-full border border-vvl-border bg-white" />
      <p className="sr-only">{view.state.name}</p>
    </div>
  );
}

function StepDag({ state, setState, view, publicToken }) {
  const filters = useScheduleFilters();
  const setScore = (match, side, delta) => {
    setState((current) => {
      const prev = current.scores[match.id];
      if (!prev?.played && delta < 0) return current;
      const base = prev?.played ? prev : { played: true, home: 0, away: 0, penalties: null };
      const next = {
        ...base,
        played: true,
        home: Number(base.home) || 0,
        away: Number(base.away) || 0,
        [side]: Math.max(0, (Number(base[side]) || 0) + delta),
      };
      if (next.home !== next.away) next.penalties = null;
      return { ...current, scores: { ...current.scores, [match.id]: next } };
    });
  };

  const clearScore = (matchId) => {
    setState((current) => {
      const scores = { ...current.scores };
      delete scores[matchId];
      return { ...current, scores };
    });
  };

  const penalties = (match, teamId) => {
    setState((current) => ({
      ...current,
      scores: {
        ...current.scores,
        [match.id]: { ...(current.scores[match.id] || { home: 0, away: 0 }), played: true, penalties: teamId },
      },
    }));
  };

  const scheduled = view.matches.filter((match) => match.slot && (!filters.partId || match.partId === filters.partId));
  const selected = view.matches.find((match) => match.id === filters.matchId);
  const groups = [];
  scheduled.forEach((match) => {
    let group = groups.find((item) => item.label === match.slot.label);
    if (!group) {
      group = { label: match.slot.label, matches: [] };
      groups.push(group);
    }
    group.matches.push(match);
  });

  return (
    <PitchFocus view={view} activePartId={selected?.partId || filters.partId} onSelectPart={filters.selectPart}>
      {groups.map((group) => (
        <section key={group.label} className="space-y-1.5">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-gray-400">{group.label}</h2>
          {group.matches.map((match) => {
            const open = match.id === filters.matchId;
            return (
              <article key={match.id} className="rounded-sm border border-vvl-border bg-white" data-testid={`score-${match.id}`}>
                <button type="button" className="flex w-full items-center gap-2 px-3 py-2.5 text-left" onClick={() => filters.selectMatch(match)}>
                  <span className="shrink-0 rounded-sm bg-black px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
                    {match.part?.name?.replace(/^Veld\s*/i, '') || ''}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                    {compactTeam(match.homeLabel)}
                    <span className="px-1 font-normal text-gray-400">–</span>
                    {compactTeam(match.awayLabel)}
                  </span>
                  <span className="text-sm font-black tabular-nums">{match.score ? `${match.score.home}–${match.score.away}` : ''}</span>
                </button>
                {open ? (
                  <div className="space-y-3 border-t border-vvl-border px-3 py-3">
                    <ScoreLine label={match.homeLabel} value={match.score ? match.score.home : null} onMinus={() => setScore(match, 'home', -1)} onPlus={() => setScore(match, 'home', 1)} />
                    <ScoreLine label={match.awayLabel} value={match.score ? match.score.away : null} onMinus={() => setScore(match, 'away', -1)} onPlus={() => setScore(match, 'away', 1)} />
                    {match.phase === 'knockout' && match.score && match.score.home === match.score.away ? (
                      <div className="grid grid-cols-2 gap-2">
                        <button type="button" className="vvl-btn-outline text-xs" onClick={() => penalties(match, match.homeId)}>
                          {match.homeLabel} na strafschoppen
                        </button>
                        <button type="button" className="vvl-btn-outline text-xs" onClick={() => penalties(match, match.awayId)}>
                          {match.awayLabel} na strafschoppen
                        </button>
                      </div>
                    ) : null}
                    {match.score ? (
                      <button type="button" className="text-xs font-bold uppercase text-gray-400" onClick={() => clearScore(match.id)}>
                        Wis
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </article>
            );
          })}
        </section>
      ))}
      <PouleBoards poules={view.poules} />
      <details>
        <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.16em] text-gray-400">Knock-out</summary>
        <div className="mt-4">
          <BracketView matches={view.matches} />
        </div>
      </details>
      <div className="flex items-center justify-between gap-3">
        <a className="vvl-btn-outline" href={liveUrl(publicToken)}>
          Live
        </a>
        <QrBlock value={liveUrl(publicToken)} size={112} caption="Voor de bar" />
      </div>
    </PitchFocus>
  );
}

function ScoreLine({ label, value, onMinus, onPlus }) {
  return (
    <div className="flex items-center gap-2">
      <span className="min-w-0 flex-1 text-sm font-semibold leading-tight">{compactTeam(label)}</span>
      <button type="button" className="h-12 w-12 bg-black text-2xl font-black text-white" onClick={onMinus} aria-label={`${label} min`}>
        –
      </button>
      <span className="w-8 text-center text-2xl font-black tabular-nums" data-testid="score-waarde">
        {value == null ? '–' : value}
      </span>
      <button type="button" className="h-12 w-12 bg-black text-2xl font-black text-white" onClick={onPlus} aria-label={`${label} plus`}>
        +
      </button>
    </div>
  );
}
