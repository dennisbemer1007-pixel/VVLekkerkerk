import prisma from './prisma.js';
import { resolvePlanningPeriod, periodFromRound } from './planningPeriod.js';
import { getActiveRound } from './planningRounds.js';
import { notifyPlanningReady } from './mail.js';

export const OFFICIAL_DECISION =
  'Officieel maken zet het rooster vast voor de kantine. Vrijwilligers kunnen zich daarna nog wel inschrijven op een open plek, maar niet meer zelf uitschrijven. Onderling ruilen van twee persoonlijke diensten blijft mogelijk als beide personen akkoord zijn. De barcommissie kan nog wijzigen. De bardienstcoördinator kan een teamdienst nog op naam zetten. Wie een account heeft, krijgt dan de mail “planning klaar” als SMTP aanstaat. Officieel maken kan de barcommissie later weer terugdraaien.';

export async function markPlanningOfficial({ from, to, weeks } = {}) {
  const before = await getActiveRound(prisma);
  const wasOfficial = Boolean(before?.official);
  // Altijd actieve ronde-datums gebruiken zodat diensten synchroon locked blijven.
  const period = await periodFromRound(prisma);
  if (from || to || weeks) {
    const requested = resolvePlanningPeriod({
      from: from || period.from,
      to: to || period.to,
      weeks,
    });
    if (
      requested.from.getTime() !== period.from.getTime() ||
      requested.to.getTime() !== period.to.getTime()
    ) {
      // Negeer afwijkende body: actieve periode is leidend.
    }
  }
  const locked = await prisma.service.updateMany({
    where: {
      active: true,
      draft: false,
      date: { gte: period.from, lte: period.to },
    },
    data: { locked: true },
  });
  const round = await prisma.planningRound.update({
    where: { id: before.id },
    data: {
      fromDate: period.from,
      toDate: period.to,
      status: 'OFFICIAL',
      official: true,
      publishedAt: before.publishedAt || new Date(),
    },
  });
  const mail = wasOfficial ? { sent: 0, skipped: true } : await notifyPlanningReady();
  return { locked: locked.count, round, period, mail };
}

/** Haalt de officiële status weg: diensten ontgrendelen, vrijwilligersfase weer open. */
export async function unmarkPlanningOfficial() {
  const before = await getActiveRound(prisma);
  const period = await periodFromRound(prisma);
  const unlocked = await prisma.service.updateMany({
    where: {
      active: true,
      date: { gte: period.from, lte: period.to },
      locked: true,
    },
    data: { locked: false },
  });
  const round = await prisma.planningRound.update({
    where: { id: before.id },
    data: {
      fromDate: period.from,
      toDate: period.to,
      status: 'VOLUNTEER_OPEN',
      official: false,
      publishedAt: before?.publishedAt || new Date(),
    },
  });
  return { unlocked: unlocked.count, round, period };
}

export async function planningIsOfficial() {
  const round = await getActiveRound(prisma);
  return Boolean(round?.official);
}

/** Zet locked gelijk aan official voor alle diensten in de actieve periode. */
export async function syncOfficialLocks() {
  const round = await getActiveRound(prisma);
  if (!round.fromDate || !round.toDate) return { synced: 0, official: false };
  const period = {
    from: new Date(round.fromDate),
    to: new Date(round.toDate),
  };
  if (round.official) {
    const r = await prisma.service.updateMany({
      where: {
        active: true,
        draft: false,
        date: { gte: period.from, lte: period.to },
        locked: false,
      },
      data: { locked: true },
    });
    return { synced: r.count, official: true };
  }
  const r = await prisma.service.updateMany({
    where: {
      active: true,
      date: { gte: period.from, lte: period.to },
      locked: true,
    },
    data: { locked: false },
  });
  return { synced: r.count, official: false };
}
