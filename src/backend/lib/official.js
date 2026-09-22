import prisma from './prisma.js';
import { resolvePlanningPeriod, periodFromRound } from './planningPeriod.js';

export const OFFICIAL_DECISION =
  'Na “officieel maken” is de planning van de gekozen periode vast: diensten in de ronde worden vergrendeld. Alleen barcommissie/admin mag daarna nog inschrijven of uitschrijven. Vrijwilligers kunnen onderling blijven ruilen als beide personen akkoord zijn. Bardienstcoördinatoren vullen teamdiensten vóór dit moment.';

export async function markPlanningOfficial({ from, to, weeks } = {}) {
  const period = from || to
    ? resolvePlanningPeriod({ from, to, weeks })
    : await periodFromRound(prisma);
  const locked = await prisma.service.updateMany({
    where: {
      active: true,
      draft: false,
      date: { gte: period.from, lte: period.to },
    },
    data: { locked: true },
  });
  const round = await prisma.planningRound.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      fromDate: period.from,
      toDate: period.to,
      status: 'OFFICIAL',
      official: true,
      publishedAt: new Date(),
    },
    update: {
      fromDate: period.from,
      toDate: period.to,
      status: 'OFFICIAL',
      official: true,
    },
  });
  return { locked: locked.count, round, period };
}

export async function planningIsOfficial() {
  const round = await prisma.planningRound.findUnique({ where: { id: 1 } });
  return Boolean(round?.official);
}
