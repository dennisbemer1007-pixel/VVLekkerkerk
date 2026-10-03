import { useMemo, useSyncExternalStore } from 'react';
import { categoryNeeded, categoryOfTeam, categorySort } from './categories.js';
import { EXAMPLE_PEOPLE, buildExampleMatches } from './example.js';
import { claimConflict, decorateMatch, planReferees, projectBoard } from './planReferees.js';

const STORAGE_KEY = 'vvl-scheids-voorbeeld-v1';

function emptyState() {
  return {
    enabled: false,
    byId: {},
    byEmail: {},
    categoryOn: {},
    assignments: [],
    swaps: [],
    initialized: false,
  };
}

export function levelsForPerson(person, state) {
  if (!person || !state) return [];
  const id = person.id != null ? String(person.id) : '';
  if (id && Object.prototype.hasOwnProperty.call(state.byId, id)) return state.byId[id] || [];
  const email = String(person.email || '').toLowerCase();
  if (email && Object.prototype.hasOwnProperty.call(state.byEmail, email)) return state.byEmail[email] || [];
  const preset = EXAMPLE_PEOPLE.find((item) => item.email === email);
  return preset ? [...preset.levels] : [];
}

export function resolvePeople(state) {
  return EXAMPLE_PEOPLE.map((person) => ({
    ...person,
    levels: levelsForPerson(person, state),
  }));
}

function isNeededFor(state) {
  return (key) => categoryNeeded(key, state.categoryOn);
}

function withInitialPlan(state) {
  if (state.initialized) return state;
  const people = resolvePeople(state);
  const planned = planReferees({
    people,
    matches: buildExampleMatches(),
    isNeeded: isNeededFor(state),
  });
  return { ...state, assignments: planned.assignments, initialized: true };
}

function readState() {
  let parsed = emptyState();
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (raw) parsed = { ...emptyState(), ...JSON.parse(raw) };
  } catch {
    parsed = emptyState();
  }
  const next = withInitialPlan(parsed);
  if (!parsed.initialized) {
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* voorbeeld blijft in geheugen */
    }
  }
  return next;
}

let state = readState();
const listeners = new Set();

function emit(next) {
  state = next;
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* negeer volle of geblokkeerde opslag */
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return state;
}

export function useScheidsState() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function scheidsFeatureOn() {
  return Boolean(state.enabled);
}

export function useScheidsEnabled() {
  return Boolean(useScheidsState().enabled);
}

export function setScheidsEnabled(enabled) {
  emit({ ...state, enabled: Boolean(enabled) });
}

export function useScheidsBoard() {
  const current = useScheidsState();
  return useMemo(() => {
    const people = resolvePeople(current);
    return projectBoard({
      people,
      matches: buildExampleMatches(),
      isNeeded: isNeededFor(current),
      assignments: current.assignments,
    });
  }, [current]);
}

export function categoriesForSettings(matches = buildExampleMatches()) {
  const map = new Map();
  for (const match of matches) {
    if (!match.home) continue;
    const category = categoryOfTeam(match.team);
    if (category) map.set(category.key, category);
  }
  return [...map.values()].sort(categorySort);
}

export function savePersonLevels(person, levels) {
  const nextLevels = Array.isArray(levels) ? [...levels] : [];
  const byId = { ...state.byId };
  const byEmail = { ...state.byEmail };
  if (person?.id != null) byId[String(person.id)] = nextLevels;
  const email = String(person?.email || '').toLowerCase();
  if (email) byEmail[email] = nextLevels;
  emit({ ...state, byId, byEmail });
}

export function setCategoryNeeded(key, needed) {
  emit({
    ...state,
    categoryOn: { ...state.categoryOn, [key]: Boolean(needed) },
  });
}

export function replanScheids() {
  const people = resolvePeople(state);
  const keep = (state.assignments || []).filter(
    (row) => row.status === 'bevestigd' || row.source === 'self' || row.source === 'hand',
  );
  const planned = planReferees({
    people,
    matches: buildExampleMatches(),
    isNeeded: isNeededFor(state),
    locked: keep,
  });
  emit({ ...state, assignments: planned.assignments, initialized: true });
}

export function confirmScheids(slotId, email) {
  const board = currentBoard();
  const slot = board.slots.find((item) => item.id === slotId && item.person?.email === email);
  if (!slot?.assignment) return;
  const others = state.assignments.filter((row) => row.slotId !== slotId);
  emit({
    ...state,
    assignments: [
      ...others,
      { ...slot.assignment, status: 'bevestigd', source: slot.assignment.source || 'auto' },
    ],
  });
}

export function assignScheids(slotId, personEmail) {
  const board = currentBoard();
  const slot = board.slotById.get(slotId);
  if (!slot) return;
  const others = state.assignments.filter((row) => row.slotId !== slotId);
  if (!personEmail) {
    emit({ ...state, assignments: others });
    return;
  }
  const person = board.people.find((item) => item.email === personEmail);
  const blocks = board.blocks;
  if (!person || claimConflict(person, slot, blocks)) return;
  const decorated = decorateMatch(slot);
  const sameDay = board.slots.some(
    (item) =>
      item.id !== slotId &&
      item.date === decorated.date &&
      item.person?.email === personEmail,
  );
  if (sameDay) return;
  emit({
    ...state,
    assignments: [
      ...others,
      { slotId, personEmail, status: 'voorgesteld', source: 'hand', besideOwn: false },
    ],
  });
}

export function claimScheids(slotId, email) {
  const board = currentBoard();
  const slot = board.slots.find((item) => item.id === slotId);
  const person = board.people.find((item) => item.email === email);
  if (!slot || !person || !slot.open) return claimConflict(person, slot, board.blocks) || 'Plek is bezet.';
  const conflict = claimConflict(person, slot, board.blocks);
  if (conflict) return conflict;
  const others = state.assignments.filter((row) => row.slotId !== slotId);
  emit({
    ...state,
    assignments: [
      ...others,
      { slotId, personEmail: email, status: 'bevestigd', source: 'self', besideOwn: false },
    ],
  });
  return '';
}

function currentBoard() {
  const people = resolvePeople(state);
  return projectBoard({
    people,
    matches: buildExampleMatches(),
    isNeeded: isNeededFor(state),
    assignments: state.assignments,
  });
}

export function swapCandidates(email) {
  const board = currentBoard();
  const mine = board.slots.filter((slot) => slot.person?.email === email);
  const options = [];
  for (const mineSlot of mine) {
    for (const other of board.slots) {
      if (!other.person || other.person.email === email) continue;
      const me = mineSlot.person;
      const them = other.person;
      if (claimConflict(me, other, board.blocks) || claimConflict(them, mineSlot, board.blocks)) continue;
      options.push({
        fromSlotId: mineSlot.id,
        toSlotId: other.id,
        fromLabel: slotLabel(mineSlot),
        toLabel: slotLabel(other),
        toName: them.name,
        toEmail: them.email,
      });
    }
  }
  return options;
}

function slotLabel(slot) {
  return `${slot.team} · ${slot.time}`;
}

export function proposeSwap({ fromEmail, toEmail, fromSlotId, toSlotId }) {
  const id = `ruil-${Date.now()}`;
  const swaps = [
    ...state.swaps.filter((swap) => swap.status !== 'wacht' || swap.fromEmail !== fromEmail),
    { id, fromEmail, toEmail, fromSlotId, toSlotId, status: 'wacht' },
  ];
  emit({ ...state, swaps });
  return id;
}

export function acceptSwap(swapId, email) {
  const swap = state.swaps.find((item) => item.id === swapId && item.toEmail === email && item.status === 'wacht');
  if (!swap) return;
  const board = currentBoard();
  const fromSlot = board.slotById.get(swap.fromSlotId);
  const toSlot = board.slotById.get(swap.toSlotId);
  if (!fromSlot || !toSlot) return;
  const assignments = state.assignments.filter(
    (row) => row.slotId !== swap.fromSlotId && row.slotId !== swap.toSlotId,
  );
  assignments.push(
    { slotId: swap.fromSlotId, personEmail: swap.toEmail, status: 'voorgesteld', source: 'hand', besideOwn: false },
    { slotId: swap.toSlotId, personEmail: swap.fromEmail, status: 'voorgesteld', source: 'hand', besideOwn: false },
  );
  emit({
    ...state,
    assignments,
    swaps: state.swaps.map((item) => (item.id === swapId ? { ...item, status: 'akkoord' } : item)),
  });
}

export function viewerPerson(user, boardPeople) {
  const email = String(user?.email || '').toLowerCase();
  return (boardPeople || []).find((person) => person.email === email) || null;
}
