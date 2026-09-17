import { addWeeks, endOfDay, startOfDay, toIsoDate } from './dates.js';

const MAX_DAYS = 400;

export function resolvePlanningPeriod({ from, to, weeks } = {}, now = new Date()) {
  const start = from ? startOfDay(new Date(from)) : startOfDay(now);
  if (Number.isNaN(start.getTime())) {
    const err = new Error('Ongeldige begindatum.');
    err.status = 400;
    throw err;
  }
  let end;
  if (to) {
    end = endOfDay(new Date(to));
  } else {
    const w = Number(weeks);
    end = endOfDay(addWeeks(start, Number.isFinite(w) && w > 0 ? w : 6));
  }
  if (Number.isNaN(end.getTime())) {
    const err = new Error('Ongeldige einddatum.');
    err.status = 400;
    throw err;
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
  const round = await prisma.planningRound.findUnique({ where: { id: 1 } });
  if (round?.fromDate && round?.toDate) {
    return {
      from: startOfDay(round.fromDate),
      to: endOfDay(round.toDate),
    };
  }
  return resolvePlanningPeriod({}, fallbackNow);
}

export function periodJson(period) {
  return { from: toIsoDate(period.from), to: toIsoDate(period.to) };
}
