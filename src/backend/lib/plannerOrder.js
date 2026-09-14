import { OBLIGATIONS, prefersSlot } from './obligation.js';

/**
 * Vastgelegde keuze (FO §34 / §89, te herzien):
 * 1. Openstaande inhaaldiensten eerst
 * 2. Verplicht lid (6 weken) vóór VR18+ (12 weken)
 * 3. Wie dit kalenderjaar het minst persoonlijk heeft gestaan
 * 4. Wie het langst geleden (of nog nooit) een persoonlijke dienst had
 * 5. Dagdeelvoorkeur
 * 6. Persoonsnummer als stabiele tie-break
 *
 * Geen extra “straf” op oude historie buiten dit jaar. Teamdiensten tellen niet mee.
 */
export const PLANNER_FAIRNESS_DECISION =
  'inhaal → verplicht 6w → VR18+ → minste persoonlijke diensten dit jaar → langst geleden → voorkeur dagdeel → persoonsnummer';

export function obligationRank(person) {
  if (person.obligation === OBLIGATIONS.FULL) return 1;
  if (person.obligation === OBLIGATIONS.VR18) return 2;
  return 9;
}

export function lastPersonalAt(enrollments) {
  let max = null;
  for (const enrollment of enrollments || []) {
    if (enrollment.kind === 'TEAM' || enrollment.noShow) continue;
    const d = new Date(enrollment.service?.date ?? enrollment.createdAt);
    if (!max || d > max) max = d;
  }
  return max;
}

export function compareFillCandidates(a, b, service) {
  const makeup = (b.person.makeupDue ?? 0) - (a.person.makeupDue ?? 0);
  if (makeup) return makeup;

  const rank = obligationRank(a.person) - obligationRank(b.person);
  if (rank) return rank;

  const aYear = a.counts?.countYear ?? 0;
  const bYear = b.counts?.countYear ?? 0;
  if (aYear !== bYear) return aYear - bYear;

  const aLast = a.lastPersonalAt ? a.lastPersonalAt.getTime() : 0;
  const bLast = b.lastPersonalAt ? b.lastPersonalAt.getTime() : 0;
  if (aLast !== bLast) return aLast - bLast;

  const aPref = prefersSlot(a.person, service?.slot) ? 0 : 1;
  const bPref = prefersSlot(b.person, service?.slot) ? 0 : 1;
  if (aPref !== bPref) return aPref - bPref;

  return String(a.person.personNumber || '').localeCompare(String(b.person.personNumber || ''), 'nl');
}
