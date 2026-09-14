import prisma from './prisma.js';
import { addWeeks, endOfDay, startOfDay } from './dates.js';

export const OFFICIAL_DECISION =
  'Na “officieel maken” is de 6-wekenplanning vast: diensten in de ronde worden vergrendeld. Alleen barcommissie/admin mag daarna nog inschrijven of uitschrijven. Teamcoördinatoren vullen teamdiensten vóór dit moment.';

export async function markPlanningOfficial({ weeks = 6 } = {}) {
  const from = startOfDay(new Date());
  const to = endOfDay(addWeeks(from, weeks));
  const locked = await prisma.service.updateMany({
    where: {
      active: true,
      draft: false,
      date: { gte: from, lte: to },
    },
    data: { locked: true },
  });
  const round = await prisma.planningRound.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      fromDate: from,
      toDate: to,
      status: 'OFFICIAL',
      official: true,
      publishedAt: new Date(),
    },
    update: {
      status: 'OFFICIAL',
      official: true,
    },
  });
  return { locked: locked.count, round };
}

export async function planningIsOfficial() {
  const round = await prisma.planningRound.findUnique({ where: { id: 1 } });
  return Boolean(round?.official);
}
