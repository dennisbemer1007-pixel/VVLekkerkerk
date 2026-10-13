import { occupancyStatus } from './dates.js';
import { isRoundPublishedForVolunteers } from './planningPeriod.js';

/** Dashboard Vol / Nog 1 / Open: alleen actieve niet-concept diensten. */
export function dashboardServiceCounts(services) {
  const list = (services || []).filter((s) => s && s.active !== false && !s.draft);
  let full = 0;
  let almost = 0;
  let open = 0;
  for (const s of list) {
    const enrolled = s.enrolled ?? s.enrollments?.length ?? 0;
    const required = s.required ?? 2;
    const status = s.status ?? occupancyStatus(enrolled, required);
    if (status === 'full') full += 1;
    else if (status === 'almost') almost += 1;
    else open += 1;
  }
  return { full, almost, open };
}

/** Zonder publicatie blijven aandacht-tegels (niet ingepland / no-show) leeg. */
export function dashboardAttentionEnabled(round) {
  return isRoundPublishedForVolunteers(round);
}

/**
 * No-show telt alleen als de barcommissie die via de app heeft gemarkeerd
 * (audit `enrollment.noshow` voor dit inschrijvings-id).
 */
export function isCommitteeMarkedNoShow(enrollmentId, auditedNoshowIds) {
  const id = Number(enrollmentId);
  if (!Number.isFinite(id) || id <= 0) return false;
  return Boolean(auditedNoshowIds?.has?.(id));
}

export function filterCommitteeNoShowPeople(people, noShowRows, auditedNoshowIds) {
  const noShowByPerson = new Map();
  for (const row of noShowRows || []) {
    if (!isCommitteeMarkedNoShow(row.id ?? row.enrollmentId, auditedNoshowIds)) continue;
    const personId = row.personId;
    const cur = noShowByPerson.get(personId) || { count: 0, dates: [] };
    cur.count += 1;
    if (row.service?.date) cur.dates.push(row.service.date);
    noShowByPerson.set(personId, cur);
  }
  return (people || [])
    .filter((p) => noShowByPerson.has(p.id) && (p.obligation === 'FULL' || p.obligation === 'VR18'))
    .map((p) => {
      const info = noShowByPerson.get(p.id);
      return {
        id: p.id,
        name: p.name,
        role: p.role,
        team: p.team?.name ?? p.team ?? null,
        obligation: p.obligation,
        noShowCount: info.count,
        lastNoShowDate: info.dates[0] || null,
      };
    });
}
