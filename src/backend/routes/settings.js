import { Router } from 'express';
import { requireRole } from '../lib/auth.js';
import { ADMIN_ROLES } from '../lib/roles.js';
import {
  getMailSettings,
  publicMailSettings,
  saveMailSettings,
  sendMail,
  verifyMailConnection,
} from '../lib/mail.js';
import { publicClubSettings, rolloverSeason } from '../lib/season.js';
import { cleanupPrivacy } from '../lib/privacy.js';
import { writeAudit } from '../lib/audit.js';

const router = Router();
const ADMIN = ADMIN_ROLES;

/** Status voor iedereen die mag uitnodigen (zodat UI weet of mail aanstaat) */
router.get(
  '/mail/status',
  requireRole(...ADMIN, 'Teamcoördinator')(async (_req, res, next) => {
    try {
      const settings = await getMailSettings();
      res.json({
        enabled: settings.enabled,
        isReady: publicMailSettings(settings).isReady,
        fromEmail: settings.fromEmail || null,
      });
    } catch (err) {
      next(err);
    }
  }),
);

router.get(
  '/mail',
  requireRole(...ADMIN)(async (_req, res, next) => {
    try {
      const settings = await getMailSettings();
      res.json(publicMailSettings(settings));
    } catch (err) {
      next(err);
    }
  }),
);

router.put(
  '/mail',
  requireRole(...ADMIN)(async (req, res, next) => {
    try {
      const saved = await saveMailSettings(req.body);
      res.json({
        ...publicMailSettings(saved),
        message: 'Mailserver-instellingen opgeslagen',
      });
    } catch (err) {
      next(err);
    }
  }),
);

/** Test: verbinding controleren + optioneel testmail sturen */
router.post(
  '/mail/test',
  requireRole(...ADMIN)(async (req, res, next) => {
    try {
      const settings = await getMailSettings();
      const publicSettings = publicMailSettings(settings);

      if (!publicSettings.host) {
        return res.status(400).json({ error: 'Sla eerst de SMTP-host op' });
      }

      await verifyMailConnection(settings);

      const to = (req.body.to || settings.fromEmail || req.person.email || '').trim();
      if (!to) {
        return res.status(400).json({
          error: 'Vul een testadres in of stel een afzender-e-mail in',
        });
      }

      await sendMail({
        to,
        subject: 'Testmail VVL Planning App',
        text: 'Dit is een testmail. De mailserver is correct aangesloten.',
        html: '<p>Dit is een <strong>testmail</strong>. De mailserver is correct aangesloten.</p>',
      });

      res.json({
        ok: true,
        message: `Verbinding ok. Testmail verstuurd naar ${to}.`,
      });
    } catch (err) {
      res.status(400).json({
        error: `Mailtest mislukt: ${err.message}`,
      });
    }
  }),
);

router.get(
  '/club',
  requireRole(...ADMIN)(async (_req, res, next) => {
    try {
      res.json(await publicClubSettings());
    } catch (err) {
      next(err);
    }
  }),
);

router.post(
  '/club/rollover',
  requireRole(...ADMIN)(async (req, res, next) => {
    try {
      const result = await rolloverSeason({
        actorId: req.person.id,
        newLabel: req.body?.seasonLabel,
      });
      await writeAudit({
        actorId: req.person.id,
        action: 'season.rollover',
        entity: 'ClubSettings',
        entityId: 1,
        detail: `${result.oldLabel} → ${result.seasonLabel}`,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  }),
);

router.post(
  '/privacy/cleanup',
  requireRole(...ADMIN)(async (req, res, next) => {
    try {
      const result = await cleanupPrivacy();
      await writeAudit({
        actorId: req.person.id,
        action: 'privacy.cleanup',
        entity: 'ClubSettings',
        entityId: 1,
        detail: `${result.auditDeleted} audit, ${result.contactsCleared} contacten`,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  }),
);

export default router;
