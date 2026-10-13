import fs from 'fs';
import path from 'path';
import { isMandatoryObligation } from './obligation.js';

/**
 * Eenmalig: no-show-vlaggen zonder audit `enrollment.noshow` opruimen.
 * Die ontstaan o.a. bij incident-restore van oude inschrijvingen zonder auditlog —
 * niet door een bewuste markering van de barcommissie in de app.
 */
export const ORPHAN_NOSHOW_REPAIR_ID = 'orphan-noshow-without-audit-2026-10-13';

export function orphanNoShowRepairMarkerPath(stateDir) {
  return path.join(stateDir, `repaired-${ORPHAN_NOSHOW_REPAIR_ID}.json`);
}

export function isOrphanNoShow(enrollment, auditedNoshowIds) {
  if (!enrollment?.noShow) return false;
  const id = Number(enrollment.id);
  if (!Number.isFinite(id) || id <= 0) return true;
  return !auditedNoshowIds?.has?.(id);
}

/**
 * Zet orphan no-shows terug naar false en past makeupDue alleen af voor
 * persoonlijke verplichte inschrijvingen (zelfde regel als /noshow DELETE).
 */
export async function repairOrphanNoShows(prisma, { stateDir, force = false } = {}) {
  if (!stateDir) throw new Error('stateDir is verplicht voor orphan-noshow repair');
  const marker = orphanNoShowRepairMarkerPath(stateDir);
  if (!force && fs.existsSync(marker)) {
    return { already: true, marker };
  }

  const audited = await prisma.auditLog.findMany({
    where: { action: 'enrollment.noshow', entity: 'Enrollment' },
    select: { entityId: true },
  });
  const auditedNoshowIds = new Set(
    audited.map((row) => Number(row.entityId)).filter((id) => Number.isFinite(id) && id > 0),
  );

  const flagged = await prisma.enrollment.findMany({
    where: { noShow: true },
    include: { person: { select: { id: true, name: true, obligation: true, makeupDue: true } } },
  });

  let cleared = 0;
  let makeupAdjusted = 0;
  const details = [];

  for (const enrollment of flagged) {
    if (!isOrphanNoShow(enrollment, auditedNoshowIds)) continue;

    const personalMandatory =
      enrollment.kind !== 'TEAM' && isMandatoryObligation(enrollment.person?.obligation);

    await prisma.$transaction(async (tx) => {
      await tx.enrollment.update({
        where: { id: enrollment.id },
        data: { noShow: false },
      });
      if (personalMandatory && (enrollment.person?.makeupDue ?? 0) > 0) {
        await tx.person.update({
          where: { id: enrollment.personId },
          data: { makeupDue: { decrement: 1 } },
        });
        makeupAdjusted += 1;
      }
    });

    cleared += 1;
    details.push({
      id: enrollment.id,
      personId: enrollment.personId,
      person: enrollment.person?.name || null,
      kind: enrollment.kind,
      makeupAdjusted: Boolean(personalMandatory && (enrollment.person?.makeupDue ?? 0) > 0),
    });
  }

  const result = {
    repairId: ORPHAN_NOSHOW_REPAIR_ID,
    at: new Date().toISOString(),
    auditedNoshows: auditedNoshowIds.size,
    flaggedBefore: flagged.length,
    cleared,
    makeupAdjusted,
    keptWithAudit: flagged.length - cleared,
    details: details.slice(0, 200),
  };
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(marker, JSON.stringify(result, null, 2));
  return result;
}
