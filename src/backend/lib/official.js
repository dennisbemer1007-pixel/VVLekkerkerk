import prisma from './prisma.js';
import { resolvePlanningPeriod, periodFromRound } from './planningPeriod.js';
import { notifyPlanningReady } from './mail.js';

export const OFFICIAL_DECISION =
  'Officieel maken zet het rooster vast voor de kantine: vrijwilligers kunnen zich daarna niet meer zelf in- of uitschrijven en niet meer ruilen. De barcommissie kan nog wijzigen. De bardienstcoördinator kan een teamdienst nog op naam zetten. Wie een account heeft, krijgt dan de mail “planning klaar” als SMTP aanstaat.';

export async function markPlanningOfficial({ from, to, weeks } = {}) {
  const before = await prisma.planningRound.findUnique({ where: { id: 1 } });
  const wasOfficial = Boolean(before?.official);
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
  const mail = wasOfficial ? { sent: 0, skipped: true } : await notifyPlanningReady();
  return { locked: locked.count, round, period, mail };
}

export async function planningIsOfficial() {
  const round = await prisma.planningRound.findUnique({ where: { id: 1 } });
  return Boolean(round?.official);
}
