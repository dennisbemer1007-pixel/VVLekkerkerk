import prisma from './prisma.js';
import { addWeeks, endOfDay, startOfDay } from './dates.js';
import { mapService, serviceInclude, serviceLocation } from './serviceHelpers.js';
import {
  barSlotKey,
  barSlotKeyFromService,
  groupHomeMatchesByKickoff,
  pickServicesMatchingHomeMatches,
  planningNoteForGroup,
} from './matchPlanning.js';

/**
 * Maak ontbrekende bardiensten voor toekomstige thuiswedstrijden
 * en verwijder diensten die niet bij een thuis-aftrap horen.
 */
export async function syncServicesFromHomeMatches({ required = 2 } = {}) {
  const from = startOfDay(new Date());
  const matches = await prisma.match.findMany({
    where: { home: true, date: { gte: from } },
    include: { team: true },
    orderBy: { date: 'asc' },
  });

  const groups = groupHomeMatchesByKickoff(matches);
  const needed = Math.max(1, Number(required) || 2);

  const kitchenGone = await prisma.service.deleteMany({ where: { type: 'KITCHEN' } });

  const futureServices = await prisma.service.findMany({
    where: { date: { gte: from } },
    select: { id: true, type: true, date: true, time: true, matchId: true },
  });

  const { keep, remove } = pickServicesMatchingHomeMatches(futureServices, groups);

  if (remove.length) {
    await prisma.service.deleteMany({
      where: { id: { in: remove.map((s) => s.id) } },
    });
  }

  const keepByKey = new Map();
  for (const service of keep) {
    const key = barSlotKeyFromService(service);
    if (key) keepByKey.set(key, service);
  }

  const created = [];
  let skipped = 0;
  let updated = 0;

  for (const group of groups) {
    const key = barSlotKey(group.date, group.window.startMinutes);
    const existingSvc = keepByKey.get(key) || null;

    const payload = {
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
    };

    if (existingSvc) {
      skipped += 1;
      await prisma.service.update({
        where: { id: existingSvc.id },
        data: payload,
      });
      updated += 1;
      continue;
    }

    const service = await prisma.service.create({
      data: payload,
      include: serviceInclude,
    });
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
    updated,
    removed: remove.length + kitchenGone.count,
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
