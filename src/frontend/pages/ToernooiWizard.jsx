import { useSearchParams } from 'react-router-dom';
import FieldEditor from '../toernooi/Pitch.jsx';
import {
  CATEGORIES,
  createExample,
  partsForField,
  resizeFields,
  resizeTeams,
  withPouleMode,
} from '../toernooi/engine.js';
import { useTournament } from '../toernooi/storage.js';
import { BracketView, FitBanner, PouleBoards, QrBlock, ScheduleTable, dutchDate, liveUrl } from '../toernooi/views.jsx';

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
        className="vvl-input w-28"
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
    <select className="vvl-input" aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
      {CATEGORIES.map((category) => (
        <option key={category.id} value={category.id}>
          {category.id} · {SIZE_SHORT[category.size]}
        </option>
      ))}
    </select>
  );
}

function Choice({ active, children, onClick }) {
  return (
    <button type="button" className={`min-h-11 flex-1 ${active ? 'vvl-btn-primary' : 'vvl-btn-outline'}`} onClick={onClick}>
      {children}
    </button>
  );
}

export default function ToernooiWizard() {
  const { state, setState, view } = useTournament();
  const [params, setParams] = useSearchParams();
  const requested = params.get('stap') || 'velden';
  const index = Math.max(0, STEPS.findIndex((step) => step.id === requested));
  const step = STEPS[index];

  const go = (id) => {
    const next = new URLSearchParams(params);
    next.set('stap', id);
    setParams(next, { replace: true });
  };

  return (
    <div className="space-y-4" data-testid={`toernooi-step-${step.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="page-title">{state.name || 'Toernooi'}</h1>
          <p className="text-sm font-semibold text-gray-600">{dutchDate(state.date)}</p>
        </div>
        <button type="button" className="vvl-btn-outline shrink-0 text-xs" onClick={() => setState(createExample())}>
          Voorbeeld
        </button>
      </div>

      <div className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1" role="tablist" aria-label="Stappen">
        {STEPS.map((item, itemIndex) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={item.id === step.id}
            className={`min-h-11 shrink-0 px-3 text-xs font-bold uppercase ${
              item.id === step.id ? 'bg-black text-white' : 'bg-white text-black'
            }`}
            onClick={() => go(item.id)}
          >
            {itemIndex + 1} {item.label}
          </button>
        ))}
      </div>

      {step.id === 'velden' ? <StepVelden state={state} setState={setState} /> : null}
      {step.id === 'teams' ? <StepTeams state={state} setState={setState} view={view} /> : null}
      {step.id === 'tijd' ? <StepTijd state={state} setState={setState} view={view} /> : null}
      {step.id === 'diensten' ? <StepDiensten state={state} setState={setState} view={view} /> : null}
      {step.id === 'fluiten' ? <StepFluiten state={state} setState={setState} view={view} /> : null}
      {step.id === 'schema' ? <StepSchema view={view} /> : null}
      {step.id === 'pdf' ? <StepPdf view={view} /> : null}
      {step.id === 'dag' ? <StepDag state={state} setState={setState} view={view} /> : null}

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

function StepVelden({ state, setState }) {
  const fields = state.fields.map((field) => ({ ...field, parts: partsForField(field) }));
  return (
    <div className="space-y-4">
      <label className="block max-w-md">
        <span className="vvl-label">Naam</span>
        <input className="vvl-input" value={state.name} onChange={(event) => setState({ ...state, name: event.target.value })} />
      </label>
      <NumberField
        label="Aantal velden"
        value={state.fields.length}
        min={1}
        max={8}
        testId="aantal-velden"
        onChange={(count) => setState({ ...state, fields: resizeFields(state.fields, count) })}
      />
      <div className="grid gap-3 lg:grid-cols-2">
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <NumberField
          label="Aantal teams"
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
        <div className="flex min-w-[16rem] flex-1 gap-1">
          <Choice active={state.categoryMode === 'team'} onClick={() => setMode('team')}>
            Per team
          </Choice>
          <Choice active={state.categoryMode === 'poule'} onClick={() => setMode('poule')}>
            Per poule
          </Choice>
        </div>
      </div>

      {state.categoryMode === 'poule' ? (
        <PouleEditors state={state} setState={setState} />
      ) : (
        <ul className="space-y-2">
          {state.teams.map((team) => (
            <li key={team.id} className="grid gap-2 sm:grid-cols-[1fr_11rem]">
              <input
                className="vvl-input"
                aria-label="Teamnaam"
                value={team.name}
                onChange={(event) => setTeam(team.id, { name: event.target.value })}
              />
              <CategorySelect value={team.category} onChange={(category) => setTeam(team.id, { category })} />
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        {view.poules.map((poule) => (
          <p key={poule.id} className="vvl-card px-3 py-2 text-sm">
            <span className="font-black uppercase">{poule.name}</span>
            <span className="text-gray-600"> · {poule.teams.length} · {SIZE_SHORT[poule.size]}</span>
          </p>
        ))}
      </div>
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
    <div className="space-y-3">
      <NumberField label="Aantal poules" value={state.poules.length || 1} min={1} max={8} onChange={setPouleCount} />
      {state.poules.map((poule) => (
        <section key={poule.id} className="vvl-card space-y-2">
          <div className="grid gap-2 sm:grid-cols-[1fr_11rem]">
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
          <ul className="space-y-2">
            {state.teams
              .filter((team) => team.pouleId === poule.id)
              .map((team) => (
                <li key={team.id} className="grid gap-2 sm:grid-cols-[1fr_9rem]">
                  <input
                    className="vvl-input"
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
                    className="vvl-input"
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
    <div className="space-y-4">
      <div className="flex flex-col gap-1 sm:flex-row">
        <Choice active={state.format === 'poules'} onClick={() => set({ format: 'poules' })}>
          Poules
        </Choice>
        <Choice active={state.format === 'knockout'} onClick={() => set({ format: 'knockout' })}>
          Sudden death
        </Choice>
        <Choice active={state.format === 'poules-knockout'} onClick={() => set({ format: 'poules-knockout' })}>
          Poules + knock-out
        </Choice>
      </div>
      {state.format === 'poules-knockout' ? (
        <NumberField label="Doorgaan per poule" value={state.advance} min={1} max={4} onChange={(advance) => set({ advance })} />
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
        <NumberField label="Wedstrijd (min)" value={state.matchMinutes} min={5} max={90} onChange={(matchMinutes) => set({ matchMinutes })} />
        <NumberField label="Wissel (min)" value={state.changeoverMinutes} min={0} max={30} onChange={(changeoverMinutes) => set({ changeoverMinutes })} />
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
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4">
        <NumberField label="Bar" value={state.barShifts} min={0} max={8} onChange={(barShifts) => set({ barShifts })} />
        <NumberField label="Keuken" value={state.kitchenShifts} min={0} max={8} onChange={(kitchenShifts) => set({ kitchenShifts })} />
      </div>
      <ul className="space-y-2">
        {view.shifts.map((shift) => (
          <li key={shift.id} className="vvl-card flex items-center justify-between gap-3 text-sm">
            <span className="font-black uppercase">{shift.name}</span>
            <span className="font-semibold">
              {shift.start}–{shift.end}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-sm font-semibold">Straks open diensten in Diensten.</p>
    </div>
  );
}

function StepFluiten({ state, setState, view }) {
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
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1 sm:flex-row">
        <Choice active={state.refereeMode === 'manual'} onClick={() => choose('manual')}>
          Zelf indelen
        </Choice>
        <Choice active={state.refereeMode === 'auto'} onClick={() => choose('auto')}>
          Teams fluiten elkaar
        </Choice>
      </div>
      <ul className="space-y-2">
        {scheduled.map((match) => (
          <li key={match.id} className="vvl-card grid gap-2 text-sm md:grid-cols-[7rem_1fr_14rem] md:items-center">
            <span className="font-bold">{match.slot?.label}</span>
            <span>
              {match.homeLabel}
              <span className="text-gray-500"> – </span>
              {match.awayLabel}
            </span>
            {state.refereeMode === 'manual' ? (
              <select
                className="vvl-input"
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
              <span className="font-semibold">{match.refereeName || '—'}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function StepSchema({ view }) {
  return (
    <div className="space-y-4">
      {view.fit.ok ? null : <FitBanner fit={view.fit} />}
      <ScheduleTable view={view} />
      {view.unplaced.length ? (
        <p className="text-sm font-semibold text-red-800">{view.unplaced.length} niet ingepland.</p>
      ) : null}
      <PouleBoards poules={view.poules} />
      <BracketView matches={view.matches} />
    </div>
  );
}

function StepPdf({ view }) {
  const url = liveUrl();
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <a className="vvl-btn-primary" href="/mockup/toernooi/afdruk" target="_blank" rel="noreferrer">
          Afdrukken
        </a>
        <QrBlock value={url} caption="Voor de bar" />
      </div>
      <iframe title="Afdrukvoorbeeld" src="/mockup/toernooi/afdruk" className="h-[75vh] w-full border border-vvl-border bg-white" />
      <p className="sr-only">{view.state.name}</p>
    </div>
  );
}

function StepDag({ state, setState, view }) {
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

  const groups = [];
  view.matches
    .filter((match) => match.slot)
    .forEach((match) => {
      let group = groups.find((item) => item.label === match.slot.label);
      if (!group) {
        group = { label: match.slot.label, matches: [] };
        groups.push(group);
      }
      group.matches.push(match);
    });

  return (
    <div className="mx-auto max-w-md space-y-4">
      {groups.map((group) => (
        <section key={group.label} className="space-y-2">
          <h2 className="text-sm font-black uppercase">{group.label}</h2>
          {group.matches.map((match) => (
            <article key={match.id} className="vvl-card space-y-3" data-testid={`score-${match.id}`}>
              <p className="text-xs font-bold uppercase text-gray-500">
                {match.part?.name} · {match.pouleName || match.roundLabel}
              </p>
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
                <button type="button" className="text-xs font-bold uppercase text-gray-500" onClick={() => clearScore(match.id)}>
                  Wis
                </button>
              ) : null}
            </article>
          ))}
        </section>
      ))}
      <PouleBoards poules={view.poules} />
      <BracketView matches={view.matches} />
      <div className="flex items-center justify-between gap-3">
        <a className="vvl-btn-outline" href="/mockup/toernooi/live">
          Live
        </a>
        <QrBlock value={liveUrl()} size={128} caption="Voor de bar" />
      </div>
    </div>
  );
}

function ScoreLine({ label, value, onMinus, onPlus }) {
  return (
    <div className="flex items-center gap-2">
      <span className="min-w-0 flex-1 font-bold leading-tight">{label}</span>
      <button type="button" className="h-14 w-14 bg-black text-3xl font-black text-white" onClick={onMinus} aria-label={`${label} min`}>
        –
      </button>
      <span className="w-10 text-center text-3xl font-black tabular-nums" data-testid="score-waarde">
        {value == null ? '–' : value}
      </span>
      <button type="button" className="h-14 w-14 bg-black text-3xl font-black text-white" onClick={onPlus} aria-label={`${label} plus`}>
        +
      </button>
    </div>
  );
}
