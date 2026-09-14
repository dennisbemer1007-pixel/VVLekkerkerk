import { isYoungYouthTeam } from './youthTeams.js';

export function parseTeamDutySlots(raw) {
  try {
    const parsed = JSON.parse(raw || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.map(String).filter((v) => ['MORNING', 'SECOND', 'LAST'].includes(v));
  } catch {
    return [];
  }
}

/** FO: alleen O13-1 / JO13-1 / O13-1JM, niet JO13-2 of andere O13-elftallen. */
export function isO13FirstTeam(name) {
  const compact = String(name || '').replace(/\s+/g, '');
  return /(?:JO|O)13-1(?:JM)?(?!\d)/i.test(compact);
}

export function hasDefaultSecondLastTeamDuty(name) {
  const compact = String(name || '').replace(/\s+/g, '');
  if (/(?:MO)17|(?:JO|O)16|(?:MO|JO|O)15/i.test(compact)) return true;
  return isO13FirstTeam(name);
}

/**
 * Standaardfuncties uit FO 18–21. Barcommissie kan dit later overschrijven.
 */
export function defaultTeamFunctions(name) {
  if (isYoungYouthTeam(name)) {
    return {
      availabilityUse: true,
      teamDutyUse: true,
      teamDutySlots: ['MORNING'],
    };
  }
  if (hasDefaultSecondLastTeamDuty(name)) {
    return {
      availabilityUse: true,
      teamDutyUse: true,
      teamDutySlots: ['SECOND', 'LAST'],
    };
  }
  return {
    availabilityUse: true,
    teamDutyUse: false,
    teamDutySlots: [],
  };
}

export function personTeamIds(person) {
  const ids = new Set();
  if (person?.teamId) ids.add(person.teamId);
  for (const membership of person?.teamMemberships || []) {
    if (membership.active === false) continue;
    if (membership.teamId) ids.add(membership.teamId);
  }
  return [...ids];
}
