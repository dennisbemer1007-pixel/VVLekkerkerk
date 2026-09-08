import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { endOfDay, endOfWeek, startOfDay, startOfWeek } from '../lib/dates.js';
import { mapService, serviceInclude, serviceLocation } from '../lib/serviceHelpers.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { ADMIN_ROLES, isAdminRole } from '../lib/roles.js';

const router = Router();
const admin = (...args) => requireRole(...ADMIN_ROLES)(...args);

function buildServiceWhere(query) {
  const { from, to, filter, activeOnly, allDates, includeDraft } = query;
  const where = { type: 'BAR' };

  if (activeOnly !== 'false') where.active = true;
  if (includeDraft !== 'true') where.draft = false;

  const now = new Date();
  if (filter === 'today') {
    where.date = { gte: startOfDay(now), lte: endOfDay(now) };
  } else if (filter === 'week') {
    where.date = { gte: startOfWeek(now), lte: endOfWeek(now) };
  } else if (from || to) {
    where.date = {};
    if (from) where.date.gte = startOfDay(new Date(from));
    if (to) where.date.lte = endOfDay(new Date(to));
  } else if (allDates !== 'true') {
    where.date = { gte: startOfDay(now) };
  }

  return { where, filter, personId: query.personId ? Number(query.personId) : null };
}

router.get(
  '/',
  requireAuth(async (req, res, next) => {
    try {
      const { where, filter, personId } = buildServiceWhere(req.query);
      // Alleen beheerders mogen concepten zien
      if (req.query.includeDraft === 'true' && !ADMIN_ROLES.includes(req.person.role)) {
        where.draft = false;
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
        if (personId !== req.person.id && !isAdminRole(req.person.role)) {
          return res.status(403).json({ error: 'Geen toegang tot andermans diensten' });
        }
        services = services.filter((s) =>
          s.enrollments.some((e) => e.personId === personId),
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
      const { date, time, note, required, location, active, draft, slot, assignedTeamId } =
        req.body;
      if (!date || !time?.trim()) {
        return res.status(400).json({ error: 'Datum en tijd zijn verplicht' });
      }
      const serviceType = 'BAR';
      const service = await prisma.service.create({
        data: {
          type: serviceType,
          date: new Date(date),
          time: time.trim(),
          note: note?.trim() || null,
          required: Math.max(1, Number(required) || 2),
          location: location?.trim() || serviceLocation(serviceType),
          active: active !== false,
          draft: Boolean(draft),
          slot: slot?.trim() || 'EXTRA',
          assignedTeamId: assignedTeamId ? Number(assignedTeamId) : null,
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
      const { type, date, time, note, required, location, active, draft, slot, assignedTeamId } =
        req.body;
      const service = await prisma.service.update({
        where: { id: Number(req.params.id) },
        data: {
          ...(type !== undefined && { type: 'BAR' }),
          ...(date !== undefined && { date: new Date(date) }),
          ...(time !== undefined && { time: time.trim() }),
          ...(note !== undefined && { note: note?.trim() || null }),
          ...(required !== undefined && { required: Math.max(1, Number(required) || 1) }),
          ...(location !== undefined && { location: location.trim() }),
          ...(active !== undefined && { active: Boolean(active) }),
          ...(draft !== undefined && { draft: Boolean(draft) }),
          ...(slot !== undefined && { slot: slot?.trim() || null }),
          ...(assignedTeamId !== undefined && {
            assignedTeamId: assignedTeamId ? Number(assignedTeamId) : null,
          }),
        },
        include: serviceInclude,
      });
      res.json(mapService(service));
    } catch (err) {
      next(err);
    }
  }),
);

export default router;
