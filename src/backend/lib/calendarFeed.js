import crypto from 'crypto';
import prisma from './prisma.js';
import { getClubSettings } from './season.js';
import { refereesEnabled } from './referees.js';
import { tournamentsEnabled } from './tournaments.js';
import { canonicalAccessRole } from './roles.js';
import { renderIcs } from './ics.js';
import {
  collectTeamIds,
  personalEvents,
  teamEvents,
} from './calendarEvents.js';

const SINCE_MS = 40 * 24 * 60 * 60 * 1000;

export function createCalendarToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export async function calendarEnabled() {
  const settings = await getClubSettings();
  return Boolean(settings.calendarEnabled);
}

async function relevantTeams(person) {
  const [memberships, children, coordinated] = await Promise.all([
    prisma.personTeam.findMany({ where: { personId: person.id, active: true } }),
    prisma.person.findMany({
      where: { guardianId: person.id, active: true },
      include: { teamMemberships: { where: { active: true } } },
    }),
    prisma.team.findMany({
      where: { coordinatorId: person.id, active: true },
      select: { id: true },
    }),
  ]);
  const ids = collectTeamIds({
    person,
    memberships,
    children,
    coordinatedIds: coordinated.map((team) => team.id),
  });
  if (!ids.length) return [];
  return prisma.team.findMany({
    where: { id: { in: ids }, active: true },
    orderBy: { name: 'asc' },
  });
}

function since(now) {
  return new Date(now.getTime() - SINCE_MS);
}

function matchRow(match) {
  return {
    id: match.id,
    date: match.date,
    time: match.time,
    home: match.home,
    opponent: match.opponent,
    teamName: match.team?.name || '',
    durationMinutes: match.team?.matchDurationMinutes || 90,
    updatedAt: match.updatedAt,
  };
}

async function loadTournaments(now) {
  if (!(await tournamentsEnabled())) return { enabled: false, rows: [] };
  const from = new Date(now.getTime() - SINCE_MS).toISOString().slice(0, 10);
  const rows = await prisma.tournament.findMany({
    where: { date: { gte: from } },
    include: { teams: { select: { name: true } } },
    orderBy: { date: 'asc' },
  });
  return {
    enabled: true,
    rows: rows.map((row) => ({
      id: row.id,
      name: row.name,
      date: row.date,
      startTime: row.startTime,
      endTime: row.endTime,
      updatedAt: row.updatedAt,
      teamNames: (row.teams || []).map((team) => team.name),
    })),
  };
}

export async function buildPersonalIcs(person, { appUrl = '', now = new Date() } = {}) {
  const teams = await relevantTeams(person);
  const ids = teams.map((team) => team.id);
  const from = since(now);
  const [matches, enrollments, refereeRows, tournaments] = await Promise.all([
    ids.length
      ? prisma.match.findMany({
          where: { teamId: { in: ids }, date: { gte: from } },
          include: { team: true },
          orderBy: [{ date: 'asc' }, { id: 'asc' }],
        })
      : [],
    prisma.enrollment.findMany({
      where: {
        personId: person.id,
        noShow: false,
        service: { active: true, draft: false, date: { gte: from } },
      },
      include: { service: true },
    }),
    (async () => {
      if (!(await refereesEnabled())) return [];
      return prisma.refereeAssignment.findMany({
        where: { personId: person.id, match: { date: { gte: from } } },
        include: { match: { include: { team: true } } },
      });
    })(),
    loadTournaments(now),
  ]);

  const events = personalEvents({
    now,
    appUrl,
    teamNames: teams.map((team) => team.name),
    refereesEnabled: refereeRows.length > 0 || (await refereesEnabled()),
    tournamentsEnabled: tournaments.enabled,
    matches: matches.map(matchRow),
    duties: enrollments.map((row) => ({
      enrollmentId: row.id,
      type: row.service.type,
      date: row.service.date,
      time: row.service.time,
      location: row.service.location,
      draft: row.service.draft,
      active: row.service.active,
      noShow: row.noShow,
      updatedAt: row.service.updatedAt || row.createdAt,
    })),
    referees: refereeRows.map((row) => ({
      id: row.id,
      status: row.status,
      updatedAt: row.updatedAt,
      match: matchRow(row.match),
    })),
    tournaments: tournaments.rows,
  });
  return renderIcs({ name: 'VVL-agenda', events, now });
}

export async function buildTeamIcs(team, { appUrl = '', now = new Date() } = {}) {
  const from = since(now);
  const [matches, duties, tournaments] = await Promise.all([
    prisma.match.findMany({
      where: { teamId: team.id, date: { gte: from } },
      include: { team: true },
      orderBy: [{ date: 'asc' }, { id: 'asc' }],
    }),
    prisma.serviceTeamDuty.findMany({
      where: {
        teamId: team.id,
        service: { active: true, draft: false, date: { gte: from } },
      },
      include: { service: true },
    }),
    loadTournaments(now),
  ]);
  const events = teamEvents({
    now,
    appUrl,
    teamId: team.id,
    teamName: team.name,
    tournamentsEnabled: tournaments.enabled,
    matches: matches.map(matchRow),
    teamDuties: duties.map((row) => ({
      serviceId: row.serviceId,
      teamId: row.teamId,
      type: row.service.type,
      date: row.service.date,
      time: row.service.time,
      location: row.service.location,
      draft: row.service.draft,
      active: row.service.active,
      updatedAt: row.service.updatedAt,
    })),
    tournaments: tournaments.rows,
  });
  return renderIcs({ name: `VVL ${team.name}`, events, now });
}

export async function renderFeed(feed, options) {
  if (!feed) return null;
  if (feed.kind === 'person') {
    if (!feed.person || feed.person.active === false) return null;
    return buildPersonalIcs(feed.person, options);
  }
  if (feed.kind === 'team') {
    if (!feed.team || feed.team.active === false) return null;
    return buildTeamIcs(feed.team, options);
  }
  return null;
}

async function createFeed(data) {
  try {
    return await prisma.calendarFeed.create({ data: { token: createCalendarToken(), ...data } });
  } catch (err) {
    const again = await prisma.calendarFeed.findFirst({ where: data.personId ? { personId: data.personId } : { teamId: data.teamId } });
    if (again) return again;
    throw err;
  }
}

export async function ensurePersonFeed(personId) {
  const existing = await prisma.calendarFeed.findUnique({ where: { personId } });
  if (existing) return existing;
  return createFeed({ kind: 'person', personId });
}

export async function rotatePersonFeed(personId) {
  const token = createCalendarToken();
  const existing = await prisma.calendarFeed.findUnique({ where: { personId } });
  if (!existing) return createFeed({ kind: 'person', personId });
  return prisma.calendarFeed.update({ where: { id: existing.id }, data: { token } });
}

export async function ensureTeamFeed(teamId) {
  const existing = await prisma.calendarFeed.findUnique({ where: { teamId } });
  if (existing) return existing;
  return createFeed({ kind: 'team', teamId });
}

export async function rotateTeamFeed(teamId) {
  const token = createCalendarToken();
  const existing = await prisma.calendarFeed.findUnique({ where: { teamId } });
  if (!existing) return createFeed({ kind: 'team', teamId });
  return prisma.calendarFeed.update({ where: { id: existing.id }, data: { token } });
}

export async function ownTeamLinks(person) {
  return relevantTeams(person);
}

export async function managedTeams(person) {
  const role = canonicalAccessRole(person.role);
  if (role === 'Admin') {
    return prisma.team.findMany({ where: { active: true }, orderBy: { name: 'asc' } });
  }
  if (role === 'Teamcoördinator') {
    return prisma.team.findMany({
      where: { coordinatorId: person.id, active: true },
      orderBy: { name: 'asc' },
    });
  }
  return null;
}

export async function canRotateTeam(person, teamId) {
  const role = canonicalAccessRole(person.role);
  if (role === 'Admin') return true;
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { coordinatorId: true, active: true },
  });
  return Boolean(team?.active && team.coordinatorId === person.id);
}
