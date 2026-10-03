import prisma from './prisma.js';
import { toIsoDate } from './dates.js';
import { getClubSettings } from './season.js';
import {
  categoryNeeded,
  categoryOfTeam,
  categorySort,
  claimConflict,
  levelLabel,
  parseRefereeLevels,
  planReferees,
  projectBoard,
  slotsOverlap,
  swapOptionsFor,
} from './refereePlan.js';

const CATEGORY_KEY = /^(?:(?:JO|MO|O)(?:[7-9]|1[0-9])|Senioren|VR)$/;

function httpError(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

export async function refereesEnabled() {
  const settings = await getClubSettings();
  return Boolean(settings.refereesEnabled);
}

export async function assertRefereesEnabled() {
  if (!(await refereesEnabled())) throw httpError('Niet gevonden', 404);
}

function todayKey() {
  return toIsoDate(new Date());
}

function matchDate(value) {
  return toIsoDate(value instanceof Date ? value : new Date(value));
}

function collectTeamNames(person) {
  const names = [];
  if (person?.team?.name) names.push(person.team.name);
  for (const membership of person?.teamMemberships || []) {
    if (membership.active === false) continue;
    if (membership.team?.name) names.push(membership.team.name);
  }
  return names;
}

function teamsForPerson(person, coachTeams) {
  const names = new Set(collectTeamNames(person));
  for (const name of coachTeams.get(person.id) || []) names.add(name);
  for (const child of person.children || []) {
    for (const name of collectTeamNames(child)) names.add(name);
  }
  return [...names];
}

async function loadRaw() {
  const [matches, people, categories, assignments, coaches] = await Promise.all([
    prisma.match.findMany({ include: { team: true } }),
    prisma.person.findMany({
      where: { active: true },
      include: {
        team: true,
        teamMemberships: { where: { active: true }, include: { team: true } },
        children: {
          where: { active: true },
          include: {
            team: true,
            teamMemberships: { where: { active: true }, include: { team: true } },
          },
        },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.refereeCategory.findMany(),
    prisma.refereeAssignment.findMany({ include: { match: true } }),
    prisma.team.findMany({
      where: { coordinatorId: { not: null } },
      select: { name: true, coordinatorId: true },
    }),
  ]);
  const coachTeams = new Map();
  for (const team of coaches) {
    const list = coachTeams.get(team.coordinatorId) || [];
    list.push(team.name);
    coachTeams.set(team.coordinatorId, list);
  }
  const overrides = {};
  for (const row of categories) overrides[row.key] = row.needed;
  const plannerPeople = people.map((person) => ({
    id: person.id,
    name: person.name,
    levels: parseRefereeLevels(person.refereeLevels),
    teams: teamsForPerson(person, coachTeams),
  }));
  const plannerMatches = matches
    .map((match) => ({
      id: match.id,
      date: matchDate(match.date),
      time: String(match.time || '').trim(),
      home: match.home !== false,
      team: match.team?.name || '',
      opponent: match.opponent || '',
    }))
    .filter((match) => match.date && match.time && match.team);
  const plannerAssignments = assignments
    .filter((row) => row.personId)
    .map((row) => ({
      matchId: row.matchId,
      personId: row.personId,
      status: row.status,
      source: row.source,
      date: row.match ? matchDate(row.match.date) : '',
    }));
  return { matches, plannerPeople, plannerMatches, overrides, categories, assignments, plannerAssignments };
}

function isNeededFor(overrides) {
  return (key) => categoryNeeded(key, overrides);
}

function keptLocked(row) {
  return row.status === 'bevestigd' || row.source === 'self' || row.source === 'hand';
}

export async function syncRefereeSlots() {
  if (!(await refereesEnabled())) return { created: 0 };
  const raw = await loadRaw();
  const needed = isNeededFor(raw.overrides);
  let created = 0;
  const existing = new Map(raw.assignments.map((row) => [row.matchId, row]));
  for (const match of raw.plannerMatches) {
    if (!match.home) continue;
    const category = categoryOfTeam(match.team);
    if (!category || !needed(category.key)) continue;
    const current = existing.get(match.id);
    if (!current) {
      await prisma.refereeAssignment.create({
        data: {
          matchId: match.id,
          level: category.level,
          categoryKey: category.key,
          status: 'voorgesteld',
          source: 'auto',
          openReason: '',
        },
      });
      created += 1;
      continue;
    }
    if (current.level !== category.level || current.categoryKey !== category.key) {
      await prisma.refereeAssignment.update({
        where: { id: current.id },
        data: { level: category.level, categoryKey: category.key },
      });
    }
  }
  return { created };
}

function categoryChips(plannerMatches, categories) {
  const byKey = new Map();
  for (const match of plannerMatches) {
    if (!match.home) continue;
    const category = categoryOfTeam(match.team);
    if (category) byKey.set(category.key, category);
  }
  for (const row of categories) {
    if (byKey.has(row.key)) continue;
    const category = categoryOfTeam(row.key);
    if (category) byKey.set(category.key, category);
  }
  return [...byKey.values()]
    .sort(categorySort)
    .map((category) => ({
      key: category.key,
      level: category.level,
      needed: categoryNeeded(category.key, Object.fromEntries(categories.map((row) => [row.key, row.needed]))),
    }));
}

function publicSlot(slot, options = null) {
  return {
    matchId: slot.id,
    date: slot.date,
    time: slot.time,
    team: slot.team,
    opponent: slot.opponent || '',
    field: '',
    level: slot.level,
    levelLabel: levelLabel(slot.level),
    categoryKey: slot.key,
    open: slot.open,
    reason: slot.reason || '',
    status: slot.assignment?.status || '',
    source: slot.assignment?.source || '',
    person: slot.person ? { id: slot.person.id, name: slot.person.name } : null,
    ...(options ? { options } : {}),
  };
}

function sameDayTaken(slot, slots, personId) {
  return slots.some(
    (other) =>
      other.id !== slot.id &&
      other.date === slot.date &&
      other.person &&
      String(other.person.id) === String(personId),
  );
}

function slotOptions(slot, board) {
  return board.people
    .filter((person) => {
      if (slot.person && String(slot.person.id) === String(person.id)) return true;
      if (claimConflict(person, slot, board.blocks)) return false;
      if (sameDayTaken(slot, board.slots, person.id)) return false;
      return true;
    })
    .map((person) => ({ id: person.id, name: person.name }));
}

async function viewBoard({ fromDate = todayKey() } = {}) {
  await syncRefereeSlots();
  const raw = await loadRaw();
  const board = projectBoard({
    people: raw.plannerPeople,
    matches: raw.plannerMatches,
    isNeeded: isNeededFor(raw.overrides),
    assignments: raw.plannerAssignments,
    fromDate,
  });
  return { raw, board };
}

export async function overview() {
  const { raw, board } = await viewBoard();
  return {
    slots: board.slots.map((slot) => publicSlot(slot, slotOptions(slot, board))),
    categories: categoryChips(raw.plannerMatches, raw.categories),
    people: raw.plannerPeople
      .filter((person) => person.levels.length)
      .map((person) => ({ id: person.id, name: person.name, levels: person.levels })),
  };
}

export async function attention() {
  const { board } = await viewBoard();
  return board.slots
    .filter((slot) => slot.open && slot.reason && slot.reason !== 'Nog niet ingepland.')
    .map((slot) => publicSlot(slot));
}

export async function listPeople() {
  const people = await prisma.person.findMany({
    where: { active: true },
    select: { id: true, name: true, refereeLevels: true },
    orderBy: { name: 'asc' },
  });
  return people.map((person) => ({
    id: person.id,
    name: person.name,
    levels: parseRefereeLevels(person.refereeLevels),
  }));
}

export async function mineFor(personId) {
  const { board } = await viewBoard();
  const me = board.people.find((person) => person.id === personId) || null;
  const mine = board.slots.filter((slot) => slot.person && slot.person.id === personId).map((slot) => publicSlot(slot));
  const open = me
    ? board.slots
        .filter((slot) => slot.open && (me.levels || []).includes(slot.level))
        .map((slot) => ({
          ...publicSlot(slot),
          conflict: claimConflict(me, slot, board.blocks),
        }))
    : [];
  const swaps = await prisma.refereeSwap.findMany({
    where: { counterpartyId: personId, status: 'PENDING' },
    include: {
      requester: { select: { id: true, name: true } },
      fromAssignment: { include: { match: { include: { team: true } } } },
    },
    orderBy: { createdAt: 'asc' },
  });
  const incoming = swaps.map((swap) => ({
    id: swap.id,
    fromName: swap.requester?.name || '',
    team: swap.fromAssignment?.match?.team?.name || '',
    time: swap.fromAssignment?.match?.time || '',
    date: swap.fromAssignment?.match ? matchDate(swap.fromAssignment.match.date) : '',
  }));
  const swapOptions = me ? swapOptionsFor(personId, board.slots, board.blocks) : [];
  return {
    levels: me?.levels || [],
    mine,
    open,
    incoming,
    swapOptions: swapOptions.map((option) => ({
      fromMatchId: option.fromMatchId,
      toMatchId: option.toMatchId,
      toName: option.toName,
      toLabel: option.toLabel,
    })),
  };
}

export async function setLevels(personId, levels) {
  const person = await prisma.person.findUnique({ where: { id: Number(personId) } });
  if (!person) throw httpError('Persoon niet gevonden', 404);
  const clean = parseRefereeLevels(levels);
  await prisma.person.update({
    where: { id: person.id },
    data: { refereeLevels: JSON.stringify(clean) },
  });
  return { id: person.id, levels: clean };
}

export async function setCategoryNeeded(key, needed) {
  const clean = String(key || '');
  if (!CATEGORY_KEY.test(clean)) throw httpError('Onbekende categorie', 400);
  await prisma.refereeCategory.upsert({
    where: { key: clean },
    create: { key: clean, needed: Boolean(needed) },
    update: { needed: Boolean(needed) },
  });
  await syncRefereeSlots();
  return overview();
}

export async function replanReferees() {
  await syncRefereeSlots();
  const raw = await loadRaw();
  const fromDate = todayKey();
  const planned = planReferees({
    people: raw.plannerPeople,
    matches: raw.plannerMatches,
    isNeeded: isNeededFor(raw.overrides),
    fromDate,
    locked: raw.plannerAssignments.filter((row) => keptLocked(row)),
    occupied: raw.plannerAssignments
      .filter((row) => row.date && row.date < fromDate)
      .map((row) => ({ personId: row.personId, date: row.date })),
  });
  const byMatch = new Map(raw.assignments.map((row) => [row.matchId, row]));
  for (const slot of planned.slots) {
    const row = byMatch.get(slot.id);
    if (!row) continue;
    const assignment = planned.assignments.find((item) => item.matchId === slot.id);
    const open = planned.open.find((item) => item.matchId === slot.id);
    await prisma.refereeAssignment.update({
      where: { id: row.id },
      data: assignment
        ? {
            personId: assignment.personId,
            status: assignment.status,
            source: assignment.source,
            openReason: '',
            level: slot.level,
            categoryKey: slot.key,
          }
        : {
            personId: null,
            status: 'voorgesteld',
            source: 'auto',
            openReason: open?.reason || '',
            level: slot.level,
            categoryKey: slot.key,
          },
    });
  }
  const result = await overview();
  return {
    filled: planned.assignments.length,
    open: planned.open.length,
    ...result,
  };
}

function decoratedSlot(board, matchId) {
  return board.slots.find((slot) => slot.id === Number(matchId)) || board.slotById.get(Number(matchId)) || null;
}

export async function assignSlot(matchId, personId) {
  const { board } = await viewBoard();
  const slot = decoratedSlot(board, matchId);
  if (!slot) throw httpError('Geen scheidsrechterplek voor deze wedstrijd', 404);
  const row = await prisma.refereeAssignment.findUnique({ where: { matchId: Number(matchId) } });
  if (!row) throw httpError('Geen scheidsrechterplek voor deze wedstrijd', 404);
  if (personId == null || personId === '') {
    await prisma.refereeAssignment.update({
      where: { id: row.id },
      data: { personId: null, status: 'voorgesteld', source: 'hand', openReason: '' },
    });
    return overview();
  }
  const person = board.people.find((item) => item.id === Number(personId));
  if (!person) throw httpError('Persoon niet gevonden', 404);
  const conflict = claimConflict(person, slot, board.blocks);
  if (conflict) throw httpError(conflict, 400);
  if (sameDayTaken(slot, board.slots, person.id)) {
    throw httpError('Deze persoon fluit die dag al.', 400);
  }
  await prisma.refereeAssignment.update({
    where: { id: row.id },
    data: { personId: person.id, status: 'voorgesteld', source: 'hand', openReason: '' },
  });
  return overview();
}

export async function confirmSlot(matchId, personId) {
  const updated = await prisma.refereeAssignment.updateMany({
    where: { matchId: Number(matchId), personId: Number(personId) },
    data: { status: 'bevestigd' },
  });
  if (!updated.count) throw httpError('Deze plek is niet van jou', 404);
  return mineFor(personId);
}

export async function claimSlot(matchId, personId) {
  const { board } = await viewBoard();
  const slot = decoratedSlot(board, matchId);
  if (!slot || !slot.open) throw httpError('Plek is bezet.', 400);
  const person = board.people.find((item) => item.id === Number(personId));
  const conflict = claimConflict(person, slot, board.blocks);
  if (conflict) throw httpError(conflict, 400);
  const overlap = board.slots.some(
    (other) => other.person && other.person.id === person.id && slotsOverlap(other, slot),
  );
  if (overlap) throw httpError('Je fluit dan al een andere wedstrijd.', 400);
  const updated = await prisma.refereeAssignment.updateMany({
    where: { matchId: Number(matchId), personId: null },
    data: { personId: person.id, status: 'bevestigd', source: 'self', openReason: '' },
  });
  if (!updated.count) throw httpError('Plek is bezet.', 400);
  return mineFor(personId);
}

export async function proposeSwap({ requesterId, fromMatchId, toMatchId }) {
  const { board } = await viewBoard();
  const fromSlot = decoratedSlot(board, fromMatchId);
  const toSlot = decoratedSlot(board, toMatchId);
  if (!fromSlot?.person || fromSlot.person.id !== Number(requesterId)) {
    throw httpError('Dit is niet jouw plek', 400);
  }
  if (!toSlot?.person || toSlot.person.id === Number(requesterId)) {
    throw httpError('Ruilen kan alleen met een andere scheidsrechter', 400);
  }
  if (claimConflict(fromSlot.person, toSlot, board.blocks) || claimConflict(toSlot.person, fromSlot, board.blocks)) {
    throw httpError('Deze ruil past niet', 400);
  }
  const fromRow = await prisma.refereeAssignment.findUnique({ where: { matchId: fromSlot.id } });
  const toRow = await prisma.refereeAssignment.findUnique({ where: { matchId: toSlot.id } });
  if (!fromRow || !toRow) throw httpError('Plek niet gevonden', 404);
  await prisma.refereeSwap.updateMany({
    where: { requesterId: Number(requesterId), status: 'PENDING' },
    data: { status: 'CANCELLED' },
  });
  const swap = await prisma.refereeSwap.create({
    data: {
      fromAssignmentId: fromRow.id,
      toAssignmentId: toRow.id,
      requesterId: Number(requesterId),
      counterpartyId: toSlot.person.id,
      status: 'PENDING',
    },
  });
  return { id: swap.id, ...(await mineFor(requesterId)) };
}

export async function acceptSwap(swapId, personId) {
  const swap = await prisma.refereeSwap.findFirst({
    where: { id: Number(swapId), counterpartyId: Number(personId), status: 'PENDING' },
    include: { fromAssignment: true, toAssignment: true },
  });
  if (!swap) throw httpError('Ruilverzoek niet gevonden', 404);
  const { board } = await viewBoard();
  const fromSlot = decoratedSlot(board, swap.fromAssignment.matchId);
  const toSlot = decoratedSlot(board, swap.toAssignment.matchId);
  if (!fromSlot?.person || !toSlot?.person) throw httpError('Plek is niet meer beschikbaar', 400);
  if (
    fromSlot.person.id !== swap.requesterId ||
    toSlot.person.id !== Number(personId) ||
    claimConflict(fromSlot.person, toSlot, board.blocks) ||
    claimConflict(toSlot.person, fromSlot, board.blocks)
  ) {
    throw httpError('Deze ruil past niet meer', 400);
  }
  await prisma.$transaction([
    prisma.refereeAssignment.update({
      where: { id: swap.fromAssignmentId },
      data: { personId: toSlot.person.id, status: 'voorgesteld', source: 'hand', openReason: '' },
    }),
    prisma.refereeAssignment.update({
      where: { id: swap.toAssignmentId },
      data: { personId: fromSlot.person.id, status: 'voorgesteld', source: 'hand', openReason: '' },
    }),
    prisma.refereeSwap.update({
      where: { id: swap.id },
      data: { status: 'ACCEPTED' },
    }),
  ]);
  return mineFor(personId);
}

export async function rejectSwap(swapId, personId) {
  const updated = await prisma.refereeSwap.updateMany({
    where: { id: Number(swapId), counterpartyId: Number(personId), status: 'PENDING' },
    data: { status: 'REJECTED' },
  });
  if (!updated.count) throw httpError('Ruilverzoek niet gevonden', 404);
  return mineFor(personId);
}
