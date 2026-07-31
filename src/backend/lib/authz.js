import prisma from './prisma.js';
import { isAdminRole } from './roles.js';

/** Teams waar deze persoon coördinator van is, plus eigen teamId. */
export async function teamIdsForActor(actor) {
  const ids = new Set();
  if (actor.teamId) ids.add(actor.teamId);
  const coordinated = await prisma.team.findMany({
    where: { coordinatorId: actor.id },
    select: { id: true },
  });
  for (const t of coordinated) ids.add(t.id);
  return ids;
}

export async function canManagePersonAsTeamCoordinator(actor, targetPerson) {
  if (!actor || !targetPerson) return false;
  if (isAdminRole(actor.role)) return true;
  if (actor.role !== 'Teamcoördinator') return false;
  const allowed = await teamIdsForActor(actor);
  if (targetPerson.teamId && allowed.has(targetPerson.teamId)) return true;
  return false;
}

/** Datum altijd als lokale middag van YYYY-MM-DD (voorkomt UTC-midnight skew). */
export function parseMatchDateInput(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return new Date(`${y}-${m}-${d}T12:00:00`);
  }
  const s = String(value || '').trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return new Date(`${s}T12:00:00`);
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return parseMatchDateInput(d);
}
