import { endOfDay, startOfDay, toIsoDate } from './dates.js';
import { resolvePlanningPeriod } from './planningPeriod.js';

export function publicRound(round) {
  if (!round) return null;
  return {
    id: round.id,
    label: round.label || 'Planning',
    fromDate: round.fromDate,
    toDate: round.toDate,
    status: round.status,
    volunteerDeadline: round.volunteerDeadline,
    volunteerNotifiedAt: round.volunteerNotifiedAt,
    mandatoryNotifiedAt: round.mandatoryNotifiedAt,
    publishedAt: round.publishedAt,
    official: Boolean(round.official),
    active: Boolean(round.active),
    updatedAt: round.updatedAt,
  };
}

/** Actieve planningsronde; maakt er één aan als die nog niet bestaat. */
export async function getActiveRound(prisma) {
  let round = await prisma.planningRound.findFirst({
    where: { active: true },
    orderBy: { id: 'asc' },
  });
  if (!round) {
    round = await prisma.planningRound.findFirst({ orderBy: { id: 'asc' } });
  }
  if (!round) {
    return prisma.planningRound.create({
      data: { label: 'Planning', status: 'DRAFT', active: true },
    });
  }
  if (!round.active) {
    round = await prisma.planningRound.update({
      where: { id: round.id },
      data: { active: true },
    });
  }
  return round;
}

export async function listPlanningRounds(prisma) {
  const rounds = await prisma.planningRound.findMany({ orderBy: [{ fromDate: 'asc' }, { id: 'asc' }] });
  if (!rounds.length) {
    return [await getActiveRound(prisma)];
  }
  return rounds;
}

function rangesOverlap(aFrom, aTo, bFrom, bTo) {
  if (!aFrom || !aTo || !bFrom || !bTo) return false;
  return aFrom.getTime() <= bTo.getTime() && bFrom.getTime() <= aTo.getTime();
}

export async function assertNoRoundOverlap(prisma, { from, to, excludeId = null }) {
  const others = await prisma.planningRound.findMany({
    where: excludeId ? { id: { not: Number(excludeId) } } : undefined,
  });
  for (const other of others) {
    if (!other.fromDate || !other.toDate) continue;
    if (rangesOverlap(from, to, startOfDay(other.fromDate), endOfDay(other.toDate))) {
      const err = new Error(
        `Periode overlapt met “${other.label || `planning ${other.id}`}” (${toIsoDate(other.fromDate)} t/m ${toIsoDate(other.toDate)}). Kies aansluitende datums zonder overlap.`,
      );
      err.status = 400;
      throw err;
    }
  }
}

export async function createPlanningRound(prisma, { label, from, to }) {
  const period = resolvePlanningPeriod({ from, to });
  await assertNoRoundOverlap(prisma, { from: period.from, to: period.to });
  const existing = await prisma.planningRound.count();
  return prisma.planningRound.create({
    data: {
      label: String(label || 'Planning').trim().slice(0, 80) || 'Planning',
      fromDate: period.from,
      toDate: period.to,
      status: 'DRAFT',
      active: existing === 0,
    },
  });
}

export async function activatePlanningRound(prisma, id) {
  const round = await prisma.planningRound.findUnique({ where: { id: Number(id) } });
  if (!round) {
    const err = new Error('Planningperiode niet gevonden');
    err.status = 404;
    throw err;
  }
  await prisma.$transaction([
    prisma.planningRound.updateMany({ data: { active: false } }),
    prisma.planningRound.update({ where: { id: round.id }, data: { active: true } }),
  ]);
  return getActiveRound(prisma);
}

export async function updatePlanningRound(prisma, id, { label, from, to, volunteerDeadline } = {}) {
  const round = await prisma.planningRound.findUnique({ where: { id: Number(id) } });
  if (!round) {
    const err = new Error('Planningperiode niet gevonden');
    err.status = 404;
    throw err;
  }
  const data = {};
  if (label !== undefined) data.label = String(label || 'Planning').trim().slice(0, 80) || 'Planning';
  if (from || to) {
    const period = resolvePlanningPeriod({
      from: from || round.fromDate,
      to: to || round.toDate,
    });
    await assertNoRoundOverlap(prisma, {
      from: period.from,
      to: period.to,
      excludeId: round.id,
    });
    data.fromDate = period.from;
    data.toDate = period.to;
  }
  if (volunteerDeadline !== undefined) {
    data.volunteerDeadline = volunteerDeadline ? new Date(volunteerDeadline) : null;
  }
  return prisma.planningRound.update({ where: { id: round.id }, data });
}
