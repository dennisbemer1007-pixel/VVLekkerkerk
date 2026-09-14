import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { ADMIN_ROLES, isAdminRole, publicPersonBrief } from '../lib/roles.js';
import { parseTeamDutySlots } from '../lib/teamFunctions.js';
import { teamIdsForActor } from '../lib/authz.js';
import { addWeeks, endOfDay, startOfDay } from '../lib/dates.js';
import { executedCountForObligation, remainingObligation, personalEnrollmentCount } from '../lib/obligation.js';
import { mapService, serviceInclude } from '../lib/serviceHelpers.js';
import { getClubSettings } from '../lib/season.js';

const router = Router();
const admin = (...args) => requireRole(...ADMIN_ROLES)(...args);

function mapTeam(team) {
  return {
    ...team,
    teamDutySlots: parseTeamDutySlots(team.teamDutySlots),
    coordinator: publicPersonBrief(team.coordinator),
    members: (team.members || []).map(publicPersonBrief),
  };
}

function teamFunctionFields(body) {
  const data = {};
  if (body.active !== undefined) data.active = Boolean(body.active);
  if (body.availabilityUse !== undefined) data.availabilityUse = Boolean(body.availabilityUse);
  if (body.teamDutyUse !== undefined) data.teamDutyUse = Boolean(body.teamDutyUse);
  if (body.teamDutySlots !== undefined) {
    const slots = Array.isArray(body.teamDutySlots)
      ? body.teamDutySlots
      : parseTeamDutySlots(body.teamDutySlots);
    data.teamDutySlots = JSON.stringify(slots);
  }
  if (
    body.availabilityUse !== undefined ||
    body.teamDutyUse !== undefined ||
    body.teamDutySlots !== undefined
  ) {
    data.functionsConfigured = true;
  }
  return data;
}

router.get(
  '/dashboard',
  requireAuth(async (req, res, next) => {
    try {
      if (!isAdminRole(req.person.role) && req.person.role !== 'Teamcoördinator') {
        return res.status(403).json({ error: 'Alleen teamcoördinatoren zien dit overzicht' });
      }
      const settings = await getClubSettings();
      const allowed = isAdminRole(req.person.role)
        ? null
        : [...(await teamIdsForActor(req.person))];
      if (allowed && !allowed.length) {
        return res.json({ seasonLabel: settings.seasonLabel, teams: [] });
      }

      const from = startOfDay(new Date());
      const to = endOfDay(addWeeks(from, 6));
      const yearStart = new Date(from.getFullYear(), 0, 1);

      const teams = await prisma.team.findMany({
        where: allowed ? { id: { in: allowed } } : { active: true },
        include: {
          coordinator: true,
          members: { where: { active: true }, orderBy: { name: 'asc' } },
          matches: {
            where: { date: { gte: from, lte: to } },
            orderBy: { date: 'asc' },
          },
          assignedServices: {
            where: { active: true, draft: false, date: { gte: from, lte: to } },
            include: serviceInclude,
            orderBy: [{ date: 'asc' }, { time: 'asc' }],
          },
        },
        orderBy: { name: 'asc' },
      });

      const openPersonal = await prisma.service.findMany({
        where: {
          active: true,
          draft: false,
          kind: { not: 'TEAM' },
          date: { gte: from, lte: to },
        },
        include: serviceInclude,
        orderBy: [{ date: 'asc' }, { time: 'asc' }],
      });
      const open = openPersonal
        .map(mapService)
        .filter((s) => s.status !== 'full' && !s.locked);

      const payload = [];
      for (const team of teams) {
        const members = [];
        for (const member of team.members) {
          const enrollments = await prisma.enrollment.findMany({
            where: { personId: member.id },
            include: { service: true },
          });
          const counts = {
            count6w: personalEnrollmentCount(enrollments, startOfDay(addWeeks(from, -6)), to),
            count12w: personalEnrollmentCount(enrollments, startOfDay(addWeeks(from, -12)), to),
            countYear: personalEnrollmentCount(enrollments, yearStart, to),
          };
          const executed = executedCountForObligation(member, counts);
          members.push({
            ...publicPersonBrief(member),
            stillNeeded: remainingObligation(member, executed),
            makeupDue: member.makeupDue ?? 0,
            barLast6Weeks: counts.count6w,
          });
        }
        payload.push({
          id: team.id,
          name: team.name,
          teamDutyUse: team.teamDutyUse,
          teamDutySlots: parseTeamDutySlots(team.teamDutySlots),
          coordinator: publicPersonBrief(team.coordinator),
          members,
          upcomingMatches: team.matches.map((m) => ({
            id: m.id,
            date: m.date,
            time: m.time,
            home: m.home,
            opponent: m.opponent,
          })),
          teamServices: team.assignedServices.map(mapService),
        });
      }

      res.json({
        seasonLabel: settings.seasonLabel,
        openPersonal: open.slice(0, 40),
        teams: payload,
      });
    } catch (err) {
      next(err);
    }
  }),
);

router.get(
  '/',
  requireAuth(async (req, res, next) => {
    try {
      let where = {};
      if (!isAdminRole(req.person.role)) {
        if (req.person.role === 'Teamcoördinator') {
          const ids = [...(await teamIdsForActor(req.person))];
          where = ids.length ? { id: { in: ids } } : { id: -1 };
        } else if (req.person.teamId) {
          where = { id: req.person.teamId };
        } else {
          where = { id: -1 };
        }
      }
      const teams = await prisma.team.findMany({
        where,
        include: {
          coordinator: true,
          members: { where: { active: true }, orderBy: { name: 'asc' } },
        },
        orderBy: { name: 'asc' },
      });
      res.json(teams.map(mapTeam));
    } catch (err) {
      next(err);
    }
  }),
);

router.post(
  '/',
  admin(async (req, res, next) => {
    try {
      const { name, coordinatorId, matchDurationMinutes } = req.body;
      if (!name?.trim()) return res.status(400).json({ error: 'Teamnaam is verplicht' });
      const duration = Number(matchDurationMinutes);
      const team = await prisma.team.create({
        data: {
          name: name.trim(),
          coordinatorId: coordinatorId ? Number(coordinatorId) : null,
          matchDurationMinutes:
            Number.isFinite(duration) && duration > 0 ? Math.round(duration) : 90,
          ...teamFunctionFields(req.body),
        },
      });
      res.status(201).json(mapTeam({ ...team, coordinator: null, members: [] }));
    } catch (err) {
      next(err);
    }
  }),
);

router.put(
  '/:id',
  admin(async (req, res, next) => {
    try {
      const { name, coordinatorId, matchDurationMinutes } = req.body;
      const data = {
        ...(name !== undefined && { name: name.trim() }),
        ...(coordinatorId !== undefined && {
          coordinatorId: coordinatorId ? Number(coordinatorId) : null,
        }),
        ...teamFunctionFields(req.body),
      };
      if (matchDurationMinutes !== undefined) {
        const duration = Number(matchDurationMinutes);
        if (!Number.isFinite(duration) || duration <= 0) {
          return res.status(400).json({ error: 'Wedstrijdduur moet een positief aantal minuten zijn' });
        }
        data.matchDurationMinutes = Math.round(duration);
      }
      const team = await prisma.team.update({
        where: { id: Number(req.params.id) },
        data,
      });
      res.json(mapTeam({ ...team, coordinator: undefined, members: undefined }));
    } catch (err) {
      next(err);
    }
  }),
);

export default router;
