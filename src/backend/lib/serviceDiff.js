import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { startOfDay, toIsoDate } from './dates.js';

/**
 * Alleen herstellen als live minder diensten heeft dan de incident-backup.
 * 3 okt-backup (177) vs live (208) is geen dataverlies: ontbrekende ids
 * zijn oude AUTO-rijen die bewust weg zijn. Die niet massaal terugzetten.
 */
export function shouldAttemptIncidentRestore(diff) {
  if (!diff || diff.error) return false;
  const live = Number(diff.liveCount) || 0;
  const backup = Number(diff.backupCount) || 0;
  if (backup > 0 && live >= backup) return false;
  return Boolean(diff.withPerson || diff.manual);
}

/** Backup van vóór de startup-sync op 3 okt 2026. */
export const INCIDENT_BACKUP_NAME = 'vvl-2026-10-03T17-34-13-503Z.db';

export function incidentBackupPath(stateDir) {
  return path.join(stateDir, 'backups', INCIDENT_BACKUP_NAME);
}

export function toId(value) {
  if (value == null || value === '') return null;
  const n = typeof value === 'bigint' ? Number(value) : Number(value);
  return Number.isSafeInteger(n) ? n : null;
}

export function sqlIntList(ids) {
  const nums = [...new Set((ids || []).map(toId).filter((n) => n != null && n > 0))];
  return nums.length ? nums.join(',') : 'NULL';
}

function toBool(value) {
  return value === true || value === 1 || value === 1n || value === '1' || value === 'true';
}

function asDate(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return value;
  return new Date(value);
}

export function classifyServiceGap({
  service,
  enrollments = [],
  swaps = [],
  teamDuties = [],
  match = null,
  now = new Date(),
}) {
  const day = startOfDay(asDate(service.date) || now);
  const today = startOfDay(now);
  const when = day.getTime() < today.getTime() ? 'past' : 'future';
  const enrollmentCount = enrollments.length;
  const noShowCount = enrollments.filter((row) => toBool(row.noShow)).length;
  const remindedCount = enrollments.filter((row) => Boolean(row.remindedAt)).length;
  const hasPerson = enrollmentCount > 0;
  const manual = service.origin === 'MANUAL' || service.origin === 'YEAR' || toBool(service.locked);
  return {
    id: toId(service.id),
    date: toIsoDate(day),
    type: service.type,
    time: service.time,
    origin: service.origin,
    locked: toBool(service.locked),
    kind: service.kind,
    matchId: toId(service.matchId),
    match: match
      ? {
          id: toId(match.id),
          opponent: match.opponent || '',
          home: toBool(match.home),
          team: match.teamName || match.team?.name || null,
        }
      : null,
    when,
    enrollments: enrollmentCount,
    noShows: noShowCount,
    reminded: remindedCount,
    swaps: swaps.length,
    teamDuties: teamDuties.length,
    hasPerson,
    manual,
    shouldRestore: hasPerson || manual,
  };
}

function clientFor(file) {
  return new PrismaClient({ datasources: { db: { url: `file:${file}` } } });
}

async function backupRows(backup, sql) {
  return backup.$queryRawUnsafe(sql);
}

export async function compareBackupToLive(livePrisma, backupFile, now = new Date()) {
  if (!backupFile || !fs.existsSync(backupFile)) {
    return {
      error: 'Backupbestand ontbreekt',
      backupName: INCIDENT_BACKUP_NAME,
      missing: [],
    };
  }
  const backup = clientFor(backupFile);
  try {
    const backupServices = await backupRows(backup, 'SELECT * FROM "Service"');
    const liveServices = await livePrisma.service.findMany({ select: { id: true } });
    const liveIds = new Set(liveServices.map((row) => toId(row.id)));
    const missingServices = backupServices.filter((row) => !liveIds.has(toId(row.id)));
    if (!missingServices.length) {
      return {
        backupName: path.basename(backupFile),
        backupCount: backupServices.length,
        liveCount: liveServices.length,
        missing: [],
        withPerson: 0,
        manual: 0,
        emptyAuto: 0,
        past: 0,
        future: 0,
      };
    }
    const missingIds = sqlIntList(missingServices.map((row) => row.id));
    const enrollments = await backupRows(
      backup,
      `SELECT * FROM "Enrollment" WHERE "serviceId" IN (${missingIds})`,
    );
    const teamDuties = await backupRows(
      backup,
      `SELECT * FROM "ServiceTeamDuty" WHERE "serviceId" IN (${missingIds})`,
    );
    const enrollmentIds = sqlIntList(enrollments.map((row) => row.id));
    const swaps = enrollments.length
      ? await backupRows(
          backup,
          `SELECT * FROM "SwapRequest" WHERE "fromEnrollmentId" IN (${enrollmentIds}) OR "toEnrollmentId" IN (${enrollmentIds})`,
        )
      : [];
    const matchIds = sqlIntList(missingServices.map((row) => row.matchId));
    const matches =
      matchIds === 'NULL'
        ? []
        : await backupRows(
            backup,
            `SELECT m.*, t.name AS teamName FROM "Match" m LEFT JOIN "Team" t ON t.id = m.teamId WHERE m.id IN (${matchIds})`,
          );
    const matchById = new Map(matches.map((row) => [toId(row.id), row]));
    const enrollmentsByService = new Map();
    for (const row of enrollments) {
      const serviceId = toId(row.serviceId);
      if (!enrollmentsByService.has(serviceId)) enrollmentsByService.set(serviceId, []);
      enrollmentsByService.get(serviceId).push(row);
    }
    const dutiesByService = new Map();
    for (const row of teamDuties) {
      const serviceId = toId(row.serviceId);
      if (!dutiesByService.has(serviceId)) dutiesByService.set(serviceId, []);
      dutiesByService.get(serviceId).push(row);
    }
    const swapsByEnrollment = new Map();
    for (const swap of swaps) {
      for (const id of [toId(swap.fromEnrollmentId), toId(swap.toEnrollmentId)]) {
        if (id == null) continue;
        if (!swapsByEnrollment.has(id)) swapsByEnrollment.set(id, []);
        swapsByEnrollment.get(id).push(swap);
      }
    }
    const missing = missingServices.map((service) => {
      const serviceEnrollments = enrollmentsByService.get(toId(service.id)) || [];
      const uniqueSwaps = [
        ...new Map(
          serviceEnrollments
            .flatMap((row) => swapsByEnrollment.get(toId(row.id)) || [])
            .map((swap) => [toId(swap.id), swap]),
        ).values(),
      ];
      return classifyServiceGap({
        service,
        enrollments: serviceEnrollments,
        swaps: uniqueSwaps,
        teamDuties: dutiesByService.get(toId(service.id)) || [],
        match: toId(service.matchId) ? matchById.get(toId(service.matchId)) : null,
        now,
      });
    });
    missing.sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
    return {
      backupName: path.basename(backupFile),
      backupCount: backupServices.length,
      liveCount: liveServices.length,
      missing,
      withPerson: missing.filter((row) => row.hasPerson).length,
      manual: missing.filter((row) => row.manual).length,
      emptyAuto: missing.filter((row) => !row.shouldRestore).length,
      past: missing.filter((row) => row.when === 'past').length,
      future: missing.filter((row) => row.when === 'future').length,
    };
  } finally {
    await backup.$disconnect();
  }
}

function serviceCreateData(row) {
  return {
    id: toId(row.id),
    type: row.type,
    date: asDate(row.date),
    time: row.time,
    location: row.location,
    required: toId(row.required) ?? 2,
    active: toBool(row.active),
    draft: toBool(row.draft),
    locked: true,
    kind: row.kind,
    origin: row.origin || 'AUTO',
    slot: row.slot,
    note: row.note,
    matchId: toId(row.matchId),
    assignedTeamId: toId(row.assignedTeamId),
    sourceRuleId: toId(row.sourceRuleId),
    activityId: toId(row.activityId),
    createdAt: asDate(row.createdAt),
    updatedAt: asDate(row.updatedAt),
  };
}

async function liveFkOrNull(delegate, id) {
  const value = toId(id);
  if (!value) return null;
  try {
    const row = await delegate.findUnique({ where: { id: value } });
    return row ? value : null;
  } catch {
    return null;
  }
}

export async function restoreProtectedServices(livePrisma, backupFile, classified) {
  const wanted = (classified.missing || []).filter((row) => row.shouldRestore);
  if (!wanted.length) return { restored: [], skipped: (classified.missing || []).length };
  const backup = clientFor(backupFile);
  const restored = [];
  const skippedFk = [];
  try {
    const ids = sqlIntList(wanted.map((row) => row.id));
    const services = await backupRows(backup, `SELECT * FROM "Service" WHERE id IN (${ids})`);
    const enrollments = await backupRows(
      backup,
      `SELECT * FROM "Enrollment" WHERE "serviceId" IN (${ids})`,
    );
    const teamDuties = await backupRows(
      backup,
      `SELECT * FROM "ServiceTeamDuty" WHERE "serviceId" IN (${ids})`,
    );
    const enrollmentIds = sqlIntList(enrollments.map((row) => row.id));
    const swaps = enrollments.length
      ? await backupRows(
          backup,
          `SELECT * FROM "SwapRequest" WHERE "fromEnrollmentId" IN (${enrollmentIds}) OR "toEnrollmentId" IN (${enrollmentIds})`,
        )
      : [];
    for (const service of services) {
      const id = toId(service.id);
      try {
        const exists = await livePrisma.service.findUnique({ where: { id } });
        if (exists) continue;
        const data = serviceCreateData(service);
        data.matchId = await liveFkOrNull(livePrisma.match, data.matchId);
        data.assignedTeamId = await liveFkOrNull(livePrisma.team, data.assignedTeamId);
        data.sourceRuleId = await liveFkOrNull(livePrisma.serviceRule, data.sourceRuleId);
        data.activityId = await liveFkOrNull(livePrisma.activity, data.activityId);
        await livePrisma.service.create({ data });
        restored.push(id);
      } catch (err) {
        skippedFk.push({ id, reason: err.message });
        console.warn('[serviceDiff] Dienst %s niet hersteld: %s', id, err.message);
      }
    }
    for (const duty of teamDuties) {
      const id = toId(duty.id);
      try {
        const exists = await livePrisma.serviceTeamDuty.findUnique({ where: { id } }).catch(() => null);
        if (exists) continue;
        const serviceOk = await livePrisma.service.findUnique({ where: { id: toId(duty.serviceId) } });
        const teamId = await liveFkOrNull(livePrisma.team, duty.teamId);
        if (!serviceOk || !teamId) continue;
        await livePrisma.serviceTeamDuty.create({
          data: {
            id,
            serviceId: toId(duty.serviceId),
            teamId,
            reserved: toId(duty.reserved) ?? 1,
          },
        });
      } catch (err) {
        skippedFk.push({ id, kind: 'duty', reason: err.message });
      }
    }
    for (const enrollment of enrollments) {
      const id = toId(enrollment.id);
      try {
        const exists = await livePrisma.enrollment.findUnique({ where: { id } });
        if (exists) continue;
        const serviceOk = await livePrisma.service.findUnique({
          where: { id: toId(enrollment.serviceId) },
        });
        const personId = await liveFkOrNull(livePrisma.person, enrollment.personId);
        if (!serviceOk || !personId) continue;
        await livePrisma.enrollment.create({
          data: {
            id,
            serviceId: toId(enrollment.serviceId),
            personId,
            source: enrollment.source,
            kind: enrollment.kind,
            forTeamId: await liveFkOrNull(livePrisma.team, enrollment.forTeamId),
            reason: enrollment.reason,
            makeup: toBool(enrollment.makeup),
            noShow: toBool(enrollment.noShow),
            remindedAt: asDate(enrollment.remindedAt),
            createdAt: asDate(enrollment.createdAt),
          },
        });
      } catch (err) {
        skippedFk.push({ id, kind: 'enrollment', reason: err.message });
      }
    }
    for (const swap of swaps) {
      const id = toId(swap.id);
      try {
        const exists = await livePrisma.swapRequest.findUnique({ where: { id } });
        if (exists) continue;
        const fromOk = await livePrisma.enrollment.findUnique({
          where: { id: toId(swap.fromEnrollmentId) },
        });
        const toOk = await livePrisma.enrollment.findUnique({
          where: { id: toId(swap.toEnrollmentId) },
        });
        if (!fromOk || !toOk) continue;
        await livePrisma.swapRequest.create({
          data: {
            id,
            fromEnrollmentId: toId(swap.fromEnrollmentId),
            toEnrollmentId: toId(swap.toEnrollmentId),
            requesterId: await liveFkOrNull(livePrisma.person, swap.requesterId),
            counterpartyId: await liveFkOrNull(livePrisma.person, swap.counterpartyId),
            status: swap.status,
            matchBlockWarning: toBool(swap.matchBlockWarning),
            note: swap.note,
            rejectReason: swap.rejectReason,
            decidedById: await liveFkOrNull(livePrisma.person, swap.decidedById),
            decidedAt: asDate(swap.decidedAt),
            createdAt: asDate(swap.createdAt),
            updatedAt: asDate(swap.updatedAt),
          },
        });
      } catch (err) {
        skippedFk.push({ id, kind: 'swap', reason: err.message });
      }
    }
    return {
      restored,
      skipped: (classified.missing || []).length - restored.length,
      skippedFk,
    };
  } catch (err) {
    console.warn('[serviceDiff] Herstel afgebroken, start gaat door: %s', err.message);
    return {
      restored,
      skipped: (classified.missing || []).length - restored.length,
      skippedFk,
      error: err.message,
    };
  } finally {
    await backup.$disconnect();
  }
}

export function publicServiceDiff(diff, restoreResult = null) {
  if (!diff) return null;
  return {
    backupName: diff.backupName || INCIDENT_BACKUP_NAME,
    error: diff.error || null,
    backupCount: diff.backupCount ?? null,
    liveCount: diff.liveCount ?? null,
    missingCount: diff.missing?.length ?? 0,
    withPerson: diff.withPerson ?? 0,
    manual: diff.manual ?? 0,
    emptyAuto: diff.emptyAuto ?? 0,
    past: diff.past ?? 0,
    future: diff.future ?? 0,
    restoredIds: restoreResult?.restored || [],
    missing: diff.missing || [],
  };
}
