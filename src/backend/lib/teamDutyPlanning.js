import { kickoffTimeFromMatch, slotForKickoff } from './matchPlanning.js';
import { isOldYouthTeam, isYoungYouthTeam } from './youthTeams.js';
import { parseTeamDutySlots } from './teamFunctions.js';

/** Aantal teamdienst-plekken per shift (FO + tester 2026-09). */
export const TEAM_DUTY_RESERVED = {
  MORNING: 2,
  SECOND: 2,
  LAST: 1,
};

/** Minimale vrije (persoonlijke) plekken naast teamdiensten. */
export const TEAM_DUTY_PERSONAL_MIN = {
  MORNING: 1,
  SECOND: 0,
  LAST: 1,
};

export function roleToSlot(role) {
  if (role === 'MORNING') return 'MORNING';
  if (role === 'SECOND') return 'AFTERNOON';
  if (role === 'LAST') return 'EVENING';
  return null;
}

export function slotMatchesKickoff(role, match) {
  // O13–O17: bij een thuiswedstrijd die zaterdag altijd middag én avond.
  if (role === 'SECOND' || role === 'LAST') return true;
  const expected = roleToSlot(role);
  if (!expected) return false;
  return slotForKickoff(kickoffTimeFromMatch(match)) === expected;
}

export function reservedSpotsForRole(role) {
  return TEAM_DUTY_RESERVED[role] || 0;
}

export function personalMinimumForRole(role) {
  return TEAM_DUTY_PERSONAL_MIN[role] ?? 0;
}

export function teamFitsDutyRole(team, role) {
  if (!team?.teamDutyUse) return false;
  const slots = parseTeamDutySlots(team.teamDutySlots);
  if (!slots.includes(role)) return false;
  if (role === 'MORNING') return isYoungYouthTeam(team.name);
  if (role === 'SECOND' || role === 'LAST') return isOldYouthTeam(team.name);
  return false;
}

/**
 * Jeugdteams die op dit dagdeel thuis spelen, met gereserveerde plekken.
 * Meerdere teams thuis: elk team krijgt de standaard teamdiensten; required groeit mee.
 */
export function teamDutyAssignments(rule, homeMatches) {
  if (!rule?.teamDuty || !rule.teamDutySlotRole) return [];
  const role = rule.teamDutySlotRole;
  const reserved = reservedSpotsForRole(role);
  if (!reserved) return [];

  const seen = new Set();
  const out = [];
  for (const match of homeMatches || []) {
    const team = match.team;
    if (!team || seen.has(team.id)) continue;
    if (!teamFitsDutyRole(team, role)) continue;
    if (!slotMatchesKickoff(role, match)) continue;
    seen.add(team.id);
    out.push({ team, reserved, match });
  }
  out.sort((a, b) => String(a.team.name).localeCompare(String(b.team.name), 'nl'));
  return out;
}

export function requiredForTeamDuties(ruleRequired, role, assignments) {
  const base = Math.max(1, Number(ruleRequired) || 1);
  const reserved = (assignments || []).reduce((sum, a) => sum + (a.reserved || 0), 0);
  const personalMin = assignments?.length ? personalMinimumForRole(role) : 0;
  return Math.max(base, reserved + personalMin);
}

export function kindForAssignments(required, assignments) {
  const reserved = (assignments || []).reduce((sum, a) => sum + (a.reserved || 0), 0);
  if (!reserved) return 'PERSONAL';
  if (reserved >= required) return 'TEAM';
  return 'MIXED';
}

export function serviceCapacity(service) {
  const duties = service?.teamDuties || [];
  const teamReserved = duties.reduce((sum, d) => sum + Number(d.reserved || 0), 0);
  const required = Math.max(0, Number(service?.required) || 0);
  const personalCapacity = Math.max(0, required - teamReserved);
  const enrollments = (service?.enrollments || []).filter((e) => !e.noShow);
  const teamEnrolled = enrollments.filter((e) => e.kind === 'TEAM').length;
  const personalEnrolled = enrollments.filter((e) => e.kind !== 'TEAM').length;
  return {
    required,
    teamReserved,
    personalCapacity,
    teamEnrolled,
    personalEnrolled,
    teamOpen: Math.max(0, teamReserved - teamEnrolled),
    personalOpen: Math.max(0, personalCapacity - personalEnrolled),
    enrolled: enrollments.length,
    open: Math.max(0, required - enrollments.length),
  };
}

export function teamDutyOpenForTeam(service, teamId) {
  const duty = (service?.teamDuties || []).find((d) => d.teamId === Number(teamId));
  if (!duty) return 0;
  const used = (service?.enrollments || []).filter(
    (e) => e.kind === 'TEAM' && Number(e.forTeamId) === Number(teamId) && !e.noShow,
  ).length;
  return Math.max(0, Number(duty.reserved || 0) - used);
}

export function friendlyEnrollmentReason(source, { makeup = false, obligation } = {}) {
  if (source === 'SELF') return 'Zelf ingeschreven';
  if (source === 'TEAM') return 'Ingevuld door de bardienstcoördinator';
  if (source === 'ADMIN') return 'Ingepland door de barcommissie';
  if (source === 'AUTO') {
    if (makeup) return 'Automatisch ingepland: openstaande inhaaldienst.';
    if (obligation === 'VR18') {
      return 'Automatisch ingepland: VR18+ (1 bardienst per 12 weken) stond nog open.';
    }
    return 'Automatisch ingepland: verplichte bardienst (1 per 6 weken) stond nog open.';
  }
  return null;
}
