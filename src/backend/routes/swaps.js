import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../lib/auth.js';
import { isAdminRole, publicPersonBrief } from '../lib/roles.js';
import { addWeeks, endOfDay, startOfDay } from '../lib/dates.js';
import { blocksForPerson } from '../lib/matchBlocks.js';
import { writeAudit } from '../lib/audit.js';
import { notifyBarcommissieOfPendingSwap } from '../lib/mail.js';
import { resolvePublicAppUrl } from '../lib/appUrl.js';
import { PENDING_SWAP_STATUSES, swapBlockers } from '../lib/swapRules.js';
import { pendingForEnrollment, pendingForPerson } from '../lib/swapQueries.js';

const router = Router();

const SWAP_INCLUDE = {
  requester: true,
  counterparty: true,
  fromEnrollment: { include: { person: true, service: { include: { enrollments: true } } } },
  toEnrollment: { include: { person: true, service: { include: { enrollments: true } } } },
};

function mapEnrollment(enrollment) {
  if (!enrollment) return null;
  return {
    id: enrollment.id,
    personId: enrollment.personId,
    serviceId: enrollment.serviceId,
    kind: enrollment.kind,
    makeup: enrollment.makeup,
    noShow: enrollment.noShow,
    reason: enrollment.reason,
    person: publicPersonBrief(enrollment.person),
    service: enrollment.service
      ? {
          id: enrollment.service.id,
          type: enrollment.service.type,
          date: enrollment.service.date,
          time: enrollment.service.time,
          slot: enrollment.service.slot,
          draft: enrollment.service.draft,
          active: enrollment.service.active,
          kind: enrollment.service.kind,
        }
      : undefined,
  };
}

function serviceText(enrollment) {
  const service = enrollment?.service;
  if (!service) return 'onbekende dienst';
  const date = new Date(service.date).toLocaleDateString('nl-NL', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const type = service.type === 'KITCHEN' ? 'keuken' : 'bar';
  return `${date} · ${service.time} · ${type}`;
}

function mapSwap(swap) {
  return {
    id: swap.id,
    status: swap.status,
    matchBlockWarning: swap.matchBlockWarning,
    note: swap.note,
    createdAt: swap.createdAt,
    updatedAt: swap.updatedAt,
    decidedAt: swap.decidedAt,
    requesterId: swap.requesterId,
    counterpartyId: swap.counterpartyId,
    requester: publicPersonBrief(swap.requester),
    counterparty: publicPersonBrief(swap.counterparty),
    fromEnrollment: mapEnrollment(swap.fromEnrollment),
    toEnrollment: mapEnrollment(swap.toEnrollment),
  };
}

async function loadEnrollment(id) {
  return prisma.enrollment.findUnique({
    where: { id: Number(id) },
    include: {
      person: { include: { team: true, teamMemberships: { where: { active: true } } } },
      service: { include: { enrollments: true } },
    },
  });
}

async function matchesAround(...dates) {
  const valid = dates.filter(Boolean).map((d) => new Date(d));
  if (!valid.length) return [];
  const min = valid.reduce((a, b) => (a < b ? a : b));
  const max = valid.reduce((a, b) => (a > b ? a : b));
  return prisma.match.findMany({
    where: {
      date: {
        gte: startOfDay(addWeeks(min, -1)),
        lte: endOfDay(addWeeks(max, 1)),
      },
    },
    include: { team: true },
  });
}

function withBlocks(person, matches) {
  return { ...person, blocks: blocksForPerson(person, matches) };
}

async function evaluatePair(fromEnrollment, toEnrollment) {
  const matches = await matchesAround(fromEnrollment.service?.date, toEnrollment.service?.date);
  const fromPerson = withBlocks(fromEnrollment.person, matches);
  const toPerson = withBlocks(toEnrollment.person, matches);
  return {
    ...swapBlockers({
      fromEnrollment,
      toEnrollment,
      fromPerson,
      toPerson,
      matches,
    }),
    fromPerson,
    toPerson,
  };
}

router.get(
  '/',
  requireAuth(async (req, res, next) => {
    try {
      const me = req.person.id;
      const where = isAdminRole(req.person.role)
        ? {
            OR: [
              { requesterId: me },
              { counterpartyId: me },
              { status: 'PENDING_COMMITTEE' },
            ],
          }
        : { OR: [{ requesterId: me }, { counterpartyId: me }] };

      const swaps = await prisma.swapRequest.findMany({
        where,
        include: SWAP_INCLUDE,
        orderBy: { createdAt: 'desc' },
      });
      res.json(swaps.map(mapSwap));
    } catch (err) {
      next(err);
    }
  }),
);

router.get(
  '/candidates',
  requireAuth(async (req, res, next) => {
    try {
      const today = startOfDay(new Date());
      const where = {
        kind: 'PERSONAL',
        noShow: false,
        service: { active: true, draft: false, date: { gte: today } },
      };
      const rows = await prisma.enrollment.findMany({
        where,
        include: { person: true, service: true },
        orderBy: [{ service: { date: 'asc' } }],
        take: 400,
      });
      const mine = rows.filter((e) => e.personId === req.person.id).map(mapEnrollment);
      const others = rows.filter((e) => e.personId !== req.person.id).map(mapEnrollment);
      res.json({ mine, others });
    } catch (err) {
      next(err);
    }
  }),
);

router.post(
  '/',
  requireAuth(async (req, res, next) => {
    try {
      const fromEnrollmentId = Number(req.body.fromEnrollmentId);
      const toEnrollmentId = Number(req.body.toEnrollmentId);
      if (!fromEnrollmentId || !toEnrollmentId) {
        return res.status(400).json({ error: 'Kies twee diensten om te ruilen' });
      }

      const fromEnrollment = await loadEnrollment(fromEnrollmentId);
      const toEnrollment = await loadEnrollment(toEnrollmentId);
      if (!fromEnrollment || !toEnrollment) {
        return res.status(404).json({ error: 'Een van de diensten is niet gevonden' });
      }
      if (fromEnrollment.personId !== req.person.id) {
        return res.status(403).json({ error: 'Je kunt alleen een eigen dienst inruilen' });
      }

      const check = await evaluatePair(fromEnrollment, toEnrollment);
      if (!check.ok) {
        return res.status(400).json({ error: check.errors[0], errors: check.errors });
      }

      if (await pendingForPerson(fromEnrollment.personId)) {
        return res.status(409).json({ error: 'Je hebt al een openstaand ruilverzoek' });
      }
      if (await pendingForPerson(toEnrollment.personId)) {
        return res.status(409).json({ error: 'De andere persoon heeft al een openstaand ruilverzoek' });
      }
      if (await pendingForEnrollment(fromEnrollmentId) || await pendingForEnrollment(toEnrollmentId)) {
        return res.status(409).json({ error: 'Een van deze diensten zit al in een ruilverzoek' });
      }

      const swap = await prisma.swapRequest.create({
        data: {
          fromEnrollmentId,
          toEnrollmentId,
          requesterId: fromEnrollment.personId,
          counterpartyId: toEnrollment.personId,
          status: 'PENDING_PEER',
          matchBlockWarning: check.matchBlock,
          note: req.body.note ? String(req.body.note).slice(0, 300) : null,
        },
        include: SWAP_INCLUDE,
      });

      await writeAudit({
        actorId: req.person.id,
        action: 'swap.create',
        entity: 'SwapRequest',
        entityId: swap.id,
        detail: `${fromEnrollment.person.name} ↔ ${toEnrollment.person.name}`,
      });

      res.status(201).json(mapSwap(swap));
    } catch (err) {
      next(err);
    }
  }),
);

router.post(
  '/:id/accept',
  requireAuth(async (req, res, next) => {
    try {
      const swap = await prisma.swapRequest.findUnique({
        where: { id: Number(req.params.id) },
        include: SWAP_INCLUDE,
      });
      if (!swap) return res.status(404).json({ error: 'Ruilverzoek niet gevonden' });
      if (swap.counterpartyId !== req.person.id) {
        return res.status(403).json({ error: 'Alleen de andere persoon kan dit verzoek accepteren' });
      }
      if (swap.status !== 'PENDING_PEER') {
        return res.status(400).json({ error: 'Dit verzoek kan niet meer geaccepteerd worden' });
      }

      const check = await evaluatePair(swap.fromEnrollment, swap.toEnrollment);
      if (!check.ok) {
        return res.status(400).json({ error: check.errors[0], errors: check.errors });
      }

      const updated = await prisma.swapRequest.update({
        where: { id: swap.id },
        data: { status: 'PENDING_COMMITTEE', matchBlockWarning: check.matchBlock },
        include: SWAP_INCLUDE,
      });

      await writeAudit({
        actorId: req.person.id,
        action: 'swap.accept',
        entity: 'SwapRequest',
        entityId: swap.id,
        detail: swap.counterparty.name,
      });

      let appUrl = '';
      try {
        appUrl = resolvePublicAppUrl();
      } catch {
        appUrl = '';
      }
      notifyBarcommissieOfPendingSwap({
        requesterName: updated.requester?.name || 'Onbekend',
        counterpartyName: updated.counterparty?.name || 'Onbekend',
        fromLabel: serviceText(updated.fromEnrollment),
        toLabel: serviceText(updated.toEnrollment),
        appUrl,
      }).catch((err) => {
        console.error('[Mail] Ruil-notificatie barcommissie mislukt:', err.message);
      });

      res.json(mapSwap(updated));
    } catch (err) {
      next(err);
    }
  }),
);

router.post(
  '/:id/cancel',
  requireAuth(async (req, res, next) => {
    try {
      const swap = await prisma.swapRequest.findUnique({
        where: { id: Number(req.params.id) },
        include: SWAP_INCLUDE,
      });
      if (!swap) return res.status(404).json({ error: 'Ruilverzoek niet gevonden' });
      const involved = swap.requesterId === req.person.id || swap.counterpartyId === req.person.id;
      if (!involved && !isAdminRole(req.person.role)) {
        return res.status(403).json({ error: 'Je mag dit verzoek niet intrekken' });
      }
      if (!PENDING_SWAP_STATUSES.includes(swap.status)) {
        return res.status(400).json({ error: 'Dit verzoek is al afgehandeld' });
      }

      const updated = await prisma.swapRequest.update({
        where: { id: swap.id },
        data: { status: 'CANCELLED', decidedById: req.person.id, decidedAt: new Date() },
        include: SWAP_INCLUDE,
      });

      await writeAudit({
        actorId: req.person.id,
        action: 'swap.cancel',
        entity: 'SwapRequest',
        entityId: swap.id,
        detail: swap.status,
      });

      res.json(mapSwap(updated));
    } catch (err) {
      next(err);
    }
  }),
);

router.post(
  '/:id/reject',
  requireAuth(async (req, res, next) => {
    try {
      const swap = await prisma.swapRequest.findUnique({
        where: { id: Number(req.params.id) },
        include: SWAP_INCLUDE,
      });
      if (!swap) return res.status(404).json({ error: 'Ruilverzoek niet gevonden' });

      const asPeer = swap.counterpartyId === req.person.id && swap.status === 'PENDING_PEER';
      const asCommittee = isAdminRole(req.person.role) && PENDING_SWAP_STATUSES.includes(swap.status);
      if (!asPeer && !asCommittee) {
        return res.status(403).json({ error: 'Je mag dit verzoek niet afwijzen' });
      }

      const updated = await prisma.swapRequest.update({
        where: { id: swap.id },
        data: { status: 'REJECTED', decidedById: req.person.id, decidedAt: new Date() },
        include: SWAP_INCLUDE,
      });

      await writeAudit({
        actorId: req.person.id,
        action: 'swap.reject',
        entity: 'SwapRequest',
        entityId: swap.id,
        detail: asPeer ? 'counterparty' : 'committee',
      });

      res.json(mapSwap(updated));
    } catch (err) {
      next(err);
    }
  }),
);

router.post(
  '/:id/approve',
  requireAuth(async (req, res, next) => {
    try {
      if (!isAdminRole(req.person.role)) {
        return res.status(403).json({ error: 'Alleen de barcommissie kan een ruil goedkeuren' });
      }

      const swap = await prisma.swapRequest.findUnique({
        where: { id: Number(req.params.id) },
        include: SWAP_INCLUDE,
      });
      if (!swap) return res.status(404).json({ error: 'Ruilverzoek niet gevonden' });
      if (swap.status !== 'PENDING_COMMITTEE') {
        return res.status(400).json({ error: 'Dit verzoek wacht nog niet op de barcommissie' });
      }

      const fromEnrollment = await loadEnrollment(swap.fromEnrollmentId);
      const toEnrollment = await loadEnrollment(swap.toEnrollmentId);
      if (!fromEnrollment || !toEnrollment) {
        return res.status(404).json({ error: 'Een van de diensten is niet meer beschikbaar' });
      }

      const check = await evaluatePair(fromEnrollment, toEnrollment);
      if (!check.ok) {
        return res.status(400).json({ error: check.errors[0], errors: check.errors });
      }
      if (check.matchBlock && !req.body?.ignoreMatchBlock) {
        return res.status(409).json({
          error:
            'Let op: bij deze ruil valt iemand binnen een wedstrijdblokkade. Toch goedkeuren?',
          code: 'MATCH_BLOCK',
          canOverride: true,
        });
      }

      const fromPersonId = fromEnrollment.personId;
      const toPersonId = toEnrollment.personId;
      const fromMakeup = fromEnrollment.makeup;
      const toMakeup = toEnrollment.makeup;
      const fromName = fromEnrollment.person.name;
      const toName = toEnrollment.person.name;

      await prisma.$transaction(async (tx) => {
        await tx.enrollment.update({
          where: { id: fromEnrollment.id },
          data: {
            personId: toPersonId,
            makeup: toMakeup,
            reason: `Geruild met ${fromName}`,
          },
        });
        await tx.enrollment.update({
          where: { id: toEnrollment.id },
          data: {
            personId: fromPersonId,
            makeup: fromMakeup,
            reason: `Geruild met ${toName}`,
          },
        });
        await tx.swapRequest.update({
          where: { id: swap.id },
          data: {
            status: 'APPROVED',
            matchBlockWarning: check.matchBlock,
            decidedById: req.person.id,
            decidedAt: new Date(),
          },
        });
      });

      if (req.body?.ignoreMatchBlock && check.matchBlock) {
        await writeAudit({
          actorId: req.person.id,
          action: 'swap.match_block_override',
          entity: 'SwapRequest',
          entityId: swap.id,
          detail: `${fromName} ↔ ${toName}`,
        });
      }
      await writeAudit({
        actorId: req.person.id,
        action: 'swap.approve',
        entity: 'SwapRequest',
        entityId: swap.id,
        detail: `${fromName} ↔ ${toName}`,
      });

      const fresh = await prisma.swapRequest.findUnique({
        where: { id: swap.id },
        include: SWAP_INCLUDE,
      });
      res.json(mapSwap(fresh));
    } catch (err) {
      next(err);
    }
  }),
);

export default router;
