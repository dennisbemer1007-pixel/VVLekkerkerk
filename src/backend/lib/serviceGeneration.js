import prisma from './prisma.js';
import { mapService, serviceInclude, serviceLocation } from './serviceHelpers.js';
import { ensureClubDefaults } from './clubDefaults.js';
import {
  datesInRange,
  evaluateRule,
  sameCalendarDay,
  serviceKey,
  startTimeFromService,
} from './serviceRuleLogic.js';
import { startOfDay, toIsoDate } from './dates.js';
import { periodFromRound, resolvePlanningPeriod } from './planningPeriod.js';
import { getActiveRound } from './planningRounds.js';
import {
  eligibleTeamDutyCandidates,
  keepTeamIdFromExisting,
  kindForAssignments,
  pickTeamDutyAssignment,
  recordTeamDutyStand,
  requiredForTeamDuties,
  shouldAttachTeamDutiesToLocked,
  standsFromDutyRows,
} from './teamDutyPlanning.js';
import { blockedByMorningBarOrKitchenOnly } from './dutyRestrictions.js';
import { deactivateDuplicateServices, deactivateOrphanAutoServices } from './serviceDedup.js';
import { getClubSettings, seasonRangeFromLabel } from './season.js';

const FIXED_PERSON_REASON = 'Vaste persoon volgens dienstregel';

export async function ensureFixedPersonEnrollment(serviceId, rule) {
  const personId = rule?.fixedPersonId ? Number(rule.fixedPersonId) : null;
  if (!personId || !serviceId) return { enrolled: false, reason: 'no-fixed-person' };

  const [service, person] = await Promise.all([
    prisma.service.findUnique({
      where: { id: serviceId },
      include: { enrollments: true },
    }),
    prisma.person.findUnique({
      where: { id: personId },
      include: {
        team: true,
        teamMemberships: { where: { active: true }, include: { team: true } },
      },
    }),
  ]);
  if (!service?.active || service.draft) return { enrolled: false, reason: 'inactive-service' };
  if (!person?.active) return { enrolled: false, reason: 'inactive-person' };
  if (service.enrollments.some((e) => e.personId === personId && !e.noShow)) {
    return { enrolled: false, reason: 'already' };
  }
  if (blockedByMorningBarOrKitchenOnly(person, service)) {
    return { enrolled: false, reason: 'morning-bar-kitchen-only' };
  }

  if (service.enrollments.length >= service.required) {
    await prisma.service.update({
      where: { id: serviceId },
      data: { required: service.enrollments.length + 1 },
    });
  }

  await prisma.enrollment.create({
    data: {
      serviceId,
      personId,
      source: 'AUTO',
      kind: 'PERSONAL',
      reason: FIXED_PERSON_REASON,
    },
  });
  return { enrolled: true };
}

function buildNote(rule, evaluation, assignments) {
  const bits = [rule.name];
  if (evaluation.activities?.[0]) bits.push(evaluation.activities[0].name);
  if (assignments?.length) {
    const names = assignments.map((a) => `${a.team.name} (${a.reserved})`);
    bits.push(`Teamdienst: ${names.join(', ')}`);
  }
  return bits.filter(Boolean).join(' · ');
}

function pickExistingTarget(list) {
  const keepable = list.find((s) => s.origin === 'MANUAL' || s.locked || s.enrollments?.length);
  const auto = list.find((s) => s.origin === 'AUTO') || list.find((s) => s.origin !== 'MANUAL') || list[0];
  return keepable || auto || null;
}

async function syncTeamDuties(serviceId, assignments) {
  const wanted = new Map((assignments || []).map((a) => [a.team.id, a.reserved]));
  const existing = await prisma.serviceTeamDuty.findMany({ where: { serviceId } });
  for (const row of existing) {
    if (!wanted.has(row.teamId)) {
      const used = await prisma.enrollment.count({
        where: { serviceId, kind: 'TEAM', forTeamId: row.teamId },
      });
      if (used === 0) {
        await prisma.serviceTeamDuty.delete({ where: { id: row.id } });
      }
      continue;
    }
    const reserved = Math.max(wanted.get(row.teamId), 1);
    if (row.reserved !== reserved) {
      await prisma.serviceTeamDuty.update({
        where: { id: row.id },
        data: { reserved },
      });
    }
    wanted.delete(row.teamId);
  }
  for (const [teamId, reserved] of wanted) {
    await prisma.serviceTeamDuty.create({
      data: { serviceId, teamId, reserved },
    });
  }
}

async function loadSeasonTeamDutyStands({ seasonFrom, seasonTo, excludeServiceIds }) {
  const duties = await prisma.serviceTeamDuty.findMany({
    where: {
      service: {
        type: 'BAR',
        active: true,
        date: { gte: seasonFrom, lte: seasonTo },
        ...(excludeServiceIds.length ? { id: { notIn: excludeServiceIds } } : {}),
      },
    },
    select: { teamId: true, service: { select: { date: true } } },
  });
  return standsFromDutyRows(duties);
}

export async function generateServicesFromRules({ from, to, weeks } = {}) {
  await ensureClubDefaults();
  await deactivateDuplicateServices(prisma);
  await deactivateOrphanAutoServices(prisma);

  const period = from || to || weeks
    ? resolvePlanningPeriod({ from, to, weeks })
    : await periodFromRound(prisma);
  const start = period.from;
  const end = period.to;

  const [rules, matches, activities, teams, existing, settings] = await Promise.all([
    prisma.serviceRule.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      include: { fixedPerson: true },
    }),
    prisma.match.findMany({
      where: { date: { gte: start, lte: end } },
      include: { team: true },
    }),
    prisma.activity.findMany({
      where: { date: { gte: start, lte: end } },
    }),
    prisma.team.findMany(),
    prisma.service.findMany({
      where: { date: { gte: start, lte: end } },
      include: {
        enrollments: { select: { id: true, kind: true, forTeamId: true, noShow: true } },
        teamDuties: true,
      },
    }),
    getClubSettings(),
  ]);

  const existingByKey = new Map();
  for (const service of existing) {
    const key = serviceKey(service.date, service.type, startTimeFromService(service));
    if (!existingByKey.has(key)) existingByKey.set(key, []);
    existingByKey.get(key).push(service);
  }

  const needed = new Map();
  for (const date of datesInRange(start, end)) {
    const weekday = date.getDay();
    const homeMatches = matches.filter((m) => m.home !== false && sameCalendarDay(m.date, date));
    const dayActivities = activities.filter((a) => sameCalendarDay(a.date, date));
    for (const rule of rules) {
      const evaluation = evaluateRule(rule, {
        date,
        weekday,
        homeMatches,
        activities: dayActivities,
        teams,
      });
      if (!evaluation.ok) continue;
      const key = serviceKey(date, rule.type, rule.startTime);
      if (needed.has(key)) continue;
      needed.set(key, {
        key,
        date,
        rule,
        evaluation,
        homeMatches,
        candidates: eligibleTeamDutyCandidates(rule, homeMatches),
        type: rule.type,
        time: `${rule.startTime} - ${rule.endTime}`,
        slot: rule.slot || null,
        sourceRuleId: rule.id,
        origin: 'AUTO',
        activityId: evaluation.activities?.[0]?.id ?? null,
        location: serviceLocation(rule.type),
      });
    }
  }

  const excludeServiceIds = [];
  for (const spec of needed.values()) {
    for (const service of existingByKey.get(spec.key) || []) {
      if (service.origin === 'MANUAL' || service.locked) continue;
      excludeServiceIds.push(service.id);
    }
  }

  const season = seasonRangeFromLabel(settings.seasonLabel, settings.seasonStartMonth);
  const seasonTo = end > season.to ? end : season.to;
  const fairness = await loadSeasonTeamDutyStands({
    seasonFrom: season.from,
    seasonTo,
    excludeServiceIds,
  });

  // Middag vóór avond, zodat we middag+avond aan hetzelfde team kunnen koppelen.
  const roleOrder = { MORNING: 0, SECOND: 1, LAST: 2 };
  const specsOrdered = [...needed.values()].sort(
    (a, b) =>
      (roleOrder[a.rule.teamDutySlotRole] ?? 9) - (roleOrder[b.rule.teamDutySlotRole] ?? 9) ||
      String(a.key).localeCompare(String(b.key)),
  );
  const afternoonTeamByDate = new Map();

  for (const spec of specsOrdered) {
    const target = pickExistingTarget(existingByKey.get(spec.key) || []);
    const keepTeamId = keepTeamIdFromExisting(target, spec.candidates);
    const dateKey = toIsoDate(spec.date);
    const preferTeamId =
      spec.rule.teamDutySlotRole === 'LAST' ? afternoonTeamByDate.get(dateKey) || null : null;
    const assignments = pickTeamDutyAssignment(spec.rule, spec.candidates, {
      counts: fairness.counts,
      lastAt: fairness.lastAt,
      keepTeamId,
      preferTeamId,
    });
    const required = requiredForTeamDuties(spec.rule.required, spec.rule.teamDutySlotRole, assignments);
    spec.assignments = assignments;
    spec.required = required;
    spec.kind = kindForAssignments(required, assignments);
    spec.assignedTeamId = assignments[0]?.team?.id ?? null;
    spec.matchId = (assignments[0]?.match || spec.evaluation.matches?.[0] || spec.homeMatches[0])?.id ?? null;
    spec.note = buildNote(spec.rule, spec.evaluation, assignments);
    if (assignments[0]?.team) {
      recordTeamDutyStand(
        fairness,
        assignments[0].team.id,
        spec.date,
        assignments[0].reserved,
      );
      if (spec.rule.teamDutySlotRole === 'SECOND') {
        afternoonTeamByDate.set(dateKey, assignments[0].team.id);
      }
    }
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let fixedEnrolled = 0;
  const createdServices = [];

  for (const spec of needed.values()) {
    const list = existingByKey.get(spec.key) || [];
    const target = pickExistingTarget(list);

    const enrolled = target?.enrollments?.length || 0;
    const payload = {
      type: spec.type,
      date: spec.date,
      time: spec.time,
      required: Math.max(spec.required, enrolled),
      slot: spec.slot,
      kind: spec.kind,
      assignedTeamId: spec.assignedTeamId,
      sourceRuleId: spec.sourceRuleId,
      activityId: spec.activityId,
      matchId: spec.matchId,
      note: spec.note,
      location: spec.location,
      active: true,
    };

    let serviceId = null;

    if (target) {
      if (target.origin === 'MANUAL') {
        skipped += 1;
        continue;
      }
      if (target.locked) {
        if (shouldAttachTeamDutiesToLocked(target, spec.assignments)) {
          await prisma.service.update({
            where: { id: target.id },
            data: {
              kind: spec.kind,
              assignedTeamId: spec.assignedTeamId,
              matchId: spec.matchId,
              note: spec.note,
            },
          });
          await syncTeamDuties(target.id, spec.assignments);
          updated += 1;
          serviceId = target.id;
        } else {
          skipped += 1;
        }
        if (serviceId && spec.rule.fixedPersonId) {
          const fix = await ensureFixedPersonEnrollment(serviceId, spec.rule);
          if (fix.enrolled) fixedEnrolled += 1;
        }
        continue;
      }
      await prisma.service.update({
        where: { id: target.id },
        data: payload,
      });
      await syncTeamDuties(target.id, spec.assignments);
      updated += 1;
      serviceId = target.id;
    } else {
      const service = await prisma.service.create({
        data: {
          ...payload,
          origin: 'AUTO',
          draft: false,
          locked: false,
        },
        include: serviceInclude,
      });
      await syncTeamDuties(service.id, spec.assignments);
      created += 1;
      createdServices.push(mapService(service));
      serviceId = service.id;
    }

    if (serviceId && spec.rule.fixedPersonId) {
      const fix = await ensureFixedPersonEnrollment(serviceId, spec.rule);
      if (fix.enrolled) fixedEnrolled += 1;
    }
  }

  let removed = 0;
  for (const service of existing) {
    if (service.origin === 'MANUAL') continue;
    if (service.activityId) continue;
    if (service.enrollments?.length) continue;
    const key = serviceKey(service.date, service.type, startTimeFromService(service));
    if (needed.has(key)) continue;
    if (service.origin !== 'AUTO') continue;
    if (service.locked || service.active === false) {
      if (service.active !== false) {
        await prisma.service.update({ where: { id: service.id }, data: { active: false } });
        removed += 1;
      }
      continue;
    }
    await prisma.service.delete({ where: { id: service.id } });
    removed += 1;
  }

  // Lege automatische diensten buiten de nieuwe periode blijven anders inschrijfbaar.
  const outside = await prisma.service.findMany({
    where: {
      origin: 'AUTO',
      locked: false,
      OR: [{ date: { gt: end } }, { date: { gte: startOfDay(new Date()), lt: start } }],
    },
    select: { id: true, enrollments: { select: { id: true } } },
  });
  for (const service of outside) {
    if (service.enrollments.length) continue;
    await prisma.service.delete({ where: { id: service.id } });
    removed += 1;
  }

  const existingRound = await getActiveRound(prisma);
  const preserveStatus = existingRound?.status && existingRound.status !== 'DRAFT';
  await prisma.planningRound.update({
    where: { id: existingRound.id },
    data: {
      fromDate: start,
      toDate: end,
      ...(preserveStatus ? {} : { status: existingRound?.status || 'DRAFT' }),
    },
  });

  // Officiële periode: nieuw aangemaakte diensten meteen vergrendelen.
  if (existingRound.official) {
    await prisma.service.updateMany({
      where: {
        active: true,
        draft: false,
        date: { gte: start, lte: end },
        locked: false,
      },
      data: { locked: true },
    });
  }

  const teamDuties = [...needed.values()].filter(
    (s) => (s.kind === 'TEAM' || s.kind === 'MIXED') && (s.assignments || []).length,
  ).length;

  return {
    created,
    updated,
    skipped,
    removed,
    fixedEnrolled,
    slots: needed.size,
    teamDuties,
    services: createdServices,
    period: { from: start, to: end },
  };
}
