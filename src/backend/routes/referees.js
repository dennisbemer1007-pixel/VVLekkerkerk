import { Router } from 'express';
import { requireAuth, requireRole } from '../lib/auth.js';
import {
  acceptSwap,
  assertRefereesEnabled,
  assignSlot,
  attention,
  claimSlot,
  confirmSlot,
  listPeople,
  mineFor,
  overview,
  proposeSwap,
  refereesEnabled,
  rejectSwap,
  replanReferees,
  setCategoryNeeded,
  setLevels,
} from '../lib/referees.js';

const router = Router();
const BEHEER = requireRole('Barcommissie', 'Admin');

router.get('/status', async (_req, res, next) => {
  try {
    res.json({ enabled: await refereesEnabled() });
  } catch (err) {
    next(err);
  }
});

router.use(async (_req, res, next) => {
  try {
    await assertRefereesEnabled();
    return next();
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    return next(err);
  }
});

function sendError(err, res, next) {
  if (err.status) return res.status(err.status).json({ error: err.message });
  return next(err);
}

router.get(
  '/overview',
  BEHEER(async (_req, res, next) => {
    try {
      res.json(await overview());
    } catch (err) {
      sendError(err, res, next);
    }
  }),
);

router.get(
  '/attention',
  BEHEER(async (_req, res, next) => {
    try {
      res.json(await attention());
    } catch (err) {
      sendError(err, res, next);
    }
  }),
);

router.get(
  '/people',
  BEHEER(async (_req, res, next) => {
    try {
      res.json(await listPeople());
    } catch (err) {
      sendError(err, res, next);
    }
  }),
);

router.put(
  '/people/:id/levels',
  BEHEER(async (req, res, next) => {
    try {
      res.json(await setLevels(req.params.id, req.body?.levels));
    } catch (err) {
      sendError(err, res, next);
    }
  }),
);

router.put(
  '/categories/:key',
  BEHEER(async (req, res, next) => {
    try {
      res.json(await setCategoryNeeded(req.params.key, req.body?.needed));
    } catch (err) {
      sendError(err, res, next);
    }
  }),
);

router.post(
  '/plan',
  BEHEER(async (_req, res, next) => {
    try {
      res.json(await replanReferees());
    } catch (err) {
      sendError(err, res, next);
    }
  }),
);

router.put(
  '/slots/:matchId',
  BEHEER(async (req, res, next) => {
    try {
      const personId = req.body?.personId == null || req.body.personId === '' ? null : req.body.personId;
      res.json(await assignSlot(req.params.matchId, personId));
    } catch (err) {
      sendError(err, res, next);
    }
  }),
);

router.get(
  '/mine',
  requireAuth(async (req, res, next) => {
    try {
      res.json(await mineFor(req.person.id));
    } catch (err) {
      sendError(err, res, next);
    }
  }),
);

router.post(
  '/slots/:matchId/confirm',
  requireAuth(async (req, res, next) => {
    try {
      res.json(await confirmSlot(req.params.matchId, req.person.id));
    } catch (err) {
      sendError(err, res, next);
    }
  }),
);

router.post(
  '/slots/:matchId/claim',
  requireAuth(async (req, res, next) => {
    try {
      res.json(await claimSlot(req.params.matchId, req.person.id));
    } catch (err) {
      sendError(err, res, next);
    }
  }),
);

router.post(
  '/swaps',
  requireAuth(async (req, res, next) => {
    try {
      res.status(201).json(
        await proposeSwap({
          requesterId: req.person.id,
          fromMatchId: Number(req.body?.fromMatchId),
          toMatchId: Number(req.body?.toMatchId),
        }),
      );
    } catch (err) {
      sendError(err, res, next);
    }
  }),
);

router.post(
  '/swaps/:id/accept',
  requireAuth(async (req, res, next) => {
    try {
      res.json(await acceptSwap(req.params.id, req.person.id));
    } catch (err) {
      sendError(err, res, next);
    }
  }),
);

router.post(
  '/swaps/:id/reject',
  requireAuth(async (req, res, next) => {
    try {
      res.json(await rejectSwap(req.params.id, req.person.id));
    } catch (err) {
      sendError(err, res, next);
    }
  }),
);

export default router;
