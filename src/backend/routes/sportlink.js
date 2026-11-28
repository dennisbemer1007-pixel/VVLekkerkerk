import { Router } from 'express';
import { requireRole } from '../lib/auth.js';
import { ADMIN_ROLES } from '../lib/roles.js';
import prisma from '../lib/prisma.js';
import { getClubSettings } from '../lib/season.js';
import { writeAudit } from '../lib/audit.js';
import {
  publicSportlinkSettings,
  runSportlinkSync,
  saveSportlinkSettings,
} from '../lib/sportlink/sync.js';

const router = Router();

const SKIP_MESSAGES = {
  disabled: 'De Sportlink-koppeling staat uit. Zet hem eerst aan.',
  no_client_id: 'Er is nog geen Client ID ingevuld.',
  running: 'Er loopt al een synchronisatie. Probeer het over een minuut opnieuw.',
};

function publicChange(row) {
  let detail = [];
  try {
    detail = JSON.parse(row.detail || '[]');
  } catch {
    detail = [];
  }
  return {
    id: row.id,
    matchId: row.matchId,
    kind: row.kind,
    label: row.label,
    oldDate: row.oldDate,
    oldTime: row.oldTime,
    newDate: row.newDate,
    newTime: row.newTime,
    servicesMoved: row.servicesMoved,
    servicesCancelled: row.servicesCancelled,
    servicesProtected: row.servicesProtected,
    mailsSent: row.mailsSent,
    mailsFailed: row.mailsFailed,
    createdAt: row.createdAt,
    acknowledgedAt: row.acknowledgedAt,
    detail,
  };
}

router.get(
  '/settings',
  requireRole(...ADMIN_ROLES)(async (_req, res, next) => {
    try {
      res.json(publicSportlinkSettings(await getClubSettings()));
    } catch (err) {
      next(err);
    }
  }),
);

router.patch(
  '/settings',
  requireRole('Admin')(async (req, res, next) => {
    try {
      const { enabled, clientId, clubName } = req.body || {};
      if (enabled !== undefined && typeof enabled !== 'boolean') {
        return res.status(400).json({ error: 'enabled moet true of false zijn' });
      }
      if (clientId !== undefined && typeof clientId !== 'string') {
        return res.status(400).json({ error: 'clientId moet tekst zijn' });
      }
      if (enabled === undefined && clientId === undefined && clubName === undefined) {
        return res.status(400).json({ error: 'Niets om op te slaan' });
      }
      const updated = await saveSportlinkSettings({ enabled, clientId, clubName }, { actorId: req.person.id });
      return res.json(publicSportlinkSettings(updated));
    } catch (err) {
      return next(err);
    }
  }),
);

router.post(
  '/sync',
  requireRole(...ADMIN_ROLES)(async (req, res, next) => {
    try {
      const result = await runSportlinkSync({ trigger: 'manual', actorId: req.person.id });
      if (result.skipped) {
        return res.status(409).json({ error: SKIP_MESSAGES[result.skipped] || 'Synchroniseren kan nu niet.' });
      }
      return res.json({ report: result.report, settings: publicSportlinkSettings(await getClubSettings()) });
    } catch (err) {
      return next(err);
    }
  }),
);

router.get(
  '/changes',
  requireRole(...ADMIN_ROLES)(async (_req, res, next) => {
    try {
      const settings = await getClubSettings();
      const [pending, recent] = await Promise.all([
        prisma.matchChange.findMany({ where: { acknowledgedAt: null }, orderBy: { createdAt: 'desc' }, take: 100 }),
        prisma.matchChange.findMany({
          where: { acknowledgedAt: { not: null } },
          orderBy: { acknowledgedAt: 'desc' },
          take: 10,
        }),
      ]);
      res.json({
        enabled: Boolean(settings.sportlinkEnabled),
        lastSyncAt: settings.sportlinkLastSyncAt,
        lastStatus: settings.sportlinkLastStatus || '',
        pending: pending.map(publicChange),
        recent: recent.map(publicChange),
      });
    } catch (err) {
      next(err);
    }
  }),
);

router.post(
  '/changes/ack-all',
  requireRole(...ADMIN_ROLES)(async (req, res, next) => {
    try {
      const result = await prisma.matchChange.updateMany({
        where: { acknowledgedAt: null },
        data: { acknowledgedAt: new Date(), acknowledgedById: req.person.id },
      });
      await writeAudit({
        actorId: req.person.id,
        action: 'sportlink.ack',
        entity: 'MatchChange',
        detail: `${result.count} meldingen afgehandeld`,
      });
      res.json({ acknowledged: result.count });
    } catch (err) {
      next(err);
    }
  }),
);

router.post(
  '/changes/:id/ack',
  requireRole(...ADMIN_ROLES)(async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) return res.status(400).json({ error: 'Ongeldige melding' });
      const row = await prisma.matchChange.findUnique({ where: { id } });
      if (!row) return res.status(404).json({ error: 'Melding niet gevonden' });
      const updated = await prisma.matchChange.update({
        where: { id },
        data: { acknowledgedAt: row.acknowledgedAt || new Date(), acknowledgedById: req.person.id },
      });
      res.json(publicChange(updated));
    } catch (err) {
      next(err);
    }
  }),
);

export default router;
