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
import { periodFromRound, resolvePlanningPeriod } from './planningPeriod.js';
import {
  kindForAssignments,
  requiredForTeamDuties,
  teamDutyAssignments,
} from './teamDutyPlanning.js';

function buildNote(rule, evaluation, assignments) {
  const bits = [rule.name];
  if (evaluation.activities?.[0]) bits.push(evaluation.activities[0].name);
  if (assignments?.length) {
    const names = assignments.map((a) => `${a.team.name} (${a.reserved})`);
    bits.push(`Teamdienst: ${names.join(', ')}`);
  }
  return bits.filter(Boolean).join(' · ');
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

export async function generateServicesFromRules({ from, to, weeks } = {}) {
  await ensureClubDefaults();

  const period = from || to || weeks
    ? resolvePlanningPeriod({ from, to, weeks })
    : await periodFromRound(prisma);
  const start = period.from;
  const end = period.to;

  const [rules, matches, activities, teams, existing] = await Promise.all([
    prisma.serviceRule.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
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
      include: { enrollments: { select: { id: true } }, teamDuties: true },
    }),
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
      const assignments = teamDutyAssignments(rule, homeMatches);
      const required = requiredForTeamDuties(rule.required, rule.teamDutySlotRole, assignments);
      const assigned = assignments[0]?.team || null;
      needed.set(key, {
        key,
        date,
        type: rule.type,
        time: `${rule.startTime} - ${rule.endTime}`,
        required,
        slot: rule.slot || null,
        kind: kindForAssignments(required, assignments),
        assignedTeamId: assigned?.id ?? null,
        sourceRuleId: rule.id,
        origin: 'AUTO',
        activityId: evaluation.activities?.[0]?.id ?? null,
        matchId: (assignments[0]?.match || evaluation.matches?.[0] || homeMatches[0])?.id ?? null,
        note: buildNote(rule, evaluation, assignments),
        location: serviceLocation(rule.type),
        assignments,
      });
    }
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const createdServices = [];

  for (const spec of needed.values()) {
    const list = existingByKey.get(spec.key) || [];
    const keepable = list.find((s) => s.origin === 'MANUAL' || s.locked || s.enrollments?.length);
    const auto = list.find((s) => s.origin === 'AUTO') || list.find((s) => s.origin !== 'MANUAL') || list[0];
    const target = keepable || auto || null;

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

    if (target) {
      if (target.locked || target.origin === 'MANUAL') {
        skipped += 1;
        continue;
      }
      await prisma.service.update({
        where: { id: target.id },
        data: payload,
      });
      await syncTeamDuties(target.id, spec.assignments);
      updated += 1;
      continue;
    }

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
  }

  let removed = 0;
  for (const service of existing) {
    if (service.origin === 'MANUAL' || service.locked) continue;
    if (service.enrollments?.length) continue;
    const key = serviceKey(service.date, service.type, startTimeFromService(service));
    if (needed.has(key)) continue;
    if (service.origin !== 'AUTO') continue;
    await prisma.service.delete({ where: { id: service.id } });
    removed += 1;
  }

  const existingRound = await prisma.planningRound.findUnique({ where: { id: 1 } });
  const preserveStatus = existingRound?.status && existingRound.status !== 'DRAFT';
  await prisma.planningRound.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      fromDate: start,
      toDate: end,
      status: 'DRAFT',
    },
    update: {
      fromDate: start,
      toDate: end,
      ...(preserveStatus ? {} : { status: existingRound?.status || 'DRAFT' }),
    },
  });

  const teamDuties = [...needed.values()].filter((s) => s.kind === 'TEAM' || s.kind === 'MIXED').length;

  return {
    created,
    updated,
    skipped,
    removed,
    slots: needed.size,
    teamDuties,
    services: createdServices,
    period: { from: start, to: end },
  };
}
