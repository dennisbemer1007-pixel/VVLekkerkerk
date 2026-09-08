import { startOfDay, toIsoDate } from './dates.js';
import { parseTimeStartMinutes } from './time.js';

/** Kantinedienst duurt 3 uur vanaf de aftrap. */
export const SERVICE_DURATION_MINUTES = 180;

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

export function slotForKickoff(kickoffHm) {
  const mins = parseTimeStartMinutes(kickoffHm);
  if (mins == null || mins < 12 * 60) return 'MORNING';
  if (mins < 16 * 60) return 'AFTERNOON';
  return 'EVENING';
}

/** Wedstrijd 09:00 → dienst 09:00 - 12:00. */
export function serviceWindowForKickoff(kickoffHm) {
  const start = parseTimeStartMinutes(kickoffHm) ?? 9 * 60;
  const end = start + SERVICE_DURATION_MINUTES;
  const startHm = formatHm(start);
  const endHm = formatHm(end);
  return {
    start: startHm,
    end: endHm,
    time: `${startHm} - ${endHm}`,
    slot: slotForKickoff(startHm),
    startMinutes: start,
  };
}

/**
 * Thuiswedstrijden groeperen per dag + aftrap.
 * Vijf wedstrijden om 09:00 → één bardienst.
 */
export function groupHomeMatchesByKickoff(matches) {
  const groups = new Map();
  for (const match of matches || []) {
    if (match?.home === false) continue;
    const day = toIsoDate(startOfDay(match.date));
    const kickoff = kickoffTimeFromMatch(match);
    const key = `${day}|${kickoff}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        date: startOfDay(match.date),
        kickoff,
        window: serviceWindowForKickoff(kickoff),
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

export function barSlotKey(date, startMinutes) {
  return `${toIsoDate(startOfDay(date))}|BAR|${startMinutes}`;
}

export function barSlotKeyFromService(service) {
  const start = parseTimeStartMinutes(service?.time);
  if (start == null) return null;
  return barSlotKey(service.date, start);
}

/**
 * Houd max. één BAR per thuis-aftrap; rest (keuken, extra tijden, duplicaten) is wees.
 */
export function pickServicesMatchingHomeMatches(services, groups) {
  const needed = new Map();
  for (const group of groups || []) {
    needed.set(barSlotKey(group.date, group.window.startMinutes), group);
  }

  const byKey = new Map();
  const unmatched = [];

  for (const service of services || []) {
    const start = parseTimeStartMinutes(service.time);
    if (service.type !== 'BAR' || start == null) {
      unmatched.push(service);
      continue;
    }
    const key = barSlotKey(service.date, start);
    if (!needed.has(key)) {
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
  return `Thuis ${group.window.time} · ${teams}`;
}
