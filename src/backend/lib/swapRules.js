import { startOfDay } from './dates.js';
import { overlappingMatchBlocks } from './matchBlocks.js';

export const PENDING_SWAP_STATUSES = ['PENDING_PEER', 'PENDING_COMMITTEE'];

export const SWAP_RULES_DECISION = {
  personalOnly: true,
  bothMustAccept: true,
  committeeApproves: true,
  neverCreateOpenSlot: true,
  noUnenrollWorkflow: true,
  teamDutiesExcluded: true,
  futureOnly: true,
  matchBlockBlocksUntilOverride: true,
  onePendingPerPerson: true,
  makeupFollowsPerson: true,
};

export function swapBlockers({ fromEnrollment, toEnrollment, fromPerson, toPerson, matches, now = new Date() }) {
  const errors = [];
  if (!fromEnrollment || !toEnrollment) {
    errors.push('Beide diensten moeten bestaan.');
    return { ok: false, errors, matchBlock: false };
  }
  if (fromEnrollment.id === toEnrollment.id) {
    errors.push('Je kunt niet dezelfde dienst ruilen.');
  }
  if (fromEnrollment.personId === toEnrollment.personId) {
    errors.push('Een ruil is altijd tussen twee personen.');
  }
  if (fromEnrollment.kind === 'TEAM' || toEnrollment.kind === 'TEAM') {
    errors.push('Teamdiensten vallen buiten de normale ruil. Dat gaat via de teamcoördinator.');
  }
  if (fromEnrollment.noShow || toEnrollment.noShow) {
    errors.push('Een no-show kan niet worden geruild.');
  }
  const fromService = fromEnrollment.service;
  const toService = toEnrollment.service;
  if (!fromService?.active || !toService?.active || fromService.draft || toService.draft) {
    errors.push('Alleen actieve, gepubliceerde diensten kunnen worden geruild.');
  }
  if (fromService?.locked || toService?.locked) {
    errors.push('Dit rooster is officieel. Ruilen kan dan niet meer; vraag de barcommissie.');
  }
  const today = startOfDay(now);
  if (fromService && startOfDay(fromService.date) < today) {
    errors.push('Een dienst in het verleden kan niet worden geruild.');
  }
  if (toService && startOfDay(toService.date) < today) {
    errors.push('Een dienst in het verleden kan niet worden geruild.');
  }

  const fromOnTarget = (toService?.enrollments || []).some(
    (e) => e.personId === fromEnrollment.personId && e.id !== toEnrollment.id,
  );
  const toOnSource = (fromService?.enrollments || []).some(
    (e) => e.personId === toEnrollment.personId && e.id !== fromEnrollment.id,
  );
  if (fromOnTarget || toOnSource) {
    errors.push('Na de ruil zou iemand dubbel op dezelfde dienst staan.');
  }

  let matchBlock = false;
  if (fromPerson && toService) {
    const overlap = overlappingMatchBlocks(toService, fromPerson.blocks || []);
    if (overlap.length) matchBlock = true;
  }
  if (toPerson && fromService) {
    const overlap = overlappingMatchBlocks(fromService, toPerson.blocks || []);
    if (overlap.length) matchBlock = true;
  }

  return { ok: errors.length === 0, errors, matchBlock };
}
