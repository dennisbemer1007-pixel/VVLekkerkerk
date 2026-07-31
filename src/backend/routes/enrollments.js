import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../lib/auth.js';
import { isAdminRole, publicPersonBrief } from '../lib/roles.js';
import { teamIdsForActor } from '../lib/authz.js';

const router = Router();

function mapEnrollment(enrollment) {
  if (!enrollment) return null;
  return {
    ...enrollment,
    person: publicPersonBrief(enrollment.person),
    service: enrollment.service
      ? {
          id: enrollment.service.id,
          type: enrollment.service.type,
          date: enrollment.service.date,
          time: enrollment.service.time,
          draft: enrollment.service.draft,
          active: enrollment.service.active,
        }
      : undefined,
  };
}

async function canManageEnrollment(actor, targetPersonId) {
  if (actor.id === Number(targetPersonId)) return true;
  if (isAdminRole(actor.role)) return true;

  if (actor.role === 'Teamcoördinator') {
    const target = await prisma.person.findUnique({
      where: { id: Number(targetPersonId) },
      select: { teamId: true, team: { select: { coordinatorId: true } } },
    });
    if (!target) return false;
    if (actor.teamId && target.teamId === actor.teamId) return true;
    if (target.team?.coordinatorId === actor.id) return true;
  }
  return false;
}

function enrollmentSource(actor, targetPersonId) {
  if (isAdminRole(actor.role) && actor.id !== Number(targetPersonId)) return 'ADMIN';
  if (actor.role === 'Teamcoördinator' && actor.id !== Number(targetPersonId)) return 'TEAM';
  return 'SELF';
}

router.get(
  '/',
  requireAuth(async (req, res, next) => {
    try {
      let where = {};
      if (isAdminRole(req.person.role)) {
        where = {};
      } else if (req.person.role === 'Teamcoördinator') {
        const teamIds = [...(await teamIdsForActor(req.person))];
        where = {
          OR: [
            { personId: req.person.id },
            ...(teamIds.length ? [{ person: { teamId: { in: teamIds } } }] : []),
          ],
        };
      } else {
        where = { personId: req.person.id };
      }

      const enrollments = await prisma.enrollment.findMany({
        where,
        include: { person: true, service: true },
        orderBy: { createdAt: 'desc' },
      });
      res.json(enrollments.map(mapEnrollment));
    } catch (err) {
      next(err);
    }
  }),
);

router.post(
  '/',
  requireAuth(async (req, res, next) => {
    try {
      const { serviceId, personId } = req.body;
      if (!serviceId || !personId) {
        return res.status(400).json({ error: 'Dienst en persoon zijn verplicht' });
      }

      const targetId = Number(personId);
      if (!(await canManageEnrollment(req.person, targetId))) {
        return res.status(403).json({
          error: 'Je mag alleen jezelf (of teamleden als teamcoördinator) inschrijven',
        });
      }

      const person = await prisma.person.findUnique({ where: { id: targetId } });
      if (!person?.active) {
        return res.status(400).json({ error: 'Deze persoon is niet actief' });
      }

      try {
        const enrollment = await prisma.$transaction(async (tx) => {
          const service = await tx.service.findUnique({
            where: { id: Number(serviceId) },
            include: { enrollments: true },
          });
          if (!service || !service.active) {
            const err = new Error('Dienst niet gevonden of uitgeschakeld');
            err.status = 404;
            throw err;
          }
          if (service.draft && !isAdminRole(req.person.role)) {
            const err = new Error(
              'Deze dienst is nog een concept en niet open voor inschrijving',
            );
            err.status = 403;
            throw err;
          }
          if (service.enrollments.length >= service.required) {
            const err = new Error('Deze dienst is al vol');
            err.status = 409;
            throw err;
          }

          const existing = await tx.enrollment.findUnique({
            where: {
              serviceId_personId: {
                serviceId: Number(serviceId),
                personId: targetId,
              },
            },
          });
          if (existing) {
            const err = new Error('Je staat al ingeschreven voor deze dienst');
            err.status = 409;
            throw err;
          }

          return tx.enrollment.create({
            data: {
              serviceId: Number(serviceId),
              personId: targetId,
              source: enrollmentSource(req.person, targetId),
            },
            include: { person: true, service: true },
          });
        });

        res.status(201).json(mapEnrollment(enrollment));
      } catch (e) {
        if (e.status) {
          return res.status(e.status).json({ error: e.message });
        }
        if (e.code === 'P2002') {
          return res.status(409).json({ error: 'Je staat al ingeschreven voor deze dienst' });
        }
        throw e;
      }
    } catch (err) {
      next(err);
    }
  }),
);

router.delete(
  '/:id',
  requireAuth(async (req, res, next) => {
    try {
      const enrollment = await prisma.enrollment.findUnique({
        where: { id: Number(req.params.id) },
      });
      if (!enrollment) {
        return res.status(404).json({ error: 'Inschrijving niet gevonden' });
      }
      if (!(await canManageEnrollment(req.person, enrollment.personId))) {
        return res.status(403).json({ error: 'Je mag deze inschrijving niet verwijderen' });
      }

      // Beheer mag altijd omgooien; vrijwilligers niet na deadline / CLOSED / verplichte fase
      if (!isAdminRole(req.person.role) && req.person.id === enrollment.personId) {
        const round = await prisma.planningRound.findUnique({ where: { id: 1 } });
        const status = round?.status || '';
        if (status === 'CLOSED' || status === 'MANDATORY_OPEN') {
          return res.status(403).json({
            error:
              'De vrijwilligersfase is voorbij. Neem contact op met de bardienstcoördinator om te wijzigen.',
          });
        }
        if (
          round?.volunteerDeadline &&
          new Date() > new Date(round.volunteerDeadline)
        ) {
          return res.status(403).json({
            error:
              'De inschrijftermijn is verstreken. Neem contact op met de bardienstcoördinator om te wijzigen.',
          });
        }
      }

      await prisma.enrollment.delete({ where: { id: enrollment.id } });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  }),
);

export default router;
