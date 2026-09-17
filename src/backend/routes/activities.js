import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { ADMIN_ROLES } from '../lib/roles.js';
import { writeAudit } from '../lib/audit.js';
import { parseMatchDateInput } from '../lib/authz.js';
import { trySyncPlanningFromMatches } from '../lib/proposePlanning.js';
import { ACTIVITY_TYPES as ACTIVITY_TYPE_DEFS } from '../lib/defaultServiceRules.js';
import { mapService, serviceInclude } from '../lib/serviceHelpers.js';
import { endOfDay, startOfDay } from '../lib/dates.js';
import { serviceCapacity } from '../lib/teamDutyPlanning.js';

const router = Router();
const admin = (...args) => requireRole(...ADMIN_ROLES)(...args);

const ACTIVITY_TYPES = ACTIVITY_TYPE_DEFS.map((item) => item.id);

function parseActivity(body) {
  const parsedDate = parseMatchDateInput(body.date);
  return {
    name: String(body.name || '').trim(),
    date: parsedDate,
    startTime: String(body.startTime || '').trim(),
    endTime: String(body.endTime || '').trim(),
    type: ACTIVITY_TYPES.includes(body.type) ? body.type : 'overig',
    location: body.location?.trim() || null,
    locked: Boolean(body.locked),
    note: body.note?.trim() || null,
  };
}

function parsePersonIds(body) {
  const raw = body?.personIds ?? body?.people ?? [];
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
}

async function enrollPeopleOnActivity(activityId, personIds, actorId) {
  const ids = parsePersonIds({ personIds });
  if (!ids.length) return { assigned: 0 };
  const services = await prisma.service.findMany({
    where: { activityId, active: true },
    include: serviceInclude,
    orderBy: [{ date: 'asc' }, { time: 'asc' }],
  });
  let assigned = 0;
  for (const service of services) {
    for (const personId of ids) {
      const already = service.enrollments.some((e) => e.personId === personId);
      if (already) continue;
      const cap = serviceCapacity(service);
      if (cap.personalOpen <= 0 && cap.open <= 0) continue;
      const person = await prisma.person.findUnique({ where: { id: personId } });
      if (!person?.active) continue;
      await prisma.enrollment.create({
        data: {
          serviceId: service.id,
          personId,
          source: 'ADMIN',
          kind: 'PERSONAL',
          reason: 'Vooraf ingepland via jaarplanning',
        },
      });
      service.enrollments.push({ personId, kind: 'PERSONAL', noShow: false });
      assigned += 1;
    }
  }
  if (assigned) {
    await writeAudit({
      actorId,
      action: 'activity.assign_people',
      entity: 'Activity',
      entityId: activityId,
      detail: `${assigned} vooraf ingepland`,
    });
  }
  return { assigned };
}

router.get(
  '/',
  requireAuth(async (_req, res, next) => {
    try {
      const activities = await prisma.activity.findMany({
        include: { services: { include: serviceInclude, orderBy: [{ date: 'asc' }, { time: 'asc' }] } },
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      });
      res.json(
        activities.map((a) => ({
          ...a,
          services: (a.services || []).map(mapService),
        })),
      );
    } catch (err) {
      next(err);
    }
  }),
);

router.post(
  '/',
  admin(async (req, res, next) => {
    try {
      const data = parseActivity(req.body);
      if (!data.name) return res.status(400).json({ error: 'Naam is verplicht' });
      if (!data.date) return res.status(400).json({ error: 'Datum is verplicht' });
      if (!data.startTime || !data.endTime) {
        return res.status(400).json({ error: 'Begin- en eindtijd zijn verplicht' });
      }
      const activity = await prisma.activity.create({ data });
      await writeAudit({
        actorId: req.person.id,
        action: 'activity.create',
        entity: 'Activity',
        entityId: activity.id,
        detail: `${activity.name} ${activity.type}`,
      });
      const planning = await trySyncPlanningFromMatches({
        from: startOfDay(activity.date),
        to: endOfDay(activity.date),
      });
      const people = await enrollPeopleOnActivity(activity.id, parsePersonIds(req.body), req.person.id);
      res.status(201).json({
        ...activity,
        planningCreated: planning.created ?? 0,
        peopleAssigned: people.assigned,
      });
    } catch (err) {
      next(err);
    }
  }),
);

router.put(
  '/:id',
  admin(async (req, res, next) => {
    try {
      const data = parseActivity(req.body);
      if (!data.name) return res.status(400).json({ error: 'Naam is verplicht' });
      if (!data.date) return res.status(400).json({ error: 'Datum is verplicht' });
      const activity = await prisma.activity.update({
        where: { id: Number(req.params.id) },
        data,
      });
      await writeAudit({
        actorId: req.person.id,
        action: 'activity.update',
        entity: 'Activity',
        entityId: activity.id,
        detail: activity.name,
      });
      await trySyncPlanningFromMatches({
        from: startOfDay(activity.date),
        to: endOfDay(activity.date),
      });
      const people = await enrollPeopleOnActivity(activity.id, parsePersonIds(req.body), req.person.id);
      res.json({ ...activity, peopleAssigned: people.assigned });
    } catch (err) {
      next(err);
    }
  }),
);

router.delete(
  '/:id',
  admin(async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      await prisma.service.updateMany({ where: { activityId: id }, data: { activityId: null } });
      await prisma.activity.delete({ where: { id } });
      await writeAudit({
        actorId: req.person.id,
        action: 'activity.delete',
        entity: 'Activity',
        entityId: id,
      });
      await trySyncPlanningFromMatches();
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  }),
);

export default router;
