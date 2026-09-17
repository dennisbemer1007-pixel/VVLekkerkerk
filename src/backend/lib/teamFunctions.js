import { isOldYouthTeam, isYoungYouthTeam } from './youthTeams.js';

export function parseTeamDutySlots(raw) {
  try {
    const parsed = JSON.parse(raw || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.map(String).filter((v) => ['MORNING', 'SECOND', 'LAST'].includes(v));
  } catch {
    return [];
  }
}

/** Eerste O13-elftal (O13-1 / JO13-1 / O13-1JM). Teamdiensten gelden voor alle O13–O17. */
export function isO13FirstTeam(name) {
  const compact = String(name || '').replace(/\s+/g, '');
  return /(?:JO|O)13-1(?:JM)?(?!\d)/i.test(compact);
}

/** O13 t/m O17: middag (2 plekken) + avond (1 plek) bij thuiswedstrijd. */
export function hasDefaultSecondLastTeamDuty(name) {
  return isOldYouthTeam(name);
}

/**
 * Standaardfuncties. O8–O12 ochtend; O13–O17 middag+avond.
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
