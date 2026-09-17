import { startOfDay, toIsoDate } from './dates.js';
import { parseTimeStartMinutes } from './time.js';
import { SLOT_TIMES } from './youthTeams.js';

export const BAR_SLOTS = [
  {
    slot: 'MORNING',
    label: 'Ochtend',
    time: SLOT_TIMES.MORNING.BAR,
    startMinutes: 7 * 60 + 30,
  },
  {
    slot: 'AFTERNOON',
    label: 'Middag',
    time: SLOT_TIMES.AFTERNOON.BAR,
    startMinutes: 12 * 60,
  },
  {
    slot: 'EVENING',
    label: 'Avond',
    time: SLOT_TIMES.EVENING.BAR,
    startMinutes: 16 * 60 + 30,
  },
];

export function formatHm(totalMinutes) {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Number(totalMinutes) || 0));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function normalizeKickoffHm(value) {
  const mins = parseTimeStartMinutes(value);
  if (mins == null) return null;
  return formatHm(mins);
}

/** Aftrap als HH:MM; zonder tijd valt terug op het tijdstip in de datum. */
export function kickoffTimeFromMatch(match) {
  const fromField = normalizeKickoffHm(match?.time);
  if (fromField) return fromField;
  if (match?.date) {
    const d = new Date(match.date);
    if (!Number.isNaN(d.getTime())) {
      return formatHm(d.getHours() * 60 + d.getMinutes());
    }
  }
  return '09:00';
}

/** Aftrap voor 12:00 → ochtend, tot 16:30 → middag, daarna avond. */
export function slotForKickoff(kickoffHm) {
  const mins = parseTimeStartMinutes(kickoffHm);
  if (mins == null || mins < 12 * 60) return 'MORNING';
  if (mins < 16 * 60 + 30) return 'AFTERNOON';
  return 'EVENING';
}

export function slotFromService(service) {
  if (service?.slot && service.slot !== 'EXTRA') return service.slot;
  return slotForKickoff(service?.time);
}

export function windowForSlot(slot) {
  const spec = BAR_SLOTS.find((s) => s.slot === slot) || BAR_SLOTS[0];
  const [start, end] = spec.time.split(' - ');
  return {
    start,
    end,
    time: spec.time,
    slot: spec.slot,
    startMinutes: spec.startMinutes,
    label: spec.label,
  };
}

/** Aftrap 08:30 of 11:00 → vaste ochtenddienst 07:30 - 12:00. */
export function serviceWindowForKickoff(kickoffHm) {
  return windowForSlot(slotForKickoff(kickoffHm));
}

/**
 * Thuiswedstrijden groeperen per dag + dagdeel.
 * Meerdere ochtendwedstrijden → één bardienst 09:00–12:00.
 */
export function groupHomeMatchesByKickoff(matches) {
  const groups = new Map();
  for (const match of matches || []) {
    if (match?.home === false) continue;
    const day = toIsoDate(startOfDay(match.date));
    const kickoff = kickoffTimeFromMatch(match);
    const slot = slotForKickoff(kickoff);
    const key = `${day}|${slot}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        date: startOfDay(match.date),
        slot,
        window: windowForSlot(slot),
        matches: [],
      });
    }
    groups.get(key).matches.push(match);
  }
  return [...groups.values()].sort((a, b) => {
    const byDate = a.date - b.date;
    if (byDate !== 0) return byDate;
    return a.window.startMinutes - b.window.startMinutes;
  });
}

export function barSlotKey(date, slot) {
  return `${toIsoDate(startOfDay(date))}|BAR|${slot}`;
}

export function barSlotKeyFromService(service) {
  const slot = slotFromService(service);
  if (!slot) return null;
  return barSlotKey(service.date, slot);
}

/**
 * Houd max. één BAR per dagdeel met thuiswedstrijd; rest is wees.
 */
export function pickServicesMatchingHomeMatches(services, groups) {
  const needed = new Map();
  for (const group of groups || []) {
    needed.set(barSlotKey(group.date, group.window.slot), group);
  }

  const byKey = new Map();
  const unmatched = [];

  for (const service of services || []) {
    if (service.type !== 'BAR') {
      unmatched.push(service);
      continue;
    }
    const key = barSlotKeyFromService(service);
    if (!key || !needed.has(key)) {
      unmatched.push(service);
      continue;
    }
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(service);
  }

  const keep = [];
  const extras = [];
  for (const [key, list] of byKey) {
    const group = needed.get(key);
    const matchIds = new Set((group.matches || []).map((m) => m.id).filter((id) => id != null));
    const ranked = [...list].sort((a, b) => {
      const aHit = a.matchId != null && matchIds.has(a.matchId) ? 0 : 1;
      const bHit = b.matchId != null && matchIds.has(b.matchId) ? 0 : 1;
      if (aHit !== bHit) return aHit - bHit;
      return (a.id ?? 0) - (b.id ?? 0);
    });
    keep.push(ranked[0]);
    extras.push(...ranked.slice(1));
  }

  return { keep, remove: [...unmatched, ...extras] };
}

export function planningNoteForGroup(group) {
  const names = (group.matches || []).map((m) => {
    const team = m.team?.name;
    const vs = m.opponent ? ` vs ${m.opponent}` : '';
    return team ? `${team}${vs}` : m.opponent || null;
  });
  const unique = [...new Set(names.filter(Boolean))];
  const shown = unique.slice(0, 4);
  const extra = unique.length > 4 ? ` +${unique.length - 4}` : '';
  const teams = shown.length ? shown.join(', ') + extra : `${group.matches.length} thuiswedstrijd(en)`;
  const label = group.window.label || 'Bardienst';
  return `${label} ${group.window.time} · ${teams}`;
}
