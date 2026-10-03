/**
 * Toernooi-indeling, schema en stand. Zelfde module op de server en in de wizard.
 * Regels: round-robin per poule, niemand twee keer tegelijk, rust waar het past,
 * en alleen een velddeel van de juiste grootte.
 * Tiebreak: punten, onderling resultaat, doelsaldo, doelpunten voor.
 */

export const CATEGORIES = [
  { id: 'JO8', size: 'quarter' },
  { id: 'JO9', size: 'quarter' },
  { id: 'JO10', size: 'half' },
  { id: 'JO11', size: 'half' },
  { id: 'JO12', size: 'half' },
  { id: 'JO13', size: 'full' },
  { id: 'JO15', size: 'full' },
  { id: 'JO17', size: 'full' },
  { id: 'Senioren', size: 'full' },
];

export const SIZE_LABEL = {
  quarter: 'kwartveld',
  half: 'half veld',
  full: 'heel veld',
};

const SIZE_RANK = { quarter: 1, half: 2, full: 3 };

const SPLITS = {
  full: [{ key: 'full', size: 'full', suffix: '' }],
  half: [
    { key: 'a', size: 'half', suffix: 'a' },
    { key: 'b', size: 'half', suffix: 'b' },
  ],
  quarter: ['a', 'b', 'c', 'd'].map((suffix) => ({ key: suffix, size: 'quarter', suffix })),
};

export function sizeForCategory(category) {
  return CATEGORIES.find((item) => item.id === category)?.size || 'full';
}

export function parseTime(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function formatTime(total) {
  const mins = ((total % 1440) + 1440) % 1440;
  const hours = Math.floor(mins / 60);
  const minutes = mins % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function partsForField(field) {
  const split = SPLITS[field.split] ? field.split : 'full';
  const base = String(field.name || '').trim() || 'Veld';
  const custom = field.partNames || {};
  return SPLITS[split].map((part) => {
    const autoName = part.suffix ? `${base}${part.suffix}` : base;
    const edited = String(custom[part.key] || '').trim();
    return {
      id: `${field.id}-${part.key}`,
      fieldId: field.id,
      fieldName: base,
      key: part.key,
      size: part.size,
      autoName,
      name: edited || autoName,
    };
  });
}

export function allParts(fields) {
  return (fields || []).flatMap(partsForField);
}

function pouleSizes(count) {
  if (count <= 0) return [];
  if (count <= 5) return [count];
  const rem = count % 4;
  if (rem === 0) return Array(count / 4).fill(4);
  if (rem === 3) return [...Array((count - 3) / 4).fill(4), 3];
  if (rem === 1) return [5, ...Array((count - 5) / 4).fill(4)];
  return [...Array(Math.max(0, (count - 6) / 4)).fill(4), 3, 3];
}

function letter(index) {
  return String.fromCharCode(65 + index);
}

export function resolvePoules(state) {
  const teams = state.teams || [];
  if (state.categoryMode === 'poule') {
    return (state.poules || [])
      .map((poule) => {
        const category = poule.category || 'JO11';
        const members = teams.filter((team) => team.pouleId === poule.id);
        return {
          id: poule.id,
          name: poule.name || category,
          category,
          size: sizeForCategory(category),
          teams: members.map((team) => ({ ...team, category })),
        };
      })
      .filter((poule) => poule.teams.length > 0);
  }

  const order = [];
  const grouped = new Map();
  teams.forEach((team) => {
    const category = team.category || 'JO11';
    if (!grouped.has(category)) {
      grouped.set(category, []);
      order.push(category);
    }
    grouped.get(category).push({ ...team, category });
  });

  const poules = [];
  order.forEach((category) => {
    const members = grouped.get(category);
    let cursor = 0;
    pouleSizes(members.length).forEach((size, index) => {
      const slice = members.slice(cursor, cursor + size);
      cursor += size;
      poules.push({
        id: `poule-${category}-${index}`,
        name: `${category} ${letter(index)}`,
        category,
        size: sizeForCategory(category),
        teams: slice,
      });
    });
  });
  return poules;
}

/** Circle-method. Onegelijke aantallen krijgen een bye (die telt niet als wedstrijd). */
export function roundRobin(teams) {
  const list = teams.map((team) => ({ ...team }));
  if (list.length < 2) return [];
  if (list.length % 2 === 1) list.push(null);
  const total = list.length;
  const fixed = list[0];
  let rotating = list.slice(1);
  const rounds = [];
  for (let round = 0; round < total - 1; round += 1) {
    const row = [fixed, ...rotating];
    const matches = [];
    for (let i = 0; i < total / 2; i += 1) {
      const home = row[i];
      const away = row[total - 1 - i];
      if (home && away) matches.push({ home, away });
    }
    rounds.push(matches);
    rotating = [rotating[rotating.length - 1], ...rotating.slice(0, -1)];
  }
  return rounds;
}

export function buildSlots(state) {
  const start = parseTime(state.startTime);
  const end = parseTime(state.endTime);
  if (start == null || end == null || end <= start) return [];
  const matchMinutes = Math.max(1, Number(state.matchMinutes) || 1);
  const changeover = Math.max(0, Number(state.changeoverMinutes) || 0);
  const step = Math.max(matchMinutes, matchMinutes + changeover);
  const breakOn = Boolean(state.breakEnabled);
  const breakStart = breakOn ? parseTime(state.breakStart) : null;
  const breakMinutes = Math.max(0, Number(state.breakMinutes) || 0);
  const breakEnd = breakStart == null ? null : breakStart + breakMinutes;
  const slots = [];
  let cursor = start;
  while (cursor + matchMinutes <= end && slots.length < 80) {
    const matchEnd = cursor + matchMinutes;
    const hitsBreak = breakEnd != null && cursor < breakEnd && matchEnd > breakStart;
    if (hitsBreak) {
      if (breakEnd <= cursor) break;
      cursor = breakEnd;
      continue;
    }
    slots.push({
      index: slots.length,
      start: cursor,
      end: matchEnd,
      label: formatTime(cursor),
    });
    cursor += step;
  }
  return slots;
}

function seedPositions(size) {
  let positions = [1];
  while (positions.length < size) {
    const next = [];
    const mirror = positions.length * 2 + 1;
    positions.forEach((position) => {
      next.push(position);
      next.push(mirror - position);
    });
    positions = next;
  }
  return positions;
}

function nextPowerOfTwo(value) {
  let size = 1;
  while (size < value) size *= 2;
  return size;
}

function knockoutRoundLabel(matchCount, isFirst, isLast) {
  if (isLast || matchCount === 1) return 'Finale';
  if (isFirst) return 'Kruisfinale';
  if (matchCount === 2) return 'Halve finale';
  return 'Knock-out';
}

function buildBracket(category, size, seeds) {
  const real = seeds.filter(Boolean);
  if (real.length < 2) return [];
  const width = nextPowerOfTwo(real.length);
  const slots = Array(width).fill(null);
  real.forEach((seed, index) => {
    slots[index] = seed;
  });
  const positions = seedPositions(width);
  let current = [];
  for (let i = 0; i < width; i += 2) {
    current.push(slots[positions[i] - 1] || null);
    current.push(slots[positions[i + 1] - 1] || null);
  }
  const matches = [];
  let round = 1;
  while (current.length >= 2) {
    const next = [];
    const made = [];
    for (let i = 0; i < current.length; i += 2) {
      const home = current[i];
      const away = current[i + 1];
      if (!home && !away) continue;
      if (!home || !away) {
        next.push(home || away);
        continue;
      }
      const id = `ko-${category}-r${round}-${made.length}`;
      made.push({ home, away, id });
      next.push({ kind: 'winner', matchId: id });
    }
    const isFirst = round === 1;
    const isLast = next.length < 2;
    const label = knockoutRoundLabel(made.length, isFirst, isLast);
    made.forEach((match) => {
      matches.push({
        id: match.id,
        phase: 'knockout',
        category,
        size,
        round,
        roundLabel: label,
        seriesId: `ko-${category}`,
        homeRef: match.home,
        awayRef: match.away,
        homeId: match.home.kind === 'team' ? match.home.teamId : null,
        awayId: match.away.kind === 'team' ? match.away.teamId : null,
      });
    });
    if (!made.length && next.length === current.length) break;
    current = next;
    round += 1;
    if (round > 8) break;
  }
  return matches;
}

function groupBundles(poules) {
  const bundles = [];
  poules.forEach((poule, pouleIndex) => {
    roundRobin(poule.teams).forEach((round, roundIndex) => {
      if (!round.length) return;
      bundles.push({
        id: `${poule.id}-r${roundIndex + 1}`,
        order: roundIndex * 1000 + pouleIndex,
        phase: 'poule',
        category: poule.category,
        size: poule.size,
        round: roundIndex + 1,
        seriesId: `poule-${poule.id}`,
        matches: round.map((match, matchIndex) => ({
          id: `${poule.id}-r${roundIndex + 1}-m${matchIndex + 1}`,
          phase: 'poule',
          category: poule.category,
          size: poule.size,
          round: roundIndex + 1,
          roundLabel: `Ronde ${roundIndex + 1}`,
          seriesId: `poule-${poule.id}`,
          pouleId: poule.id,
          pouleName: poule.name,
          homeRef: { kind: 'team', teamId: match.home.id },
          awayRef: { kind: 'team', teamId: match.away.id },
          homeId: match.home.id,
          awayId: match.away.id,
          homeLabel: match.home.name,
          awayLabel: match.away.name,
        })),
      });
    });
  });
  return bundles;
}

function knockoutBundles(state, poules) {
  const format = state.format || 'poules';
  if (format === 'poules') return [];
  const advance = Math.max(1, Number(state.advance) || 1);
  const byCategory = new Map();
  poules.forEach((poule) => {
    if (!byCategory.has(poule.category)) byCategory.set(poule.category, []);
    byCategory.get(poule.category).push(poule);
  });

  const bundles = [];
  let categoryIndex = 0;
  byCategory.forEach((list, category) => {
    const size = list[0]?.size || sizeForCategory(category);
    let seeds = [];
    if (format === 'knockout') {
      list.forEach((poule) => {
        poule.teams.forEach((team) => {
          seeds.push({ kind: 'team', teamId: team.id, label: team.name });
        });
      });
    } else {
      const take = Math.max(...list.map((poule) => Math.min(advance, poule.teams.length)));
      for (let rank = 1; rank <= take; rank += 1) {
        list.forEach((poule) => {
          if (rank <= poule.teams.length) {
            seeds.push({ kind: 'place', pouleId: poule.id, rank, label: `${rank}e ${poule.name}` });
          }
        });
      }
    }
    const matches = buildBracket(category, size, seeds);
    const rounds = new Map();
    matches.forEach((match) => {
      if (!rounds.has(match.round)) rounds.set(match.round, []);
      rounds.get(match.round).push(match);
    });
    rounds.forEach((roundMatches, round) => {
      bundles.push({
        id: `ko-${category}-r${round}`,
        order: 50000 + round * 1000 + categoryIndex,
        phase: 'knockout',
        category,
        size,
        round,
        seriesId: `ko-${category}`,
        matches: roundMatches,
      });
    });
    categoryIndex += 1;
  });
  return bundles;
}

function placeBundles(bundles, parts, slots, { rest, stagger }) {
  const used = slots.map(() => ({ teams: new Set(), parts: new Set(), categories: new Set() }));
  const lastSlot = new Map();
  const seriesLast = new Map();
  const categoryLastGroup = new Map();
  const placed = [];
  const unplaced = [];

  bundles.forEach((bundle) => {
    const teamIds = bundle.matches.flatMap((match) => [match.homeId, match.awayId].filter(Boolean));
    let slotIndex = -1;
    for (let index = 0; index < slots.length; index += 1) {
      const slot = used[index];
      if (teamIds.some((id) => slot.teams.has(id))) continue;
      if (rest && teamIds.some((id) => lastSlot.has(id) && index < lastSlot.get(id) + 2)) continue;
      if (stagger && slot.categories.has(`${bundle.phase}:${bundle.category}`)) continue;
      const previous = seriesLast.get(bundle.seriesId);
      if (previous != null && index <= previous) continue;
      if (rest && previous != null && index < previous + 2) continue;
      if (bundle.phase === 'knockout') {
        const groupEnd = categoryLastGroup.get(bundle.category);
        if (groupEnd != null && index <= groupEnd) continue;
        if (rest && groupEnd != null && index < groupEnd + 2) continue;
      }
      const free = parts.filter((part) => part.size === bundle.size && !slot.parts.has(part.id));
      if (free.length < bundle.matches.length) continue;
      slotIndex = index;
      break;
    }
    if (slotIndex < 0) {
      unplaced.push(...bundle.matches);
      return;
    }
    const free = parts.filter((part) => part.size === bundle.size && !used[slotIndex].parts.has(part.id));
    bundle.matches.forEach((match, index) => {
      const part = free[index];
      used[slotIndex].parts.add(part.id);
      used[slotIndex].categories.add(`${bundle.phase}:${bundle.category}`);
      if (match.homeId) {
        used[slotIndex].teams.add(match.homeId);
        lastSlot.set(match.homeId, slotIndex);
      }
      if (match.awayId) {
        used[slotIndex].teams.add(match.awayId);
        lastSlot.set(match.awayId, slotIndex);
      }
      placed.push({ ...match, slotIndex, partId: part.id });
    });
    seriesLast.set(bundle.seriesId, slotIndex);
    if (bundle.phase === 'poule') categoryLastGroup.set(bundle.category, slotIndex);
  });

  return { placed, unplaced };
}

export function buildPlan(state, options = {}) {
  const poules = options.poules || resolvePoules(state);
  const parts = (options.parts || allParts(state.fields)).slice();
  const extra = options.extraParts || {};
  Object.entries(extra).forEach(([size, count]) => {
    for (let i = 0; i < count; i += 1) {
      parts.push({ id: `extra-${size}-${i}`, fieldId: 'extra', name: `Extra ${i + 1}`, size, key: 'extra' });
    }
  });
  const slots = options.slots || buildSlots(state);
  const bundles = [...groupBundles(poules), ...knockoutBundles(state, poules)].sort((a, b) => a.order - b.order);
  const attempts = [
    { rest: true, stagger: true },
    { rest: true, stagger: false },
    { rest: false, stagger: true },
    { rest: false, stagger: false },
  ];
  let best = null;
  let chosen = attempts[attempts.length - 1];
  for (const attempt of attempts) {
    const result = placeBundles(bundles, parts, slots, attempt);
    if (!best || result.unplaced.length < best.unplaced.length) {
      best = result;
      chosen = attempt;
    }
    if (result.unplaced.length === 0) {
      best = result;
      chosen = attempt;
      break;
    }
  }
  return {
    poules,
    parts: options.parts || allParts(state.fields),
    slots,
    placed: best.placed,
    unplaced: best.unplaced,
    rest: chosen.rest && best.unplaced.length === 0,
    stagger: chosen.stagger,
  };
}

function modeSize(matches) {
  const counts = new Map();
  matches.forEach((match) => counts.set(match.size, (counts.get(match.size) || 0) + 1));
  let best = 'half';
  let bestCount = -1;
  counts.forEach((count, size) => {
    if (count > bestCount) {
      best = size;
      bestCount = count;
    }
  });
  return best;
}

function planFits(state, options) {
  return buildPlan(state, options).unplaced.length === 0;
}

function partSuggestion(state) {
  const fields = state.fields || [];
  const splitLabel = { quarter: 'een veld in kwarten', half: 'een veld in helften' };
  for (let i = 0; i < fields.length; i += 1) {
    for (const target of ['quarter', 'half']) {
      if (fields[i].split === target) continue;
      const next = fields.map((field, index) => (index === i ? { ...field, split: target } : field));
      if (planFits({ ...state, fields: next })) return splitLabel[target];
    }
  }
  for (let i = 0; i < fields.length; i += 1) {
    for (let j = i + 1; j < fields.length; j += 1) {
      for (const pair of [['quarter', 'half'], ['quarter', 'quarter'], ['half', 'half']]) {
        const next = fields.map((field, index) => {
          if (index === i) return { ...field, split: pair[0] };
          if (index === j) return { ...field, split: pair[1] };
          return field;
        });
        if (planFits({ ...state, fields: next })) return 'velden in kwarten en helften';
      }
    }
  }
  const working = { quarter: 0, half: 0, full: 0 };
  for (let step = 0; step < 12; step += 1) {
    const trial = buildPlan(state, { extraParts: working });
    if (!trial.unplaced.length) {
      const bits = Object.entries(working)
        .filter(([, count]) => count > 0)
        .map(([size, count]) => {
          if (count === 1) return `1 extra ${SIZE_LABEL[size]}`;
          const noun = { quarter: 'kwartvelden', half: 'halve velden', full: 'hele velden' }[size];
          return `${count} extra ${noun}`;
        });
      return bits.join(' en ');
    }
    working[modeSize(trial.unplaced)] += 1;
  }
  return '';
}

export function assessFit(state) {
  const plan = buildPlan(state);
  const last = plan.placed.reduce((max, match) => Math.max(max, match.slotIndex), -1);
  const endLabel = last >= 0 ? formatTime(plan.slots[last].end) : '';
  if (!plan.unplaced.length) {
    return {
      ok: true,
      unplaced: 0,
      endLabel,
      text: endLabel ? `Past. Klaar om ${endLabel}.` : 'Past.',
      suggestions: [],
    };
  }

  const suggestions = [];
  const current = Math.max(1, Number(state.matchMinutes) || 1);
  for (let minutes = current - 1; minutes >= 5; minutes -= 1) {
    if (planFits({ ...state, matchMinutes: minutes })) {
      suggestions.push(`wedstrijden ${minutes} min`);
      break;
    }
  }

  const parts = partSuggestion(state);
  if (parts) suggestions.push(parts);

  const teams = state.teams || [];
  for (let drop = 1; drop <= Math.min(4, teams.length - 2); drop += 1) {
    if (planFits({ ...state, teams: teams.slice(0, -drop) })) {
      suggestions.push(drop === 1 ? '1 team minder' : `${drop} teams minder`);
      break;
    }
  }

  const suggestionText = suggestions.length ? ` Voorstel: ${suggestions.join(', of ')}.` : '';
  return {
    ok: false,
    unplaced: plan.unplaced.length,
    endLabel,
    text: `Past niet. ${plan.unplaced.length} ${plan.unplaced.length === 1 ? 'wedstrijd' : 'wedstrijden'} zonder veld.${suggestionText}`,
    suggestions,
  };
}

export function standingsFor(poule, matches, scores) {
  const rows = new Map(
    poule.teams.map((team) => [
      team.id,
      {
        teamId: team.id,
        name: team.name,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        gf: 0,
        ga: 0,
        gd: 0,
        points: 0,
      },
    ]),
  );
  matches
    .filter((match) => match.pouleId === poule.id && match.phase === 'poule')
    .forEach((match) => {
      const score = scores?.[match.id];
      if (!score?.played) return;
      const home = rows.get(match.homeId);
      const away = rows.get(match.awayId);
      if (!home || !away) return;
      const hg = Number(score.home) || 0;
      const ag = Number(score.away) || 0;
      home.played += 1;
      away.played += 1;
      home.gf += hg;
      home.ga += ag;
      away.gf += ag;
      away.ga += hg;
      if (hg > ag) {
        home.won += 1;
        home.points += 3;
        away.lost += 1;
      } else if (hg < ag) {
        away.won += 1;
        away.points += 3;
        home.lost += 1;
      } else {
        home.drawn += 1;
        away.drawn += 1;
        home.points += 1;
        away.points += 1;
      }
    });
  const table = [...rows.values()].map((row) => ({ ...row, gd: row.gf - row.ga }));

  const mutual = (aId, bId) => {
    let pointsA = 0;
    let pointsB = 0;
    let played = false;
    matches
      .filter((match) => match.pouleId === poule.id && match.phase === 'poule')
      .forEach((match) => {
        const score = scores?.[match.id];
        if (!score?.played) return;
        const ids = [match.homeId, match.awayId];
        if (!ids.includes(aId) || !ids.includes(bId)) return;
        played = true;
        const hg = Number(score.home) || 0;
        const ag = Number(score.away) || 0;
        const aGoals = match.homeId === aId ? hg : ag;
        const bGoals = match.homeId === bId ? hg : ag;
        if (aGoals > bGoals) pointsA += 3;
        else if (bGoals > aGoals) pointsB += 3;
        else {
          pointsA += 1;
          pointsB += 1;
        }
      });
    if (!played || pointsA === pointsB) return 0;
    return pointsB - pointsA;
  };

  return table.sort(
    (a, b) =>
      b.points - a.points ||
      mutual(a.teamId, b.teamId) ||
      b.gd - a.gd ||
      b.gf - a.gf ||
      a.name.localeCompare(b.name, 'nl'),
  );
}

/** Heel veld waar geen categorie op past: blijft leeg, met een hint om te delen. */
export function unusedFullFields(state, matches) {
  const used = new Set(
    (matches || []).filter((match) => match.slotIndex != null && match.part?.fieldId).map((match) => match.part.fieldId),
  );
  return (state?.fields || []).filter((field) => field.split === 'full' && !used.has(field.id));
}

function pouleComplete(poule, matches, scores) {
  const own = matches.filter((match) => match.pouleId === poule.id && match.phase === 'poule');
  return own.length > 0 && own.every((match) => scores?.[match.id]?.played);
}

export function autoReferees(matches, teams) {
  const known = matches.filter((match) => match.homeId && match.awayId && match.slotIndex != null);
  const bySlot = new Map();
  known.forEach((match) => {
    if (!bySlot.has(match.slotIndex)) bySlot.set(match.slotIndex, new Set());
    const set = bySlot.get(match.slotIndex);
    set.add(match.homeId);
    set.add(match.awayId);
  });
  const load = new Map(teams.map((team) => [team.id, 0]));
  const assigned = {};
  const reffing = new Map();
  known
    .slice()
    .sort((a, b) => a.slotIndex - b.slotIndex || String(a.id).localeCompare(String(b.id)))
    .forEach((match) => {
      const playing = bySlot.get(match.slotIndex) || new Set();
      const busy = reffing.get(match.slotIndex) || new Set();
      const free = teams.filter((team) => !playing.has(team.id) && !busy.has(team.id));
      const same = free.filter((team) => team.category === match.category);
      const pool = (same.length ? same : free).slice().sort((a, b) => {
        const diff = (load.get(a.id) || 0) - (load.get(b.id) || 0);
        return diff || a.name.localeCompare(b.name, 'nl');
      });
      if (!pool.length) return;
      assigned[match.id] = pool[0].id;
      load.set(pool[0].id, (load.get(pool[0].id) || 0) + 1);
      if (!reffing.has(match.slotIndex)) reffing.set(match.slotIndex, new Set());
      reffing.get(match.slotIndex).add(pool[0].id);
    });
  return assigned;
}

export function buildShifts(state) {
  const start = parseTime(state.startTime);
  const end = parseTime(state.endTime);
  if (start == null || end == null || end <= start) return [];
  const make = (count, kind) => {
    const total = Math.max(0, Number(count) || 0);
    if (!total) return [];
    const edges = [start];
    for (let i = 1; i < total; i += 1) {
      edges.push(Math.round((start + ((end - start) * i) / total) / 5) * 5);
    }
    edges.push(end);
    return edges.slice(0, -1).map((from, index) => ({
      id: `${kind}-${index + 1}`,
      kind,
      name: kind === 'bar' ? `Bar ${index + 1}` : `Keuken ${index + 1}`,
      start: formatTime(from),
      end: formatTime(edges[index + 1]),
    }));
  };
  return [...make(state.barShifts, 'bar'), ...make(state.kitchenShifts, 'keuken')];
}

function teamCategory(team, state) {
  if (state.categoryMode === 'poule') {
    const poule = (state.poules || []).find((item) => item.id === team.pouleId);
    if (poule?.category) return poule.category;
  }
  return team.category || 'JO11';
}

export function present(state) {
  const normalized = normalizeTournament(state);
  const parts = allParts(normalized.fields);
  const poules = resolvePoules(normalized);
  const slots = buildSlots(normalized);
  const plan = buildPlan(normalized, { poules, parts, slots });
  const scores = normalized.scores || {};
  const tables = new Map(poules.map((poule) => [poule.id, standingsFor(poule, plan.placed, scores)]));
  const complete = new Set(poules.filter((poule) => pouleComplete(poule, plan.placed, scores)).map((poule) => poule.id));
  const teamById = new Map(normalized.teams.map((team) => [team.id, { ...team, category: teamCategory(team, normalized) }]));
  const matchById = new Map();

  const resolveRef = (ref) => {
    if (!ref) return { teamId: null, label: '—' };
    if (ref.kind === 'team') {
      const team = teamById.get(ref.teamId);
      return { teamId: ref.teamId, label: team?.name || 'Team' };
    }
    if (ref.kind === 'place') {
      const poule = poules.find((item) => item.id === ref.pouleId);
      const fallback = ref.label || `${ref.rank}e ${poule?.name || ''}`.trim();
      if (!complete.has(ref.pouleId)) return { teamId: null, label: fallback };
      const row = tables.get(ref.pouleId)?.[ref.rank - 1];
      return row ? { teamId: row.teamId, label: row.name } : { teamId: null, label: fallback };
    }
    if (ref.kind === 'winner') {
      const source = matchById.get(ref.matchId);
      if (!source?.winnerId) {
        const label = source?.roundLabel ? `Winnaar ${source.roundLabel.toLowerCase()}` : 'Winnaar';
        return { teamId: null, label };
      }
      const team = teamById.get(source.winnerId);
      return { teamId: source.winnerId, label: team?.name || 'Winnaar' };
    }
    return { teamId: null, label: '—' };
  };

  const ordered = [...plan.placed, ...plan.unplaced].sort((a, b) => {
    const ar = a.phase === 'knockout' ? 1 : 0;
    const br = b.phase === 'knockout' ? 1 : 0;
    return ar - br || (a.round || 0) - (b.round || 0) || String(a.id).localeCompare(String(b.id));
  });

  const matches = ordered.map((match) => {
    const home = match.homeLabel && match.homeId ? { teamId: match.homeId, label: match.homeLabel } : resolveRef(match.homeRef);
    const away = match.awayLabel && match.awayId ? { teamId: match.awayId, label: match.awayLabel } : resolveRef(match.awayRef);
    if (!match.homeLabel) home.label = resolveRef(match.homeRef).label;
    if (!match.awayLabel) away.label = resolveRef(match.awayRef).label;
    const resolvedHome = resolveRef(match.homeRef);
    const resolvedAway = resolveRef(match.awayRef);
    const score = scores[match.id] || null;
    let winnerId = null;
    if (score?.played && resolvedHome.teamId && resolvedAway.teamId) {
      if (Number(score.home) > Number(score.away)) winnerId = resolvedHome.teamId;
      else if (Number(score.away) > Number(score.home)) winnerId = resolvedAway.teamId;
      else if (score.penalties === resolvedHome.teamId || score.penalties === resolvedAway.teamId) winnerId = score.penalties;
    }
    const row = {
      ...match,
      homeId: resolvedHome.teamId,
      awayId: resolvedAway.teamId,
      homeLabel: resolvedHome.label,
      awayLabel: resolvedAway.label,
      winnerId,
      score: score?.played ? score : null,
      part: parts.find((part) => part.id === match.partId) || null,
      slot: match.slotIndex == null ? null : slots[match.slotIndex] || null,
    };
    matchById.set(row.id, row);
    return row;
  });

  const refereePool = normalized.teams.map((team) => ({ ...team, category: teamCategory(team, normalized) }));
  const auto = normalized.refereeMode === 'manual' ? {} : autoReferees(matches, refereePool);
  const manual = normalized.manualReferees || {};
  const withRefs = matches.map((match) => {
    const refereeId = normalized.refereeMode === 'manual' ? manual[match.id] || '' : auto[match.id] || '';
    const referee = refereePool.find((team) => team.id === refereeId);
    return { ...match, refereeId: refereeId || '', refereeName: referee?.name || '' };
  });

  const fit = assessFit(normalized);
  return {
    state: normalized,
    parts,
    poules: poules.map((poule) => ({ ...poule, table: tables.get(poule.id) || [], complete: complete.has(poule.id) })),
    slots,
    matches: withRefs,
    unplaced: withRefs.filter((match) => match.slotIndex == null),
    fit,
    shifts: buildShifts(normalized),
    rest: plan.rest,
  };
}

export function todayIso() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/** Leeg toernooi: pauze uit, 12 minuten spelen, 3 minuten wissel. */
export function createEmpty() {
  return normalizeTournament({
    name: 'Nieuw toernooi',
    date: todayIso(),
    fields: [{ id: 'f1', name: 'Veld 1', split: 'quarter', partNames: {} }],
    teams: [1, 2, 3, 4].map((index) => ({
      id: `t${index}`,
      name: `Team ${index}`,
      category: 'JO9',
    })),
    format: 'poules',
    advance: 2,
    matchMinutes: 12,
    changeoverMinutes: 3,
    breakEnabled: false,
    barShifts: 0,
    kitchenShifts: 0,
    scores: {},
  });
}

export function createExample() {
  const jo9 = [
    'JO9-1 Lekkerkerk',
    'JO9-2 Lekkerkerk',
    'JO9-1 Krimpen',
    'JO9-1 Ouderkerk',
    'JO9-1 Bergambacht',
    'JO9-1 Schoonhoven',
    'JO9-1 Stolwijk',
    'JO9-1 Berkenwoude',
  ];
  const jo11 = [
    'JO11-1 Lekkerkerk',
    'JO11-2 Lekkerkerk',
    'JO11-1 Krimpen',
    'JO11-1 Ouderkerk',
    'JO11-1 Bergambacht',
    'JO11-1 Schoonhoven',
    'JO11-1 Stolwijk',
    'JO11-1 Haastrecht',
  ];
  return normalizeTournament({
    name: 'Lekkerkerker Jeugdtoernooi',
    date: '2026-10-10',
    fields: [
      { id: 'f1', name: 'Veld 1', split: 'quarter' },
      { id: 'f2', name: 'Veld 2', split: 'half' },
      { id: 'f3', name: 'Veld 3', split: 'half' },
      { id: 'f4', name: 'Veld 4', split: 'full' },
    ],
    categoryMode: 'team',
    teams: [
      ...jo9.map((name, index) => ({ id: `t9-${index + 1}`, name, category: 'JO9' })),
      ...jo11.map((name, index) => ({ id: `t11-${index + 1}`, name, category: 'JO11' })),
    ],
    poules: [],
    format: 'poules-knockout',
    advance: 2,
    startTime: '09:00',
    endTime: '16:00',
    matchMinutes: 12,
    changeoverMinutes: 3,
    breakEnabled: true,
    breakStart: '12:00',
    breakMinutes: 30,
    barShifts: 3,
    kitchenShifts: 2,
    refereeMode: 'auto',
    manualReferees: {},
    scores: {},
  });
}

export function normalizeTournament(input) {
  const base = input || {};
  const fields = Array.isArray(base.fields) && base.fields.length
    ? base.fields.map((field, index) => ({
        id: field.id || `f${index + 1}`,
        name: field.name || `Veld ${index + 1}`,
        split: SPLITS[field.split] ? field.split : 'full',
        partNames: field.partNames || {},
      }))
    : [{ id: 'f1', name: 'Veld 1', split: 'full', partNames: {} }];
  const teams = Array.isArray(base.teams)
    ? base.teams.map((team, index) => ({
        id: team.id || `t${index + 1}`,
        name: team.name || `Team ${index + 1}`,
        category: CATEGORIES.some((item) => item.id === team.category) ? team.category : 'JO11',
        pouleId: team.pouleId || '',
      }))
    : [];
  return {
    name: base.name || 'Toernooi',
    date: base.date || '2026-10-10',
    fields,
    categoryMode: base.categoryMode === 'poule' ? 'poule' : 'team',
    teams,
    poules: Array.isArray(base.poules)
      ? base.poules.map((poule, index) => ({
          id: poule.id || `p${index + 1}`,
          name: poule.name || `Poule ${letter(index)}`,
          category: CATEGORIES.some((item) => item.id === poule.category) ? poule.category : 'JO11',
        }))
      : [],
    format: ['poules', 'knockout', 'poules-knockout'].includes(base.format) ? base.format : 'poules',
    advance: Math.max(1, Number(base.advance) || 2),
    startTime: parseTime(base.startTime) != null ? base.startTime : '09:00',
    endTime: parseTime(base.endTime) != null ? base.endTime : '16:00',
    matchMinutes: Math.max(1, Number(base.matchMinutes) || 12),
    changeoverMinutes:
      base.changeoverMinutes == null ? 3 : Math.max(0, Number(base.changeoverMinutes) || 0),
    breakEnabled: Boolean(base.breakEnabled),
    breakStart: parseTime(base.breakStart) != null ? base.breakStart : '12:00',
    breakMinutes: Math.max(0, Number(base.breakMinutes) || 0),
    barShifts: Math.max(0, Number(base.barShifts) || 0),
    kitchenShifts: Math.max(0, Number(base.kitchenShifts) || 0),
    refereeMode: base.refereeMode === 'manual' ? 'manual' : 'auto',
    manualReferees: base.manualReferees || {},
    scores: base.scores || {},
  };
}

export function resizeTeams(teams, count, make) {
  const total = Math.max(0, Math.min(32, count));
  if (total < teams.length) return teams.slice(0, total);
  const next = teams.slice();
  while (next.length < total) next.push(make(next.length));
  return next;
}

export function resizeFields(fields, count) {
  const total = Math.max(1, Math.min(8, count));
  if (total < fields.length) return fields.slice(0, total);
  const next = fields.slice();
  while (next.length < total) {
    const n = next.length + 1;
    next.push({ id: `f${n}-${Date.now().toString(36)}`, name: `Veld ${n}`, split: 'full', partNames: {} });
  }
  return next;
}

export function implicitPoulesFromTeams(state) {
  return resolvePoules({ ...state, categoryMode: 'team' }).map((poule) => ({
    id: poule.id,
    name: poule.name,
    category: poule.category,
    teamIds: poule.teams.map((team) => team.id),
  }));
}

export function withPouleMode(state) {
  const derived = implicitPoulesFromTeams(state);
  return {
    ...state,
    categoryMode: 'poule',
    poules: derived.map(({ id, name, category }) => ({ id, name, category })),
    teams: (state.teams || []).map((team) => ({
      ...team,
      pouleId: derived.find((poule) => poule.teamIds.includes(team.id))?.id || derived[0]?.id || '',
    })),
  };
}

export function cycleSplit(split) {
  if (split === 'full') return 'half';
  if (split === 'half') return 'quarter';
  return 'full';
}

export { SIZE_RANK };
