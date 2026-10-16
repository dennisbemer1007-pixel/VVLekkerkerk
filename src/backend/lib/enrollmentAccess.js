/** Hoelang een ouder een verse inschrijving nog zelf ongedaan mag maken op een officieel rooster. */
export const RECENT_UNENROLL_MS = 2 * 60 * 60 * 1000;

export function withinRecentUnenrollWindow(createdAt, now = new Date()) {
  const created = new Date(createdAt).getTime();
  const at = now instanceof Date ? now.getTime() : Number(now);
  if (!Number.isFinite(created) || !Number.isFinite(at)) return false;
  const age = at - created;
  return age >= 0 && age <= RECENT_UNENROLL_MS;
}

/**
 * Officieel rooster: vrijwilliger schrijft zich niet meer uit.
 * Zichzelf of een eigen kind mag dat wel binnen 2 uur na het inschrijven.
 * Barcommissie en admin mogen altijd.
 */
export function mayUnenroll({ isAdmin, locked, selfOrGuardian, createdAt, now }) {
  if (isAdmin) return true;
  if (!locked) return true;
  return Boolean(selfOrGuardian) && withinRecentUnenrollWindow(createdAt, now);
}

/** Barcommissie mag de laatste plek vullen, ook als die als teamplek is gereserveerd. */
export function mayAddDespiteTeamOnlySpots({ isAdmin, personalOpen, enrolledCount, required }) {
  return Boolean(isAdmin) && Number(personalOpen) <= 0 && Number(enrolledCount) < Number(required);
}

/** Huisgenoten die nog niet op deze dienst staan. */
export function householdIdsStillOpen(householdIds, enrollments) {
  const enrolled = new Set((enrollments || []).map((row) => Number(row.personId)));
  return (householdIds || []).map(Number).filter((id) => id > 0 && !enrolled.has(id));
}
