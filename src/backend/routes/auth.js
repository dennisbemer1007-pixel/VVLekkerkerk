import { Router } from 'express';
import prisma from '../lib/prisma.js';
import {
  createInviteToken,
  createSession,
  hashPassword,
  inviteExpiry,
  inviteLink,
  publicPerson,
  requireAuth,
  requireRole,
  passwordMatches,
} from '../lib/auth.js';
import { accessForRole } from '../lib/roles.js';
import { normalizeObligation } from '../lib/obligation.js';
import { trySendInviteEmail, trySendPasswordResetEmail } from '../lib/mail.js';
import { passwordResetLink, resetExpiry } from '../lib/passwordReset.js';
import { resolvePublicAppUrl, normalizeRole } from '../lib/appUrl.js';
import { canManagePersonAsTeamCoordinator } from '../lib/authz.js';
import { nextPersonNumber, syncPrimaryTeamMembership } from '../lib/personNumber.js';
import { publicDemoAccountList } from '../lib/demoAccounts.js';

const router = Router();

const ADMIN_ROLES = ['Barcommissie', 'Bestuur', 'Coördinator'];
const INVITE_ROLES = ['Barcommissie', 'Bestuur', 'Coördinator', 'Teamcoördinator'];

function safeAppUrl() {
  try {
    return resolvePublicAppUrl();
  } catch (err) {
    err.status = err.status || 503;
    throw err;
  }
}

/** Huidige gebruiker */
router.get(
  '/me',
  requireAuth(async (req, res) => {
    res.json(publicPerson(req.person, { includeContact: true }));
  }),
);

/**
 * Demo one-click logins — alleen als SEED_DEMO=true (of lokaal development).
 * Runtime-endpoint: Vite-build env is niet nodig.
 */
router.get('/demo-accounts', (_req, res) => {
  const accounts = publicDemoAccountList();
  res.json({ enabled: accounts.length > 0, accounts });
});

/** Inloggen */
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email?.trim() || !password) {
      return res.status(400).json({ error: 'E-mail en wachtwoord zijn verplicht' });
    }

    const person = await prisma.person.findUnique({
      where: { email: email.trim().toLowerCase() },
      include: { team: true },
    });

    if (!(await passwordMatches(password, person))) {
      return res.status(401).json({ error: 'Onjuiste e-mail of wachtwoord' });
    }

    const token = await createSession(person.id);
    res.json({ token, person: publicPerson(person, { includeContact: true }) });
  } catch (err) {
    next(err);
  }
});

/** Wachtwoord vergeten — altijd zelfde antwoord (geen e-mail enumeration) */
router.post('/forgot-password', async (req, res, next) => {
  try {
    const email = req.body?.email?.trim().toLowerCase();
    const generic = {
      ok: true,
      message:
        'Als dit e-mailadres bij ons bekend is, ontvang je een link om je wachtwoord te resetten.',
    };
    if (!email) {
      return res.status(400).json({ error: 'Vul je e-mailadres in' });
    }

    const person = await prisma.person.findUnique({ where: { email } });
    if (person?.passwordHash && person.active) {
      try {
        const token = createInviteToken();
        await prisma.person.update({
          where: { id: person.id },
          data: {
            passwordResetToken: token,
            passwordResetExpiresAt: resetExpiry(),
          },
        });
        const link = passwordResetLink(token, safeAppUrl());
        await trySendPasswordResetEmail({ email, name: person.name, link });
      } catch (dbErr) {
        console.error('[Wachtwoord-reset] database:', dbErr.message);
        return res.status(503).json({
          error:
            'Wachtwoord-reset is nog niet geactiveerd op de server. Voer npm run db:push uit en herstart de app.',
        });
      }
    }

    res.json(generic);
  } catch (err) {
    next(err);
  }
});

router.get('/reset/:token', async (req, res, next) => {
  try {
    const person = await prisma.person.findUnique({
      where: { passwordResetToken: req.params.token },
    });
    if (!person?.active || !person.passwordHash) {
      return res.status(404).json({ error: 'Deze link is ongeldig' });
    }
    if (!person.passwordResetExpiresAt || person.passwordResetExpiresAt < new Date()) {
      return res.status(410).json({ error: 'Deze link is verlopen. Vraag een nieuwe aan.' });
    }
    res.json({ name: person.name, email: person.email });
  } catch (err) {
    next(err);
  }
});

router.post('/reset/:token', async (req, res, next) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Kies een wachtwoord van minstens 8 tekens' });
    }

    const person = await prisma.person.findUnique({
      where: { passwordResetToken: req.params.token },
    });
    if (!person?.active) {
      return res.status(404).json({ error: 'Deze link is ongeldig' });
    }
    if (!person.passwordResetExpiresAt || person.passwordResetExpiresAt < new Date()) {
      return res.status(410).json({ error: 'Deze link is verlopen' });
    }

    const passwordHash = await hashPassword(password);
    await prisma.person.update({
      where: { id: person.id },
      data: {
        passwordHash,
        passwordResetToken: null,
        passwordResetExpiresAt: null,
      },
    });

    await prisma.session.deleteMany({ where: { personId: person.id } });

    res.json({ ok: true, message: 'Wachtwoord gewijzigd. Je kunt nu inloggen.' });
  } catch (err) {
    next(err);
  }
});

/** Uitloggen */
router.post(
  '/logout',
  requireAuth(async (req, res, next) => {
    try {
      const header = req.headers.authorization || '';
      const token = header.startsWith('Bearer ') ? header.slice(7) : null;
      if (token) {
        await prisma.session.deleteMany({ where: { token } });
      }
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  }),
);

/** Uitnodiging ophalen (publiek, via deeplink) */
router.get('/invite/:token', async (req, res, next) => {
  try {
    const person = await prisma.person.findUnique({
      where: { inviteToken: req.params.token },
    });

    if (!person || !person.active) {
      return res.status(404).json({ error: 'Deze uitnodiging is ongeldig' });
    }
    if (person.passwordHash) {
      return res.status(410).json({ error: 'Account is al aangemaakt. Log in met je e-mail.' });
    }
    if (person.inviteExpiresAt && person.inviteExpiresAt < new Date()) {
      return res.status(410).json({ error: 'Deze uitnodiging is verlopen. Vraag een nieuwe aan.' });
    }

    res.json({
      name: person.name,
      email: person.email,
      role: person.role,
      access: accessForRole(person.role),
      expiresAt: person.inviteExpiresAt,
    });
  } catch (err) {
    next(err);
  }
});

/** Account aanmaken via deeplink */
router.post('/invite/:token/accept', async (req, res, next) => {
  try {
    const { password, name } = req.body;
    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Kies een wachtwoord van minstens 8 tekens' });
    }

    const person = await prisma.person.findUnique({
      where: { inviteToken: req.params.token },
    });

    if (!person || !person.active) {
      return res.status(404).json({ error: 'Deze uitnodiging is ongeldig' });
    }
    if (person.passwordHash) {
      return res.status(410).json({ error: 'Account is al aangemaakt' });
    }
    if (person.inviteExpiresAt && person.inviteExpiresAt < new Date()) {
      return res.status(410).json({ error: 'Deze uitnodiging is verlopen' });
    }

    const passwordHash = await hashPassword(password);
    const updated = await prisma.person.update({
      where: { id: person.id },
      data: {
        passwordHash,
        inviteToken: null,
        inviteExpiresAt: null,
        accountCreatedAt: new Date(),
        ...(name?.trim() && { name: name.trim() }),
      },
      include: { team: true },
    });

    const token = await createSession(updated.id);
    res.status(201).json({
      token,
      person: publicPerson(updated, { includeContact: true }),
      message: 'Account aangemaakt. Welkom!',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Admin: persoon uitnodigen per e-mail.
 * Maakt persoon aan (of hergebruikt) en geeft deeplink terug.
 * Echte e-mail versturen is optioneel; de link kan gekopieerd of via mailto verstuurd worden.
 */
router.post(
  '/invite',
  requireRole(...INVITE_ROLES)(async (req, res, next) => {
    try {
      const { name, email, phone, role, obligation, mandatoryBar, teamId } = req.body;
      if (!name?.trim() || !email?.trim()) {
        return res.status(400).json({ error: 'Naam en e-mail zijn verplicht' });
      }

      const cleanEmail = email.trim().toLowerCase();
      let chosenRole = normalizeRole(role, 'Vrijwilliger');
      let chosenTeamId = teamId ? Number(teamId) : null;
      const chosenObligation = normalizeObligation(obligation, mandatoryBar);

      // Teamcoördinator mag alleen vrijwilligers in eigen team(s) uitnodigen
      if (req.person.role === 'Teamcoördinator') {
        chosenRole = 'Vrijwilliger';
        if (!req.person.teamId) {
          return res.status(400).json({
            error: 'Koppel eerst jezelf aan een team om ouders uit te nodigen',
          });
        }
        if (chosenTeamId && chosenTeamId !== req.person.teamId) {
          return res.status(403).json({ error: 'Je mag alleen voor je eigen team uitnodigen' });
        }
        chosenTeamId = req.person.teamId;
      } else if (!ADMIN_ROLES.includes(req.person.role)) {
        return res.status(403).json({ error: 'Geen toegang' });
      }

      const token = createInviteToken();
      const expiresAt = inviteExpiry();

      let person = await prisma.person.findUnique({ where: { email: cleanEmail } });

      if (person?.passwordHash) {
        return res.status(409).json({
          error: 'Deze e-mail heeft al een account. Gebruik inloggen.',
        });
      }

      if (person) {
        person = await prisma.person.update({
          where: { id: person.id },
          data: {
            name: name.trim(),
            phone: phone?.trim() || null,
            role: chosenRole,
            obligation: chosenObligation,
            teamId: chosenTeamId,
            inviteToken: token,
            inviteExpiresAt: expiresAt,
            active: true,
          },
        });
      } else {
        person = await prisma.person.create({
          data: {
            name: name.trim(),
            personNumber: await nextPersonNumber(),
            email: cleanEmail,
            phone: phone?.trim() || null,
            role: chosenRole,
            obligation: chosenObligation,
            teamId: chosenTeamId,
            inviteToken: token,
            inviteExpiresAt: expiresAt,
          },
        });
      }

      if (chosenTeamId) await syncPrimaryTeamMembership(person.id, chosenTeamId);

      const link = inviteLink(token, safeAppUrl());
      console.log(`[Uitnodiging] aangemaakt voor ${person.email}`);

      const mail = await trySendInviteEmail({
        email: cleanEmail,
        name: person.name,
        link,
      });

      res.status(201).json({
        person: publicPerson(person, { includeContact: true }),
        inviteLink: link,
        emailSent: mail.sent,
        emailError: mail.sent ? null : mail.reason,
        mailto: `mailto:${encodeURIComponent(cleanEmail)}?subject=${encodeURIComponent(
          'Uitnodiging VVL Planning App',
        )}&body=${encodeURIComponent(
          `Hoi ${person.name},\n\nJe bent uitgenodigd voor de VVL Planning App van V.V. Lekkerkerk.\n\nMaak je account aan via deze link:\n${link}\n\nDe link is 14 dagen geldig.\n\nGroet,\nV.V. Lekkerkerk`,
        )}`,
        access: accessForRole(person.role),
      });
    } catch (err) {
      next(err);
    }
  }),
);

/** Admin: opnieuw uitnodigen */
router.post(
  '/invite/:personId/resend',
  requireRole(...INVITE_ROLES)(async (req, res, next) => {
    try {
      const person = await prisma.person.findUnique({
        where: { id: Number(req.params.personId) },
      });
      if (!person) return res.status(404).json({ error: 'Persoon niet gevonden' });
      if (!(await canManagePersonAsTeamCoordinator(req.person, person))) {
        return res.status(403).json({ error: 'Je mag deze uitnodiging niet opnieuw versturen' });
      }
      if (!person.email) {
        return res.status(400).json({ error: 'Deze persoon heeft geen e-mailadres' });
      }
      if (person.passwordHash) {
        return res.status(409).json({ error: 'Account bestaat al' });
      }

      const token = createInviteToken();
      const updated = await prisma.person.update({
        where: { id: person.id },
        data: { inviteToken: token, inviteExpiresAt: inviteExpiry() },
      });

      const link = inviteLink(token, safeAppUrl());
      console.log(`[Uitnodiging] opnieuw aangemaakt voor ${updated.email}`);

      const mail = await trySendInviteEmail({
        email: updated.email,
        name: updated.name,
        link,
      });

      res.json({
        person: publicPerson(updated, { includeContact: true }),
        inviteLink: link,
        emailSent: mail.sent,
        emailError: mail.sent ? null : mail.reason,
        mailto: `mailto:${encodeURIComponent(updated.email)}?subject=${encodeURIComponent(
          'Uitnodiging VVL Planning App',
        )}&body=${encodeURIComponent(
          `Hoi ${updated.name},\n\nMaak je account aan via:\n${link}\n\nGroet,\nV.V. Lekkerkerk`,
        )}`,
      });
    } catch (err) {
      next(err);
    }
  }),
);

export default router;
