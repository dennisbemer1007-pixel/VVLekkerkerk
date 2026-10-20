/**
 * #70 zette per ongeluk teamplekken op weekdagen weg (aanname: alleen zaterdag).
 * Chantal corrigeerde: 7x7 speelt wél doordeweeks thuis. Dit bestand:
 * - herstelt wat de strip-repair veilig kan terugzetten;
 * - stript nooit meer weekdag-teamplekken.
 *
 * Niet herstellen als er al een vrijwilliger op de dienst staat (zoals do 12/11
 * met Cees): Chantal had die teamplek expres weggehaald.
 */
import fs from 'fs';
import path from 'path';

export const WEEKDAY_TEAM_DUTY_REPAIR_ID = 'weekday-team-duty-strip-2026-10-19';
export const WEEKDAY_TEAM_DUTY_UNDO_ID = 'weekday-team-duty-undo-2026-10-19';

export function weekdayTeamDutyRepairMarkerPath(stateDir) {
  return path.join(stateDir, `repaired-${WEEKDAY_TEAM_DUTY_REPAIR_ID}.json`);
}

export function weekdayTeamDutyUndoMarkerPath(stateDir) {
  return path.join(stateDir, `repaired-${WEEKDAY_TEAM_DUTY_UNDO_ID}.json`);
}

/** @deprecated — strip niet meer; blijft voor marker-pad / oude imports. */
export async function repairWeekdayTeamDuties(_prisma, { stateDir, force = false } = {}) {
  if (!stateDir) throw new Error('stateDir is verplicht voor weekday-team-duty repair');
  const marker = weekdayTeamDutyRepairMarkerPath(stateDir);
  if (!force && fs.existsSync(marker)) {
    return { already: true, marker, removed: 0, services: 0 };
  }
  // Geen strip meer: schrijf een lege marker zodat oude startcode niet alsnog stript.
  const result = {
    repairId: WEEKDAY_TEAM_DUTY_REPAIR_ID,
    removed: 0,
    services: 0,
    items: [],
    skipped: 'no-strip-weekdays-allowed',
    at: new Date().toISOString(),
  };
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(marker, JSON.stringify(result, null, 2));
  return result;
}

/**
 * Zet teamplekken terug die #70 per ongeluk van weekdagen haalde.
 * Slaat diensten over met een persoonlijke inschrijving (Chantal had die
 * teamplek expres weg; sync mag hem niet terugzetten).
 */
export async function undoWeekdayTeamDutyStrip(prisma, { stateDir, force = false } = {}) {
  if (!stateDir) throw new Error('stateDir is verplicht voor weekday-team-duty undo');
  const undoMarker = weekdayTeamDutyUndoMarkerPath(stateDir);
  if (!force && fs.existsSync(undoMarker)) {
    return { already: true, marker: undoMarker };
  }

  const stripMarker = weekdayTeamDutyRepairMarkerPath(stateDir);
  let items = [];
  if (fs.existsSync(stripMarker)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(stripMarker, 'utf8'));
      items = Array.isArray(parsed?.items) ? parsed.items : [];
    } catch {
      items = [];
    }
  }

  let restored = 0;
  let skippedEnrolled = 0;
  let skippedExists = 0;
  let skippedMissing = 0;
  const restoredItems = [];
  const skippedItems = [];

  for (const item of items) {
    const serviceId = Number(item.serviceId);
    const teamId = Number(item.teamId);
    if (!Number.isInteger(serviceId) || serviceId <= 0) continue;
    if (!Number.isInteger(teamId) || teamId <= 0) continue;

    const service = await prisma.service.findUnique({
      where: { id: serviceId },
      select: {
        id: true,
        teamDutiesManual: true,
        enrollments: { select: { id: true, kind: true, noShow: true } },
        teamDuties: { select: { id: true, teamId: true } },
      },
    });
    if (!service) {
      skippedMissing += 1;
      skippedItems.push({ serviceId, teamId, reason: 'missing-service' });
      continue;
    }

    const hasPersonal = (service.enrollments || []).some(
      (row) => !row.noShow && row.kind !== 'TEAM',
    );
    if (hasPersonal) {
      // Zoals do 12/11 + Cees: teamplek blijft weg, vlag blijft staan.
      skippedEnrolled += 1;
      skippedItems.push({ serviceId, teamId, reason: 'personal-enrollment' });
      continue;
    }

    if ((service.teamDuties || []).some((d) => Number(d.teamId) === teamId)) {
      skippedExists += 1;
      continue;
    }

    const team = await prisma.team.findUnique({
      where: { id: teamId },
      select: { id: true },
    });
    if (!team) {
      skippedMissing += 1;
      skippedItems.push({ serviceId, teamId, reason: 'missing-team' });
      continue;
    }

    await prisma.serviceTeamDuty.create({
      data: {
        serviceId,
        teamId,
        reserved: 1,
      },
    });
    // Vlag niet wissen: anders wijst de sync daarna alsnog een ander team toe.
    restored += 1;
    restoredItems.push({ serviceId, teamId, teamName: item.teamName || null });
  }

  const result = {
    repairId: WEEKDAY_TEAM_DUTY_UNDO_ID,
    restored,
    skippedEnrolled,
    skippedExists,
    skippedMissing,
    restoredItems: restoredItems.slice(0, 40),
    skippedItems: skippedItems.slice(0, 40),
    at: new Date().toISOString(),
  };
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(undoMarker, JSON.stringify(result, null, 2));
  return result;
}
