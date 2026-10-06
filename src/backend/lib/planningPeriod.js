import {
  parseCalendarDate,
  planningEndSunday,
  startOfWeekUtc,
  sundayUtcNoon,
  toIsoDate,
  utcDayEnd,
  utcDayStart,
} from './dates.js';
import { getActiveRound } from './planningRounds.js';

const MAX_DAYS = 400;

/** Planningen lopen van maandag t/m zondag. Gekozen datums worden daarop afgerond. */
export function resolvePlanningPeriod({ from, to, weeks } = {}, now = new Date()) {
  const rawStart = from ? parseCalendarDate(from) : parseCalendarDate(now);
  if (!rawStart || Number.isNaN(rawStart.getTime())) {
    const err = new Error('Ongeldige begindatum.');
    err.status = 400;
    throw err;
  }
  const startNoon = startOfWeekUtc(rawStart);
  let endNoon;
  if (to) {
    const rawEnd = parseCalendarDate(to);
    if (!rawEnd || Number.isNaN(rawEnd.getTime())) {
      const err = new Error('Ongeldige einddatum.');
      err.status = 400;
      throw err;
    }
    endNoon = planningEndSunday(rawEnd);
    if (utcDayEnd(endNoon) < utcDayStart(startNoon)) {
      endNoon = sundayUtcNoon(rawEnd);
    }
  } else {
    const w = Number(weeks);
    const weekCount = Number.isFinite(w) && w > 0 ? w : 6;
    const weekStart = new Date(startNoon.getTime());
    weekStart.setUTCDate(weekStart.getUTCDate() + (weekCount - 1) * 7);
    endNoon = sundayUtcNoon(weekStart);
  }
  const start = utcDayStart(startNoon);
  const end = utcDayEnd(endNoon);
  if (end < start) {
    const err = new Error('De einddatum moet op of na de begindatum liggen.');
    err.status = 400;
    throw err;
  }
  const days = Math.round((utcDayStart(endNoon) - start) / 86400000) + 1;
  if (days > MAX_DAYS) {
    const err = new Error('Kies een periode van maximaal 13 maanden.');
    err.status = 400;
    throw err;
  }
  return { from: start, to: end, days };
}

export async function periodFromRound(prisma, fallbackNow = new Date()) {
  const round = await getActiveRound(prisma);
  if (round?.fromDate && round?.toDate) {
    const fromNoon = parseCalendarDate(round.fromDate);
    const toNoon = parseCalendarDate(round.toDate);
    return {
      from: utcDayStart(fromNoon),
      to: utcDayEnd(toNoon),
      roundId: round.id,
      label: round.label || 'Planning',
      official: Boolean(round.official),
    };
  }
  return { ...resolvePlanningPeriod({}, fallbackNow), roundId: round?.id, label: round?.label || 'Planning', official: false };
}

/** Vorige planningsronde: eindigt vóór de start van de huidige. Geen vorige → null (eerste planning ooit). */
export function pickPreviousRound(rounds, currentFrom) {
  const start = utcDayStart(parseCalendarDate(currentFrom) || currentFrom);
  if (Number.isNaN(start.getTime())) return null;
  const startMs = start.getTime();
  let best = null;
  let bestEnd = -Infinity;
  for (const round of rounds || []) {
    if (!round?.fromDate || !round?.toDate) continue;
    const end = utcDayEnd(parseCalendarDate(round.toDate));
    if (Number.isNaN(end.getTime()) || end.getTime() >= startMs) continue;
    if (end.getTime() > bestEnd) {
      best = round;
      bestEnd = end.getTime();
    }
  }
  return best;
}

export async function previousPlanningPeriod(prisma, currentFrom) {
  const rounds = await prisma.planningRound.findMany({
    where: { fromDate: { not: null }, toDate: { not: null } },
    select: { id: true, label: true, fromDate: true, toDate: true },
  });
  const round = pickPreviousRound(rounds, currentFrom);
  if (!round) return null;
  return {
    from: utcDayStart(parseCalendarDate(round.fromDate)),
    to: utcDayEnd(parseCalendarDate(round.toDate)),
    roundId: round.id,
    label: round.label || 'Planning',
  };
}

export function periodJson(period) {
  return {
    from: toIsoDate(period.from),
    to: toIsoDate(period.to),
    ...(period.roundId ? { roundId: period.roundId } : {}),
    ...(period.label ? { label: period.label } : {}),
  };
}

/** True als de dienstkalenderdag binnen de planningsronde valt (van t/m tot). */
export function isWithinPlanningPeriod(date, period) {
  const t = new Date(date).getTime();
  if (Number.isNaN(t) || !period?.from || !period?.to) return false;
  return t >= period.from.getTime() && t <= period.to.getTime();
}

/**
 * Huidige + toekomstige planningen: vanaf vandaag tot de laatste einddatum.
 * Zo blijft de lopende periode inschrijfbaar als er al een volgende ronde actief is.
 */
export async function enrollableServiceRange(prisma, now = new Date()) {
  const today = utcDayStart(now);
  const rounds = await prisma.planningRound.findMany({
    where: { fromDate: { not: null }, toDate: { not: null } },
    select: { fromDate: true, toDate: true },
  });
  let to = today;
  let found = false;
  for (const round of rounds) {
    const end = utcDayEnd(parseCalendarDate(round.toDate));
    if (end < today) continue;
    found = true;
    if (end > to) to = end;
  }
  if (!found) {
    const active = await periodFromRound(prisma, now);
    return { from: today, to: active.to > today ? active.to : today };
  }
  return { from: today, to };
}

/**
 * Snij een diensten-datumfilter af op de planningsperiode.
 * Zonder bestaand filter is het resultaat precies de periode.
 * Een latere ondergrens (bijv. vandaag) blijft staan; een latere bovengrens wordt ingekort.
 */
export function clampServiceDateFilter(dateFilter, period) {
  const fromMs = period.from.getTime();
  const toMs = period.to.getTime();
  const gteMs = Math.max(fromMs, dateFilter?.gte ? new Date(dateFilter.gte).getTime() : fromMs);
  const lteMs = Math.min(toMs, dateFilter?.lte ? new Date(dateFilter.lte).getTime() : toMs);
  return { gte: new Date(gteMs), lte: new Date(lteMs) };
}
