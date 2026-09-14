import fs from 'fs';
import path from 'path';

/** Persistente datamap (`DATA_DIR=/var/data`). Lokaal ongezet. */
export function resolveDataDir() {
  const dir = process.env.DATA_DIR?.trim();
  return dir || null;
}

export function ensureDataDir() {
  const dir = resolveDataDir();
  if (dir) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** SQLite-URL op de persistente schijf, anders bestaande DATABASE_URL. */
export function sqliteUrlForDataDir() {
  const dir = resolveDataDir();
  if (!dir) return process.env.DATABASE_URL;
  const dbPath = path.join(dir, 'vvl.db').replace(/\\/g, '/');
  return `file:${dbPath}`;
}

export function sqliteFilePathFromUrl(url = process.env.DATABASE_URL) {
  const raw = String(url || '');
  const m = raw.match(/^file:(.+)$/);
  if (!m) return null;
  return m[1];
}
