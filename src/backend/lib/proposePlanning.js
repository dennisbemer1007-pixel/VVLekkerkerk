import { generateServicesFromRules } from './serviceGeneration.js';
import prisma from './prisma.js';
import { addWeeks, endOfDay } from './dates.js';
import { periodFromRound, resolvePlanningPeriod } from './planningPeriod.js';

/**
 * Maak/bijwerken van diensten op basis van configureerbare dienstregels,
 * wedstrijden en activiteiten. Overschrijft geen vastgezette of handmatige diensten.
 */
export async function syncServicesFromHomeMatches(options = {}) {
  return generateServicesFromRules(options);
}

export async function trySyncPlanningFromMatches(options) {
  try {
    return await generateServicesFromRules(options);
  } catch (err) {
    console.error('[planning] sync from rules failed:', err);
    return {
      created: 0,
      skipped: 0,
      updated: 0,
      removed: 0,
      slots: 0,
      services: [],
      error: err.message,
    };
  }
}

export async function proposeFromMatches(options = {}) {
  return generateServicesFromRules(options);
}

export async function publishDraftServices({ volunteerDeadline, from, to, weeks } = {}) {
  const period = from || to
    ? resolvePlanningPeriod({ from, to, weeks })
    : await periodFromRound(prisma);

  const result = await prisma.service.updateMany({
    where: {
      draft: true,
      active: true,
      date: { gte: period.from, lte: period.to },
    },
    data: { draft: false },
  });

  const deadline = volunteerDeadline
    ? endOfDay(new Date(volunteerDeadline))
    : endOfDay(addWeeks(period.from, 1));

  if (Number.isNaN(deadline.getTime())) {
    const err = new Error('Ongeldige deadline-datum. Kies een geldige datum of laat het veld leeg.');
    err.status = 400;
    throw err;
  }

  await prisma.planningRound.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      fromDate: period.from,
      toDate: period.to,
      status: 'VOLUNTEER_OPEN',
      volunteerDeadline: deadline,
      publishedAt: new Date(),
    },
    update: {
      fromDate: period.from,
      toDate: period.to,
      status: 'VOLUNTEER_OPEN',
      volunteerDeadline: deadline,
      publishedAt: new Date(),
    },
  });

  return { published: result.count, volunteerDeadline: deadline, period };
}
