import fs from 'fs';
import path from 'path';
import { sqliteFilePathFromUrl, resolveDataDir } from './dataDir.js';
import { unsealSecret } from './secrets.js';

export const TOURNAMENT_MIGRATION = '20261003160000_tournaments';
export const REFEREE_MIGRATION = '20261003180000_referees';

export const LIVE_MIGRATIONS = [TOURNAMENT_MIGRATION, REFEREE_MIGRATION];

export function deployStateDir(dbFile) {
  return resolveDataDir() || (dbFile ? path.dirname(dbFile) : process.cwd());
}

export function deployStatusPath(stateDir) {
  return path.join(stateDir, 'deploy-status.json');
}

export function appliedMigrationsPath(stateDir) {
  return path.join(stateDir, 'applied-migrations.json');
}

export function backupDirFor(dbFile) {
  const base = resolveDataDir() || (dbFile ? path.dirname(dbFile) : process.cwd());
  return path.join(base, 'backups');
}

export function splitSqlStatements(sql) {
  return String(sql || '')
    .split('\n')
    .filter((line) => !/^\s*--/.test(line))
    .join('\n')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);
}

export function isIgnorableMigrationError(message) {
  const text = String(message || '').toLowerCase();
  return (
    text.includes('duplicate column') ||
    text.includes('already exists') ||
    text.includes('duplicate column name')
  );
}

export function migrationSqlPath(root, name) {
  return path.join(root, 'src/backend/prisma/migrations', name, 'migration.sql');
}

export function resolveLiveDbFile(root, url = process.env.DATABASE_URL) {
  let dbFile = sqliteFilePathFromUrl(url);
  if (dbFile && !path.isAbsolute(dbFile)) {
    dbFile = path.join(root, dbFile.replace(/^\.\//, ''));
  }
  return dbFile || null;
}

export function readDeployStatus(stateDir) {
  const file = deployStatusPath(stateDir);
  if (!file || !fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

export function writeDeployStatus(stateDir, payload) {
  fs.mkdirSync(stateDir, { recursive: true });
  const file = deployStatusPath(stateDir);
  fs.writeFileSync(file, JSON.stringify(payload, null, 2));
  return file;
}

export async function backupSqlite(prisma, dbFile, destDir) {
  if (!dbFile || !fs.existsSync(dbFile)) {
    throw new Error('Geen SQLite-bestand om te back-uppen');
  }
  fs.mkdirSync(destDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(destDir, `vvl-${stamp}.db`);
  const escaped = dest.replace(/'/g, "''");
  try {
    await prisma.$executeRawUnsafe(`VACUUM INTO '${escaped}'`);
  } catch (err) {
    console.warn('[live-deploy] VACUUM INTO mislukt, kopie:', err.message);
    try {
      await prisma.$queryRawUnsafe('PRAGMA wal_checkpoint(FULL)');
    } catch {
      /* live bestand kan gelockt zijn; de kopie is dan de terugval */
    }
    fs.copyFileSync(dbFile, dest);
    for (const ext of ['-wal', '-shm']) {
      if (fs.existsSync(dbFile + ext)) fs.copyFileSync(dbFile + ext, dest + ext);
    }
  }
  if (!fs.existsSync(dest) || fs.statSync(dest).size === 0) {
    throw new Error(`Backup ontbreekt of is leeg: ${dest}`);
  }
  return {
    path: dest,
    exists: true,
    bytes: fs.statSync(dest).size,
    at: new Date().toISOString(),
  };
}

export async function applySqlFile(prisma, filePath) {
  const sql = fs.readFileSync(filePath, 'utf8');
  const statements = splitSqlStatements(sql);
  let applied = 0;
  let skipped = 0;
  for (const statement of statements) {
    try {
      await prisma.$executeRawUnsafe(statement);
      applied += 1;
    } catch (err) {
      if (isIgnorableMigrationError(err.message)) {
        skipped += 1;
        continue;
      }
      throw err;
    }
  }
  return { applied, skipped, statements: statements.length };
}

export async function applyNamedMigrationsOnce(prisma, root, stateDir) {
  const stateFile = appliedMigrationsPath(stateDir);
  let state = { applied: [] };
  if (fs.existsSync(stateFile)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      if (Array.isArray(parsed?.applied)) state = parsed;
    } catch {
      state = { applied: [] };
    }
  }
  const results = {};
  for (const name of LIVE_MIGRATIONS) {
    if (state.applied.includes(name)) {
      results[name] = { already: true };
      continue;
    }
    const file = migrationSqlPath(root, name);
    if (!fs.existsSync(file)) {
      throw new Error(`Migratie ontbreekt: ${file}`);
    }
    results[name] = await applySqlFile(prisma, file);
    state.applied.push(name);
  }
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(
    stateFile,
    JSON.stringify({ applied: state.applied, at: new Date().toISOString() }, null, 2),
  );
  return results;
}

export async function inspectMail(prisma) {
  const secretSet = Boolean(process.env.MAIL_SECRET);
  let row = null;
  try {
    row = await prisma.mailSettings.findUnique({ where: { id: 1 } });
  } catch {
    return {
      secretSet,
      smtpPresent: false,
      smtpSealed: false,
      smtpDecrypts: null,
      fromEmail: '',
      user: '',
      enabled: false,
    };
  }
  const stored = row?.password || '';
  const smtpPresent = Boolean(stored);
  const smtpSealed = stored.startsWith('enc:v1:');
  let smtpDecrypts = null;
  if (smtpPresent) {
    try {
      const plain = unsealSecret(stored);
      smtpDecrypts = smtpSealed ? Boolean(plain) : true;
    } catch {
      smtpDecrypts = false;
    }
  }
  return {
    secretSet,
    smtpPresent,
    smtpSealed,
    smtpDecrypts,
    fromEmail: row?.fromEmail || '',
    user: row?.user || '',
    enabled: Boolean(row?.enabled),
  };
}
