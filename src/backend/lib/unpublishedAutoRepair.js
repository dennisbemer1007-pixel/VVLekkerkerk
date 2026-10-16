import fs from 'fs';
import path from 'path';
import { endOfDay, parseCalendarDate, startOfDay, toIsoDate } from './dates.js';
import { isRoundPublishedForVolunteers } from './planningPeriod.js';

/** Eenmalig: AUTO-diensten die zichtbaar waren zonder gepubliceerde planning verbergen/opruimen. */
export const UNPUBLISHED_AUTO_REPAIR_ID = 'unpublished-auto-services-2026-10-13';

/**
 * Tweede pass: na #56 konden startup-sync + status≠DRAFT opnieuw draft=false AUTO
 * aanmaken. Zet die terug naar concept (geen delete — veiligere herhaalbare fix).
 */
export const UNPUBLISHED_AUTO_DRAFT_REPAIR_ID = 'unpublished-auto-draft-flag-2026-10-13';
export function unpublishedAutoRepairMarkerPath(stateDir) {
  return path.join(stateDir, `repaired-${UNPUBLISHED_AUTO_REPAIR_ID}.json`);
}

export function isInsidePublishedPeriod(date, publishedPeriods) {
  const t = startOfDay(parseCalendarDate(date) || date).getTime();
  if (Number.isNaN(t)) return false;
  return (publishedPeriods || []).some((period) => t >= period.from.getTime() && t <= period.to.getTime());
}

/**
 * AUTO-dienst die vrijwilligers niet mogen zien zonder publicatie:
 * geen open jaarplanning-activiteit, niet in een gepubliceerde periode.
 */
export function shouldHideUnpublishedAutoService(service, publishedPeriods) {
  if (!service || service.origin !== 'AUTO') return false;
  if (service.active === false) return false;
  if (service.activity?.openForEnrollment === true) return false;
  // Nooit concept zetten binnen een gepubliceerde periode.
  if (isInsidePublishedPeriod(service.date, publishedPeriods)) return false;
  if ((publishedPeriods || []).length === 0) {
    // Zonder enige publicatie: verberg toekomstige AUTO (oude #56/#57-gedrag).
    return true;
  }
  return true;
}

export function hasProtectedEnrollment(enrollments) {
  return (enrollments || []).some((row) => {
    const source = String(row.source || '');
    return source === 'SELF' || source === 'ADMIN' || source === 'TEAM';
  });
}

/**
 * Ruimt of verbergt AUTO-diensten buiten gepubliceerde planningen.
 * - Geen beschermde inschrijvingen → dienst verwijderen (na wissen AUTO-inschrijvingen)
 * - Wel SELF/ADMIN/TEAM → alleen draft=true (blijft in Mijn diensten via filter mine)
 */
export async function repairUnpublishedAutoServices(prisma, { stateDir, force = false, now = new Date() } = {}) {
  if (!stateDir) throw new Error('stateDir is verplicht voor unpublished-auto repair');
  const marker = unpublishedAutoRepairMarkerPath(stateDir);
  if (!force && fs.existsSync(marker)) {
    return { already: true, marker };
  }

  const rounds = await prisma.planningRound.findMany({
    where: { publishedAt: { not: null }, fromDate: { not: null }, toDate: { not: null } },
  });
  const publishedPeriods = rounds.filter(isRoundPublishedForVolunteers).map((round) => ({
    from: startOfDay(parseCalendarDate(round.fromDate)),
    to: endOfDay(parseCalendarDate(round.toDate)),
  }));

  const today = startOfDay(now);
  const services = await prisma.service.findMany({
    where: {
      origin: 'AUTO',
      active: true,
      date: { gte: today },
    },
    include: {
      enrollments: true,
      activity: { select: { id: true, openForEnrollment: true } },
    },
  });

  let removedEnrollments = 0;
  let removedServices = 0;
  let draftedServices = 0;
  const details = [];

  for (const service of services) {
    if (!shouldHideUnpublishedAutoService(service, publishedPeriods)) continue;

    if (hasProtectedEnrollment(service.enrollments)) {
      if (!service.draft) {
        await prisma.service.update({ where: { id: service.id }, data: { draft: true } });
        draftedServices += 1;
        details.push({ id: service.id, action: 'draft', date: toIsoDate(service.date), type: service.type });
      }
      continue;
    }

    for (const row of service.enrollments || []) {
      await prisma.enrollment.delete({ where: { id: row.id } });
      removedEnrollments += 1;
    }
    await prisma.serviceTeamDuty.deleteMany({ where: { serviceId: service.id } });
    await prisma.service.delete({ where: { id: service.id } });
    removedServices += 1;
    details.push({ id: service.id, action: 'deleted', date: toIsoDate(service.date), type: service.type });
  }

  const result = {
    repairId: UNPUBLISHED_AUTO_REPAIR_ID,
    at: new Date().toISOString(),
    publishedPeriods: publishedPeriods.length,
    removedEnrollments,
    removedServices,
    draftedServices,
    details,
  };
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(marker, JSON.stringify(result, null, 2));
  return result;
}

export function unpublishedAutoDraftRepairMarkerPath(stateDir) {
  return path.join(stateDir, `repaired-${UNPUBLISHED_AUTO_DRAFT_REPAIR_ID}.json`);
}

/**
 * Zet actieve AUTO-diensten buiten gepubliceerde planningen op draft=true.
 * Geen deletes — bedoeld als herstel nadat sync ze opnieuw “open” zette.
 */
export async function repairUnpublishedAutoDraftFlags(prisma, { stateDir, force = false, now = new Date() } = {}) {
  if (!stateDir) throw new Error('stateDir is verplicht voor unpublished-auto draft repair');
  const marker = unpublishedAutoDraftRepairMarkerPath(stateDir);
  if (!force && fs.existsSync(marker)) {
    return { already: true, marker };
  }

  const rounds = await prisma.planningRound.findMany({
    where: { publishedAt: { not: null }, fromDate: { not: null }, toDate: { not: null } },
  });
  const publishedPeriods = rounds.filter(isRoundPublishedForVolunteers).map((round) => ({
    from: startOfDay(parseCalendarDate(round.fromDate)),
    to: endOfDay(parseCalendarDate(round.toDate)),
  }));

  const today = startOfDay(now);
  const services = await prisma.service.findMany({
    where: {
      origin: 'AUTO',
      active: true,
      draft: false,
      date: { gte: today },
    },
    include: {
      activity: { select: { id: true, openForEnrollment: true } },
    },
  });

  let draftedServices = 0;
  const details = [];
  for (const service of services) {
    if (!shouldHideUnpublishedAutoService(service, publishedPeriods)) continue;
    await prisma.service.update({ where: { id: service.id }, data: { draft: true } });
    draftedServices += 1;
    details.push({ id: service.id, action: 'draft', date: toIsoDate(service.date), type: service.type });
  }

  const result = {
    repairId: UNPUBLISHED_AUTO_DRAFT_REPAIR_ID,
    at: new Date().toISOString(),
    publishedPeriods: publishedPeriods.length,
    draftedServices,
    details,
  };
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(marker, JSON.stringify(result, null, 2));
  return result;
}
