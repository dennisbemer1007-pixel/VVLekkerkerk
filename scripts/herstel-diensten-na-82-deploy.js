/**
 * Eenmalig, NIET automatisch, niet op productie uitvoeren vanuit een agent.
 *
 * Na de deploy van PR #82 (17/11/2026 ± 18:28 UTC / 19:28 CET) kon een
 * startup-sync van de eerste gepubliceerde periode lege AUTO-concepten
 * buiten die periode hard wissen (o.a. donderdag 3-12, keuken 12-12,
 * bar 16:30–19:30 op 12-12). Dit script:
 *  1. toont AUTO-diensten die ná die tijd alleen inactief zijn gezet
 *     (die zijn te heractiveren);
 *  2. kan ontbrekende rijen terugzetten uit de Render-backup die
 *     render-start vóór die sync maakte (DATA_DIR/backups/vvl-2026-11-17T18-*.db).
 *
 * Inschrijvingen worden niet gewijzigd. Standaard droge run:
 *   node scripts/herstel-diensten-na-82-deploy.js
 *   node scripts/herstel-diensten-na-82-deploy.js --from-backup=/pad/naar/vvl-2026-11-17T18-28-....db
 * Echt uitvoeren (eerst backup van live):
 *   node scripts/herstel-diensten-na-82-deploy.js --apply [--since=2026-11-17T18:28:00Z] [--from-backup=...]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import { sqliteUrlForDataDir } from '../src/backend/lib/dataDir.js';
import { backupDirFor, backupSqlite, resolveLiveDbFile } from '../src/backend/lib/liveDeploy.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const sinceArg = args.find((a) => a.startsWith('--since='));
const backupArg = args.find((a) => a.startsWith('--from-backup='));
const since = new Date(sinceArg ? sinceArg.slice(8) : '2026-11-17T18:28:00Z');
const backupPath = backupArg ? backupArg.slice('--from-backup='.length) : null;
if (Number.isNaN(since.getTime())) {
  console.error('Ongeldige --since');
  process.exit(1);
}
if (backupPath && !fs.existsSync(backupPath)) {
  console.error(`Backup niet gevonden: ${backupPath}`);
  process.exit(1);
}

if (process.env.DATA_DIR) {
  process.env.DATABASE_URL = sqliteUrlForDataDir();
} else if (!process.env.DATABASE_URL) {
  console.error('Geen DATA_DIR of DATABASE_URL — gestopt.');
  process.exit(1);
}

function dayKey(value) {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

function isTargetService(row) {
  const day = dayKey(row.date);
  if (day === '2026-12-03') return true;
  if (day === '2026-12-12' && row.type === 'KITCHEN') return true;
  if (day === '2026-12-12' && row.type === 'BAR' && String(row.time || '').startsWith('16:30')) return true;
  return false;
}

function sqliteUrl(file) {
  const abs = path.resolve(file);
  return abs.startsWith('/') ? `file:${abs}` : `file:./${abs}`;
}

const { default: prisma } = await import('../src/backend/lib/prisma.js');
let backupPrisma = null;
try {
  const inactive = await prisma.service.findMany({
    where: {
      origin: 'AUTO',
      active: false,
      updatedAt: { gte: since },
    },
    select: {
      id: true,
      date: true,
      time: true,
      type: true,
      draft: true,
      locked: true,
      required: true,
      updatedAt: true,
    },
    orderBy: [{ date: 'asc' }, { time: 'asc' }],
  });
  console.log(`${inactive.length} inactieve AUTO-dienst(en) sinds ${since.toISOString()}:`);
  for (const r of inactive) {
    const mark = isTargetService(r) ? ' [doel 3-12/12-12]' : '';
    console.log(
      `  #${r.id} ${dayKey(r.date)} ${r.type} ${r.time} draft=${r.draft} locked=${r.locked} gewijzigd=${r.updatedAt.toISOString()}${mark}`,
    );
  }
  if (!inactive.length) {
    console.log('  (geen — als de diensten hard zijn verwijderd, is een backup nodig)');
  }

  let missing = [];
  if (backupPath) {
    backupPrisma = new PrismaClient({ datasources: { db: { url: sqliteUrl(backupPath) } } });
    const fromBackup = await backupPrisma.service.findMany({
      where: { origin: 'AUTO' },
      include: { teamDuties: true, enrollments: { select: { id: true } } },
    });
    const live = await prisma.service.findMany({
      select: { id: true, date: true, time: true, type: true, active: true },
    });
    const liveById = new Map(live.map((s) => [s.id, s]));
    missing = fromBackup.filter((row) => {
      if (!isTargetService(row)) return false;
      const current = liveById.get(row.id);
      return !current;
    });
    console.log(`\n${missing.length} doel-dienst(en) staan in de backup maar ontbreken live:`);
    for (const r of missing) {
      console.log(`  #${r.id} ${dayKey(r.date)} ${r.type} ${r.time} draft=${r.draft} duties=${(r.teamDuties || []).length}`);
    }
    if (!missing.length) {
      console.log('  (geen ontbrekende doel-diensten in deze backup)');
    }
  } else {
    console.log('\nGeen --from-backup=... meegegeven. Voor hard gewiste rijen: de backup van render-start rond 17/11/2026 18:28 UTC (DATA_DIR/backups/vvl-2026-11-17T18-*.db).');
  }

  if (!apply) {
    console.log('\nDroge run: niets gewijzigd. Gebruik --apply (na een eigen backup) om inactieve rijen te heractiveren en ontbrekende rijen uit --from-backup terug te zetten. Raakt geen inschrijvingen.');
  } else {
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
    if (inactive.length) {
      const res = await prisma.service.updateMany({
        where: { id: { in: inactive.map((r) => r.id) }, origin: 'AUTO', active: false },
        data: { active: true, teamDutiesManual: true },
      });
      console.log(`${res.count} dienst(en) weer actief gezet (teamDutiesManual, sync blijft eraf).`);
    }
    let restored = 0;
    for (const row of missing) {
      const exists = await prisma.service.findUnique({ where: { id: row.id } });
      if (exists) continue;
      await prisma.service.create({
        data: {
          id: row.id,
          type: row.type,
          date: row.date,
          time: row.time,
          location: row.location,
          required: row.required,
          active: true,
          draft: row.draft,
          locked: row.locked,
          kind: row.kind,
          origin: row.origin,
          teamDutiesManual: true,
          slot: row.slot,
          note: row.note,
          matchId: row.matchId,
          assignedTeamId: row.assignedTeamId,
          sourceRuleId: row.sourceRuleId,
          activityId: row.activityId,
          createdAt: row.createdAt,
          updatedAt: new Date(),
          teamDuties: {
            create: (row.teamDuties || []).map((d) => ({
              teamId: d.teamId,
              reserved: d.reserved,
            })),
          },
        },
      });
      restored += 1;
      console.log(`Teruggezet: #${row.id} ${dayKey(row.date)} ${row.type} ${row.time}`);
    }
    if (backupPath) console.log(`${restored} dienst(en) teruggezet uit de backup (zonder inschrijvingen te wijzigen).`);
  }
} finally {
  if (backupPrisma) await backupPrisma.$disconnect().catch(() => {});
  await prisma.$disconnect().catch(() => {});
}
