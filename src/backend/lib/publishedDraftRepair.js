import fs from 'fs';
import path from 'path';
import { endOfDay, parseCalendarDate, startOfDay, toIsoDate } from './dates.js';
import { isRoundPublishedForVolunteers } from './planningPeriod.js';

/**
 * Eenmalig: na publiceren moeten diensten in de gepubliceerde periode draft=false zijn.
 * Concept-labels bij de barcommissie kwamen doordat draft=true bleef hangen
 * (of door eerdere repairs vóór publishedAt).
 */
export const PUBLISHED_DRAFT_REPAIR_ID = 'published-period-undraft-2026-10-16';

export function publishedDraftRepairMarkerPath(stateDir) {
  return path.join(stateDir, `repaired-${PUBLISHED_DRAFT_REPAIR_ID}.json`);
}

export function publishedPeriodsFromRounds(rounds) {
  return (rounds || [])
    .filter(isRoundPublishedForVolunteers)
    .map((round) => ({
      from: startOfDay(parseCalendarDate(round.fromDate)),
      to: endOfDay(parseCalendarDate(round.toDate)),
    }))
    .filter((period) => period.from && period.to && !Number.isNaN(period.from.getTime()));
}

export function isInsideAnyPeriod(date, periods) {
  const t = startOfDay(parseCalendarDate(date) || date).getTime();
  if (Number.isNaN(t)) return false;
  return (periods || []).some((period) => t >= period.from.getTime() && t <= period.to.getTime());
}

/**
 * Zet draft=false voor actieve diensten in gepubliceerde periodes.
 * Raakt geen inschrijvingen aan.
 */
export async function repairPublishedPeriodDrafts(prisma, { stateDir, force = false } = {}) {
  if (!stateDir) throw new Error('stateDir is verplicht voor published-draft repair');
  const marker = publishedDraftRepairMarkerPath(stateDir);
  if (!force && fs.existsSync(marker)) {
    return { already: true, marker };
  }

  const rounds = await prisma.planningRound.findMany({
    where: { publishedAt: { not: null }, fromDate: { not: null }, toDate: { not: null } },
  });
  const periods = publishedPeriodsFromRounds(rounds);
  if (!periods.length) {
    const empty = {
      repairId: PUBLISHED_DRAFT_REPAIR_ID,
      at: new Date().toISOString(),
      publishedPeriods: 0,
      undrafted: 0,
      details: [],
    };
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(marker, JSON.stringify(empty, null, 2));
    return empty;
  }

  const drafts = await prisma.service.findMany({
    where: { active: true, draft: true },
    select: { id: true, date: true, type: true, origin: true },
  });

  let undrafted = 0;
  const details = [];
  for (const service of drafts) {
    if (!isInsideAnyPeriod(service.date, periods)) continue;
    await prisma.service.update({ where: { id: service.id }, data: { draft: false } });
    undrafted += 1;
    details.push({
      id: service.id,
      action: 'undraft',
      date: toIsoDate(service.date),
      type: service.type,
      origin: service.origin,
    });
  }

  const result = {
    repairId: PUBLISHED_DRAFT_REPAIR_ID,
    at: new Date().toISOString(),
    publishedPeriods: periods.length,
    undrafted,
    details: details.slice(0, 300),
  };
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(marker, JSON.stringify(result, null, 2));
  return result;
}
