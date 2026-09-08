import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { addWeeks, endOfDay, endOfWeek, startOfDay, startOfWeek, toIsoDate } from '../lib/dates.js';
import { mapService, serviceInclude } from '../lib/serviceHelpers.js';
import { proposeFromMatches, publishDraftServices } from '../lib/proposePlanning.js';
import { notifyMandatory, notifyVolunteers } from '../lib/mail.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { ADMIN_ROLES, isAdminRole } from '../lib/roles.js';
import {
  isUnavailableOn,
  OBLIGATIONS,
  prefersSlot,
  underQuota,
  POST_MATCH_BUFFER_MINUTES,
} from '../lib/obligation.js';
import { combineDateAndTime, addMinutesToDate } from '../lib/time.js';
import { resolvePublicAppUrl } from '../lib/appUrl.js';

const router = Router();
const admin = (...args) => requireRole(...ADMIN_ROLES)(...args);

function barEnrollmentCount(enrollments, from, to) {
  return enrollments.filter((e) => {
    const d = new Date(e.service?.date ?? e.createdAt);
    if (e.service && e.service.type !== 'BAR') return false;
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  }).length;
}

router.get(
  '/stats',
  requireAuth(async (req, res, next) => {
  try {
    const services = await prisma.service.findMany({
      where: { active: true, draft: false, type: 'BAR' },
      include: { enrollments: true },
    });

    let full = 0;
    let almost = 0;
    let open = 0;
    let totalRequired = 0;
    let totalEnrolled = 0;

    for (const s of services) {
      const enrolled = s.enrollments.length;
      const required = s.required;
      totalRequired += required;
      totalEnrolled += Math.min(enrolled, required);
      const mapped = mapService(s);
      if (mapped.status === 'full') full += 1;
      else if (mapped.status === 'almost') almost += 1;
      else open += 1;
    }

    const [personCount, serviceCount, enrollmentCount, teamCount, matchCount, draftCount] =
      await Promise.all([
        prisma.person.count({ where: { active: true } }),
        prisma.service.count({ where: { active: true, draft: false, type: 'BAR' } }),
        prisma.enrollment.count(),
        prisma.team.count(),
        prisma.match.count(),
        prisma.service.count({ where: { active: true, draft: true, type: 'BAR' } }),
      ]);

    const occupancyRate =
      totalRequired === 0 ? 0 : Math.round((totalEnrolled / totalRequired) * 100);

    const now = new Date();
    const sixWeeksAgo = startOfDay(addWeeks(now, -6));
    const yearStart = new Date(now.getFullYear(), 0, 1);

    const people = await prisma.person.findMany({
      where: { active: true },
      include: {
        team: true,
        enrollments: {
          include: { service: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    const dutyStats = people.map((p) => {
      const last6 = barEnrollmentCount(p.enrollments, sixWeeksAgo, endOfDay(now));
      const thisYear = barEnrollmentCount(p.enrollments, yearStart, endOfDay(now));
      return {
        id: p.id,
        name: p.name,
        team: p.team?.name ?? null,
        obligation: p.obligation,
        barLast6Weeks: last6,
        barThisYear: thisYear,
        underQuota: underQuota(p, last6, thisYear),
      };
    });

    let round = await prisma.planningRound.findUnique({ where: { id: 1 } });
    let notSelfEnrolled = [];
    if (round?.fromDate && round?.toDate) {
      const roundServices = await prisma.service.findMany({
        where: {
          active: true,
          draft: false,
          type: 'BAR',
          date: { gte: startOfDay(round.fromDate), lte: endOfDay(round.toDate) },
        },
        select: { id: true },
      });
      const serviceIds = roundServices.map((s) => s.id);
      const selfEnrolled = serviceIds.length
        ? await prisma.enrollment.findMany({
            where: { serviceId: { in: serviceIds }, source: 'SELF' },
            select: { personId: true },
            distinct: ['personId'],
          })
        : [];
      const selfIds = new Set(selfEnrolled.map((e) => e.personId));
      notSelfEnrolled = people
        .filter((p) => !selfIds.has(p.id))
        .map((p) => ({
          id: p.id,
          name: p.name,
          team: p.team?.name ?? null,
          obligation: p.obligation,
        }));
    }

    res.json({
      personCount,
      serviceCount,
      enrollmentCount,
      teamCount,
      matchCount,
      ...(isAdminRole(req.person.role) ? { draftCount } : {}),
      full,
      almost,
      open,
      occupancyRate,
      ...(isAdminRole(req.person.role)
        ? {
            dutyStats,
            notSelfEnrolled,
            planningRound: round,
          }
        : {}),
    });
  } catch (err) {
    next(err);
  }
}),
);

router.get(
  '/round',
  requireAuth(async (_req, res, next) => {
  try {
    let round = await prisma.planningRound.findUnique({ where: { id: 1 } });
    if (!round) {
      round = await prisma.planningRound.create({ data: { id: 1, status: 'DRAFT' } });
    }
    res.json(round);
  } catch (err) {
    next(err);
  }
}),
);

router.get(
  '/',
  requireAuth(async (req, res, next) => {
  try {
    const { from, to, filter, personId, includeDraft } = req.query;
    const where = { active: true, type: 'BAR' };
    if (includeDraft === 'true' && isAdminRole(req.person.role)) {
      // admin mag drafts zien
    } else {
      where.draft = false;
    }

    const now = new Date();

    if (filter === 'today') {
      where.date = { gte: startOfDay(now), lte: endOfDay(now) };
    } else if (filter === 'week') {
      where.date = { gte: startOfWeek(now), lte: endOfWeek(now) };
    } else if (!from && !to) {
      where.date = { gte: startOfDay(now), lte: endOfDay(addWeeks(now, 6)) };
    } else {
      where.date = {};
      if (from) where.date.gte = startOfDay(new Date(from));
      if (to) where.date.lte = endOfDay(new Date(to));
    }

    let services = await prisma.service.findMany({
      where,
      include: serviceInclude,
      orderBy: [{ date: 'asc' }, { time: 'asc' }],
    });

    services = services.map(mapService);

    if (filter === 'open') {
      services = services.filter((s) => s.status !== 'full');
    }
    if (filter === 'mine' && personId) {
      const pid = Number(personId);
      if (pid !== req.person.id && !isAdminRole(req.person.role)) {
        return res.status(403).json({ error: 'Geen toegang tot andermans planning' });
      }
      services = services.filter((s) =>
        s.enrollments.some((e) => e.personId === pid),
      );
    }

    res.json({
      services,
      period: {
        from: from || toIsoDate(where.date?.gte ?? startOfDay(now)),
        to: to || toIsoDate(where.date?.lte ?? endOfDay(addWeeks(now, 6))),
      },
    });
  } catch (err) {
    next(err);
  }
}),
);

/** Legacy: één bardienst per thuiswedstrijd */
router.post(
  '/from-matches',
  admin(async (req, res, next) => {
    try {
      const { defaultTime = '10:00 - 14:00', required = 2 } = req.body ?? {};
      const from = startOfDay(new Date());
      const matches = await prisma.match.findMany({
        where: { home: true, date: { gte: from } },
        orderBy: { date: 'asc' },
      });

      const created = [];
      for (const match of matches) {
        const exists = await prisma.service.findFirst({
          where: {
            type: 'BAR',
            date: { gte: startOfDay(match.date), lte: endOfDay(match.date) },
            slot: null,
          },
        });
        if (exists) continue;

        const service = await prisma.service.create({
          data: {
            type: 'BAR',
            date: match.date,
            time: String(defaultTime),
            required: Math.max(1, Number(required) || 2),
            location: 'Bar',
            draft: false,
            matchId: match.id,
            note: match.opponent ? `Thuiswedstrijd vs ${match.opponent}` : 'Thuiswedstrijd',
          },
          include: serviceInclude,
        });
        created.push(mapService(service));
      }

      res.status(201).json({ created: created.length, services: created });
    } catch (err) {
      next(err);
    }
  }),
);

/** Planning bijwerken vanuit thuiswedstrijden (ochtend/middag/avond) */
router.post(
  '/propose',
  admin(async (req, res, next) => {
    try {
      const result = await proposeFromMatches(req.body ?? {});
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }),
);

router.post(
  '/sync',
  admin(async (req, res, next) => {
    try {
      const result = await proposeFromMatches(req.body ?? {});
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }),
);

/** Concept publiceren + vrijwilligersfase openen */
router.post(
  '/publish',
  admin(async (req, res, next) => {
    try {
      const result = await publishDraftServices(req.body ?? {});
      res.json(result);
    } catch (err) {
      next(err);
    }
  }),
);

/** Bericht naar vrijwilligers: inschrijven tot deadline */
router.post(
  '/notify-volunteers',
  admin(async (req, res, next) => {
    try {
      const round = await prisma.planningRound.findUnique({ where: { id: 1 } });
      const mail = await notifyVolunteers({
        deadline: round?.volunteerDeadline,
        appUrl: resolvePublicAppUrl(),
      });
      await prisma.planningRound.upsert({
        where: { id: 1 },
        create: { id: 1, status: 'VOLUNTEER_OPEN', volunteerNotifiedAt: new Date() },
        update: { volunteerNotifiedAt: new Date(), status: 'VOLUNTEER_OPEN' },
      });
      res.json({ ok: true, mail });
    } catch (err) {
      next(err);
    }
  }),
);

/** Bericht naar verplichte bardienst */
router.post(
  '/notify-mandatory',
  admin(async (req, res, next) => {
    try {
      const mail = await notifyMandatory({ appUrl: resolvePublicAppUrl() });
      await prisma.planningRound.upsert({
        where: { id: 1 },
        create: { id: 1, status: 'MANDATORY_OPEN', mandatoryNotifiedAt: new Date() },
        update: { status: 'MANDATORY_OPEN', mandatoryNotifiedAt: new Date() },
      });
      res.json({ ok: true, mail });
    } catch (err) {
      next(err);
    }
  }),
);

/**
 * Vul open plekken met verplichte vrijwilligers (quota, team, beschikbaarheid, voorkeur).
 */
router.post(
  '/fill-mandatory',
  admin(async (_req, res, next) => {
    try {
      const from = startOfDay(new Date());
      const to = endOfDay(addWeeks(from, 6));
      const sixWeeksAgo = startOfDay(addWeeks(from, -6));
      const yearStart = new Date(from.getFullYear(), 0, 1);

      const services = await prisma.service.findMany({
        where: {
          active: true,
          draft: false,
          type: 'BAR',
          date: { gte: from, lte: to },
        },
        include: {
          enrollments: true,
          assignedTeam: { include: { members: true } },
          match: { include: { team: true } },
        },
        orderBy: [{ date: 'asc' }, { time: 'asc' }],
      });

      const mandatory = await prisma.person.findMany({
        where: {
          active: true,
          obligation: { in: [OBLIGATIONS.FULL, OBLIGATIONS.HALF] },
        },
        include: {
          enrollments: { include: { service: true } },
          team: true,
        },
      });

      const homeMatches = await prisma.match.findMany({
        where: {
          home: true,
          date: { gte: from, lte: to },
          teamId: { not: null },
        },
        include: { team: true },
      });

      const busyUntilByTeamDay = new Map();
      for (const m of homeMatches) {
        if (!m.teamId || !m.team) continue;
        const dayKey = `${m.teamId}:${startOfDay(m.date).toISOString()}`;
        const duration = m.team.matchDurationMinutes ?? 90;
        const busyUntil = addMinutesToDate(m.date, duration + POST_MATCH_BUFFER_MINUTES);
        const prev = busyUntilByTeamDay.get(dayKey);
        if (!prev || busyUntil > prev) busyUntilByTeamDay.set(dayKey, busyUntil);
      }

      const counts6w = Object.fromEntries(
        mandatory.map((p) => [p.id, barEnrollmentCount(p.enrollments, sixWeeksAgo, to)]),
      );
      const countsYear = Object.fromEntries(
        mandatory.map((p) => [p.id, barEnrollmentCount(p.enrollments, yearStart, to)]),
      );

      const enrolledToday = new Set();
      let filled = 0;
      const details = [];

      for (const service of services) {
        let open = service.required - service.enrollments.length;
        if (open <= 0) continue;

        const already = new Set(service.enrollments.map((e) => e.personId));
        const serviceStart = combineDateAndTime(service.date, service.time);
        const dayIso = startOfDay(service.date).toISOString();

        const eligible = (p) => {
          if (already.has(p.id) || enrolledToday.has(`${p.id}:${dayIso}`)) return false;
          if (isUnavailableOn(p, service.date)) return false;
          if (p.teamId) {
            const busy = busyUntilByTeamDay.get(`${p.teamId}:${dayIso}`);
            if (busy && serviceStart < busy) return false;
          }
          return true;
        };

        let candidates = mandatory.filter(
          (p) =>
            eligible(p) &&
            (service.assignedTeamId ? p.teamId === service.assignedTeamId : true),
        );

        if (candidates.length === 0 && service.assignedTeamId) {
          candidates = mandatory.filter((p) => eligible(p));
        }

        candidates.sort((a, b) => {
          const aUnder = underQuota(a, counts6w[a.id], countsYear[a.id]) ? 0 : 1;
          const bUnder = underQuota(b, counts6w[b.id], countsYear[b.id]) ? 0 : 1;
          if (aUnder !== bUnder) return aUnder - bUnder;

          const aPref = prefersSlot(a, service.slot) ? 0 : 1;
          const bPref = prefersSlot(b, service.slot) ? 0 : 1;
          if (aPref !== bPref) return aPref - bPref;

          const aCount = (counts6w[a.id] ?? 0) + (countsYear[a.id] ?? 0);
          const bCount = (counts6w[b.id] ?? 0) + (countsYear[b.id] ?? 0);
          return aCount - bCount;
        });

        for (const person of candidates) {
          if (open <= 0) break;
          await prisma.enrollment.create({
            data: { serviceId: service.id, personId: person.id, source: 'AUTO' },
          });
          counts6w[person.id] = (counts6w[person.id] ?? 0) + 1;
          countsYear[person.id] = (countsYear[person.id] ?? 0) + 1;
          enrolledToday.add(`${person.id}:${dayIso}`);
          open -= 1;
          filled += 1;
          details.push({
            serviceId: service.id,
            personId: person.id,
            personName: person.name,
            team: service.assignedTeam?.name ?? null,
            obligation: person.obligation,
          });
        }
      }

      await prisma.planningRound.upsert({
        where: { id: 1 },
        create: { id: 1, status: 'CLOSED' },
        update: { status: 'CLOSED' },
      });

      res.json({ filled, details });
    } catch (err) {
      next(err);
    }
  }),
);

export default router;
