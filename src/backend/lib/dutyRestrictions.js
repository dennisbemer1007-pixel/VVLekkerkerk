import { inferSlot } from './pdfRoster.js';

/** Teams van deze persoon met “alleen ochtendbar / keuken”. */
export function teamsWithMorningBarOrKitchenOnly(person) {
  const out = [];
  if (person?.team?.morningBarOrKitchenOnly) out.push(person.team);
  for (const membership of person?.teamMemberships || []) {
    if (membership.active === false) continue;
    if (membership.team?.morningBarOrKitchenOnly) out.push(membership.team);
  }
  return out;
}

export function personMorningBarOrKitchenOnly(person) {
  return teamsWithMorningBarOrKitchenOnly(person).length > 0;
}

/** Keuken altijd ok; bar alleen ochtend. */
export function serviceOkForMorningBarOrKitchenOnly(service) {
  if (!service) return false;
  if (service.type === 'KITCHEN') return true;
  if (service.type !== 'BAR') return false;
  return inferSlot(service) === 'MORNING';
}

/** True als deze persoon niet op deze dienst mag (middag-/avondbar). */
export function blockedByMorningBarOrKitchenOnly(person, service) {
  if (!personMorningBarOrKitchenOnly(person)) return false;
  return !serviceOkForMorningBarOrKitchenOnly(service);
}
