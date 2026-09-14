/**
 * Startscript voor Render (free demo).
 * - Zorgt voor SQLite + schema
 * - Seed demo-data als de DB leeg is (na cold start verdwijnt ephemeral storage)
 */
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { ensureDataDir, sqliteUrlForDataDir } from '../src/backend/lib/dataDir.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

process.env.NODE_ENV = process.env.NODE_ENV || 'production';
process.env.SEED_DEMO = process.env.SEED_DEMO ?? 'true';
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
console.log('[render-start] APP_URL=', process.env.APP_URL || '(niet gezet)');

execSync('npx prisma db push --schema=src/backend/prisma/schema.prisma --accept-data-loss', {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
});

const { default: prisma } = await import('../src/backend/lib/prisma.js');
const services = await prisma.service.count();
const people = await prisma.person.count();

if (process.env.SEED_DEMO === 'true' && (services === 0 || people <= 1)) {
  console.log('[render-start] Lege DB — demo-data laden…');
  execSync('node scripts/seed-mock.js', {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });
} else {
  console.log('[render-start] Bestaande data behouden (%s diensten, %s personen)', services, people);
}

await prisma.$disconnect();

console.log('[render-start] Server starten…');
await import('../src/backend/server.js');
