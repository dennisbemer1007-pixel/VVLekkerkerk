import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import authRouter from './routes/auth.js';
import enrollmentsRouter from './routes/enrollments.js';
import matchesRouter from './routes/matches.js';
import pdfRouter from './routes/pdf.js';
import personsRouter from './routes/persons.js';
import planningRouter from './routes/planning.js';
import servicesRouter from './routes/services.js';
import settingsRouter from './routes/settings.js';
import tournamentsRouter from './routes/tournaments.js';
import teamsRouter from './routes/teams.js';
import { ensureAdmin } from './lib/seed.js';
import { trySyncPlanningFromMatches } from './lib/proposePlanning.js';
import prisma from './lib/prisma.js';
import { UPLOADS_DIR, ensureUploadDirs, isUnsafeUploadPath } from './lib/uploads.js';
import { clientErrorPayload } from './lib/clientError.js';
import { ensureClubDefaults } from './lib/clubDefaults.js';
import { maybeRunDutyReminders } from './lib/reminders.js';
import fs from 'fs';
import serviceRulesRouter from './routes/serviceRules.js';
import activitiesRouter from './routes/activities.js';
import swapsRouter from './routes/swaps.js';
import notificationsRouter from './routes/notifications.js';
import refereesRouter from './routes/referees.js';


const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT ?? 3001;
const isProd = process.env.NODE_ENV === 'production';

ensureUploadDirs();

if (process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 1);
}

app.disable('x-powered-by');
app.use(
  helmet({
    contentSecurityPolicy: isProd
      ? {
          useDefaults: true,
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'blob:'],
            connectSrc: ["'self'"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            frameAncestors: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            upgradeInsecureRequests: [],
          },
        }
      : false,
    crossOriginResourcePolicy: { policy: isProd ? 'same-origin' : 'cross-origin' },
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    referrerPolicy: { policy: 'no-referrer' },
    hsts: isProd ? { maxAge: 15552000, includeSubDomains: true } : false,
  }),
);

const corsOrigin = process.env.CORS_ORIGIN || (isProd ? process.env.APP_URL : '');
if (isProd && !corsOrigin) {
  console.warn('[Security] Zet CORS_ORIGIN of APP_URL in productie.');
}
app.use(
  cors({
    origin: corsOrigin
      ? corsOrigin.split(',').map((s) => s.trim())
      : isProd
        ? false
        : true,
    credentials: true,
  }),
);

app.use(express.json({ limit: '2mb' }));
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  next();
});

// Foto's: onvoorspelbare bestandsnamen; geen directory listing en geen back-ups
app.use('/uploads', (req, res, next) => {
  if (isUnsafeUploadPath(req.path)) return res.status(404).end();
  next();
});
app.use(
  '/uploads',
  express.static(UPLOADS_DIR, { fallthrough: true, index: false, maxAge: '7d', dotfiles: 'deny' }),
);

app.get('/api/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, name: 'VVL Planning App', db: true });
    maybeRunDutyReminders().catch((err) => console.error('[reminders]', err.message));
  } catch (err) {
    console.error('[Health] Database niet bereikbaar:', err.message);
    res.status(503).json({
      ok: false,
      name: 'VVL Planning App',
      db: false,
      error: 'Database niet bereikbaar',
    });
  }
});

function postOnly(limiter) {
  return (req, res, next) => {
    if (req.method !== 'POST') return next();
    return limiter(req, res, next);
  };
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Te veel loginpogingen. Probeer over 15 minuten opnieuw.' },
});

const forgotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Te veel resetverzoeken. Probeer later opnieuw.' },
});

const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Te veel resetpogingen. Probeer later opnieuw.' },
});

const inviteAcceptLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Te veel pogingen met deze uitnodiging. Probeer later opnieuw.' },
});

const inviteCreateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Te veel uitnodigingen. Probeer later opnieuw.' },
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', apiLimiter);
app.use('/api/auth/login', postOnly(loginLimiter));
app.use('/api/auth/forgot-password', postOnly(forgotLimiter));
app.use('/api/auth/reset', postOnly(resetLimiter));
app.use('/api/auth/invite/:token/accept', postOnly(inviteAcceptLimiter));
app.use('/api/auth/invite', (req, res, next) => {
  if (req.method !== 'POST') return next();
  const rest = req.path || '/';
  if (rest === '/' || /\/resend\/?$/.test(rest)) return inviteCreateLimiter(req, res, next);
  return next();
});

app.use('/api/auth', authRouter);
app.use('/api/persons', personsRouter);
app.use('/api/teams', teamsRouter);
app.use('/api/matches', matchesRouter);
app.use('/api/services', servicesRouter);
app.use('/api/enrollments', enrollmentsRouter);
app.use('/api/planning', planningRouter);
app.use('/api/service-rules', serviceRulesRouter);
app.use('/api/activities', activitiesRouter);
app.use('/api/swaps', swapsRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/referees', refereesRouter);
app.use('/api/pdf', pdfRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/tournaments', tournamentsRouter);

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Niet gevonden' });
});

if (isProd) {
  const dist = path.join(__dirname, '../../dist');
  app.get('/robots.txt', (_req, res) => {
    const built = path.join(dist, 'robots.txt');
    const source = path.join(__dirname, '../frontend/public/robots.txt');
    const file = fs.existsSync(built) ? built : source;
    if (!fs.existsSync(file)) {
      res.status(404).type('text/plain').send('User-agent: *\nDisallow: /\n');
      return;
    }
    res.type('text/plain').send(fs.readFileSync(file, 'utf8'));
  });
  app.use(express.static(dist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(dist, 'index.html'));
  });
}

app.use((err, _req, res, _next) => {
  const { status, body } = clientErrorPayload(err, isProd);
  if (status >= 500) console.error(err);
  res.status(status).json(body);
});

ensureAdmin()
  .then(() => ensureClubDefaults())
  .then(() => {
    app.listen(PORT, () => {
      console.log(`VVL Planning API op http://localhost:${PORT}`);
      if (!isProd) {
        console.warn(
          '[Security] Development mode — wijzig standaard admin-wachtwoord vóór productie.',
        );
      } else if (!process.env.MAIL_SECRET) {
        console.warn(
          '[Security] MAIL_SECRET ontbreekt. SMTP-wachtwoorden worden niet opgeslagen tot die sleutel gezet is.',
        );
      }
      trySyncPlanningFromMatches().then((result) => {
        if (result?.error) {
          console.error('[planning] startup sync failed:', result.error);
          return;
        }
        if (result?.created || result?.removed || result?.updated) {
          console.log(
            `[planning] startup sync: +${result.created} ~${result.updated} −${result.removed} (${result.slots} diensten uit regels)`,
          );
        }
      });
      setInterval(() => {
        maybeRunDutyReminders().catch((err) => console.error('[reminders]', err.message));
      }, 60 * 60 * 1000);
    });
  })
  .catch((err) => {
    console.error('Kon admin niet aanmaken:', err);
    process.exit(1);
  });
