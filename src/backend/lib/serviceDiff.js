import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { startOfDay, toIsoDate } from './dates.js';

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

export async function restoreProtectedServices(livePrisma, backupFile, classified) {
  const wanted = (classified.missing || []).filter((row) => row.shouldRestore);
  if (!wanted.length) return { restored: [], skipped: (classified.missing || []).length };
  const backup = clientFor(backupFile);
  const restored = [];
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
      const exists = await livePrisma.service.findUnique({ where: { id } });
      if (exists) continue;
      await livePrisma.service.create({ data: serviceCreateData(service) });
      restored.push(id);
    }
    for (const duty of teamDuties) {
      const id = toId(duty.id);
      const exists = await livePrisma.serviceTeamDuty.findUnique({ where: { id } }).catch(() => null);
      if (exists) continue;
      const serviceOk = await livePrisma.service.findUnique({ where: { id: toId(duty.serviceId) } });
      if (!serviceOk) continue;
      await livePrisma.serviceTeamDuty.create({
        data: {
          id,
          serviceId: toId(duty.serviceId),
          teamId: toId(duty.teamId),
          reserved: toId(duty.reserved) ?? 1,
        },
      });
    }
    for (const enrollment of enrollments) {
      const id = toId(enrollment.id);
      const exists = await livePrisma.enrollment.findUnique({ where: { id } });
      if (exists) continue;
      const serviceOk = await livePrisma.service.findUnique({
        where: { id: toId(enrollment.serviceId) },
      });
      if (!serviceOk) continue;
      await livePrisma.enrollment.create({
        data: {
          id,
          serviceId: toId(enrollment.serviceId),
          personId: toId(enrollment.personId),
          source: enrollment.source,
          kind: enrollment.kind,
          forTeamId: toId(enrollment.forTeamId),
          reason: enrollment.reason,
          makeup: toBool(enrollment.makeup),
          noShow: toBool(enrollment.noShow),
          remindedAt: asDate(enrollment.remindedAt),
          createdAt: asDate(enrollment.createdAt),
        },
      });
    }
    for (const swap of swaps) {
      const id = toId(swap.id);
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
          requesterId: toId(swap.requesterId),
          counterpartyId: toId(swap.counterpartyId),
          status: swap.status,
          matchBlockWarning: toBool(swap.matchBlockWarning),
          note: swap.note,
          rejectReason: swap.rejectReason,
          decidedById: toId(swap.decidedById),
          decidedAt: asDate(swap.decidedAt),
          createdAt: asDate(swap.createdAt),
          updatedAt: asDate(swap.updatedAt),
        },
      });
    }
    return { restored, skipped: (classified.missing || []).length - restored.length };
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
