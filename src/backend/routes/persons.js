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
import { parsePersonCsv, PERSON_IMPORT_EXAMPLE, validatePersonRows } from '../lib/csvPersons.js';
import { isNamelessRosterPerson } from '../lib/personMatch.js';
import { trySendInviteEmail } from '../lib/mail.js';
import { exportPersonData, wipePersonContact, personExportSheets } from '../lib/privacy.js';
import { workbookToXlsx } from '../lib/xlsxWrite.js';
import { personTemplateSheets, personExportRowsSheets } from '../lib/personsXlsx.js';
import { getClubSettings } from '../lib/season.js';
import { normalizeAbsenceRange } from '../lib/absences.js';

const router = Router();
const PHOTO_ROLES = [...ADMIN_ROLES, 'Teamcoördinator'];

function publicAbsence(absence) {
  return {
    id: absence.id,
    personId: absence.personId,
    fromDate: absence.fromDate,
    toDate: absence.toDate,
    note: absence.note || '',
  };
}

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
      const includeNameless = req.query.includeNameless === 'true' && isAdmin;
      const persons = await prisma.person.findMany({
        where: includeInactive ? undefined : { active: true },
        include: { team: true, guardian: true },
        orderBy: { name: 'asc' },
      });
      const visible = includeNameless
        ? persons
        : persons.filter((p) => !isNamelessRosterPerson(p));
      res.json(visible.map((p) => publicPerson(p, { viewerRole: req.person.role })));
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

/** Eigen afwezigheden (alleen lezen; wijzigen gaat via de barcommissie/admin) */
router.get(
  '/me/absences',
  requireAuth(async (req, res, next) => {
    try {
      const absences = await prisma.personAbsence.findMany({
        where: { personId: req.person.id },
        orderBy: { fromDate: 'asc' },
      });
      res.json(absences.map(publicAbsence));
    } catch (err) {
      next(err);
    }
  }),
);

/** Afwezigheden van een persoon (alleen barcommissie/admin) */
router.get(
  '/:id/absences',
  requireRole(...ADMIN_ROLES)(async (req, res, next) => {
    try {
      const personId = Number(req.params.id);
      const absences = await prisma.personAbsence.findMany({
        where: { personId },
        orderBy: { fromDate: 'asc' },
      });
      res.json(absences.map(publicAbsence));
    } catch (err) {
      next(err);
    }
  }),
);

/** Afwezigheidsperiode toevoegen (alleen barcommissie/admin) */
router.post(
  '/:id/absences',
  requireRole(...ADMIN_ROLES)(async (req, res, next) => {
    try {
      const personId = Number(req.params.id);
      const existing = await prisma.person.findUnique({ where: { id: personId } });
      if (!existing) return res.status(404).json({ error: 'Persoon niet gevonden' });

      const { fromDate, toDate } = normalizeAbsenceRange(req.body || {});
      const note = String(req.body?.note || '').trim().slice(0, 200);
      const absence = await prisma.personAbsence.create({
        data: { personId, fromDate, toDate, note },
      });
      await writeAudit({
        actorId: req.person.id,
        action: 'person.absence.create',
        entity: 'Person',
        entityId: personId,
        detail: `${existing.name}: afwezig ${fromDate.toISOString().slice(0, 10)} t/m ${toDate.toISOString().slice(0, 10)}`,
      });
      res.status(201).json(publicAbsence(absence));
    } catch (err) {
      next(err);
    }
  }),
);

/** Afwezigheidsperiode verwijderen (alleen barcommissie/admin) */
router.delete(
  '/:id/absences/:absenceId',
  requireRole(...ADMIN_ROLES)(async (req, res, next) => {
    try {
      const personId = Number(req.params.id);
      const absenceId = Number(req.params.absenceId);
      const existing = await prisma.personAbsence.findUnique({ where: { id: absenceId } });
      if (!existing || existing.personId !== personId) {
        return res.status(404).json({ error: 'Afwezigheid niet gevonden' });
      }
      await prisma.personAbsence.delete({ where: { id: absenceId } });
      await writeAudit({
        actorId: req.person.id,
        action: 'person.absence.delete',
        entity: 'Person',
        entityId: personId,
        detail: `afwezigheid verwijderd (${absenceId})`,
      });
      res.json({ ok: true });
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

router.get(
  '/import-example',
  requireRole(...ADMIN_ROLES)(async (_req, res) => {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="voorbeeld-personen.csv"');
    res.send(`\uFEFF${PERSON_IMPORT_EXAMPLE}`);
  }),
);

/** Sjabloon downloaden: headers + toegestane waarden per keuzeveld, geen data. */
router.get(
  '/template.xlsx',
  requireRole(...ADMIN_ROLES)(async (_req, res, next) => {
    try {
      const teams = await prisma.team.findMany({ select: { name: true }, orderBy: { name: 'asc' } });
      const buf = workbookToXlsx(personTemplateSheets(teams));
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader('Content-Disposition', 'attachment; filename="vvl-personen-sjabloon.xlsx"');
      res.send(buf);
    } catch (err) {
      next(err);
    }
  }),
);

/** Alle personen exporteren als xlsx (zelfde structuur als het sjabloon, dus her-importeerbaar). */
router.get(
  '/export.xlsx',
  requireRole(...ADMIN_ROLES)(async (req, res, next) => {
    try {
      const includeInactive = req.query.all === 'true';
      const [persons, teams] = await Promise.all([
        prisma.person.findMany({
          where: includeInactive ? undefined : { active: true },
          include: { team: true, guardian: true },
          orderBy: { name: 'asc' },
        }),
        prisma.team.findMany({ select: { name: true }, orderBy: { name: 'asc' } }),
      ]);
      const visible = persons.filter((p) => !isNamelessRosterPerson(p));
      const buf = workbookToXlsx(personExportRowsSheets(visible, teams));
      await writeAudit({
        actorId: req.person.id,
        action: 'person.export.xlsx',
        entity: 'Person',
        entityId: req.person.id,
        detail: `${visible.length} personen geëxporteerd`,
      });
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader('Content-Disposition', 'attachment; filename="vvl-personen-export.xlsx"');
      res.send(buf);
    } catch (err) {
      next(err);
    }
  }),
);

router.get(
  '/me/children',
  requireAuth(async (req, res, next) => {
    try {
      const children = await prisma.person.findMany({
        where: { guardianId: req.person.id, active: true },
        orderBy: { name: 'asc' },
      });
      res.json(children.map((p) => publicPerson(p, { viewerRole: req.person.role })));
    } catch (err) {
      next(err);
    }
  }),
);

router.post(
  '/me/children',
  requireAuth(async (req, res, next) => {
    try {
      const name = String(req.body?.name || '').trim();
      if (name.length < 2) return res.status(400).json({ error: 'Vul de naam van het kind in.' });
      const guardian = await prisma.person.findUnique({ where: { id: req.person.id } });
      const child = await prisma.person.create({
        data: {
          name,
          personNumber: await nextPersonNumber(),
          email: null,
          role: 'Vrijwilliger',
          obligation: 'NONE',
          teamId: guardian?.teamId ?? null,
          guardianId: req.person.id,
          active: true,
        },
      });
      if (child.teamId) await syncPrimaryTeamMembership(child.id, child.teamId);
      await writeAudit({
        actorId: req.person.id,
        action: 'person.create_child',
        entity: 'Person',
        entityId: child.id,
        detail: child.name,
      });
      res.status(201).json(publicPerson(child, { viewerRole: req.person.role }));
    } catch (err) {
      next(err);
    }
  }),
);

router.delete(
  '/me/children/:id',
  requireAuth(async (req, res, next) => {
    try {
      const child = await prisma.person.findUnique({ where: { id: Number(req.params.id) } });
      if (!child || child.guardianId !== req.person.id) {
        return res.status(404).json({ error: 'Kind niet gevonden' });
      }
      if (child.email || child.passwordHash) {
        return res.status(400).json({ error: 'Dit account verwijder je niet hier' });
      }
      await prisma.person.delete({ where: { id: child.id } });
      await writeAudit({
        actorId: req.person.id,
        action: 'person.delete_child',
        entity: 'Person',
        entityId: child.id,
        detail: child.name,
      });
      res.json({ ok: true });
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

/** Bulk: uitnodigingslink (opnieuw) versturen naar geselecteerde personen met e-mail. */
router.post(
  '/bulk-invite',
  requireRole(...ADMIN_ROLES)(async (req, res, next) => {
    try {
      const ids = Array.isArray(req.body.personIds)
        ? [...new Set(req.body.personIds.map(Number).filter(Boolean))]
        : [];
      if (!ids.length) {
        return res.status(400).json({ error: 'Geen personen geselecteerd' });
      }
      let appUrl = '';
      try {
        appUrl = resolvePublicAppUrl();
      } catch (err) {
        return next(err);
      }

      const persons = await prisma.person.findMany({ where: { id: { in: ids } } });
      const sent = [];
      const failed = [];
      const skippedNoEmail = [];

      for (const person of persons) {
        if (!person.email) {
          skippedNoEmail.push(person.name);
          continue;
        }
        if (person.passwordHash) {
          failed.push({ name: person.name, reason: 'Heeft al een account' });
          continue;
        }
        const token = createInviteToken();
        await prisma.person.update({
          where: { id: person.id },
          data: { inviteToken: token, inviteExpiresAt: inviteExpiry() },
        });
        const link = inviteLink(token, appUrl);
        const mail = await trySendInviteEmail({ email: person.email, name: person.name, link });
        if (mail.sent) sent.push(person.name);
        else failed.push({ name: person.name, reason: mail.reason || 'Mail mislukt' });
      }

      await writeAudit({
        actorId: req.person.id,
        action: 'person.bulk_invite',
        entity: 'Person',
        detail: `${sent.length} verstuurd, ${skippedNoEmail.length} zonder e-mail, ${failed.length} mislukt`,
      });

      res.json({ sent, failed, skippedNoEmail });
    } catch (err) {
      next(err);
    }
  }),
);

router.post(
  '/',
  requireRole(...ADMIN_ROLES)(async (req, res, next) => {
    try {
      const { name, phone, role, teamId, email, exempted, guardianId } = req.body;
      if (!name?.trim()) {
        return res.status(400).json({ error: 'Naam is verplicht' });
      }
      const cleanGuardianId = guardianId ? Number(guardianId) : null;
      const cleanEmail = email?.trim().toLowerCase() || null;
      if (!cleanEmail && !cleanGuardianId) {
        return res.status(400).json({ error: 'Vul een e-mailadres in, of kies "Hoort bij"' });
      }
      if (cleanGuardianId) {
        const guardian = await prisma.person.findUnique({ where: { id: cleanGuardianId } });
        if (!guardian) {
          return res.status(400).json({ error: '"Hoort bij"-persoon niet gevonden' });
        }
      }
      const personNumber = await nextPersonNumber();
      const person = await prisma.person.create({
        data: {
          name: name.trim(),
          personNumber,
          email: cleanEmail,
          phone: phone?.trim() || null,
          role: normalizeRole(role, 'Vrijwilliger'),
          teamId: teamId ? Number(teamId) : null,
          exempted: Boolean(exempted),
          guardianId: cleanGuardianId,
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
      const withGuardian = await prisma.person.findUnique({
        where: { id: person.id },
        include: { team: true, guardian: true },
      });
      res.status(201).json(publicPerson(withGuardian, { viewerRole: req.person.role }));
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

      const { name, phone, role, active, teamId, email, exempted, guardianId } = req.body;

      let cleanGuardianId;
      if (guardianId !== undefined) {
        cleanGuardianId = guardianId ? Number(guardianId) : null;
        if (cleanGuardianId === id) {
          return res.status(400).json({ error: 'Iemand kan niet aan zichzelf "hoort bij" gekoppeld worden' });
        }
        if (cleanGuardianId) {
          const guardian = await prisma.person.findUnique({ where: { id: cleanGuardianId } });
          if (!guardian) {
            return res.status(400).json({ error: '"Hoort bij"-persoon niet gevonden' });
          }
        }
      }

      if (email !== undefined) {
        const cleanEmail = email?.trim().toLowerCase() || null;
        const existing = await prisma.person.findUnique({ where: { id } });
        const willHaveGuardian = cleanGuardianId !== undefined ? cleanGuardianId : existing?.guardianId;
        if (!cleanEmail && !willHaveGuardian) {
          return res.status(400).json({ error: 'Vul een e-mailadres in, of kies "Hoort bij"' });
        }
      }

      const data = {
        ...(name !== undefined && { name: name.trim() }),
        ...(email !== undefined && { email: email?.trim().toLowerCase() || null }),
        ...(phone !== undefined && { phone: phone?.trim() || null }),
        ...(role !== undefined && { role: normalizeRole(role, 'Vrijwilliger') }),
        ...(exempted !== undefined && { exempted: Boolean(exempted) }),
        ...(teamId !== undefined && { teamId: teamId ? Number(teamId) : null }),
        ...(guardianId !== undefined && { guardianId: cleanGuardianId }),
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
        include: { team: true, guardian: true },
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

/** Persoon definitief verwijderen. Alleen mogelijk zonder rooster-historie (anders eerst deactiveren). */
router.delete(
  '/:id',
  requireRole(...ADMIN_ROLES)(async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const existing = await prisma.person.findUnique({
        where: { id },
        include: {
          _count: {
            select: { enrollments: true, children: true, coordinates: true },
          },
        },
      });
      if (!existing) return res.status(404).json({ error: 'Persoon niet gevonden' });
      if (existing._count.enrollments > 0) {
        return res.status(400).json({
          error: 'Deze persoon heeft rooster-historie en kan niet verwijderd worden. Deactiveer in plaats daarvan.',
        });
      }
      if (existing._count.children > 0) {
        return res.status(400).json({
          error: 'Deze persoon heeft nog personen die aan hen "hoort bij". Koppel die eerst los.',
        });
      }
      if (existing._count.coordinates > 0) {
        return res.status(400).json({
          error: 'Deze persoon is teamcoördinator van een team. Wijzig dat eerst.',
        });
      }
      await prisma.session.deleteMany({ where: { personId: id } });
      await prisma.person.delete({ where: { id } });
      await writeAudit({
        actorId: req.person.id,
        action: 'person.delete',
        entity: 'Person',
        entityId: id,
        detail: existing.name,
      });
      res.json({ ok: true });
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

      const header = req.headers.authorization || '';
      const currentToken = header.startsWith('Bearer ') ? header.slice(7) : null;
      const keepThisSession = req.person.id === id && Boolean(currentToken);
      await prisma.session.deleteMany({
        where: {
          personId: id,
          ...(keepThisSession ? { token: { not: currentToken } } : {}),
        },
      });

      res.json({
        person: publicPerson(person, { viewerRole: req.person.role }),
        message: keepThisSession
          ? 'Wachtwoord bijgewerkt. Je blijft op dit apparaat ingelogd.'
          : 'Wachtwoord bijgewerkt',
      });
    } catch (err) {
      next(err);
    }
  }),
);

export default router;
