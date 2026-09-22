import prisma from './prisma.js';
import { addWeeks, startOfDay } from './dates.js';
import {
  executedCountForObligation,
  isUnavailableOn,
  OBLIGATIONS,
  personalEnrollmentCount,
  remainingObligation,
} from './obligation.js';
import { blocksForPerson, overlappingMatchBlocks, serviceOutsideMatchBlocks } from './matchBlocks.js';
import { writeAudit } from './audit.js';
import { trySendScheduledConfirmation } from './mail.js';
import { compareFillCandidates, lastPersonalAt } from './plannerOrder.js';
import { periodFromRound, resolvePlanningPeriod } from './planningPeriod.js';
import { friendlyEnrollmentReason, serviceCapacity } from './teamDutyPlanning.js';
import { serviceInclude } from './serviceHelpers.js';

function countsForPerson(person, windows) {
  return {
    count6w: personalEnrollmentCount(person.enrollments, windows.sixWeeksAgo, windows.to),
    count12w: personalEnrollmentCount(person.enrollments, windows.twelveWeeksAgo, windows.to),
    countYear: personalEnrollmentCount(person.enrollments, windows.yearStart, windows.to),
  };
}

export function skipReasonForPerson(person, remaining, { hadOverlap, hadEligible, exempted }) {
  if (exempted || person.exempted) return 'Persoon is vrijgesteld.';
  if (remaining <= 0) return null;
  if (!hadEligible && hadOverlap) {
    return 'Geen geschikt moment beschikbaar vanwege wedstrijdblokkades.';
  }
  if (!hadEligible) {
    return 'Geen beschikbare dienst gevonden binnen de betreffende periode.';
  }
  return 'Geen geschikt moment beschikbaar.';
}

export function autoReason(person, isMakeup) {
  return friendlyEnrollmentReason('AUTO', {
    makeup: isMakeup,
    obligation: person.obligation,
  });
}

export async function fillMandatoryPersonal({ actorId = null, from, to, weeks } = {}) {
  const period = from || to
    ? resolvePlanningPeriod({ from, to, weeks })
    : await periodFromRound(prisma);
  from = period.from;
  to = period.to;
  const windows = {
    from,
    to,
    sixWeeksAgo: startOfDay(addWeeks(from, -6)),
    twelveWeeksAgo: startOfDay(addWeeks(from, -12)),
    yearStart: new Date(from.getFullYear(), 0, 1),
  };

  const services = await prisma.service.findMany({
    where: {
      active: true,
      draft: false,
      date: { gte: from, lte: to },
    },
    include: serviceInclude,
    orderBy: [{ date: 'asc' }, { time: 'asc' }],
  });

  const mandatory = await prisma.person.findMany({
    where: {
      active: true,
      obligation: { in: [OBLIGATIONS.FULL, OBLIGATIONS.VR18] },
    },
    include: {
      team: true,
      teamMemberships: { where: { active: true } },
      enrollments: { include: { service: true } },
    },
  });

  const matches = await prisma.match.findMany({
    where: { date: { gte: startOfDay(addWeeks(from, -1)), lte: to } },
    include: { team: true },
  });

  const state = mandatory.map((person) => {
    const counts = countsForPerson(person, windows);
    const executed = executedCountForObligation(person, counts);
    return {
      person,
      counts,
      remaining: remainingObligation(person, executed),
      blocks: blocksForPerson(person, matches),
      lastPersonalAt: lastPersonalAt(person.enrollments),
      hadOverlap: false,
      hadEligible: false,
    };
  });

  const enrolledToday = new Set();
  let filled = 0;
  const details = [];

  for (const service of services) {
    let open = serviceCapacity(service).personalOpen;
    if (open <= 0) continue;
    const already = new Set(service.enrollments.map((e) => e.personId));
    const dayIso = startOfDay(service.date).toISOString();

    const eligible = [];
    for (const row of state) {
      const { person } = row;
      if (person.exempted) continue;
      if (row.remaining <= 0) continue;
      if (already.has(person.id) || enrolledToday.has(`${person.id}:${dayIso}`)) continue;
      if (isUnavailableOn(person, service.date)) continue;
      const overlap = overlappingMatchBlocks(service, row.blocks);
      if (overlap.length) {
        row.hadOverlap = true;
        continue;
      }
      if (!serviceOutsideMatchBlocks(service, row.blocks)) {
        row.hadOverlap = true;
        continue;
      }
      row.hadEligible = true;
      eligible.push(row);
    }

    eligible.sort((a, b) => compareFillCandidates(a, b, service));

    for (const row of eligible) {
      if (open <= 0) break;
      const isMakeup = (row.person.makeupDue ?? 0) > 0;
      const reason = autoReason(row.person, isMakeup);
      await prisma.enrollment.create({
        data: {
          serviceId: service.id,
          personId: row.person.id,
          source: 'AUTO',
          kind: 'PERSONAL',
          reason,
          makeup: isMakeup,
        },
      });
      trySendScheduledConfirmation({ person: row.person, service }).catch(() => {});
      service.enrollments.push({ personId: row.person.id, kind: 'PERSONAL', noShow: false });
      if (isMakeup) {
        row.person.makeupDue = Math.max(0, (row.person.makeupDue ?? 0) - 1);
        await prisma.person.update({
          where: { id: row.person.id },
          data: { makeupDue: row.person.makeupDue },
        });
      }
      row.counts.count6w += 1;
      row.counts.count12w += 1;
      row.counts.countYear += 1;
      row.lastPersonalAt = new Date(service.date);
      const executed = executedCountForObligation(row.person, row.counts);
      row.remaining = remainingObligation(row.person, executed);
      enrolledToday.add(`${row.person.id}:${dayIso}`);
      already.add(row.person.id);
      open -= 1;
      filled += 1;
      details.push({
        serviceId: service.id,
        personId: row.person.id,
        personName: row.person.name,
        obligation: row.person.obligation,
        reason,
        makeup: isMakeup,
      });
    }
  }

  const unfilled = state
    .filter((row) => remainingObligation(row.person, executedCountForObligation(row.person, row.counts)) > 0)
    .map((row) => {
      const executed = executedCountForObligation(row.person, row.counts);
      const stillNeeded = remainingObligation(row.person, executed);
      return {
        id: row.person.id,
        name: row.person.name,
        obligation: row.person.obligation,
        exempted: row.person.exempted,
        planned: executed,
        makeupDue: row.person.makeupDue ?? 0,
        stillNeeded,
        reason: skipReasonForPerson(row.person, stillNeeded, row),
      };
    });

  await prisma.planningRound.upsert({
    where: { id: 1 },
    create: { id: 1, status: 'CLOSED' },
    update: { status: 'CLOSED' },
  });

  await writeAudit({
    actorId,
    action: 'planning.auto_fill',
    entity: 'PlanningRound',
    entityId: 1,
    detail: `${filled} automatisch ingepland, ${unfilled.length} verplichting(en) open`,
  });

  return { filled, details, unfilled, period: { from, to } };
}
