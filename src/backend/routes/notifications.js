import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../lib/auth.js';
import { mapNotification } from '../lib/notifications.js';

const router = Router();

router.get(
  '/',
  requireAuth(async (req, res, next) => {
    try {
      const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 30));
      const rows = await prisma.notification.findMany({
        where: { personId: req.person.id },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
      const unreadCount = await prisma.notification.count({
        where: { personId: req.person.id, readAt: null },
      });
      res.json({
        unreadCount,
        items: rows.map(mapNotification),
      });
    } catch (err) {
      next(err);
    }
  }),
);

router.post(
  '/read-all',
  requireAuth(async (req, res, next) => {
    try {
      await prisma.notification.updateMany({
        where: { personId: req.person.id, readAt: null },
        data: { readAt: new Date() },
      });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }),
);

router.post(
  '/:id/read',
  requireAuth(async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const row = await prisma.notification.findUnique({ where: { id } });
      if (!row || row.personId !== req.person.id) {
        return res.status(404).json({ error: 'Notificatie niet gevonden' });
      }
      const updated = row.readAt
        ? row
        : await prisma.notification.update({
            where: { id },
            data: { readAt: new Date() },
          });
      res.json(mapNotification(updated));
    } catch (err) {
      next(err);
    }
  }),
);

export default router;
