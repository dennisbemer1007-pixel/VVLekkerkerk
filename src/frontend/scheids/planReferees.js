import {
  ADJACENT_MAX_GAP,
  FAIRNESS_WINDOW_DAYS,
  categoryNeeded,
  categoryOfTeam,
  durationForLevel,
  levelLabel,
} from './categories.js';

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
    ...category,
    start,
    end: start + durationForLevel(category.level),
  };
}

function overlaps(a, b) {
  return a.date === b.date && a.start < b.end && b.start < a.end;
}

function ownBlocks(person, blocks) {
  const teams = new Set(person.teams || []);
  return blocks.filter((block) => teams.has(block.team));
}

function overlapsOwn(person, slot, blocks) {
  return ownBlocks(person, blocks).some((block) => overlaps(block, slot));
}

/** 0 = vlak voor of na de eigen wedstrijd, 1 = geen voorkeur. Lager gat wint. */
export function adjacentScore(person, slot, blocks) {
  let best = null;
  for (const block of ownBlocks(person, blocks)) {
    if (block.date !== slot.date || overlaps(block, slot)) continue;
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

export function explainOpenSlot({ slot, people, blocks, assignments, windowDays = FAIRNESS_WINDOW_DAYS }) {
  const takenDays = new Set();
  const history = [];
  for (const row of assignments || []) {
    if (!row.personEmail || row.slotId === slot.id) continue;
    const other = blocks.find((block) => block.id === row.slotId);
    if (!other) continue;
    takenDays.add(`${row.personEmail}|${other.date}`);
    history.push({ email: row.personEmail, date: other.date });
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
    if (takenDays.has(`${person.email}|${slot.date}`)) {
      stats.already += 1;
      continue;
    }
    const prior = history.filter(
      (row) => row.email === person.email && row.date >= windowStart && row.date < slot.date,
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

/**
 * Auto-planner voor scheidsrechters, zelfde volgorde als diensten:
 * chronologisch vullen, harde blokkades eerst, daarna eerlijke spreiding.
 * locked: al gekozen plekken die blijven staan als de persoon nog mag.
 */
export function planReferees({
  people = [],
  matches = [],
  isNeeded = (key) => categoryNeeded(key),
  locked = [],
  windowDays = FAIRNESS_WINDOW_DAYS,
} = {}) {
  const blocks = matches.map(decorateMatch).filter(Boolean);
  const slots = blocks
    .filter((match) => match.home && isNeeded(match.key))
    .sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start || a.team.localeCompare(b.team, 'nl'));
  const byId = new Map(slots.map((slot) => [slot.id, slot]));
  const takenDays = new Set();
  const history = [];
  const assignments = [];
  const lockedIds = new Set();

  for (const row of locked) {
    const slot = byId.get(row.slotId);
    const person = people.find((item) => item.email === row.personEmail);
    if (!slot || !person) continue;
    if (!(person.levels || []).includes(slot.level)) continue;
    if ((person.teams || []).includes(slot.team) || overlapsOwn(person, slot, blocks)) continue;
    if (takenDays.has(`${person.email}|${slot.date}`)) continue;
    takenDays.add(`${person.email}|${slot.date}`);
    history.push({ email: person.email, date: slot.date });
    lockedIds.add(slot.id);
    assignments.push({
      slotId: slot.id,
      personEmail: person.email,
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
      open.push({ slotId: slot.id, reason: unfilledReason(slot.level, stats) });
      continue;
    }
    takenDays.add(`${pick.person.email}|${slot.date}`);
    history.push({ email: pick.person.email, date: slot.date });
    assignments.push({
      slotId: slot.id,
      personEmail: pick.person.email,
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
} = {}) {
  const blocks = matches.map(decorateMatch).filter(Boolean);
  const slots = blocks
    .filter((match) => match.home && isNeeded(match.key))
    .sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start || a.team.localeCompare(b.team, 'nl'));
  const slotById = new Map(slots.map((slot) => [slot.id, slot]));
  const rows = (assignments || []).filter((row) => slotById.has(row.slotId));
  const assignmentBySlot = new Map(rows.map((row) => [row.slotId, row]));
  const view = slots.map((slot) => {
    const assignment = assignmentBySlot.get(slot.id) || null;
    const person = assignment ? people.find((item) => item.email === assignment.personEmail) || null : null;
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
