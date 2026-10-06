import { addWeeks, endOfDay, endOfWeek, startOfDay, startOfWeek, toIsoDate } from './dates.js';
import { getActiveRound } from './planningRounds.js';

const MAX_DAYS = 400;

/** Planningen lopen van maandag t/m zondag. Gekozen datums worden daarop afgerond. */
export function resolvePlanningPeriod({ from, to, weeks } = {}, now = new Date()) {
  const rawStart = from ? startOfDay(new Date(from)) : startOfDay(now);
  if (Number.isNaN(rawStart.getTime())) {
    const err = new Error('Ongeldige begindatum.');
    err.status = 400;
    throw err;
  }
  const start = startOfWeek(rawStart);
  let end;
  if (to) {
    const rawEnd = startOfDay(new Date(to));
    if (Number.isNaN(rawEnd.getTime())) {
      const err = new Error('Ongeldige einddatum.');
      err.status = 400;
      throw err;
    }
    end = endOfWeek(rawEnd);
  } else {
    const w = Number(weeks);
    const weekCount = Number.isFinite(w) && w > 0 ? w : 6;
    end = endOfWeek(addWeeks(start, weekCount - 1));
  }
  if (end < start) {
    const err = new Error('De einddatum moet op of na de begindatum liggen.');
    err.status = 400;
    throw err;
  }
  const days = Math.round((end - start) / 86400000) + 1;
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
    return {
      from: startOfDay(round.fromDate),
      to: endOfDay(round.toDate),
      roundId: round.id,
      label: round.label || 'Planning',
      official: Boolean(round.official),
    };
  }
  return { ...resolvePlanningPeriod({}, fallbackNow), roundId: round?.id, label: round?.label || 'Planning', official: false };
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
  const today = startOfDay(now);
  const rounds = await prisma.planningRound.findMany({
    where: { fromDate: { not: null }, toDate: { not: null } },
    select: { fromDate: true, toDate: true },
  });
  let to = today;
  let found = false;
  for (const round of rounds) {
    const end = endOfDay(round.toDate);
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
