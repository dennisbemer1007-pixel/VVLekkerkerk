import { Router } from 'express';
import { requireRole } from '../lib/auth.js';
import {
  applyScore,
  createTournament,
  deleteTournament,
  listTournaments,
  loadPublic,
  loadTournament,
  saveTournament,
  tournamentsEnabled,
} from '../lib/tournaments.js';

const router = Router();
const BEHEER = requireRole('Barcommissie', 'Admin');

router.use(async (_req, res, next) => {
  try {
    if (!(await tournamentsEnabled())) {
      return res.status(404).json({ error: 'Niet gevonden' });
    }
    return next();
  } catch (err) {
    return next(err);
  }
});

router.get('/status', (_req, res) => {
  res.json({ enabled: true });
});

router.get('/live/:token', async (req, res, next) => {
  try {
    const payload = await loadPublic(req.params.token);
    if (!payload) return res.status(404).json({ error: 'Niet gevonden' });
    return res.json(payload);
  } catch (err) {
    return next(err);
  }
});

router.get(
  '/',
  BEHEER(async (_req, res, next) => {
    try {
      res.json(await listTournaments());
    } catch (err) {
      next(err);
    }
  }),
);

router.post(
  '/',
  BEHEER(async (req, res, next) => {
    try {
      const seed = req.body?.seed === 'example' ? 'example' : 'empty';
      const created = await createTournament(seed);
      res.status(201).json(created);
    } catch (err) {
      next(err);
    }
  }),
);

router.get(
  '/:id',
  BEHEER(async (req, res, next) => {
    try {
      const row = await loadTournament(req.params.id);
      if (!row) return res.status(404).json({ error: 'Niet gevonden' });
      return res.json(row);
    } catch (err) {
      return next(err);
    }
  }),
);

router.put(
  '/:id',
  BEHEER(async (req, res, next) => {
    try {
      const row = await saveTournament(req.params.id, req.body?.state || req.body);
      if (!row) return res.status(404).json({ error: 'Niet gevonden' });
      return res.json(row);
    } catch (err) {
      return next(err);
    }
  }),
);

router.post(
  '/:id/scores',
  BEHEER(async (req, res, next) => {
    try {
      const row = await applyScore(req.params.id, req.body || {});
      if (!row) return res.status(404).json({ error: 'Niet gevonden' });
      return res.json(row);
    } catch (err) {
      return next(err);
    }
  }),
);

router.delete(
  '/:id',
  BEHEER(async (req, res, next) => {
    try {
      const ok = await deleteTournament(req.params.id);
      if (!ok) return res.status(404).json({ error: 'Niet gevonden' });
      return res.status(204).end();
    } catch (err) {
      return next(err);
    }
  }),
);

export default router;
