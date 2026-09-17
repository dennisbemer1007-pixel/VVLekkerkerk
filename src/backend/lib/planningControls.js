import prisma from './prisma.js';
import { addWeeks, endOfDay, startOfDay } from './dates.js';
import { occupancyStatus } from './dates.js';
import {
  executedCountForObligation,
  isMandatoryObligation,
  OBLIGATION_LABELS,
  personalEnrollmentCount,
  remainingObligation,
  isUnavailableOn,
} from './obligation.js';
import { skipReasonForPerson } from './autoFill.js';
import { blocksForPerson, overlappingMatchBlocks } from './matchBlocks.js';
import { periodFromRound } from './planningPeriod.js';

export async function buildPlanningControls(now = new Date()) {
  const roundPeriod = await periodFromRound(prisma, now);
  const w = {
    from: roundPeriod.from,
    to: roundPeriod.to,
    sixWeeksAgo: startOfDay(addWeeks(roundPeriod.from, -6)),
    twelveWeeksAgo: startOfDay(addWeeks(roundPeriod.from, -12)),
    yearStart: new Date(roundPeriod.from.getFullYear(), 0, 1),
  };

  const services = await prisma.service.findMany({
    where: {
      active: true,
      draft: false,
      date: { gte: w.from, lte: w.to },
    },
    include: {
      enrollments: true,
      assignedTeam: true,
    },
    orderBy: [{ date: 'asc' }, { time: 'asc' }],
  });

  const openServices = services
    .filter((s) => s.enrollments.length < s.required)
    .map((s) => ({
      id: s.id,
      date: s.date,
      time: s.time,
      type: s.type,
      kind: s.kind,
      required: s.required,
      enrolled: s.enrollments.length,
      open: Math.max(0, s.required - s.enrollments.length),
      assignedTeam: s.assignedTeam?.name ?? null,
      status: occupancyStatus(s.enrollments.length, s.required),
    }));

  const people = await prisma.person.findMany({
    where: { active: true },
    include: {
      team: true,
      teamMemberships: { where: { active: true } },
      enrollments: { include: { service: true } },
    },
    orderBy: { name: 'asc' },
  });

  const matches = await prisma.match.findMany({
    where: { date: { gte: startOfDay(addWeeks(w.from, -1)), lte: w.to } },
    include: { team: true },
  });

  const personalServices = services.filter((s) => s.kind !== 'TEAM');

  const unfilledObligations = [];
  const makeupDue = [];
  const assignmentGaps = [];

  for (const person of people) {
    const counts = {
      count6w: personalEnrollmentCount(person.enrollments, w.sixWeeksAgo, w.to),
      count12w: personalEnrollmentCount(person.enrollments, w.twelveWeeksAgo, w.to),
      countYear: personalEnrollmentCount(person.enrollments, w.yearStart, w.to),
    };
    const executed = executedCountForObligation(person, counts);
    const stillNeeded = remainingObligation(person, executed);
    const row = {
      id: person.id,
      name: person.name,
      obligation: person.obligation,
      obligationLabel: OBLIGATION_LABELS[person.obligation] || person.obligation,
      exempted: person.exempted,
      planned: executed,
      makeupDue: person.makeupDue ?? 0,
      stillNeeded,
      team: person.team?.name ?? null,
    };

    if ((person.makeupDue ?? 0) > 0) {
      makeupDue.push(row);
    }

    if (isMandatoryObligation(person.obligation) && stillNeeded > 0) {
      const blocks = blocksForPerson(person, matches);
      let hadOverlap = false;
      let hadEligible = false;
      if (!person.exempted) {
        for (const service of personalServices) {
          if (service.enrollments.some((e) => e.personId === person.id)) continue;
          if (isUnavailableOn(person, service.date)) continue;
          if (overlappingMatchBlocks(service, blocks).length) {
            hadOverlap = true;
            continue;
          }
          hadEligible = true;
          break;
        }
      }
      row.reason = skipReasonForPerson(person, stillNeeded, {
        hadOverlap,
        hadEligible,
        exempted: person.exempted,
      });
      unfilledObligations.push(row);
      if (row.reason && !person.exempted) assignmentGaps.push(row);
    }
  }

  const fullyStaffed = services.filter((s) => s.enrollments.length >= s.required).length;
  const enrolledPeople = new Set(
    services.flatMap((s) => s.enrollments.map((e) => e.personId)),
  );

  return {
    period: { from: w.from, to: w.to },
    summary: {
      serviceCount: services.length,
      fullyStaffed,
      openServiceCount: openServices.length,
      enrolledPersonCount: enrolledPeople.size,
      unfilledObligationCount: unfilledObligations.length,
      makeupDueCount: makeupDue.reduce((sum, p) => sum + (p.makeupDue || 0), 0),
      assignmentGapCount: assignmentGaps.length,
    },
    openServices,
    unfilledObligations,
    makeupDue,
    assignmentGaps,
  };
}
