import prisma from './prisma.js';
import { addWeeks, endOfDay, startOfDay } from './dates.js';
import { mapService, serviceInclude, serviceLocation } from './serviceHelpers.js';
import { ensureClubDefaults } from './clubDefaults.js';
import {
  datesInRange,
  evaluateRule,
  sameCalendarDay,
  serviceKey,
  startTimeFromService,
  teamDutyCandidates,
} from './serviceRuleLogic.js';

function buildNote(rule, evaluation, assigned, extraTeams) {
  const bits = [rule.name];
  if (evaluation.activities?.[0]) bits.push(evaluation.activities[0].name);
  if (assigned) bits.push(`Teamdienst: ${assigned.name}`);
  if (extraTeams.length) bits.push(`+ ${extraTeams.map((t) => t.name).join(', ')}`);
  return bits.filter(Boolean).join(' · ');
}

export async function generateServicesFromRules({ from, to, weeks = 6 } = {}) {
  await ensureClubDefaults();

  const start = startOfDay(from || new Date());
  const end = endOfDay(to || addWeeks(start, weeks));

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
      include: { enrollments: { select: { id: true } } },
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
      const dutyTeams = teamDutyCandidates(rule, homeMatches);
      const assigned = dutyTeams[0] || null;
      const extraTeams = dutyTeams.slice(1);
      needed.set(key, {
        key,
        date,
        type: rule.type,
        time: `${rule.startTime} - ${rule.endTime}`,
        required: Math.max(1, Number(rule.required) || 1),
        slot: rule.slot || null,
        kind: assigned ? 'TEAM' : 'PERSONAL',
        assignedTeamId: assigned?.id ?? null,
        sourceRuleId: rule.id,
        origin: 'AUTO',
        activityId: evaluation.activities?.[0]?.id ?? null,
        matchId: (evaluation.matches?.[0] || homeMatches[0])?.id ?? null,
        note: buildNote(rule, evaluation, assigned, extraTeams),
        location: serviceLocation(rule.type),
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
    const auto = list.find((s) => s.origin !== 'MANUAL') || list[0];
    const target = keepable || auto || null;

    const payload = {
      type: spec.type,
      date: spec.date,
      time: spec.time,
      required: spec.required,
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

  const teamDuties = [...needed.values()].filter((s) => s.kind === 'TEAM').length;

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
