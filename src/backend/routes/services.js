import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { endOfDay, endOfWeek, startOfDay, startOfWeek } from '../lib/dates.js';
import { mapService, serviceInclude, serviceLocation } from '../lib/serviceHelpers.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { ADMIN_ROLES, isAdminRole } from '../lib/roles.js';
import {
  clampServiceDateFilter,
  enrollableServiceRange,
  volunteerMayAccessService,
} from '../lib/planningPeriod.js';
import { includesText, queryText, tightenDate } from '../lib/listFilters.js';
import { inferSlot } from '../lib/pdfRoster.js';

const router = Router();
const admin = (...args) => requireRole(...ADMIN_ROLES)(...args);

function buildServiceWhere(query) {
  const { from, to, filter, activeOnly, allDates, includeDraft, type } = query;
  const where = {};
  if (type === 'BAR' || type === 'KITCHEN') where.type = type;

  if (activeOnly !== 'false') where.active = true;
  if (includeDraft !== 'true') where.draft = false;

  const now = new Date();
  if (filter === 'today') {
    where.date = { gte: startOfDay(now), lte: endOfDay(now) };
  } else if (filter === 'week') {
    where.date = { gte: startOfWeek(now), lte: endOfWeek(now) };
  } else if (filter === 'mine') {
    where.date = { gte: startOfDay(now) };
  } else if (from || to) {
    where.date = {};
    if (from) where.date.gte = startOfDay(new Date(from));
    if (to) where.date.lte = endOfDay(new Date(to));
  } else if (allDates !== 'true') {
    where.date = { gte: startOfDay(now) };
  }

  if (query.from || query.to) {
    where.date = tightenDate(where.date, query);
  }

  return {
    where,
    filter,
    personId: query.personId ? Number(query.personId) : null,
    q: queryText(query),
  };
}

router.get(
  '/',
  requireAuth(async (req, res, next) => {
    try {
      let { where, filter, personId, q } = buildServiceWhere(req.query);
      const adminViewer = isAdminRole(req.person.role);

      // Concepten: beheerders altijd (met label in UI); vrijwilligers alleen via "Mijn diensten".
      if (adminViewer || filter === 'mine') {
        delete where.draft;
      } else if (req.query.includeDraft === 'true') {
        where.draft = false;
      }

      // Vrijwilligers: alleen gepubliceerde planning of jaarplanning met open inschrijving.
      // "Mijn diensten" blijft zichtbaar voor bestaande inschrijvingen (ook concept).
      let enrollablePeriod = null;
      if (!adminViewer && filter !== 'mine') {
        enrollablePeriod = await enrollableServiceRange(prisma);
        if (enrollablePeriod.empty) {
          // Geen gepubliceerde ronde: alleen expliciet open activiteiten uit de jaarplanning.
          where = {
            ...where,
            draft: false,
            activity: { openForEnrollment: true },
          };
        } else {
          where = {
            ...where,
            draft: false,
            OR: [
              { activity: { openForEnrollment: true } },
              { date: clampServiceDateFilter(where.date, enrollablePeriod) },
            ],
          };
        }
      }

      let services = await prisma.service.findMany({
        where,
        include: serviceInclude,
        orderBy: [{ date: 'asc' }, { time: 'asc' }],
      });

      if (!enrollablePeriod) {
        enrollablePeriod = await enrollableServiceRange(prisma);
      }
      services = services.map((row) => {
        const mapped = mapService(row);
        return {
          ...mapped,
          visibleToVolunteers: volunteerMayAccessService(mapped, enrollablePeriod),
        };
      });

      if (filter === 'open') {
        services = services.filter((s) => s.status !== 'full');
      }
      if (!adminViewer && filter !== 'mine') {
        services = services.filter((s) => volunteerMayAccessService(s, enrollablePeriod));
      }
      if (filter === 'mine') {
        const pid = personId || req.person.id;
        if (pid !== req.person.id && !isAdminRole(req.person.role)) {
          return res.status(403).json({ error: 'Geen toegang tot andermans diensten' });
        }
        const ids = new Set([pid]);
        if (pid === req.person.id) {
          const children = await prisma.person.findMany({
            where: { guardianId: req.person.id },
            select: { id: true },
          });
          for (const child of children) ids.add(child.id);
        }
        services = services.filter((s) =>
          s.enrollments.some((e) => ids.has(e.personId)),
        );
      }
      if (q) {
        services = services.filter((s) =>
          (s.enrollments || []).some((e) => includesText(e.person?.name, q)),
        );
      }

      res.json(services);
    } catch (err) {
      next(err);
    }
  }),
);

router.post(
  '/',
  admin(async (req, res, next) => {
    try {
      const { date, time, note, required, location, active, draft, slot, assignedTeamId, type, locked, kind, matchId } =
        req.body;
      if (!date || !time?.trim()) {
        return res.status(400).json({ error: 'Datum en tijd zijn verplicht' });
      }
      const serviceType = type === 'KITCHEN' ? 'KITCHEN' : 'BAR';
      const serviceKind = kind === 'TEAM' || assignedTeamId ? 'TEAM' : 'PERSONAL';
      const timeTrimmed = time.trim();
      const rawSlot = slot?.trim() || '';
      const resolvedSlot =
        rawSlot && rawSlot !== 'EXTRA'
          ? rawSlot
          : inferSlot({ type: serviceType, time: timeTrimmed, slot: rawSlot || 'EXTRA' });
      const service = await prisma.service.create({
        data: {
          type: serviceType,
          date: new Date(date),
          time: timeTrimmed,
          note: note?.trim() || null,
          required: Math.max(1, Number(required) || 2),
          location: location?.trim() || serviceLocation(serviceType),
          active: active !== false,
          draft: Boolean(draft),
          locked: Boolean(locked),
          kind: serviceKind,
          origin: 'MANUAL',
          slot: resolvedSlot,
          assignedTeamId: assignedTeamId ? Number(assignedTeamId) : null,
          matchId: matchId ? Number(matchId) : null,
        },
        include: serviceInclude,
      });
      res.status(201).json(mapService(service));
    } catch (err) {
      next(err);
    }
  }),
);

router.put(
  '/:id',
  admin(async (req, res, next) => {
    try {
      const { type, date, time, note, required, location, active, draft, slot, assignedTeamId, locked, kind, matchId } =
        req.body;
      const nextType =
        type !== undefined ? (type === 'KITCHEN' ? 'KITCHEN' : 'BAR') : undefined;
      const nextTime = time !== undefined ? time.trim() : undefined;
      let nextSlot;
      if (slot !== undefined || nextTime !== undefined || nextType !== undefined) {
        const rawSlot = slot !== undefined ? slot?.trim() || '' : undefined;
        if (rawSlot && rawSlot !== 'EXTRA') {
          nextSlot = rawSlot;
        } else if (nextTime || rawSlot === 'EXTRA' || rawSlot === '') {
          const existing = await prisma.service.findUnique({
            where: { id: Number(req.params.id) },
            select: { type: true, time: true, slot: true },
          });
          nextSlot = inferSlot({
            type: nextType || existing?.type,
            time: nextTime || existing?.time,
            slot: rawSlot || existing?.slot || 'EXTRA',
          });
        }
      }
      const service = await prisma.service.update({
        where: { id: Number(req.params.id) },
        data: {
          ...(nextType !== undefined && { type: nextType }),
          ...(date !== undefined && { date: new Date(date) }),
          ...(nextTime !== undefined && { time: nextTime }),
          ...(note !== undefined && { note: note?.trim() || null }),
          ...(required !== undefined && { required: Math.max(1, Number(required) || 1) }),
          ...(location !== undefined && { location: location.trim() }),
          ...(active !== undefined && { active: Boolean(active) }),
          // Bewust op inactief gezet door barcommissie/admin: sync en herstart blijven eraf.
          ...(active !== undefined && !active && { teamDutiesManual: true }),
          ...(draft !== undefined && { draft: Boolean(draft) }),
          ...(locked !== undefined && { locked: Boolean(locked) }),
          ...(kind !== undefined && { kind: kind === 'TEAM' ? 'TEAM' : 'PERSONAL' }),
          ...(nextSlot !== undefined && { slot: nextSlot }),
          ...(assignedTeamId !== undefined && {
            assignedTeamId: assignedTeamId ? Number(assignedTeamId) : null,
          }),
          ...(matchId !== undefined && { matchId: matchId ? Number(matchId) : null }),
        },
        include: serviceInclude,
      });
      res.json(mapService(service));
    } catch (err) {
      next(err);
    }
  }),
);

router.put(
  '/:id/team-duties/:dutyId',
  admin(async (req, res, next) => {
    try {
      const duty = await prisma.serviceTeamDuty.findUnique({ where: { id: Number(req.params.dutyId) } });
      if (!duty || duty.serviceId !== Number(req.params.id)) {
        return res.status(404).json({ error: 'Teamplek niet gevonden' });
      }
      const data = {};
      if (req.body.teamId) data.teamId = Number(req.body.teamId);
      if (req.body.reserved != null) data.reserved = Math.max(1, Number(req.body.reserved) || 1);
      const updated = await prisma.serviceTeamDuty.update({
        where: { id: duty.id },
        data,
        include: { team: true },
      });
      await prisma.service.update({
        where: { id: duty.serviceId },
        data: { teamDutiesManual: true },
      });
      res.json(updated);
    } catch (err) {
      next(err);
    }
  }),
);

router.delete(
  '/:id/team-duties/:dutyId',
  admin(async (req, res, next) => {
    try {
      const duty = await prisma.serviceTeamDuty.findUnique({ where: { id: Number(req.params.dutyId) } });
      if (!duty || duty.serviceId !== Number(req.params.id)) {
        return res.status(404).json({ error: 'Teamplek niet gevonden' });
      }
      await prisma.serviceTeamDuty.delete({ where: { id: duty.id } });
      await prisma.service.update({
        where: { id: duty.serviceId },
        data: { teamDutiesManual: true },
      });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }),
);

export default router;
