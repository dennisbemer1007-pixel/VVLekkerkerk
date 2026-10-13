import fs from 'fs';
import path from 'path';
import { endOfDay, parseCalendarDate, startOfDay, toIsoDate } from './dates.js';
import { resolvePlanningPeriod } from './planningPeriod.js';

/** Eenmalige opruiming na bug: jaarplanning die per ongeluk een weekplanning syncte. */
export const ACTIVITY_PLANNING_SYNC_REPAIR_ID = 'activity-planning-sync-2026-10-13';

export function repairMarkerPath(stateDir) {
  return path.join(stateDir, `repaired-${ACTIVITY_PLANNING_SYNC_REPAIR_ID}.json`);
}

export function isDraftUnpublishedRound(round) {
  return Boolean(
    round &&
      round.status === 'DRAFT' &&
      !round.publishedAt &&
      !round.official &&
      round.fromDate &&
      round.toDate,
  );
}

/**
 * Herkent de typische week die ontstond door activiteit-opslaan:
 * één kalenderweek ma–zo (7 dagen) die minstens één activiteitsdatum bevat.
 */
export function looksLikeActivitySyncWeek(round, activityDates = []) {
  if (!isDraftUnpublishedRound(round)) return false;
  let period;
  try {
    period = resolvePlanningPeriod({ from: round.fromDate, to: round.toDate });
  } catch {
    return false;
  }
  if (period.days !== 7) return false;
  const fromNoon = parseCalendarDate(round.fromDate);
  if (!fromNoon || fromNoon.getUTCDay() !== 1) return false;
  const dates = (activityDates || [])
    .map((d) => parseCalendarDate(d))
    .filter((d) => d && !Number.isNaN(d.getTime()));
  if (!dates.length) return false;
  const fromMs = period.from.getTime();
  const toMs = period.to.getTime();
  return dates.some((d) => {
    const t = startOfDay(d).getTime();
    return t >= fromMs && t <= toMs;
  });
}

export function shouldRemoveAutoEnrollment(enrollment) {
  return String(enrollment?.source || '') === 'AUTO';
}

/**
 * Ruimt concept-weekplanningen op die door jaarplanning-sync zijn ontstaan.
 * - Verwijdert alleen AUTO-inschrijvingen en daarna lege AUTO-diensten
 * - Laat MANUAL-diensten (o.a. bardienst bij activiteit) en handmatige inschrijvingen staan
 * - Wist from/to van die concept-rondes zodat Planning geen spookperiode toont
 * Eenmalig via markerbestand in stateDir.
 */
export async function repairAccidentalActivityPlanningSync(prisma, { stateDir, force = false } = {}) {
  if (!stateDir) {
    throw new Error('stateDir is verplicht voor eenmalige activity-planning repair');
  }
  const marker = repairMarkerPath(stateDir);
  if (!force && fs.existsSync(marker)) {
    return { already: true, marker };
  }

  const [rounds, activities] = await Promise.all([
    prisma.planningRound.findMany(),
    prisma.activity.findMany({ select: { id: true, date: true, name: true } }),
  ]);
  const activityDates = activities.map((a) => a.date);
  const targets = rounds.filter((round) => looksLikeActivitySyncWeek(round, activityDates));

  let removedEnrollments = 0;
  let removedServices = 0;
  let clearedRounds = 0;
  const details = [];

  for (const round of targets) {
    const from = startOfDay(parseCalendarDate(round.fromDate));
    const to = endOfDay(parseCalendarDate(round.toDate));
    const services = await prisma.service.findMany({
      where: {
        origin: 'AUTO',
        date: { gte: from, lte: to },
      },
      include: { enrollments: true },
    });

    let roundEnrollments = 0;
    let roundServices = 0;
    for (const service of services) {
      const autoRows = (service.enrollments || []).filter(shouldRemoveAutoEnrollment);
      for (const row of autoRows) {
        await prisma.enrollment.delete({ where: { id: row.id } });
        roundEnrollments += 1;
      }
      const left = await prisma.enrollment.count({ where: { serviceId: service.id } });
      if (left === 0) {
        await prisma.serviceTeamDuty.deleteMany({ where: { serviceId: service.id } });
        await prisma.service.delete({ where: { id: service.id } });
        roundServices += 1;
      }
    }

    await prisma.planningRound.update({
      where: { id: round.id },
      data: { fromDate: null, toDate: null },
    });
    clearedRounds += 1;
    removedEnrollments += roundEnrollments;
    removedServices += roundServices;
    details.push({
      roundId: round.id,
      label: round.label || 'Planning',
      from: toIsoDate(from),
      to: toIsoDate(to),
      removedEnrollments: roundEnrollments,
      removedServices: roundServices,
    });
  }

  const result = {
    repairId: ACTIVITY_PLANNING_SYNC_REPAIR_ID,
    at: new Date().toISOString(),
    clearedRounds,
    removedEnrollments,
    removedServices,
    details,
    activityCount: activities.length,
  };
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(marker, JSON.stringify(result, null, 2));
  return result;
}
