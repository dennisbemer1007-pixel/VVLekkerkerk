import fs from 'fs';
import path from 'path';
import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { publicPerson, requireAuth, requireRole, hashPassword, createInviteToken, inviteExpiry, inviteLink } from '../lib/auth.js';
import { PHOTOS_DIR, photoUpload, publicPhotoPath, assertImageMagic } from '../lib/uploads.js';
import {
  normalizeObligation,
  serializeJsonArray,
  parseUnavailableWeekdays,
  parsePreferredSlots,
} from '../lib/obligation.js';
import { isAdminRole, ADMIN_ROLES } from '../lib/roles.js';
import { normalizeRole, resolvePublicAppUrl } from '../lib/appUrl.js';
import { canManagePersonAsTeamCoordinator } from '../lib/authz.js';
import { nextPersonNumber, syncPrimaryTeamMembership } from '../lib/personNumber.js';
import { writeAudit } from '../lib/audit.js';
import { parsePersonCsv, validatePersonRows } from '../lib/csvPersons.js';
import { trySendInviteEmail } from '../lib/mail.js';
import { exportPersonData, wipePersonContact, personExportSheets } from '../lib/privacy.js';
import { workbookToXlsx } from '../lib/xlsxWrite.js';
import { getClubSettings } from '../lib/season.js';

const router = Router();
const PHOTO_ROLES = [...ADMIN_ROLES, 'Teamcoördinator'];

function preferenceFieldsFromBody(body) {
  const data = {};
  if (body.obligation !== undefined || body.mandatoryBar !== undefined) {
    data.obligation = normalizeObligation(body.obligation, body.mandatoryBar);
  }
  if (body.unavailableWeekdays !== undefined) {
    data.unavailableWeekdays = serializeJsonArray(
      parseUnavailableWeekdays(
        Array.isArray(body.unavailableWeekdays)
          ? JSON.stringify(body.unavailableWeekdays)
          : body.unavailableWeekdays,
      ).map(String),
    );
  }
  if (body.preferredSlots !== undefined) {
    data.preferredSlots = serializeJsonArray(
      parsePreferredSlots(
        Array.isArray(body.preferredSlots)
          ? JSON.stringify(body.preferredSlots)
          : body.preferredSlots,
      ),
    );
  }
  return data;
}

router.get(
  '/',
  requireAuth(async (req, res, next) => {
    try {
      const isAdmin = isAdminRole(req.person.role);
      const isTeamCo = req.person.role === 'Teamcoördinator';
      if (!isAdmin && !isTeamCo) {
        return res.status(403).json({ error: 'Geen toegang tot de personenlijst' });
      }
      const includeInactive = req.query.all === 'true' && isAdmin;
      const persons = await prisma.person.findMany({
        where: includeInactive ? undefined : { active: true },
        include: { team: true },
        orderBy: { name: 'asc' },
      });
      res.json(persons.map((p) => publicPerson(p, { viewerRole: req.person.role })));
    } catch (err) {
      next(err);
    }
  }),
);

/** Eigen voorkeuren / beschikbaarheid */
router.put(
  '/me/preferences',
  requireAuth(async (req, res, next) => {
    try {
      const data = preferenceFieldsFromBody({
        unavailableWeekdays: req.body.unavailableWeekdays,
        preferredSlots: req.body.preferredSlots,
      });
      const person = await prisma.person.update({
        where: { id: req.person.id },
        data,
        include: { team: true },
      });
      res.json(publicPerson(person, { includeContact: true }));
    } catch (err) {
      next(err);
    }
  }),
);

router.get(
  '/me/export',
  requireAuth(async (req, res, next) => {
    try {
      const data = await exportPersonData(req.person.id);
      await writeAudit({
        actorId: req.person.id,
        action: 'person.export',
        entity: 'Person',
        entityId: req.person.id,
        detail: 'AVG-export eigen gegevens',
      });
      res.json(data);
    } catch (err) {
      next(err);
    }
  }),
);

router.get(
  '/me/export.xlsx',
  requireAuth(async (req, res, next) => {
    try {
      const data = await exportPersonData(req.person.id);
      await writeAudit({
        actorId: req.person.id,
        action: 'person.export',
        entity: 'Person',
        entityId: req.person.id,
        detail: 'AVG-export eigen gegevens (Excel)',
      });
      const buf = workbookToXlsx(personExportSheets(data));
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader('Content-Disposition', 'attachment; filename="vvl-mijn-gegevens.xlsx"');
      res.send(buf);
    } catch (err) {
      next(err);
    }
  }),
);

router.post(
  '/import',
  requireRole(...ADMIN_ROLES)(async (req, res, next) => {
    try {
      const parsed = parsePersonCsv(req.body.csv || '');
      if (parsed.headerError) {
        return res.status(400).json({ error: parsed.headerError });
      }
      const teams = await prisma.team.findMany({ select: { id: true, name: true } });
      const validated = validatePersonRows(parsed.rows, { teams });
      if (!validated.ok) {
        return res.status(400).json({
          error: 'Niet alle rijen zijn geldig. Onbekende teams worden niet automatisch aangemaakt.',
          invalidRows: validated.invalidRows,
          unknownTeams: validated.unknownTeams,
        });
      }

      const sendInvites = Boolean(req.body.sendInvites);
      let appUrl = '';
      if (sendInvites) {
        try {
          appUrl = resolvePublicAppUrl();
        } catch (err) {
          return next(err);
        }
      }

      const settings = await getClubSettings();
      let created = 0;
      let updated = 0;
      const invites = [];

      for (const row of validated.rows) {
        const existing = row.email
          ? await prisma.person.findUnique({ where: { email: row.email } })
          : null;
        if (existing) {
          await prisma.person.update({
            where: { id: existing.id },
            data: {
              name: row.name,
              phone: row.phone,
              role: row.role,
              obligation: row.obligation,
              teamId: row.teamId,
            },
          });
          if (row.teamId) await syncPrimaryTeamMembership(existing.id, row.teamId, prisma);
          updated += 1;
          continue;
        }

        const personNumber = await nextPersonNumber();
        const inviteToken = sendInvites && row.email ? createInviteToken() : null;
        const person = await prisma.person.create({
          data: {
            name: row.name,
            email: row.email,
            phone: row.phone,
            role: row.role,
            obligation: row.obligation,
            teamId: row.teamId,
            personNumber,
            inviteToken,
            inviteExpiresAt: inviteToken ? inviteExpiry() : null,
          },
        });
        if (row.teamId) await syncPrimaryTeamMembership(person.id, row.teamId, prisma);
        created += 1;
        if (inviteToken && row.email) {
          const link = inviteLink(inviteToken, appUrl);
          const mail = await trySendInviteEmail({ email: row.email, name: row.name, link });
          invites.push({ email: row.email, sent: mail.sent });
        }
      }

      await writeAudit({
        actorId: req.person.id,
        action: 'person.import',
        entity: 'Person',
        detail: `${created} nieuw, ${updated} bijgewerkt (${settings.seasonLabel})`,
      });

      res.json({ created, updated, invites, seasonLabel: settings.seasonLabel });
    } catch (err) {
      next(err);
    }
  }),
);

router.post(
  '/',
  requireRole(...ADMIN_ROLES)(async (req, res, next) => {
    try {
      const { name, phone, role, teamId, email, exempted } = req.body;
      if (!name?.trim()) {
        return res.status(400).json({ error: 'Naam is verplicht' });
      }
      const personNumber = await nextPersonNumber();
      const person = await prisma.person.create({
        data: {
          name: name.trim(),
          personNumber,
          email: email?.trim().toLowerCase() || null,
          phone: phone?.trim() || null,
          role: normalizeRole(role, 'Vrijwilliger'),
          teamId: teamId ? Number(teamId) : null,
          exempted: Boolean(exempted),
          ...preferenceFieldsFromBody(req.body),
        },
      });
      if (person.teamId) await syncPrimaryTeamMembership(person.id, person.teamId);
      await writeAudit({
        actorId: req.person.id,
        action: 'person.create',
        entity: 'Person',
        entityId: person.id,
        detail: person.name,
      });
      res.status(201).json(publicPerson(person, { viewerRole: req.person.role }));
    } catch (err) {
      next(err);
    }
  }),
);

router.put(
  '/:id',
  requireAuth(async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const isSelf = req.person.id === id;
      const isAdmin = isAdminRole(req.person.role);

      if (!isSelf && !isAdmin) {
        return res.status(403).json({ error: 'Geen toegang' });
      }

      if (isSelf && !isAdmin) {
        const person = await prisma.person.update({
          where: { id },
          data: preferenceFieldsFromBody({
            unavailableWeekdays: req.body.unavailableWeekdays,
            preferredSlots: req.body.preferredSlots,
          }),
          include: { team: true },
        });
        return res.json(publicPerson(person, { includeContact: true }));
      }

      const { name, phone, role, active, teamId, email, exempted } = req.body;
      const data = {
        ...(name !== undefined && { name: name.trim() }),
        ...(email !== undefined && { email: email?.trim().toLowerCase() || null }),
        ...(phone !== undefined && { phone: phone?.trim() || null }),
        ...(role !== undefined && { role: normalizeRole(role, 'Vrijwilliger') }),
        ...(exempted !== undefined && { exempted: Boolean(exempted) }),
        ...(teamId !== undefined && { teamId: teamId ? Number(teamId) : null }),
        ...preferenceFieldsFromBody(req.body),
      };
      if (active !== undefined) {
        const nextActive = Boolean(active);
        data.active = nextActive;
        data.deactivatedAt = nextActive ? null : new Date();
        if (!nextActive) {
          await prisma.session.deleteMany({ where: { personId: id } });
        }
      }
      const person = await prisma.person.update({
        where: { id },
        data,
        include: { team: true },
      });
      if (teamId) await syncPrimaryTeamMembership(person.id, Number(teamId));
      await writeAudit({
        actorId: req.person.id,
        action: 'person.update',
        entity: 'Person',
        entityId: person.id,
        detail: person.name,
      });
      res.json(publicPerson(person, { viewerRole: req.person.role }));
    } catch (err) {
      next(err);
    }
  }),
);

router.post(
  '/:id/erase-contact',
  requireRole(...ADMIN_ROLES)(async (req, res, next) => {
    try {
      const result = await wipePersonContact(req.params.id);
      await writeAudit({
        actorId: req.person.id,
        action: 'person.erase-contact',
        entity: 'Person',
        entityId: result.id,
        detail: 'contact gewist (AVG)',
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  }),
);

/** Pasfoto uploaden (jpg/png/webp, max 3 MB) */
router.post(
  '/:id/photo',
  requireRole(...PHOTO_ROLES)((req, res, next) => {
    photoUpload.single('photo')(req, res, async (err) => {
      if (err) {
        return res.status(400).json({ error: err.message || 'Upload mislukt' });
      }
      try {
        if (!req.file) {
          return res.status(400).json({ error: 'Geen foto gekozen' });
        }

        const id = Number(req.params.id);
        const existing = await prisma.person.findUnique({ where: { id } });
        if (!existing) {
          fs.unlinkSync(req.file.path);
          return res.status(404).json({ error: 'Persoon niet gevonden' });
        }
        if (!(await canManagePersonAsTeamCoordinator(req.person, existing))) {
          fs.unlinkSync(req.file.path);
          return res.status(403).json({ error: 'Geen toegang tot deze persoon' });
        }

        try {
          assertImageMagic(req.file.path);
        } catch (magicErr) {
          fs.unlinkSync(req.file.path);
          return res.status(400).json({ error: magicErr.message });
        }

        // Oude foto verwijderen
        if (existing.photoUrl?.startsWith('/uploads/photos/')) {
          const oldName = path.basename(existing.photoUrl);
          const oldPath = path.join(PHOTOS_DIR, oldName);
          if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }

        const photoUrl = publicPhotoPath(req.file.filename);
        const person = await prisma.person.update({
          where: { id },
          data: { photoUrl },
          include: { team: true },
        });
        res.json(publicPerson(person, { viewerRole: req.person.role }));
      } catch (e) {
        next(e);
      }
    });
  }),
);

router.delete(
  '/:id/photo',
  requireRole(...PHOTO_ROLES)(async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const existing = await prisma.person.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: 'Persoon niet gevonden' });
      if (!(await canManagePersonAsTeamCoordinator(req.person, existing))) {
        return res.status(403).json({ error: 'Geen toegang tot deze persoon' });
      }

      if (existing.photoUrl?.startsWith('/uploads/photos/')) {
        const oldName = path.basename(existing.photoUrl);
        const oldPath = path.join(PHOTOS_DIR, oldName);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }

      const person = await prisma.person.update({
        where: { id },
        data: { photoUrl: null },
        include: { team: true },
      });
      res.json(publicPerson(person, { viewerRole: req.person.role }));
    } catch (err) {
      next(err);
    }
  }),
);

/** Beheer: wachtwoord van gebruiker instellen */
router.put(
  '/:id/password',
  requireRole(...ADMIN_ROLES)(async (req, res, next) => {
    try {
      const { password } = req.body;
      if (!password || String(password).length < 8) {
        return res.status(400).json({ error: 'Wachtwoord moet minstens 8 tekens zijn' });
      }
      const id = Number(req.params.id);
      const existing = await prisma.person.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: 'Persoon niet gevonden' });

      const person = await prisma.person.update({
        where: { id },
        data: {
          passwordHash: await hashPassword(password),
          accountCreatedAt: existing.accountCreatedAt ?? new Date(),
          inviteToken: null,
          inviteExpiresAt: null,
          passwordResetToken: null,
          passwordResetExpiresAt: null,
        },
        include: { team: true },
      });

      await prisma.session.deleteMany({ where: { personId: id } });

      res.json({
        person: publicPerson(person, { viewerRole: req.person.role }),
        message: 'Wachtwoord bijgewerkt',
      });
    } catch (err) {
      next(err);
    }
  }),
);

export default router;
