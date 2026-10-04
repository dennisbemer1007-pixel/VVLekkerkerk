import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../lib/auth.js';
import { resolvePublicAppUrl } from '../lib/appUrl.js';
import { writeAudit } from '../lib/audit.js';
import {
  calendarResponseHeaders,
  etagMatches,
  feedUrls,
  normalizeFeedToken,
} from '../lib/ics.js';
import { CALENDAR_RATE_MAX, CALENDAR_RATE_WINDOW_MS, calendarBlocked } from '../lib/calendarEvents.js';
import {
  calendarEnabled,
  canRotateTeam,
  ensurePersonFeed,
  ensureTeamFeed,
  managedTeams,
  ownTeamLinks,
  renderFeed,
  rotatePersonFeed,
  rotateTeamFeed,
} from '../lib/calendarFeed.js';

const router = Router();

const feedLimiter = rateLimit({
  windowMs: CALENDAR_RATE_WINDOW_MS,
  max: CALENDAR_RATE_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Te veel agenda-verzoeken. Probeer later opnieuw.' },
});

function notFound(res, asText) {
  if (asText) return res.status(404).type('text/plain').send('Niet gevonden');
  return res.status(404).json({ error: 'Niet gevonden' });
}

async function gate(req, res, next) {
  try {
    if (calendarBlocked(await calendarEnabled())) return notFound(res, req.path.startsWith('/feed/'));
    return next();
  } catch (err) {
    return next(err);
  }
}

function appBase(req) {
  try {
    return resolvePublicAppUrl();
  } catch {
    const host = req.get('host');
    const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
    return host ? `${proto}://${host}` : '';
  }
}

function presentTeam(team, feed, base, canRotate) {
  return {
    id: team.id,
    name: team.name,
    canRotate: Boolean(canRotate),
    ...feedUrls(base, feed.token),
  };
}

router.get('/status', async (_req, res, next) => {
  try {
    res.json({ enabled: await calendarEnabled() });
  } catch (err) {
    next(err);
  }
});

router.get('/feed/:token', feedLimiter, async (req, res, next) => {
  try {
    if (calendarBlocked(await calendarEnabled())) return notFound(res, true);
    const token = normalizeFeedToken(req.params.token);
    if (!token) return notFound(res, true);
    const feed = await prisma.calendarFeed.findUnique({
      where: { token },
      include: { person: true, team: true },
    });
    const body = await renderFeed(feed, { appUrl: appBase(req), now: new Date() });
    if (!body) return notFound(res, true);
    const headers = calendarResponseHeaders(body);
    res.removeHeader('Pragma');
    res.set(headers);
    if (etagMatches(req.headers['if-none-match'], headers.ETag)) return res.status(304).end();
    return res.send(body);
  } catch (err) {
    return next(err);
  }
});

router.use(gate);

router.get(
  '/me',
  requireAuth(async (req, res, next) => {
    try {
      const base = appBase(req);
      const feed = await ensurePersonFeed(req.person.id);
      const teams = await ownTeamLinks(req.person);
      const teamFeeds = [];
      for (const team of teams) {
        const teamFeed = await ensureTeamFeed(team.id);
        teamFeeds.push(presentTeam(team, teamFeed, base, false));
      }
      res.json({
        ...feedUrls(base, feed.token),
        teams: teamFeeds,
      });
    } catch (err) {
      next(err);
    }
  }),
);

router.post(
  '/me/rotate',
  requireAuth(async (req, res, next) => {
    try {
      const feed = await rotatePersonFeed(req.person.id);
      await writeAudit({
        actorId: req.person.id,
        action: 'calendar.rotate',
        entity: 'CalendarFeed',
        entityId: feed.id,
        detail: 'persoonlijke link vernieuwd',
      });
      const teams = await ownTeamLinks(req.person);
      const teamFeeds = [];
      const base = appBase(req);
      for (const team of teams) {
        const teamFeed = await ensureTeamFeed(team.id);
        teamFeeds.push(presentTeam(team, teamFeed, base, false));
      }
      res.json({
        ...feedUrls(base, feed.token),
        teams: teamFeeds,
      });
    } catch (err) {
      next(err);
    }
  }),
);

router.get(
  '/teams',
  requireAuth(async (req, res, next) => {
    try {
      const scope = req.query.scope === 'managed' ? 'managed' : 'own';
      const base = appBase(req);
      const teams = scope === 'managed' ? await managedTeams(req.person) : await ownTeamLinks(req.person);
      if (!teams) return res.status(403).json({ error: 'Je hebt hier geen toegang toe' });
      const rows = [];
      for (const team of teams) {
        const feed = await ensureTeamFeed(team.id);
        const rotate = scope === 'managed' ? await canRotateTeam(req.person, team.id) : false;
        rows.push(presentTeam(team, feed, base, rotate));
      }
      res.json(rows);
    } catch (err) {
      next(err);
    }
  }),
);

router.post(
  '/teams/:teamId/rotate',
  requireAuth(async (req, res, next) => {
    try {
      const teamId = Number(req.params.teamId);
      if (!teamId) return res.status(404).json({ error: 'Niet gevonden' });
      if (!(await canRotateTeam(req.person, teamId))) {
        return res.status(403).json({ error: 'Je hebt hier geen toegang toe' });
      }
      const team = await prisma.team.findUnique({ where: { id: teamId } });
      if (!team || team.active === false) return res.status(404).json({ error: 'Niet gevonden' });
      const feed = await rotateTeamFeed(teamId);
      await writeAudit({
        actorId: req.person.id,
        action: 'calendar.rotate_team',
        entity: 'CalendarFeed',
        entityId: feed.id,
        detail: team.name,
      });
      res.json(presentTeam(team, feed, appBase(req), true));
    } catch (err) {
      next(err);
    }
  }),
);

export default router;
