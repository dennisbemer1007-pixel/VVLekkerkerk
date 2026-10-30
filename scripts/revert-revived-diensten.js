/**
 * Eenmalig, NIET automatisch: zet officiële AUTO-diensten terug op inactief die bij
 * de herstart van 30/10 (05:52 UTC) vanzelf weer actief werden.
 *
 * Standaard droge run (alleen tonen):
 *   node scripts/revert-revived-diensten.js
 * Echt uitvoeren (eerst backup):
 *   node scripts/revert-revived-diensten.js --apply [--since=2026-10-30T05:50:00Z] [--ids=1,2,3]
 *
 * Raakt alleen: origin AUTO, locked (officieel), actief, geen inschrijvingen,
 * updatedAt >= since. Zet active=false + teamDutiesManual=true (sync blijft eraf).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { sqliteUrlForDataDir } from '../src/backend/lib/dataDir.js';
import { backupDirFor, backupSqlite, resolveLiveDbFile } from '../src/backend/lib/liveDeploy.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const sinceArg = args.find((a) => a.startsWith('--since='));
const idsArg = args.find((a) => a.startsWith('--ids='));
const since = new Date(sinceArg ? sinceArg.slice(8) : '2026-10-30T05:50:00Z');
const onlyIds = idsArg
  ? idsArg.slice(6).split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0)
  : null;
if (Number.isNaN(since.getTime())) {
  console.error('Ongeldige --since');
  process.exit(1);
}

if (process.env.DATA_DIR) {
  process.env.DATABASE_URL = sqliteUrlForDataDir();
} else if (!process.env.DATABASE_URL) {
  console.error('Geen DATA_DIR of DATABASE_URL — gestopt.');
  process.exit(1);
}

const { default: prisma } = await import('../src/backend/lib/prisma.js');
try {
  const rows = await prisma.service.findMany({
    where: {
      origin: 'AUTO',
      locked: true,
      active: true,
      draft: false,
      updatedAt: { gte: since },
      enrollments: { none: {} },
      ...(onlyIds ? { id: { in: onlyIds } } : {}),
    },
    select: { id: true, date: true, time: true, type: true, slot: true, required: true, createdAt: true, updatedAt: true },
    orderBy: [{ date: 'asc' }, { time: 'asc' }],
  });
  console.log(`${rows.length} dienst(en) sinds ${since.toISOString()} (actief, officieel, AUTO, geen inschrijvingen):`);
  for (const r of rows) {
    console.log(
      `  #${r.id} ${r.date.toISOString().slice(0, 10)} ${r.type} ${r.time} (${r.slot || '-'}) nodig=${r.required} ` +
        `aangemaakt=${r.createdAt.toISOString()} gewijzigd=${r.updatedAt.toISOString()}`,
    );
  }
  if (!apply) {
    console.log('\nDroge run: niets gewijzigd. Gebruik --apply (eventueel met --ids=...) om terug te zetten.');
  } else if (rows.length) {
    const dbFile = resolveLiveDbFile(root);
    if (!dbFile || !fs.existsSync(dbFile)) {
      console.error('Geen SQLite-bestand gevonden voor backup — gestopt, niets gewijzigd.');
      process.exit(1);
    }
    const backup = await backupSqlite(prisma, dbFile, backupDirFor(dbFile));
    if (!backup?.path || !fs.existsSync(backup.path)) {
      console.error('Backup mislukt — gestopt, niets gewijzigd.');
      process.exit(1);
    }
    console.log(`Backup: ${backup.path}`);
    const res = await prisma.service.updateMany({
      where: { id: { in: rows.map((r) => r.id) }, enrollments: { none: {} } },
      data: { active: false, teamDutiesManual: true },
    });
    console.log(`${res.count} dienst(en) terug op inactief gezet.`);
  }
} finally {
  await prisma.$disconnect();
}
