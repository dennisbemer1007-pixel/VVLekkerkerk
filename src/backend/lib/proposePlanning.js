import { generateServicesFromRules } from './serviceGeneration.js';
import prisma from './prisma.js';
import { addWeeks, endOfDay, startOfDay } from './dates.js';

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

export async function publishDraftServices({ volunteerDeadline, weeks = 6 } = {}) {
  const from = startOfDay(new Date());
  const to = endOfDay(addWeeks(from, weeks));

  const result = await prisma.service.updateMany({
    where: {
      draft: true,
      active: true,
      date: { gte: from, lte: to },
    },
    data: { draft: false },
  });

  const deadline = volunteerDeadline
    ? endOfDay(new Date(volunteerDeadline))
    : endOfDay(addWeeks(from, 1));

  await prisma.planningRound.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      fromDate: from,
      toDate: to,
      status: 'VOLUNTEER_OPEN',
      volunteerDeadline: deadline,
      publishedAt: new Date(),
    },
    update: {
      fromDate: from,
      toDate: to,
      status: 'VOLUNTEER_OPEN',
      volunteerDeadline: deadline,
      publishedAt: new Date(),
    },
  });

  return { published: result.count, volunteerDeadline: deadline };
}
