/**
 * Kopieer de SQLite-database naar backups/.
 * Run: npm run db:backup
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { sqliteFilePathFromUrl } from '../src/backend/lib/dataDir.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const url = process.env.DATABASE_URL || 'file:./src/backend/prisma/dev.db';
let dbFile = sqliteFilePathFromUrl(url);
if (dbFile && !path.isAbsolute(dbFile)) {
  dbFile = path.join(root, dbFile.replace(/^\.\//, ''));
}
if (!dbFile || !fs.existsSync(dbFile)) {
  const fallback = path.join(root, 'src/backend/prisma/dev.db');
  if (fs.existsSync(fallback)) dbFile = fallback;
}

if (!dbFile || !fs.existsSync(dbFile)) {
  console.error('Geen SQLite-bestand gevonden. Zet DATABASE_URL of run npm run setup.');
  process.exit(1);
}

const outDir = process.env.BACKUP_DIR || path.join(root, 'backups');
fs.mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const dest = path.join(outDir, `vvl-${stamp}.db`);
fs.copyFileSync(dbFile, dest);
console.log(`Backup: ${dest}`);
