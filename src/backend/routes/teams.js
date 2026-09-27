import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { ADMIN_ROLES, isAdminRole, publicPerson, publicPersonBrief } from '../lib/roles.js';
import { parseTeamDutySlots } from '../lib/teamFunctions.js';
import { teamIdsForActor } from '../lib/authz.js';
import { addWeeks, endOfDay, startOfDay } from '../lib/dates.js';
import { executedCountForObligation, remainingObligation, personalEnrollmentCount } from '../lib/obligation.js';
import { mapService, serviceInclude } from '../lib/serviceHelpers.js';
import { getClubSettings } from '../lib/season.js';
import { periodFromRound } from '../lib/planningPeriod.js';
import { nextPersonNumber, syncPrimaryTeamMembership } from '../lib/personNumber.js';
import { normalizePersonName } from '../lib/personMatch.js';
import { writeAudit } from '../lib/audit.js';
import { teamDutyOpenForTeam } from '../lib/teamDutyPlanning.js';

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

      const roundPeriod = await periodFromRound(prisma);
      const from = roundPeriod.from;
      const to = roundPeriod.to;
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
          teamDuties: {
            where: { service: { active: true, draft: false, date: { gte: from, lte: to } } },
            include: { service: { include: serviceInclude } },
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
          const teamStands = enrollments.filter(
            (e) => e.kind === 'TEAM' && e.forTeamId === team.id && !e.noShow,
          );
          const stoodBetween = (fromDate, toDate, list = enrollments) =>
            list.filter((e) => {
              if (e.noShow) return false;
              const d = new Date(e.service?.date);
              if (Number.isNaN(d.getTime())) return false;
              if (fromDate && d < fromDate) return false;
              if (toDate && d > toDate) return false;
              return true;
            }).length;
          const sixWeeksAgo = startOfDay(addWeeks(new Date(), -6));
          const yearStartNow = new Date(new Date().getFullYear(), 0, 1);
          const nowEnd = endOfDay(new Date());
          members.push({
            ...publicPersonBrief(member),
            stillNeeded: remainingObligation(member, executed),
            makeupDue: member.makeupDue ?? 0,
            barLast6Weeks: counts.count6w,
            barThisYear: counts.countYear,
            stood6w: stoodBetween(sixWeeksAgo, nowEnd),
            stoodYear: stoodBetween(yearStartNow, nowEnd),
            teamDutyCount: teamStands.length,
            teamDuty6w: stoodBetween(sixWeeksAgo, nowEnd, teamStands),
            teamDutyYear: stoodBetween(yearStartNow, nowEnd, teamStands),
            hasAccount: Boolean(member.passwordHash),
            email: Boolean(member.email),
          });
        }
        const dutyById = new Map();
        for (const s of team.assignedServices) dutyById.set(s.id, s);
        for (const duty of team.teamDuties || []) {
          if (duty.service) dutyById.set(duty.service.id, duty.service);
        }
        const teamServices = [...dutyById.values()]
          .sort((a, b) => new Date(a.date) - new Date(b.date) || String(a.time).localeCompare(String(b.time)))
          .map((s) => {
            const mapped = mapService(s);
            return {
              ...mapped,
              teamOpen: teamDutyOpenForTeam(mapped, team.id),
            };
          });
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
          teamServices,
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
      const coordinator = coordinatorId ? Number(coordinatorId) : null;
      const team = await prisma.team.create({
        data: {
          name: name.trim(),
          coordinatorId: coordinator,
          matchDurationMinutes:
            Number.isFinite(duration) && duration > 0 ? Math.round(duration) : 90,
          ...teamFunctionFields(req.body),
        },
      });
      if (coordinator) {
        const person = await prisma.person.findUnique({ where: { id: coordinator } });
        if (person?.role === 'Vrijwilliger') {
          await prisma.person.update({ where: { id: person.id }, data: { role: 'Teamcoördinator' } });
        }
      }
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
      if (data.coordinatorId) {
        const coordinator = await prisma.person.findUnique({ where: { id: data.coordinatorId } });
        if (coordinator && coordinator.role === 'Vrijwilliger') {
          await prisma.person.update({
            where: { id: coordinator.id },
            data: { role: 'Teamcoördinator' },
          });
        }
      }
      res.json(mapTeam({ ...team, coordinator: undefined, members: undefined }));
    } catch (err) {
      next(err);
    }
  }),
);

router.post(
  '/:id/parents',
  requireAuth(async (req, res, next) => {
    try {
      const teamId = Number(req.params.id);
      const team = await prisma.team.findUnique({ where: { id: teamId } });
      if (!team) return res.status(404).json({ error: 'Team niet gevonden' });
      const allowed = isAdminRole(req.person.role)
        ? true
        : req.person.role === 'Teamcoördinator' && (await teamIdsForActor(req.person)).has(teamId);
      if (!allowed) {
        return res.status(403).json({ error: 'Je mag alleen ouders van je eigen team toevoegen' });
      }
      const name = String(req.body?.name || '').trim();
      if (!name) return res.status(400).json({ error: 'Naam is verplicht' });
      const wanted = normalizePersonName(name);
      const existingPeople = await prisma.person.findMany({
        where: { active: true },
        select: { id: true, name: true, email: true, teamId: true },
      });
      const matches = existingPeople.filter((p) => normalizePersonName(p.name) === wanted);
      if (matches.length > 1) {
        return res.status(409).json({
          error:
            'Er zijn meerdere personen met deze naam. Koppel het bestaande account via Beheer, zodat niemand twee keer voorkomt.',
        });
      }
      if (matches.length === 1) {
        const existing = matches[0];
        if (!existing.teamId) {
          await prisma.person.update({ where: { id: existing.id }, data: { teamId } });
        }
        await syncPrimaryTeamMembership(existing.id, teamId);
        const full = await prisma.person.findUnique({ where: { id: existing.id } });
        await writeAudit({
          actorId: req.person.id,
          action: 'person.link_parent',
          entity: 'Person',
          entityId: existing.id,
          detail: `${full.name} gekoppeld aan ${team.name}`,
        });
        return res.status(200).json({
          ...publicPerson(full, { viewerRole: req.person.role }),
          linked: true,
          message: existing.email
            ? `${full.name} heeft al een account en is aan dit team gekoppeld. Er is geen tweede persoon gemaakt.`
            : `${full.name} stond al op naam en is aan dit team gekoppeld.`,
        });
      }
      const person = await prisma.person.create({
        data: {
          name,
          personNumber: await nextPersonNumber(),
          email: null,
          role: 'Vrijwilliger',
          obligation: 'NONE',
          teamId,
          active: true,
        },
      });
      await syncPrimaryTeamMembership(person.id, teamId);
      await writeAudit({
        actorId: req.person.id,
        action: 'person.create_parent',
        entity: 'Person',
        entityId: person.id,
        detail: `${person.name} · ${team.name}`,
      });
      res.status(201).json(publicPerson(person, { viewerRole: req.person.role }));
    } catch (err) {
      next(err);
    }
  }),
);

async function parentOnTeam(personId, teamId) {
  const person = await prisma.person.findUnique({
    where: { id: personId },
    include: { teamMemberships: { where: { active: true } } },
  });
  if (!person) return null;
  const onTeam =
    person.teamId === teamId ||
    (person.teamMemberships || []).some((m) => m.teamId === teamId);
  return onTeam ? person : null;
}

async function coordinatorMayEditTeam(actor, teamId) {
  if (isAdminRole(actor.role)) return true;
  if (actor.role !== 'Teamcoördinator') return false;
  return (await teamIdsForActor(actor)).has(teamId);
}

router.put(
  '/:id/parents/:personId',
  requireAuth(async (req, res, next) => {
    try {
      const teamId = Number(req.params.id);
      const personId = Number(req.params.personId);
      if (!(await coordinatorMayEditTeam(req.person, teamId))) {
        return res.status(403).json({ error: 'Je mag alleen ouders van je eigen team wijzigen' });
      }
      const person = await parentOnTeam(personId, teamId);
      if (!person) return res.status(404).json({ error: 'Ouder niet gevonden bij dit team' });
      const name = String(req.body?.name || '').trim();
      if (!name) return res.status(400).json({ error: 'Naam is verplicht' });
      const updated = await prisma.person.update({
        where: { id: person.id },
        data: { name },
      });
      await writeAudit({
        actorId: req.person.id,
        action: 'person.rename_parent',
        entity: 'Person',
        entityId: person.id,
        detail: `${person.name} → ${name}`,
      });
      res.json(publicPerson(updated, { viewerRole: req.person.role }));
    } catch (err) {
      next(err);
    }
  }),
);

router.delete(
  '/:id/parents/:personId',
  requireAuth(async (req, res, next) => {
    try {
      const teamId = Number(req.params.id);
      const personId = Number(req.params.personId);
      if (!(await coordinatorMayEditTeam(req.person, teamId))) {
        return res.status(403).json({ error: 'Je mag alleen ouders van je eigen team verwijderen' });
      }
      const person = await parentOnTeam(personId, teamId);
      if (!person) return res.status(404).json({ error: 'Ouder niet gevonden bij dit team' });
      if (person.passwordHash || person.email) {
        return res.status(400).json({
          error: 'Deze ouder heeft een account. De barcommissie kan het account deactiveren.',
        });
      }
      const coordinates = await prisma.team.count({ where: { coordinatorId: person.id } });
      if (coordinates) {
        return res.status(400).json({ error: 'Een coördinator kun je hier niet verwijderen' });
      }
      await prisma.person.delete({ where: { id: person.id } });
      await writeAudit({
        actorId: req.person.id,
        action: 'person.delete_parent',
        entity: 'Person',
        entityId: person.id,
        detail: person.name,
      });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }),
);

router.delete(
  '/:id',
  admin(async (req, res, next) => {
    try {
      const teamId = Number(req.params.id);
      const team = await prisma.team.findUnique({
        where: { id: teamId },
        include: { members: true },
      });
      if (!team) return res.status(404).json({ error: 'Team niet gevonden' });

      await prisma.team.update({ where: { id: teamId }, data: { coordinatorId: null } });

      let removedParents = 0;
      let keptAccounts = 0;
      let keptHistory = 0;
      for (const member of team.members) {
        const nameless = !member.email && !member.passwordHash && !member.guardianId;
        const otherTeams = await prisma.team.count({
          where: { coordinatorId: member.id, id: { not: teamId } },
        });
        if (nameless && !otherTeams) {
          const duties = await prisma.enrollment.count({ where: { personId: member.id } });
          if (duties === 0) {
            await prisma.person.delete({ where: { id: member.id } });
            removedParents += 1;
            continue;
          }
          keptHistory += 1;
        } else {
          keptAccounts += 1;
        }
        if (member.teamId === teamId) {
          await prisma.person.update({ where: { id: member.id }, data: { teamId: null } });
        }
      }

      await prisma.match.updateMany({ where: { teamId }, data: { teamId: null } });
      await prisma.service.updateMany({ where: { assignedTeamId: teamId }, data: { assignedTeamId: null } });
      await prisma.serviceRule.updateMany({
        where: { conditionTeamId: teamId },
        data: { conditionTeamId: null },
      });
      await prisma.enrollment.updateMany({ where: { forTeamId: teamId }, data: { forTeamId: null } });
      await prisma.team.delete({ where: { id: teamId } });
      await writeAudit({
        actorId: req.person.id,
        action: 'team.delete',
        entity: 'Team',
        entityId: teamId,
        detail: `${team.name} · ${removedParents} ouders zonder dienst verwijderd`,
      });
      res.json({ ok: true, removedParents, keptAccounts, keptHistory });
    } catch (err) {
      next(err);
    }
  }),
);

export default router;
