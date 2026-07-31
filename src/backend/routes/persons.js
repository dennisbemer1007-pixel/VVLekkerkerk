import fs from 'fs';
import path from 'path';
import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { publicPerson, requireAuth, requireRole, hashPassword } from '../lib/auth.js';
import { PHOTOS_DIR, photoUpload, publicPhotoPath } from '../lib/uploads.js';
import {
  normalizeObligation,
  serializeJsonArray,
  parseUnavailableWeekdays,
  parsePreferredSlots,
} from '../lib/obligation.js';
import { isAdminRole } from '../lib/roles.js';
import { normalizeRole } from '../lib/appUrl.js';
import { canManagePersonAsTeamCoordinator } from '../lib/authz.js';

const router = Router();
const ADMIN_ROLES = ['Coördinator', 'Bestuur'];
const PHOTO_ROLES = ['Coördinator', 'Bestuur', 'Teamcoördinator'];

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
      const all = req.query.all === 'true';
      const canListAll =
        ADMIN_ROLES.includes(req.person.role) || req.person.role === 'Teamcoördinator';
      if (all && !canListAll) {
        return res.status(403).json({ error: 'Geen toegang' });
      }
      const persons = await prisma.person.findMany({
        where: all ? undefined : { active: true },
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

router.post(
  '/',
  requireRole(...ADMIN_ROLES)(async (req, res, next) => {
    try {
      const { name, phone, role, teamId, email } = req.body;
      if (!name?.trim()) {
        return res.status(400).json({ error: 'Naam is verplicht' });
      }
      const person = await prisma.person.create({
        data: {
          name: name.trim(),
          email: email?.trim().toLowerCase() || null,
          phone: phone?.trim() || null,
          role: normalizeRole(role, 'Vrijwilliger'),
          teamId: teamId ? Number(teamId) : null,
          ...preferenceFieldsFromBody(req.body),
        },
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

      const { name, phone, role, active, teamId, email } = req.body;
      const person = await prisma.person.update({
        where: { id },
        data: {
          ...(name !== undefined && { name: name.trim() }),
          ...(email !== undefined && { email: email?.trim().toLowerCase() || null }),
          ...(phone !== undefined && { phone: phone?.trim() || null }),
          ...(role !== undefined && { role: normalizeRole(role, 'Vrijwilliger') }),
          ...(active !== undefined && { active: Boolean(active) }),
          ...(teamId !== undefined && { teamId: teamId ? Number(teamId) : null }),
          ...preferenceFieldsFromBody(req.body),
        },
        include: { team: true },
      });
      res.json(publicPerson(person, { viewerRole: req.person.role }));
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
