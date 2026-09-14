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
import teamsRouter from './routes/teams.js';
import { ensureAdmin } from './lib/seed.js';
import { trySyncPlanningFromMatches } from './lib/proposePlanning.js';
import prisma from './lib/prisma.js';
import { UPLOADS_DIR, ensureUploadDirs } from './lib/uploads.js';
import { ensureClubDefaults } from './lib/clubDefaults.js';
import { maybeRunDutyReminders } from './lib/reminders.js';
import serviceRulesRouter from './routes/serviceRules.js';
import activitiesRouter from './routes/activities.js';
import swapsRouter from './routes/swaps.js';


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

// Foto's: onvoorspelbare bestandsnamen; geen directory listing
app.use(
  '/uploads',
  express.static(UPLOADS_DIR, { fallthrough: true, index: false, maxAge: '7d' }),
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

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', apiLimiter);
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/forgot-password', forgotLimiter);

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
app.use('/api/pdf', pdfRouter);
app.use('/api/settings', settingsRouter);

if (isProd) {
  const dist = path.join(__dirname, '../../dist');
  app.use(express.static(dist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(dist, 'index.html'));
  });
}

app.use((err, _req, res, _next) => {
  console.error(err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: isProd && status === 500 ? 'Internal server error' : err.message ?? 'Internal server error',
  });
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
