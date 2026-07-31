import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { ADMIN_ROLES, publicPersonBrief } from '../lib/roles.js';

const router = Router();
const admin = (...args) => requireRole(...ADMIN_ROLES)(...args);

function mapTeam(team) {
  return {
    ...team,
    coordinator: publicPersonBrief(team.coordinator),
    members: (team.members || []).map(publicPersonBrief),
  };
}

router.get(
  '/',
  requireAuth(async (_req, res, next) => {
    try {
      const teams = await prisma.team.findMany({
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
        },
      });
      res.status(201).json(team);
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
      res.json(team);
    } catch (err) {
      next(err);
    }
  }),
);

export default router;
