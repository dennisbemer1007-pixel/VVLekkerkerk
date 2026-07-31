import prisma from './prisma.js';
import { addWeeks, endOfDay, startOfDay } from './dates.js';
import { isOldYouthTeam, isYoungYouthTeam, SLOT_TIMES } from './youthTeams.js';
import { mapService, serviceInclude, serviceLocation } from './serviceHelpers.js';
import { POST_MATCH_BUFFER_MINUTES } from './obligation.js';
import { addMinutesToDate } from './time.js';

async function teamAssignmentCounts(teamIds, from, to) {
  const counts = Object.fromEntries(teamIds.map((id) => [id, 0]));
  if (!teamIds.length) return counts;

  const services = await prisma.service.findMany({
    where: {
      assignedTeamId: { in: teamIds },
      date: { gte: from, lte: to },
      active: true,
    },
    select: { assignedTeamId: true },
  });

  for (const s of services) {
    if (s.assignedTeamId != null) counts[s.assignedTeamId] += 1;
  }
  return counts;
}

function pickLeastAssigned(teams, counts) {
  if (!teams.length) return null;
  return [...teams].sort((a, b) => {
    const diff = (counts[a.id] ?? 0) - (counts[b.id] ?? 0);
    if (diff !== 0) return diff;
    return a.name.localeCompare(b.name, 'nl');
  })[0];
}

function slotSpecsForTeam(teamName) {
  if (isYoungYouthTeam(teamName)) {
    return [
      { slot: 'MORNING', type: 'BAR' },
      { slot: 'MORNING', type: 'KITCHEN' },
    ];
  }
  if (isOldYouthTeam(teamName)) {
    return [
      { slot: 'AFTERNOON', type: 'BAR' },
      { slot: 'AFTERNOON', type: 'KITCHEN' },
      { slot: 'EVENING', type: 'BAR' },
      { slot: 'EVENING', type: 'KITCHEN' },
    ];
  }
  return null;
}

async function findExisting(date, type, slot) {
  return prisma.service.findFirst({
    where: {
      type,
      slot,
      date: { gte: startOfDay(date), lte: endOfDay(date) },
      active: true,
    },
  });
}

function formatBusyUntil(date) {
  return date.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Concept-planning (draft) voor ±6 weken:
 * - JO8–JO12 thuis → ochtend bar + keuken
 * - JO13–JO17 thuis → middag + avond (bar + keuken)
 * - Note bevat geschatte eindtijd wedstrijd + buffer
 */
export async function proposeFromMatches({ weeks = 6, required = 2 } = {}) {
  const from = startOfDay(new Date());
  const to = endOfDay(addWeeks(from, weeks));

  const matches = await prisma.match.findMany({
    where: { home: true, date: { gte: from, lte: to } },
    include: { team: true },
    orderBy: { date: 'asc' },
  });

  const youthTeamIds = (
    await prisma.team.findMany({ select: { id: true, name: true } })
  )
    .filter((t) => isYoungYouthTeam(t.name) || isOldYouthTeam(t.name))
    .map((t) => t.id);

  const counts = await teamAssignmentCounts(youthTeamIds, from, to);
  const created = [];
  let skipped = 0;

  const byDay = new Map();
  for (const match of matches) {
    const key = startOfDay(match.date).toISOString();
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(match);
  }

  for (const [, dayMatches] of byDay) {
    const dayDate = dayMatches[0].date;

    const youngHome = [
      ...new Map(
        dayMatches
          .filter((m) => m.team && isYoungYouthTeam(m.team.name))
          .map((m) => [m.team.id, m.team]),
      ).values(),
    ];
    const oldHome = [
      ...new Map(
        dayMatches
          .filter((m) => m.team && isOldYouthTeam(m.team.name))
          .map((m) => [m.team.id, m.team]),
      ).values(),
    ];

    const picks = [
      pickLeastAssigned(youngHome, counts),
      pickLeastAssigned(oldHome, counts),
    ].filter(Boolean);

    for (const team of picks) {
      const specs = slotSpecsForTeam(team.name);
      if (!specs) continue;

      const relatedMatch =
        dayMatches.find((m) => m.teamId === team.id) || dayMatches[0];
      const duration = team.matchDurationMinutes ?? 90;
      const busyUntil = addMinutesToDate(
        relatedMatch.date,
        duration + POST_MATCH_BUFFER_MINUTES,
      );

      for (const spec of specs) {
        if (await findExisting(dayDate, spec.type, spec.slot)) {
          skipped += 1;
          continue;
        }

        const service = await prisma.service.create({
          data: {
            type: spec.type,
            date: dayDate,
            time: SLOT_TIMES[spec.slot][spec.type],
            slot: spec.slot,
            required: Math.max(1, Number(required) || 2),
            location: serviceLocation(spec.type),
            draft: true,
            active: true,
            matchId: relatedMatch.id,
            assignedTeamId: team.id,
            note: [
              `Concept · team ${team.name}`,
              relatedMatch.opponent ? `vs ${relatedMatch.opponent}` : null,
              spec.slot === 'MORNING'
                ? 'ochtend'
                : spec.slot === 'AFTERNOON'
                  ? 'middag'
                  : 'avond',
              `spelers bezet t/m ±${formatBusyUntil(busyUntil)} (${duration} min + ${POST_MATCH_BUFFER_MINUTES} min buffer)`,
            ]
              .filter(Boolean)
              .join(' · '),
          },
          include: serviceInclude,
        });

        counts[team.id] = (counts[team.id] ?? 0) + 1;
        created.push(mapService(service));
      }
    }
  }

  const existingRound = await prisma.planningRound.findUnique({ where: { id: 1 } });
  const preserveOpen =
    existingRound &&
    (existingRound.status === 'VOLUNTEER_OPEN' || existingRound.status === 'MANDATORY_OPEN');

  if (preserveOpen) {
    await prisma.planningRound.update({
      where: { id: 1 },
      data: { fromDate: from, toDate: to },
    });
  } else {
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
        status: 'DRAFT',
        volunteerDeadline: null,
        volunteerNotifiedAt: null,
        mandatoryNotifiedAt: null,
      },
    });
  }

  return {
    created: created.length,
    skipped,
    services: created,
    period: { from, to },
    preservedRound: Boolean(preserveOpen),
  };
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
