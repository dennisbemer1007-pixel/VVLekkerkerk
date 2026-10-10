import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { addWeeks, endOfDay, endOfWeek, startOfDay, startOfWeek, toIsoDate } from '../lib/dates.js';
import { mapService, serviceInclude } from '../lib/serviceHelpers.js';
import { proposeFromMatches, publishDraftServices } from '../lib/proposePlanning.js';
import { notifyMandatory, notifyVolunteers } from '../lib/mail.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { ADMIN_ROLES, isAdminRole } from '../lib/roles.js';
import {
  executedCountForObligation,
  personalEnrollmentCount,
  remainingObligation,
  underQuota,
  vr18NeedsFillInCurrent,
  vr18PeriodCounts,
} from '../lib/obligation.js';
import { resolvePublicAppUrl } from '../lib/appUrl.js';
import { fillMandatoryPersonal } from '../lib/autoFill.js';
import { buildPlanningControls } from '../lib/planningControls.js';
import { writeAudit } from '../lib/audit.js';
import { markPlanningOfficial, unmarkPlanningOfficial } from '../lib/official.js';
import { runDutyReminders } from '../lib/reminders.js';
import { periodFromRound, periodJson, previousPlanningPeriod, resolvePlanningPeriod } from '../lib/planningPeriod.js';
import {
  activatePlanningRound,
  createPlanningRound,
  getActiveRound,
  listPlanningRounds,
  publicRound,
  updatePlanningRound,
} from '../lib/planningRounds.js';
import { workbookToXlsx } from '../lib/xlsxWrite.js';
import { personShiftRows } from '../lib/planningExport.js';
import { displayEnrollmentReason } from '../lib/teamDutyPlanning.js';
import { includesText, queryText, tightenDate } from '../lib/listFilters.js';

const router = Router();
const admin = (...args) => requireRole(...ADMIN_ROLES)(...args);

router.get(
  '/stats',
  requireAuth(async (req, res, next) => {
  try {
    const services = await prisma.service.findMany({
      where: { active: true, draft: false },
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

    const [personCount, serviceCount, enrollmentCount, teamCount, matchCount, draftCount, pendingSwapCount] =
      await Promise.all([
        prisma.person.count({ where: { active: true } }),
        prisma.service.count({ where: { active: true, draft: false } }),
        prisma.enrollment.count(),
        prisma.team.count(),
        prisma.match.count(),
        prisma.service.count({ where: { active: true, draft: true } }),
        prisma.swapRequest.count({ where: { status: 'PENDING_COMMITTEE' } }),
      ]);

    const occupancyRate =
      totalRequired === 0 ? 0 : Math.round((totalEnrolled / totalRequired) * 100);

    const now = new Date();
    const sixWeeksAgo = startOfDay(addWeeks(now, -6));
    const yearStart = new Date(now.getFullYear(), 0, 1);

    const twelveWeeksAgo = startOfDay(addWeeks(now, -12));
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

    const round = await getActiveRound(prisma);
    const seasonStart = round?.fromDate ? startOfDay(round.fromDate) : yearStart;
    const seasonEnd = round?.toDate ? endOfDay(round.toDate) : endOfDay(now);
    const previous = round?.fromDate ? await previousPlanningPeriod(prisma, seasonStart, seasonEnd) : null;
    const currentPeriod = { from: seasonStart, to: seasonEnd };

    const dutyStats = people.map((p) => {
      const last6 = personalEnrollmentCount(p.enrollments, sixWeeksAgo, endOfDay(now));
      const last12 = personalEnrollmentCount(p.enrollments, twelveWeeksAgo, endOfDay(now));
      const thisYear = personalEnrollmentCount(p.enrollments, yearStart, endOfDay(now));
      const vr18 = vr18PeriodCounts(p.enrollments, currentPeriod, previous);
      const executed = executedCountForObligation(p, {
        count6w: last6,
        count12w: last12,
        countYear: thisYear,
        countPeriod: vr18.currentCount,
        countPrevious: vr18.previousCount,
        vr18Done: p.obligation === 'VR18' ? !vr18NeedsFillInCurrent(vr18) : undefined,
      });
      return {
        id: p.id,
        name: p.name,
        role: p.role,
        team: p.team?.name ?? null,
        obligation: p.obligation,
        exempted: p.exempted,
        makeupDue: p.makeupDue ?? 0,
        personNumber: p.personNumber,
        barLast6Weeks: last6,
        barLast12Weeks: last12,
        barThisYear: thisYear,
        barThisSeason: vr18.currentCount,
        underQuota: underQuota(p, last6, thisYear, vr18),
        stillNeeded: remainingObligation(p, executed),
      };
    });

    const controls = isAdminRole(req.person.role) ? await buildPlanningControls(now) : null;

    let notSelfEnrolled = [];
    let noShowPeople = [];
    if (round?.fromDate && round?.toDate) {
      const roundServices = await prisma.service.findMany({
        where: {
          active: true,
          draft: false,
          date: { gte: startOfDay(round.fromDate), lte: endOfDay(round.toDate) },
        },
        select: { id: true },
      });
      const serviceIds = roundServices.map((s) => s.id);
      const enrollmentsInPeriod = serviceIds.length
        ? await prisma.enrollment.findMany({
            where: { serviceId: { in: serviceIds } },
            select: { personId: true, source: true, noShow: true, service: { select: { date: true } } },
          })
        : [];
      const enrolledAnyIds = new Set(enrollmentsInPeriod.map((e) => e.personId));
      // Verplicht FULL: nergens in deze planning. VR18+: niet vorige én niet huidige.
      notSelfEnrolled = people
        .filter((p) => {
          if (p.exempted) return false;
          if (p.obligation === 'FULL') return !enrolledAnyIds.has(p.id);
          if (p.obligation === 'VR18') return vr18NeedsFillInCurrent(vr18PeriodCounts(p.enrollments, currentPeriod, previous));
          return false;
        })
        .map((p) => ({
          id: p.id,
          name: p.name,
          role: p.role,
          team: p.team?.name ?? null,
          obligation: p.obligation,
        }));

      const noShowRows = await prisma.enrollment.findMany({
        where: { noShow: true },
        select: {
          personId: true,
          service: { select: { date: true } },
        },
        orderBy: { service: { date: 'desc' } },
      });
      const noShowByPerson = new Map();
      for (const row of noShowRows) {
        const cur = noShowByPerson.get(row.personId) || { count: 0, dates: [] };
        cur.count += 1;
        if (row.service?.date) cur.dates.push(row.service.date);
        noShowByPerson.set(row.personId, cur);
      }
      noShowPeople = people
        .filter((p) => noShowByPerson.has(p.id) && (p.obligation === 'FULL' || p.obligation === 'VR18'))
        .map((p) => {
          const info = noShowByPerson.get(p.id);
          return {
            id: p.id,
            name: p.name,
            role: p.role,
            team: p.team?.name ?? null,
            obligation: p.obligation,
            noShowCount: info.count,
            lastNoShowDate: info.dates[0] || null,
          };
        });
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
            noShowPeople,
            planningRound: round,
            controls,
            pendingSwapCount,
          }
        : {}),
    });
  } catch (err) {
    next(err);
  }
}),
);

router.get(
  '/rounds',
  requireAuth(async (_req, res, next) => {
    try {
      const rounds = await listPlanningRounds(prisma);
      res.json(rounds.map(publicRound));
    } catch (err) {
      next(err);
    }
  }),
);

router.get(
  '/round',
  requireAuth(async (_req, res, next) => {
  try {
    const round = await getActiveRound(prisma);
    res.json(publicRound(round));
  } catch (err) {
    next(err);
  }
}),
);

router.post(
  '/rounds',
  admin(async (req, res, next) => {
    try {
      const round = await createPlanningRound(prisma, {
        label: req.body?.label,
        from: req.body?.from,
        to: req.body?.to,
      });
      await writeAudit({
        actorId: req.person.id,
        action: 'planning.round.create',
        entity: 'PlanningRound',
        entityId: round.id,
        detail: `${round.label}: ${round.fromDate?.toISOString?.()?.slice(0, 10)} t/m ${round.toDate?.toISOString?.()?.slice(0, 10)}`,
      });
      res.status(201).json(publicRound(round));
    } catch (err) {
      next(err);
    }
  }),
);

router.post(
  '/rounds/:id/activate',
  admin(async (req, res, next) => {
    try {
      const round = await activatePlanningRound(prisma, req.params.id);
      await writeAudit({
        actorId: req.person.id,
        action: 'planning.round.activate',
        entity: 'PlanningRound',
        entityId: round.id,
        detail: round.label,
      });
      res.json(publicRound(round));
    } catch (err) {
      next(err);
    }
  }),
);

router.put(
  '/rounds/:id',
  admin(async (req, res, next) => {
    try {
      const round = await updatePlanningRound(prisma, req.params.id, {
        label: req.body?.label,
        from: req.body?.from,
        to: req.body?.to,
        volunteerDeadline: req.body?.volunteerDeadline,
      });
      res.json(publicRound(round));
    } catch (err) {
      next(err);
    }
  }),
);

router.get(
  '/',
  requireAuth(async (req, res, next) => {
  try {
    const { from, to, filter, personId, includeDraft, type } = req.query;
    const where = { active: true };
    if (type === 'BAR' || type === 'KITCHEN') where.type = type;
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
      const roundPeriod = await periodFromRound(prisma);
      where.date = { gte: roundPeriod.from, lte: roundPeriod.to };
    } else {
      where.date = {};
      if (from) where.date.gte = startOfDay(new Date(from));
      if (to) where.date.lte = endOfDay(new Date(to));
    }
    if (from || to) where.date = tightenDate(where.date, { from, to });

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
    const q = queryText(req.query);
    if (q) {
      services = services.filter((s) =>
        (s.enrollments || []).some((e) => includesText(e.person?.name, q)),
      );
    }

    const periodStart = where.date?.gte ?? startOfDay(now);
    const periodEnd = where.date?.lte ?? endOfDay(addWeeks(now, 6));
    res.json({
      services,
      period: {
        from: from || toIsoDate(periodStart),
        to: to || toIsoDate(periodEnd),
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
      await writeAudit({
        actorId: req.person.id,
        action: 'planning.publish',
        entity: 'PlanningRound',
        entityId: 1,
        detail: `${result.published} concept(en) gepubliceerd`,
      });
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
      const round = await getActiveRound(prisma);
      const mail = await notifyVolunteers({
        deadline: round?.volunteerDeadline,
        appUrl: resolvePublicAppUrl(),
      });
      await prisma.planningRound.update({
        where: { id: round.id },
        data: { volunteerNotifiedAt: new Date(), status: 'VOLUNTEER_OPEN' },
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
      const round = await getActiveRound(prisma);
      await prisma.planningRound.update({
        where: { id: round.id },
        data: { status: 'MANDATORY_OPEN', mandatoryNotifiedAt: new Date() },
      });
      res.json({ ok: true, mail });
    } catch (err) {
      next(err);
    }
  }),
);

/**
 * Vul open persoonlijke plekken met verplichte leden / VR18+ / inhaaldiensten.
 */
router.post(
  '/fill-mandatory',
  admin(async (req, res, next) => {
    try {
      const result = await fillMandatoryPersonal({ actorId: req.person.id, ...req.body });
      res.json(result);
    } catch (err) {
      next(err);
    }
  }),
);

router.get(
  '/controls',
  admin(async (_req, res, next) => {
    try {
      const controls = await buildPlanningControls();
      res.json(controls);
    } catch (err) {
      next(err);
    }
  }),
);

router.post(
  '/official',
  admin(async (req, res, next) => {
    try {
      const result = await markPlanningOfficial(req.body ?? {});
      await writeAudit({
        actorId: req.person.id,
        action: 'planning.official',
        entity: 'PlanningRound',
        entityId: 1,
        detail: `${result.locked} dienst(en) vergrendeld`,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  }),
);

router.post(
  '/unofficial',
  admin(async (req, res, next) => {
    try {
      const result = await unmarkPlanningOfficial(req.body ?? {});
      await writeAudit({
        actorId: req.person.id,
        action: 'planning.unofficial',
        entity: 'PlanningRound',
        entityId: 1,
        detail: `${result.unlocked} dienst(en) ontgrendeld`,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  }),
);

router.post(
  '/remind',
  admin(async (_req, res, next) => {
    try {
      const result = await runDutyReminders();
      res.json(result);
    } catch (err) {
      next(err);
    }
  }),
);

router.get(
  '/export.xlsx',
  requireAuth(async (req, res, next) => {
    try {
      const now = startOfDay(new Date());
      const roundPeriod = await periodFromRound(prisma);
      const from = req.query.from ? startOfDay(new Date(req.query.from)) : roundPeriod.from;
      const to = req.query.to ? endOfDay(new Date(req.query.to)) : roundPeriod.to;
      const services = await prisma.service.findMany({
        where: { active: true, draft: false, date: { gte: from, lte: to } },
        include: {
          enrollments: {
            include: { person: true, forTeam: true },
            orderBy: { createdAt: 'asc' },
          },
          assignedTeam: true,
          teamDuties: { include: { team: true } },
          activity: { select: { id: true, name: true, type: true } },
        },
        orderBy: [{ date: 'asc' }, { time: 'asc' }],
      });

      const dienstRows = services.map((s) => [
        toIsoDate(s.date),
        s.time,
        s.type === 'KITCHEN' ? 'Keuken' : 'Bar',
        s.activity?.name || '',
        s.kind,
        s.required,
        s.enrollments.length,
        s.assignedTeam?.name || '',
        s.locked ? 'ja' : 'nee',
        (s.enrollments || [])
          .map((e) => {
            const name = e.person?.name;
            if (!name) return '';
            if (e.kind === 'TEAM') {
              const team =
                e.forTeam?.name ||
                (s.teamDuties || []).find((d) => Number(d.teamId) === Number(e.forTeamId))?.team
                  ?.name;
              if (team) return `${name} (${team})`;
            }
            return name;
          })
          .filter(Boolean)
          .join(', '),
      ]);
      const adminExport = isAdminRole(req.person.role);
      const peopleForCounts = adminExport
        ? await prisma.person.findMany({
            where: { active: true },
            include: { team: true },
            orderBy: { name: 'asc' },
          })
        : [];
      const inschrijfRows = services.flatMap((s) =>
        (s.enrollments || []).map((e) => {
          const row = [
            toIsoDate(s.date),
            s.time,
            s.type === 'KITCHEN' ? 'Keuken' : 'Bar',
            e.person?.name || '',
          ];
          if (adminExport) row.push(e.person?.personNumber || '');
          row.push(
            e.kind,
            e.source,
            e.makeup ? 'ja' : 'nee',
            e.noShow ? 'ja' : 'nee',
            displayEnrollmentReason(e.reason) || e.reason || '',
          );
          return row;
        }),
      );

      const sheets = [
        {
          name: 'Diensten',
          headers: ['Datum', 'Tijd', 'Type', 'Activiteit', 'Soort', 'Nodig', 'Ingeschreven', 'Team', 'Officieel', 'Namen'],
          rows: dienstRows,
        },
        {
          name: 'Inschrijvingen',
          headers: adminExport
            ? ['Datum', 'Tijd', 'Type', 'Naam', 'Persoonsnr', 'Soort', 'Bron', 'Inhaal', 'No-show', 'Reden']
            : ['Datum', 'Tijd', 'Type', 'Naam', 'Soort', 'Bron', 'Inhaal', 'No-show', 'Reden'],
          rows: inschrijfRows,
        },
        {
          name: 'Per persoon',
          headers: ['Naam', 'Diensten', 'No-shows', 'Laatste dienst'],
          rows: personShiftRows(services, adminExport ? peopleForCounts : []),
        },
      ];

      if (adminExport) {
        sheets.push({
          name: 'Personen',
          headers: ['Persoonsnr', 'Naam', 'Rol', 'Verplichting', 'Team', 'Vrijgesteld', 'Inhaal'],
          rows: peopleForCounts.map((p) => [
            p.personNumber || '',
            p.name,
            p.role,
            p.obligation,
            p.team?.name || '',
            p.exempted ? 'ja' : 'nee',
            p.makeupDue ?? 0,
          ]),
        });
      }

      const buf = workbookToXlsx(sheets);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader('Content-Disposition', 'attachment; filename="vvl-planning.xlsx"');
      res.send(buf);
    } catch (err) {
      next(err);
    }
  }),
);

export default router;
