import { Router } from 'express';
import { requireRole } from '../lib/auth.js';
import {
  getMailSettings,
  publicMailSettings,
  saveMailSettings,
  sendMail,
  verifyMailConnection,
} from '../lib/mail.js';

const router = Router();
const ADMIN = ['Coördinator', 'Bestuur'];

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

export default router;
