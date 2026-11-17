import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { startOfDay, toIsoDate } from './dates.js';

/**
 * Eenmalig herstel ná de #82-deploy (17/11/2026 ± 18:28 UTC / 19:28 CET).
 * Zet alleen diensten terug die in de render-start-backup van vlak vóór die
 * deploy staan en nu ontbreken. Geen generatie uit dienstregels — diensten die
 * Chantal vóór 19:28 CET al had weggehaald (o.a. winterstop) blijven weg.
 */
export const RESTORE_FROM_BACKUP_ID = 'restore-from-backup-2026-11-17T18-28';
export const RESTORE_FROM_DATE = '2026-11-17';
export const RESTORE_BACKUP_NAME_RE = /^vvl-2026-11-17T18-28-.*\.db$/;

export function restoreFromBackupMarkerPath(stateDir) {
  return path.join(stateDir, `repaired-${RESTORE_FROM_BACKUP_ID}.json`);
}

export function restoreBackupDir(stateDir) {
  return path.join(stateDir, 'backups');
}

export function findExactPre82DeployBackup(backupDir) {
  if (!backupDir || !fs.existsSync(backupDir)) {
    return { file: null, matches: [], reason: 'backup-dir-missing' };
  }
  const matches = fs
    .readdirSync(backupDir)
    .filter((name) => RESTORE_BACKUP_NAME_RE.test(name))
    .map((name) => path.join(backupDir, name))
    .filter((file) => {
      try {
        const st = fs.statSync(file);
        return st.isFile() && st.size > 0;
      } catch {
        return false;
      }
    });
  if (matches.length === 0) return { file: null, matches, reason: 'backup-not-found' };
  if (matches.length > 1) return { file: null, matches, reason: 'backup-not-unique' };
  return { file: matches[0], matches, reason: null };
}

function sqliteUrl(file) {
  const abs = path.resolve(file);
  return abs.startsWith('/') ? `file:${abs}` : `file:./${abs}`;
}

function servicePayload(row, { matchIds, teamIds, ruleIds, activityIds, tournamentIds }) {
  const optional = (id, allowed) => (id && allowed.has(id) ? id : null);
  return {
    id: row.id,
    type: row.type,
    date: row.date,
    time: row.time,
    location: row.location,
    required: row.required,
    active: row.active,
    draft: row.draft,
    locked: row.locked,
    kind: row.kind,
    origin: row.origin,
    teamDutiesManual: row.teamDutiesManual,
    slot: row.slot,
    note: row.note,
    matchId: optional(row.matchId, matchIds),
    assignedTeamId: optional(row.assignedTeamId, teamIds),
    sourceRuleId: optional(row.sourceRuleId, ruleIds),
    activityId: optional(row.activityId, activityIds),
    tournamentId: optional(row.tournamentId, tournamentIds),
    tournamentShiftKey: row.tournamentShiftKey,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function idSet(prisma, model) {
  const rows = await prisma[model].findMany({ select: { id: true } });
  return new Set(rows.map((r) => r.id));
}

export async function restoreMissingServicesFromPre82Backup(prisma, { stateDir, force = false } = {}) {
  if (!stateDir) throw new Error('stateDir is verplicht voor herstel uit de #82-backup');
  const marker = restoreFromBackupMarkerPath(stateDir);
  if (!force && fs.existsSync(marker)) {
    return { already: true, marker, restored: 0, enrollments: 0, teamDuties: 0 };
  }

  const backupDir = restoreBackupDir(stateDir);
  const found = findExactPre82DeployBackup(backupDir);
  if (!found.file) {
    const message = `geen exacte backup ${RESTORE_BACKUP_NAME_RE} in ${backupDir} (${found.reason}, ${found.matches.length} stuk)`;
    console.warn(`[planning] herstel uit #82-backup: ${message} — niets gedaan`);
    return {
      already: false,
      skipped: true,
      reason: found.reason,
      message,
      marker,
      restored: 0,
      enrollments: 0,
      teamDuties: 0,
      backup: null,
    };
  }

  const fromDate = startOfDay(new Date(`${RESTORE_FROM_DATE}T12:00:00Z`));
  const backupPrisma = new PrismaClient({ datasources: { db: { url: sqliteUrl(found.file) } } });
  const restoredServices = [];
  let enrollmentCount = 0;
  let dutyCount = 0;
  try {
    const [backupServices, liveIds, matchIds, teamIds, ruleIds, activityIds, tournamentIds, personIds] =
      await Promise.all([
        backupPrisma.service.findMany({
          where: { date: { gte: fromDate } },
          include: { teamDuties: true, enrollments: true },
          orderBy: { id: 'asc' },
        }),
        idSet(prisma, 'service'),
        idSet(prisma, 'match'),
        idSet(prisma, 'team'),
        idSet(prisma, 'serviceRule'),
        idSet(prisma, 'activity'),
        idSet(prisma, 'tournament'),
        idSet(prisma, 'person'),
      ]);
    const liveEnrollmentIds = await idSet(prisma, 'enrollment');
    const liveDutyIds = await idSet(prisma, 'serviceTeamDuty');

    const missing = backupServices.filter((row) => !liveIds.has(row.id));
    for (const row of missing) {
      const exists = await prisma.service.findUnique({ where: { id: row.id }, select: { id: true } });
      if (exists) continue;
      await prisma.$transaction(async (tx) => {
        await tx.service.create({ data: servicePayload(row, { matchIds, teamIds, ruleIds, activityIds, tournamentIds }) });
        for (const duty of row.teamDuties || []) {
          if (liveDutyIds.has(duty.id)) continue;
          if (!teamIds.has(duty.teamId)) continue;
          const clash = await tx.serviceTeamDuty.findFirst({
            where: { OR: [{ id: duty.id }, { serviceId: row.id, teamId: duty.teamId }] },
            select: { id: true },
          });
          if (clash) continue;
          await tx.serviceTeamDuty.create({
            data: {
              id: duty.id,
              serviceId: row.id,
              teamId: duty.teamId,
              reserved: duty.reserved,
              coordinatorRemindedAt: duty.coordinatorRemindedAt,
            },
          });
          liveDutyIds.add(duty.id);
          dutyCount += 1;
        }
        for (const enrollment of row.enrollments || []) {
          if (liveEnrollmentIds.has(enrollment.id)) continue;
          if (!personIds.has(enrollment.personId)) continue;
          const clash = await tx.enrollment.findFirst({
            where: { OR: [{ id: enrollment.id }, { serviceId: row.id, personId: enrollment.personId }] },
            select: { id: true },
          });
          if (clash) continue;
          await tx.enrollment.create({
            data: {
              id: enrollment.id,
              serviceId: row.id,
              personId: enrollment.personId,
              source: enrollment.source,
              kind: enrollment.kind,
              forTeamId: enrollment.forTeamId && teamIds.has(enrollment.forTeamId) ? enrollment.forTeamId : null,
              reason: enrollment.reason,
              makeup: enrollment.makeup,
              noShow: enrollment.noShow,
              remindedAt: enrollment.remindedAt,
              createdAt: enrollment.createdAt,
            },
          });
          liveEnrollmentIds.add(enrollment.id);
          enrollmentCount += 1;
        }
      });
      liveIds.add(row.id);
      restoredServices.push({
        id: row.id,
        date: toIsoDate(row.date),
        type: row.type,
        time: row.time,
        origin: row.origin,
        draft: row.draft,
        active: row.active,
        enrollments: (row.enrollments || []).length,
        teamDuties: (row.teamDuties || []).length,
      });
    }
  } finally {
    await backupPrisma.$disconnect().catch(() => {});
  }

  const payload = {
    repairId: RESTORE_FROM_BACKUP_ID,
    at: new Date().toISOString(),
    backup: found.file,
    from: RESTORE_FROM_DATE,
    restored: restoredServices.length,
    enrollments: enrollmentCount,
    teamDuties: dutyCount,
    services: restoredServices,
  };
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(marker, JSON.stringify(payload, null, 2));
  console.log(
    '[planning] herstel uit #82-backup:',
    JSON.stringify({
      backup: path.basename(found.file),
      restored: payload.restored,
      enrollments: payload.enrollments,
      teamDuties: payload.teamDuties,
      services: restoredServices.map((s) => `${s.date} ${s.type} ${s.time} #${s.id}`),
    }),
  );
  return { ...payload, already: false, skipped: false, marker };
}

/** Alias die de startup-hooks aanroepen. */
export async function restoreMissingSecondPlanningServices(prisma, opts) {
  return restoreMissingServicesFromPre82Backup(prisma, opts);
}
