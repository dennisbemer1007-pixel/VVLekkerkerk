import { Router } from 'express';
import { requireRole } from '../lib/auth.js';
import { ADMIN_ROLES } from '../lib/roles.js';
import {
  connectionTestMail,
  friendlySmtpError,
  getMailSettings,
  mailFromMustMatchUser,
  publicMailSettings,
  saveMailSettings,
  sendMail,
  verifyMailConnection,
} from '../lib/mail.js';
import { getClubSettings, publicClubSettings, rolloverSeason } from '../lib/season.js';
import { cleanupPrivacy } from '../lib/privacy.js';
import { writeAudit } from '../lib/audit.js';
import prisma from '../lib/prisma.js';
import { previewEnvironmentReset, runEnvironmentReset } from '../lib/environmentReset.js';
import { deployStateDir, readDeployStatus, resolveLiveDbFile } from '../lib/liveDeploy.js';
import {
  customMailTemplates,
  dienstLabel,
  filterMailAudience,
  formatDutyDate,
  MAIL_TEMPLATE_KEYS,
  previewMailTemplate,
  renderMail,
} from '../lib/mailTemplates.js';
import { resolvePublicAppUrl } from '../lib/appUrl.js';
import { syncRefereeSlots } from '../lib/referees.js';

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
    let settings;
    try {
      settings = await getMailSettings();
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

      if (!publicSettings.isReady) {
        return res.status(400).json({
          error:
            'Mailtest mislukt: zet “E-mail versturen” aan, vul host, Gmail-adres, app-wachtwoord en afzender in, en klik Opslaan.',
        });
      }

      if (!settings.user?.trim() || !settings.password) {
        return res.status(400).json({
          error:
            'Mailtest mislukt: vul gebruikersnaam (je Gmail) en het app-wachtwoord in, en klik Opslaan.',
        });
      }

      const fromMismatch = mailFromMustMatchUser(settings);
      if (fromMismatch) {
        return res.status(400).json({
          error: `Mailtest mislukt: ${fromMismatch}`,
        });
      }

      const testMail = connectionTestMail();
      const sent = await sendMail({
        to,
        subject: 'Testmail VVL Planning App',
        text: testMail.text,
        html: testMail.html,
      });

      if (!sent?.sent) {
        return res.status(400).json({
          error: `Mailtest mislukt: ${sent?.reason || 'mail is niet verstuurd'}`,
        });
      }

      res.json({
        ok: true,
        messageId: sent.messageId || null,
        message: `Verbinding ok. Testmail verstuurd naar ${to}. Staat hij niet in Inbox/Spam? Kijk in Gmail onder Verzonden. Komt hij daar ook niet? Dan is hij niet echt weggegaan — controleer app-wachtwoord en of “E-mail versturen” aanstaat.`,
      });
    } catch (err) {
      res.status(400).json({
        error: `Mailtest mislukt: ${friendlySmtpError(err.message || err, settings?.host)}`,
      });
    }
  }),
);

/** Voorbeeld van een e-mailtekst in de branding-layout (geen verzending). */
router.post(
  '/mail/preview',
  requireRole(...ADMIN)(async (req, res, next) => {
    try {
      const settings = await getMailSettings();
      let base = '';
      try {
        base = resolvePublicAppUrl();
      } catch {
        base = '';
      }
      const preview = previewMailTemplate({
        key: req.body?.key,
        templateId: req.body?.templateId,
        subject: req.body?.subject,
        body: req.body?.body,
        templatesRaw: settings.templates,
        logoBaseUrl: base,
      });
      res.json(preview);
    } catch (err) {
      if (err.status) return res.status(err.status).json({ error: err.message });
      next(err);
    }
  }),
);

/**
 * Stuur één sjabloon met voorbeelddata naar jezelf (of een opgegeven adres).
 * Geen massamail. Logo gaat mee als CID-bijlage.
 */
router.post(
  '/mail/test-template',
  requireRole(...ADMIN)(async (req, res, next) => {
    let settings;
    try {
      settings = await getMailSettings();
      const publicSettings = publicMailSettings(settings);
      if (!publicSettings.isReady) {
        return res.status(400).json({
          error:
            'Mailtest mislukt: zet “E-mail versturen” aan, vul host, gebruikersnaam, app-wachtwoord en afzender in, en klik Opslaan.',
        });
      }

      const to = String(req.body?.to || req.person?.email || settings.fromEmail || '').trim();
      if (!to || !to.includes('@')) {
        return res.status(400).json({
          error: 'Vul een testadres in (bijv. je eigen e-mail).',
        });
      }

      const { exampleMailVars } = await import('../lib/mailLayout.js');
      const { resolveMailTemplates } = await import('../lib/mailTemplates.js');

      let template;
      let templateKey = 'custom';
      if (req.body?.templateId) {
        const found = customMailTemplates(settings.templates).find(
          (item) => item.id === String(req.body.templateId),
        );
        if (!found) return res.status(400).json({ error: 'Onbekende eigen e-mailtekst' });
        template = {
          subject: String(req.body?.subject || found.subject),
          body: String(req.body?.body || found.body),
        };
      } else if (MAIL_TEMPLATE_KEYS.includes(String(req.body?.key))) {
        templateKey = String(req.body.key);
        const resolved = resolveMailTemplates(settings.templates)[templateKey];
        template = {
          subject: String(req.body?.subject || resolved.subject),
          body: String(req.body?.body || resolved.body),
        };
      } else if (String(req.body?.subject || '').trim() && String(req.body?.body || '').trim()) {
        template = {
          subject: String(req.body.subject),
          body: String(req.body.body),
        };
        templateKey = String(req.body?.key || 'custom');
      } else {
        return res.status(400).json({ error: 'Kies een e-mailtekst om te testen' });
      }

      // CID-logo (default in wrapBrandedEmail) — betrouwbaar in Gmail/Outlook
      const mail = renderMail(template, exampleMailVars(), { templateKey });
      const sent = await sendMail({ to, ...mail });
      if (!sent?.sent) {
        return res.status(400).json({
          error: `Mailtest mislukt: ${sent?.reason || 'mail is niet verstuurd'}`,
        });
      }
      res.json({
        ok: true,
        messageId: sent.messageId || null,
        to,
        subject: mail.subject,
        message: `Testmail “${mail.subject}” verstuurd naar ${to}.`,
      });
    } catch (err) {
      if (err.status) return res.status(err.status).json({ error: err.message });
      res.status(400).json({
        error: `Mailtest mislukt: ${friendlySmtpError(err.message || err, settings?.host)}`,
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
      const preview = renderMail(
        template,
        {
          naam: sample?.name || 'Naam',
          datum: sampleService ? formatDutyDate(sampleService.date) : '',
          tijd: sampleService?.time || '',
          dienst: sampleService ? dienstLabel(sampleService.type) : 'bardienst',
          link,
        },
        { templateKey: 'custom' },
      );
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
        const mail = renderMail(
          template,
          {
            naam: person.name,
            datum: sampleService ? formatDutyDate(sampleService.date) : '',
            tijd: sampleService?.time || '',
            dienst: sampleService ? dienstLabel(sampleService.type) : 'bardienst',
            link,
          },
          { templateKey: 'custom' },
        );
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

router.patch(
  '/club',
  requireRole('Admin')(async (req, res, next) => {
    try {
      const tournaments = req.body?.tournamentsEnabled;
      const referees = req.body?.refereesEnabled;
      const calendar = req.body?.calendarEnabled;
      const hasTournaments = typeof tournaments === 'boolean';
      const hasReferees = typeof referees === 'boolean';
      const hasCalendar = typeof calendar === 'boolean';
      if (!hasTournaments && !hasReferees && !hasCalendar) {
        return res.status(400).json({
          error: 'tournamentsEnabled, refereesEnabled of calendarEnabled moet true of false zijn',
        });
      }
      await getClubSettings();
      const data = {};
      if (hasTournaments) data.tournamentsEnabled = tournaments;
      if (hasReferees) data.refereesEnabled = referees;
      if (hasCalendar) data.calendarEnabled = calendar;
      await prisma.clubSettings.update({
        where: { id: 1 },
        data,
      });
      if (hasTournaments) {
        await writeAudit({
          actorId: req.person.id,
          action: 'club.tournaments',
          entity: 'ClubSettings',
          entityId: 1,
          detail: tournaments ? 'aan' : 'uit',
        });
      }
      if (hasReferees) {
        if (referees) await syncRefereeSlots();
        await writeAudit({
          actorId: req.person.id,
          action: 'club.referees',
          entity: 'ClubSettings',
          entityId: 1,
          detail: referees ? 'aan' : 'uit',
        });
      }
      if (hasCalendar) {
        await writeAudit({
          actorId: req.person.id,
          action: 'club.calendar',
          entity: 'ClubSettings',
          entityId: 1,
          detail: calendar ? 'aan' : 'uit',
        });
      }
      return res.json(await publicClubSettings());
    } catch (err) {
      return next(err);
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
  '/deploy-status',
  requireRole('Admin')(async (_req, res, next) => {
    try {
      const dbFile = resolveLiveDbFile(process.cwd());
      const status = readDeployStatus(deployStateDir(dbFile));
      if (!status) return res.json({ error: 'Geen deploy-status' });
      res.json({
        at: status.at,
        backupExists: Boolean(status.backupExists),
        backupBytes: status.backupBytes ?? null,
        backupFile: status.backupFile || null,
        counts: status.counts || null,
        flags: status.flags || null,
        mail: status.mail
          ? {
              secretSet: Boolean(status.mail.secretSet),
              smtpPresent: Boolean(status.mail.smtpPresent),
              smtpSealed: Boolean(status.mail.smtpSealed),
              smtpDecrypts: status.mail.smtpDecrypts,
              enabled: Boolean(status.mail.enabled),
            }
          : null,
        serviceDiff: status.serviceDiff || null,
        repairs: status.repairs || null,
      });
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
