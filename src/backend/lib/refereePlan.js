/**
 * Scheidsrechterplanner. Zelfde regels als het goedgekeurde voorbeeld:
 * passend niveau, niet het eigen team, niet tijdens de eigen wedstrijd,
 * hooguit één automatische plek per persoon per dag, spreiding over 6 weken,
 * voorkeur voor een plek vlak voor of na de eigen wedstrijd.
 */

export const REFEREE_LEVELS = [
  { id: 'pupillen', label: 'Pupillen' },
  { id: 'junioren', label: 'Junioren' },
  { id: 'senioren', label: 'Senioren' },
];

export const ALL_LEVEL_IDS = REFEREE_LEVELS.map((level) => level.id);
export const FAIRNESS_WINDOW_DAYS = 42;
export const ADJACENT_MAX_GAP = 45;

const YOUTH_RE = /(?:^|[^A-Za-z0-9])(JO|MO|O)\s*(\d{1,2})(?!\d)/i;

export function levelLabel(id) {
  return REFEREE_LEVELS.find((level) => level.id === id)?.label || '';
}

export function parseRefereeLevels(raw) {
  let list = raw;
  if (typeof raw === 'string') {
    try {
      list = JSON.parse(raw || '[]');
    } catch {
      list = [];
    }
  }
  if (!Array.isArray(list)) return [];
  return ALL_LEVEL_IDS.filter((id) => list.includes(id));
}

export function durationForLevel(level) {
  if (level === 'senioren') return 90;
  if (level === 'junioren') return 70;
  return 60;
}

export function categoryOfTeam(teamName) {
  const name = String(teamName || '').trim();
  if (!name) return null;
  if (/(?:^|[^A-Za-z0-9])VR(?:\s*\d+)?(?![A-Za-z])/i.test(name)) {
    return { key: 'VR', level: 'senioren', age: null, prefix: 'VR' };
  }
  if (/senior/i.test(name)) return { key: 'Senioren', level: 'senioren', age: null, prefix: 'Senioren' };
  const match = name.match(YOUTH_RE);
  if (!match) return null;
  const prefix = match[1].toUpperCase();
  const age = Number(match[2]);
  if (!Number.isFinite(age) || age < 7 || age > 19) return null;
  return {
    key: `${prefix}${age}`,
    level: age <= 12 ? 'pupillen' : 'junioren',
    age,
    prefix,
  };
}

export function defaultCategoryNeeded(key) {
  const youth = /^(JO|MO|O)(\d+)$/.exec(String(key || ''));
  if (youth) {
    const age = Number(youth[2]);
    if (age >= 8 && age <= 10) return false;
    return age >= 7 && age <= 19;
  }
  return key === 'Senioren' || key === 'VR';
}

export function categoryNeeded(key, overrides = {}) {
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, key)) return Boolean(overrides[key]);
  return defaultCategoryNeeded(key);
}

export function categorySort(a, b) {
  const rank = (cat) => {
    if (cat.prefix === 'JO') return 0;
    if (cat.prefix === 'MO') return 1;
    if (cat.prefix === 'O') return 2;
    if (cat.key === 'Senioren') return 3;
    return 4;
  };
  const byPrefix = rank(a) - rank(b);
  if (byPrefix) return byPrefix;
  return (a.age || 0) - (b.age || 0);
}

function parseMinutes(time) {
  const [hours, minutes] = String(time || '00:00').split(':').map((part) => Number(part));
  return (hours || 0) * 60 + (minutes || 0);
}

function addDays(dateStr, days) {
  const [year, month, day] = String(dateStr).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function decorateMatch(match) {
  const category = categoryOfTeam(match?.team);
  if (!category || !match?.date || !match?.time) return null;
  const start = parseMinutes(match.time);
  return {
    ...match,
    id: match.id,
    ...category,
    start,
    end: start + durationForLevel(category.level),
  };
}

export function slotsOverlap(a, b) {
  return a.date === b.date && a.start < b.end && b.start < a.end;
}

function ownBlocks(person, blocks) {
  const teams = new Set(person.teams || []);
  return blocks.filter((block) => teams.has(block.team));
}

function overlapsOwn(person, slot, blocks) {
  return ownBlocks(person, blocks).some((block) => slotsOverlap(block, slot));
}

export function adjacentScore(person, slot, blocks) {
  let best = null;
  for (const block of ownBlocks(person, blocks)) {
    if (block.date !== slot.date || slotsOverlap(block, slot)) continue;
    let gap = null;
    if (block.end <= slot.start) gap = slot.start - block.end;
    else if (slot.end <= block.start) gap = block.start - slot.end;
    if (gap == null || gap > ADJACENT_MAX_GAP) continue;
    if (!best || gap < best) best = gap;
  }
  if (best == null) return { rank: 1, gap: Number.POSITIVE_INFINITY };
  return { rank: 0, gap: best };
}

export function unfilledReason(level, stats) {
  const name = levelLabel(level);
  if (!stats.withLevel) return `Niemand met niveau ${name}.`;
  if (stats.blockedOwn === stats.withLevel) {
    return `Iedereen met niveau ${name} speelt zelf of hoort bij dit team.`;
  }
  if (stats.already === stats.withLevel) {
    return `Iedereen met niveau ${name} fluit die dag al.`;
  }
  return `Geen vrij iemand met niveau ${name}.`;
}

function personKey(id) {
  return String(id);
}

export function explainOpenSlot({ slot, people, blocks, assignments, windowDays = FAIRNESS_WINDOW_DAYS }) {
  const takenDays = new Set();
  const history = [];
  for (const row of assignments || []) {
    if (row.personId == null || row.matchId === slot.id) continue;
    const other = blocks.find((block) => block.id === row.matchId);
    if (!other) continue;
    takenDays.add(`${personKey(row.personId)}|${other.date}`);
    history.push({ id: row.personId, date: other.date });
  }
  const { eligible, stats } = assessSlot({ slot, people, blocks, takenDays, history, windowDays });
  if (eligible.length) return 'Nog niet ingepland.';
  return unfilledReason(slot.level, stats);
}

function assessSlot({ slot, people, blocks, takenDays, history, windowDays }) {
  const stats = { withLevel: 0, blockedOwn: 0, already: 0 };
  const eligible = [];
  const windowStart = addDays(slot.date, -windowDays);
  for (const person of people) {
    if (!(person.levels || []).includes(slot.level)) continue;
    stats.withLevel += 1;
    if ((person.teams || []).includes(slot.team) || overlapsOwn(person, slot, blocks)) {
      stats.blockedOwn += 1;
      continue;
    }
    if (takenDays.has(`${personKey(person.id)}|${slot.date}`)) {
      stats.already += 1;
      continue;
    }
    const prior = history.filter(
      (row) => personKey(row.id) === personKey(person.id) && row.date >= windowStart && row.date < slot.date,
    );
    const last = prior.reduce((max, row) => (row.date > max ? row.date : max), '');
    eligible.push({
      person,
      count: prior.length,
      last,
      adjacent: adjacentScore(person, slot, blocks),
    });
  }
  eligible.sort((a, b) => {
    if (a.count !== b.count) return a.count - b.count;
    if (a.last !== b.last) return a.last < b.last ? -1 : 1;
    if (a.adjacent.rank !== b.adjacent.rank) return a.adjacent.rank - b.adjacent.rank;
    if (a.adjacent.gap !== b.adjacent.gap) return a.adjacent.gap - b.adjacent.gap;
    return a.person.name.localeCompare(b.person.name, 'nl');
  });
  return { eligible, stats };
}

export function planReferees({
  people = [],
  matches = [],
  isNeeded = (key) => categoryNeeded(key),
  locked = [],
  occupied = [],
  fromDate = '',
  windowDays = FAIRNESS_WINDOW_DAYS,
} = {}) {
  const blocks = matches.map(decorateMatch).filter(Boolean);
  const slots = blocks
    .filter((match) => match.home && isNeeded(match.key) && (!fromDate || match.date >= fromDate))
    .sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start || String(a.team).localeCompare(b.team, 'nl'));
  const byId = new Map(slots.map((slot) => [slot.id, slot]));
  const takenDays = new Set();
  const history = [];
  const assignments = [];
  const lockedIds = new Set();

  for (const row of occupied) {
    if (row.personId == null || !row.date) continue;
    takenDays.add(`${personKey(row.personId)}|${row.date}`);
    history.push({ id: row.personId, date: row.date });
  }

  for (const row of locked) {
    const slot = byId.get(row.matchId);
    const person = people.find((item) => personKey(item.id) === personKey(row.personId));
    if (!slot || !person) continue;
    if (!(person.levels || []).includes(slot.level)) continue;
    if ((person.teams || []).includes(slot.team) || overlapsOwn(person, slot, blocks)) continue;
    takenDays.add(`${personKey(person.id)}|${slot.date}`);
    history.push({ id: person.id, date: slot.date });
    lockedIds.add(slot.id);
    assignments.push({
      matchId: slot.id,
      personId: person.id,
      status: row.status || 'voorgesteld',
      source: row.source || 'hand',
      besideOwn: adjacentScore(person, slot, blocks).rank === 0,
    });
  }

  const open = [];
  for (const slot of slots) {
    if (lockedIds.has(slot.id)) continue;
    const { eligible, stats } = assessSlot({ slot, people, blocks, takenDays, history, windowDays });
    const pick = eligible[0];
    if (!pick) {
      open.push({ matchId: slot.id, reason: unfilledReason(slot.level, stats) });
      continue;
    }
    takenDays.add(`${personKey(pick.person.id)}|${slot.date}`);
    history.push({ id: pick.person.id, date: slot.date });
    assignments.push({
      matchId: slot.id,
      personId: pick.person.id,
      status: 'voorgesteld',
      source: 'auto',
      besideOwn: pick.adjacent.rank === 0,
    });
  }

  return { assignments, open, slots };
}

export function claimConflict(person, slot, blocks) {
  if (!person || !slot) return 'Geen plek.';
  if (!(person.levels || []).includes(slot.level)) return 'Niveau past niet.';
  if ((person.teams || []).includes(slot.team)) return 'Niet bij je eigen team.';
  if (overlapsOwn(person, slot, blocks)) return 'Je speelt zelf op dat tijdstip.';
  return '';
}

export function projectBoard({
  people = [],
  matches = [],
  isNeeded = (key) => categoryNeeded(key),
  assignments = [],
  fromDate = '',
} = {}) {
  const blocks = matches.map(decorateMatch).filter(Boolean);
  const slots = blocks
    .filter((match) => match.home && isNeeded(match.key) && (!fromDate || match.date >= fromDate))
    .sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start || String(a.team).localeCompare(b.team, 'nl'));
  const slotById = new Map(slots.map((slot) => [slot.id, slot]));
  const rows = (assignments || []).filter((row) => slotById.has(row.matchId) && row.personId != null);
  const assignmentBySlot = new Map(rows.map((row) => [row.matchId, row]));
  const view = slots.map((slot) => {
    const assignment = assignmentBySlot.get(slot.id) || null;
    const person = assignment ? people.find((item) => personKey(item.id) === personKey(assignment.personId)) || null : null;
    const visible = assignment && person ? assignment : null;
    return {
      ...slot,
      assignment: visible,
      person: visible ? person : null,
      open: !visible,
      reason: visible ? '' : explainOpenSlot({ slot, people, blocks, assignments: rows }),
    };
  });
  return { slots: view, blocks, slotById, people };
}

export function swapOptionsFor(personId, slots, blocks) {
  const mine = slots.filter((slot) => personKey(slot.person?.id) === personKey(personId));
  const options = [];
  for (const mineSlot of mine) {
    for (const other of slots) {
      if (!other.person || personKey(other.person.id) === personKey(personId)) continue;
      if (claimConflict(mineSlot.person, other, blocks) || claimConflict(other.person, mineSlot, blocks)) continue;
      options.push({
        fromMatchId: mineSlot.id,
        toMatchId: other.id,
        toPersonId: other.person.id,
        toName: other.person.name,
        toLabel: `${other.team} · ${other.time}`,
      });
    }
  }
  return options;
}
