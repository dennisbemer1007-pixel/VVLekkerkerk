import prisma from './prisma.js';
import { addWeeks, endOfDay, startOfDay, toIsoDate } from './dates.js';
import { mapService, serviceInclude, serviceLocation } from './serviceHelpers.js';
import { parseTimeStartMinutes } from './time.js';
import {
  groupHomeMatchesByKickoff,
  planningNoteForGroup,
} from './matchPlanning.js';

function existingKey(date, type, startMinutes) {
  return `${toIsoDate(startOfDay(date))}|${type}|${startMinutes}`;
}

async function loadExistingKeys(from) {
  const services = await prisma.service.findMany({
    where: { active: true, date: { gte: from } },
    select: { date: true, type: true, time: true },
  });
  const keys = new Set();
  for (const s of services) {
    const start = parseTimeStartMinutes(s.time);
    if (start == null) continue;
    keys.add(existingKey(s.date, s.type, start));
  }
  return keys;
}

/**
 * Maak ontbrekende bardiensten voor toekomstige thuiswedstrijden.
 * Zelfde aftrap op dezelfde dag → één bardienst (3 uur, 2 personen).
 */
export async function syncServicesFromHomeMatches({ required = 2 } = {}) {
  const from = startOfDay(new Date());
  const matches = await prisma.match.findMany({
    where: { home: true, date: { gte: from } },
    include: { team: true },
    orderBy: { date: 'asc' },
  });

  const groups = groupHomeMatchesByKickoff(matches);
  const existing = await loadExistingKeys(from);
  const created = [];
  let skipped = 0;
  const needed = Math.max(1, Number(required) || 2);

  await prisma.service.updateMany({
    where: {
      active: true,
      type: 'KITCHEN',
      matchId: { not: null },
      date: { gte: from },
    },
    data: { active: false },
  });

  await prisma.service.updateMany({
    where: {
      active: true,
      type: 'BAR',
      matchId: { not: null },
      date: { gte: from },
    },
    data: { required: needed },
  });

  for (const group of groups) {
    const key = existingKey(group.date, 'BAR', group.window.startMinutes);
    if (existing.has(key)) {
      skipped += 1;
      continue;
    }

    const service = await prisma.service.create({
      data: {
        type: 'BAR',
        date: group.date,
        time: group.window.time,
        slot: group.window.slot,
        required: needed,
        location: serviceLocation('BAR'),
        draft: false,
        active: true,
        matchId: group.matches[0]?.id ?? null,
        note: planningNoteForGroup(group),
      },
      include: serviceInclude,
    });

    existing.add(key);
    created.push(mapService(service));
  }

  const to = groups.length
    ? endOfDay(groups[groups.length - 1].date)
    : endOfDay(addWeeks(from, 6));

  const existingRound = await prisma.planningRound.findUnique({ where: { id: 1 } });
  const preserveStatus = existingRound?.status && existingRound.status !== 'DRAFT';

  await prisma.planningRound.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      fromDate: from,
      toDate: to,
      status: 'DRAFT',
    },
    update: {
      fromDate: from,
      toDate: to,
      ...(preserveStatus ? {} : { status: existingRound?.status || 'DRAFT' }),
    },
  });

  return {
    created: created.length,
    skipped,
    slots: groups.length,
    services: created,
    period: { from, to },
  };
}

export async function trySyncPlanningFromMatches(options) {
  try {
    return await syncServicesFromHomeMatches(options);
  } catch (err) {
    console.error('[planning] sync from matches failed:', err);
    return { created: 0, skipped: 0, slots: 0, services: [], error: err.message };
  }
}

/** Alias: Beheer / Update-knop */
export async function proposeFromMatches(options = {}) {
  return syncServicesFromHomeMatches(options);
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
    },
    update: {
      fromDate: from,
      toDate: to,
      status: 'VOLUNTEER_OPEN',
      volunteerDeadline: deadline,
    },
  });

  return { published: result.count, volunteerDeadline: deadline };
}
