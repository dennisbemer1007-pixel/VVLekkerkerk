/**
 * Startscript voor Render.
 * - Zet SQLite op DATA_DIR (vaste schijf) als die gezet is
 * - Back-upt de live database vóór schemawijzigingen
 * - Past alleen de additieve SQL-migraties voor toernooien en scheidsrechters toe
 * - Schema alleen via additieve SQL; geen tabellen herbouwen
 * - Laadt demo-data alleen als SEED_DEMO=true en de database leeg is
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ensureDataDir, sqliteUrlForDataDir } from '../src/backend/lib/dataDir.js';
import {
  applyNamedMigrationsOnce,
  backupDirFor,
  backupSqlite,
  inspectMail,
  resolveLiveDbFile,
  writeDeployStatus,
  deployStateDir,
  TOURNAMENT_MIGRATION,
  REFEREE_MIGRATION,
} from '../src/backend/lib/liveDeploy.js';
import {
  compareBackupToLive,
  incidentBackupPath,
  publicServiceDiff,
  restoreProtectedServices,
} from '../src/backend/lib/serviceDiff.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

process.env.NODE_ENV = process.env.NODE_ENV || 'production';
process.env.SEED_DEMO = process.env.SEED_DEMO ?? 'false';
process.env.TRUST_PROXY = process.env.TRUST_PROXY ?? '1';

ensureDataDir();
if (process.env.DATA_DIR) {
  process.env.DATABASE_URL = sqliteUrlForDataDir();
} else if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'file:./demo.db';
}

// Publieke URL: Render zet RENDER_EXTERNAL_URL automatisch
if (!process.env.APP_URL && process.env.RENDER_EXTERNAL_URL) {
  process.env.APP_URL = process.env.RENDER_EXTERNAL_URL.replace(/\/$/, '');
}

if (!process.env.CORS_ORIGIN && process.env.APP_URL) {
  process.env.CORS_ORIGIN = process.env.APP_URL;
}

// Demo mag een eenvoudig wachtwoord: voorkom crash van ensureAdmin
if (process.env.SEED_DEMO === 'true' && !process.env.ADMIN_PASSWORD) {
  process.env.ADMIN_PASSWORD = 'demo-test-2026';
}

console.log('[render-start] DATABASE_URL=', process.env.DATABASE_URL);
console.log('[render-start] SEED_DEMO=', process.env.SEED_DEMO);
console.log('[render-start] APP_URL=', process.env.APP_URL || '(niet gezet)');
console.log('[render-start] MAIL_SECRET=', process.env.MAIL_SECRET ? 'gezet' : 'ONTBREEKT');
console.log('[render-start] SQL-migraties (geen db push):', TOURNAMENT_MIGRATION, REFEREE_MIGRATION);

const dbFile = resolveLiveDbFile(root);
if (process.env.DATA_DIR && (!dbFile || !fs.existsSync(dbFile))) {
  console.error('[render-start] Geen database op de schijf (%s). Stoppen om dataverlies te voorkomen.', dbFile);
  process.exit(1);
}

console.log('[render-start] prisma generate (geen db push)');
execSync('npx prisma generate --schema=src/backend/prisma/schema.prisma', {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
});

const { default: prisma } = await import('../src/backend/lib/prisma.js');
const stateDir = deployStateDir(dbFile);

let backup = null;
if (dbFile && fs.existsSync(dbFile)) {
  backup = await backupSqlite(prisma, dbFile, backupDirFor(dbFile));
  console.log('[render-start] Backup: %s (%s bytes)', backup.path, backup.bytes);
  if (!fs.existsSync(backup.path)) {
    console.error('[render-start] Backupbestand ontbreekt na schrijven.');
    process.exit(1);
  }
} else {
  console.warn('[render-start] Geen bestaand SQLite-bestand — backup overgeslagen');
}

const personsBefore = await prisma.person.count();
const servicesBefore = await prisma.service.count();
console.log('[render-start] Voor migratie: %s diensten, %s personen', servicesBefore, personsBefore);

const migrations = await applyNamedMigrationsOnce(prisma, root, stateDir);
console.log('[render-start] Migraties:', JSON.stringify(migrations));

const personsAfter = await prisma.person.count();
const servicesAfter = await prisma.service.count();
console.log('[render-start] Na migratie: %s diensten, %s personen', servicesAfter, personsAfter);

let flags = { tournamentsEnabled: false, refereesEnabled: false };
try {
  const club = await prisma.clubSettings.findUnique({ where: { id: 1 } });
  flags = {
    tournamentsEnabled: Boolean(club?.tournamentsEnabled),
    refereesEnabled: Boolean(club?.refereesEnabled),
  };
} catch (err) {
  console.warn('[render-start] ClubSettings flags:', err.message);
}

const mail = await inspectMail(prisma);
console.log(
  '[render-start] Mail: secret=%s smtp=%s sealed=%s decrypts=%s',
  mail.secretSet ? 'ja' : 'nee',
  mail.smtpPresent ? 'ja' : 'nee',
  mail.smtpSealed ? 'ja' : 'nee',
  mail.smtpDecrypts === null ? 'n.v.t.' : mail.smtpDecrypts ? 'ja' : 'NEE',
);

const namedBackup = incidentBackupPath(stateDir);
let serviceDiff = null;
let restoreResult = { restored: [], skipped: 0 };
if (fs.existsSync(namedBackup)) {
  serviceDiff = await compareBackupToLive(prisma, namedBackup);
  console.log(
    '[render-start] Dienst-diff: backup=%s live=%s ontbreekt=%s personen=%s handmatig=%s leeg-auto=%s',
    serviceDiff.backupCount,
    serviceDiff.liveCount,
    serviceDiff.missing?.length || 0,
    serviceDiff.withPerson,
    serviceDiff.manual,
    serviceDiff.emptyAuto,
  );
  if (serviceDiff.withPerson || serviceDiff.manual) {
    restoreResult = await restoreProtectedServices(prisma, namedBackup, serviceDiff);
    console.log('[render-start] Hersteld: %s', restoreResult.restored.join(','));
  } else {
    console.log('[render-start] Niets herstellen: ontbrekende rijen zijn lege AUTO-diensten');
  }
} else {
  console.warn('[render-start] Incident-backup ontbreekt:', namedBackup);
}

const publicDiff = publicServiceDiff(serviceDiff, restoreResult);
if (publicDiff) {
  const reportJson = JSON.stringify(publicDiff, null, 2);
  fs.writeFileSync(path.join(stateDir, 'service-diff-report.json'), reportJson);
  const incidentReport = path.join(stateDir, 'service-diff-incident.json');
  if (!fs.existsSync(incidentReport)) fs.writeFileSync(incidentReport, reportJson);
}

const statusFile = writeDeployStatus(stateDir, {
  at: new Date().toISOString(),
  backupExists: Boolean(backup?.exists),
  backupBytes: backup?.bytes ?? null,
  counts: {
    personsBefore,
    servicesBefore,
    personsAfter,
    servicesAfter,
    personsNow: await prisma.person.count(),
    servicesNow: await prisma.service.count(),
  },
  migrations,
  flags,
  mail: {
    secretSet: mail.secretSet,
    smtpPresent: mail.smtpPresent,
    smtpSealed: mail.smtpSealed,
    smtpDecrypts: mail.smtpDecrypts,
    enabled: mail.enabled,
  },
  serviceDiff: publicDiff,
});
console.log('[render-start] Status:', statusFile);

if (process.env.SEED_DEMO === 'true' && (servicesAfter === 0 || personsAfter <= 1)) {
  console.log('[render-start] Lege DB — demo-data laden…');
  execSync('node scripts/seed-mock.js', {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });
} else {
  console.log('[render-start] Bestaande data behouden (%s diensten, %s personen)', servicesAfter, personsAfter);
}

console.log('[render-start] Server starten…');
await import('../src/backend/server.js');
