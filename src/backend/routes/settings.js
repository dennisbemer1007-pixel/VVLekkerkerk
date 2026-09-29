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
import prisma from '../lib/prisma.js';
import { previewEnvironmentReset, runEnvironmentReset } from '../lib/environmentReset.js';
import { customMailTemplates, dienstLabel, filterMailAudience, formatDutyDate, renderMail } from '../lib/mailTemplates.js';
import { resolvePublicAppUrl } from '../lib/appUrl.js';

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

router.post(
  '/mail/send-own',
  requireRole(...ADMIN)(async (req, res, next) => {
    try {
      const audience = String(req.body?.audience || '');
      const templateId = String(req.body?.templateId || '');
      const settings = await getMailSettings();
      const template = customMailTemplates(settings.templates).find((item) => item.id === templateId);
      if (!template) return res.status(400).json({ error: 'Kies een eigen e-mailtekst' });
      if (!['volunteers', 'team', 'shift'].includes(audience)) {
        return res.status(400).json({ error: 'Kies een groep: iedereen op een dienst, een team, of alle vrijwilligers' });
      }
      const persons = await prisma.person.findMany({
        where: { active: true },
        select: { id: true, name: true, email: true, role: true, teamId: true, active: true },
      });
      let people = persons;
      let sampleService = null;
      if (audience === 'shift') {
        const service = await prisma.service.findUnique({
          where: { id: Number(req.body.serviceId) },
          include: { enrollments: { include: { person: true } } },
        });
        if (!service) return res.status(400).json({ error: 'Kies een dienst' });
        sampleService = service;
        const ids = new Set((service.enrollments || []).map((row) => row.personId));
        people = persons
          .filter((person) => ids.has(person.id))
          .map((person) => ({ ...person, serviceIds: [service.id] }));
      }
      const recipients = filterMailAudience(people, {
        audience,
        teamId: req.body.teamId,
        serviceId: req.body.serviceId,
      });
      const link = (() => {
        try {
          return resolvePublicAppUrl();
        } catch {
          return '';
        }
      })();
      const sample = recipients[0];
      const preview = renderMail(template, {
        naam: sample?.name || 'Naam',
        datum: sampleService ? formatDutyDate(sampleService.date) : '',
        tijd: sampleService?.time || '',
        dienst: sampleService ? dienstLabel(sampleService.type) : 'bardienst',
        link,
      });
      if (!req.body?.confirm) {
        return res.json({
          confirm: false,
          count: recipients.length,
          names: recipients.map((person) => person.name),
          preview,
        });
      }
      if (!recipients.length) return res.status(400).json({ error: 'Niemand in deze groep heeft een e-mailadres' });
      let sent = 0;
      const failed = [];
      for (const person of recipients) {
        const mail = renderMail(template, {
          naam: person.name,
          datum: sampleService ? formatDutyDate(sampleService.date) : '',
          tijd: sampleService?.time || '',
          dienst: sampleService ? dienstLabel(sampleService.type) : 'bardienst',
          link,
        });
        const result = await sendMail({ to: person.email, subject: mail.subject, text: mail.text, html: mail.html });
        if (result.sent) sent += 1;
        else failed.push({ name: person.name, reason: result.reason || 'niet verstuurd' });
      }
      await writeAudit({
        actorId: req.person.id,
        action: 'mail.send_own',
        entity: 'MailSettings',
        detail: `${template.name} naar ${sent} van ${recipients.length}`,
      });
      res.json({ confirm: true, sent, failed, count: recipients.length });
    } catch (err) {
      next(err);
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

router.get(
  '/opschonen',
  requireRole('Admin')(async (_req, res, next) => {
    try {
      res.json(await previewEnvironmentReset(prisma));
    } catch (err) {
      next(err);
    }
  }),
);

router.post(
  '/opschonen',
  requireRole('Admin')(async (req, res, next) => {
    try {
      const result = await runEnvironmentReset(prisma, {
        actorId: req.person.id,
        confirm: req.body?.confirm,
      });
      res.json({
        message: result.message,
        backup: result.backup,
        gewist: result.gewist,
        blijft: result.blijft,
      });
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
