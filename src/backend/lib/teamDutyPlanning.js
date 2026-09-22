import { kickoffTimeFromMatch, slotForKickoff } from './matchPlanning.js';
import { ageInRuleRange, isOldYouthTeam, isYoungYouthTeam, parseJoAge } from './youthTeams.js';
import { parseTeamDutySlots } from './teamFunctions.js';

/** Fallback aantal teamplekken per shift als de dienstregel geen aantal zet. */
export const TEAM_DUTY_RESERVED = {
  MORNING: 2,
  SECOND: 2,
  LAST: 1,
};

/** Fallback vrije plekken naast teamdiensten (alleen nog voor labels/defaults). */
export const TEAM_DUTY_PERSONAL_MIN = {
  MORNING: 1,
  SECOND: 1,
  LAST: 1,
};

export const TEAM_DUTY_AGE_DEFAULTS = {
  MORNING: { from: 8, to: 12 },
  SECOND: { from: 13, to: 17 },
  LAST: { from: 13, to: 17 },
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

export function parseAgeBound(value) {
  if (value === '' || value == null) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 5 || n > 21) return null;
  return n;
}

export function defaultsForTeamDutyRole(role) {
  const ages = TEAM_DUTY_AGE_DEFAULTS[role] || {};
  return {
    teamDutyReserved: reservedSpotsForRole(role),
    teamDutyAgeFrom: ages.from ?? null,
    teamDutyAgeTo: ages.to ?? null,
  };
}

/** Aantal teamplekken voor één team; nooit meer dan het totaal uit de dienstregel. */
export function reservedSpotsForRule(rule) {
  const role = rule?.teamDutySlotRole;
  const fromRule = Number(rule?.teamDutyReserved);
  const reserved =
    Number.isFinite(fromRule) && fromRule > 0 ? Math.round(fromRule) : reservedSpotsForRole(role);
  const requiredRaw = Number(rule?.required);
  if (Number.isFinite(requiredRaw) && requiredRaw > 0) {
    return Math.max(0, Math.min(reserved, Math.round(requiredRaw)));
  }
  return Math.max(0, reserved);
}

export function teamDutyAgeFrom(rule) {
  const parsed = parseAgeBound(rule?.teamDutyAgeFrom);
  if (parsed != null) return parsed;
  return TEAM_DUTY_AGE_DEFAULTS[rule?.teamDutySlotRole]?.from ?? null;
}

export function teamDutyAgeTo(rule) {
  const parsed = parseAgeBound(rule?.teamDutyAgeTo);
  if (parsed != null) return parsed;
  return TEAM_DUTY_AGE_DEFAULTS[rule?.teamDutySlotRole]?.to ?? null;
}

export function teamDutyAgeLabel(from, to) {
  if (from == null && to == null) return null;
  if (from != null && to != null) return `O${from}–O${to}`;
  if (from != null) return `O${from}+`;
  return `t/m O${to}`;
}

export function teamFitsDutyRole(team, role) {
  return teamFitsDutyRule(team, { teamDutySlotRole: role });
}

/**
 * Team hoort bij deze dienstregel: teamdienst aan, en leeftijdsgroep uit de regel
 * (anders de standaard ochtend=O8–O12 / middag+avond=O13–O17 plus team-shift).
 */
export function teamFitsDutyRule(team, rule) {
  if (!team?.teamDutyUse) return false;
  const role = rule?.teamDutySlotRole;
  const age = parseJoAge(team.name)?.age ?? null;
  const hasAgeFilter = rule?.teamDutyAgeFrom != null || rule?.teamDutyAgeTo != null;
  if (hasAgeFilter) {
    const from = parseAgeBound(rule.teamDutyAgeFrom);
    const to = parseAgeBound(rule.teamDutyAgeTo);
    return ageInRuleRange(age, from, to);
  }
  const slots = parseTeamDutySlots(team.teamDutySlots);
  if (role && !slots.includes(role)) return false;
  if (role === 'MORNING') return isYoungYouthTeam(team.name);
  if (role === 'SECOND' || role === 'LAST') return isOldYouthTeam(team.name);
  return false;
}

export function eligibleTeamDutyCandidates(rule, homeMatches) {
  if (!rule?.teamDuty || !rule.teamDutySlotRole) return [];
  const role = rule.teamDutySlotRole;
  const reserved = reservedSpotsForRule(rule);
  if (!reserved) return [];

  const seen = new Set();
  const out = [];
  for (const match of homeMatches || []) {
    const team = match.team;
    if (!team || seen.has(team.id)) continue;
    if (!teamFitsDutyRule(team, rule)) continue;
    if (!slotMatchesKickoff(role, match)) continue;
    seen.add(team.id);
    out.push({ team, match, reserved });
  }
  out.sort((a, b) => String(a.team.name).localeCompare(String(b.team.name), 'nl'));
  return out;
}

export function compareTeamDutyFairness(a, b, fairness = {}) {
  const counts = fairness.counts || new Map();
  const lastAt = fairness.lastAt || new Map();
  const ca = counts.get(a.team.id) || 0;
  const cb = counts.get(b.team.id) || 0;
  if (ca !== cb) return ca - cb;
  const la = lastAt.get(a.team.id) || 0;
  const lb = lastAt.get(b.team.id) || 0;
  if (la !== lb) return la - lb;
  return String(a.team.name).localeCompare(String(b.team.name), 'nl');
}

/**
 * Eén thuisspelend team per dienst: wie dit seizoen het minst heeft gestaan.
 * keepTeamId houdt een team vast als daar al ouders op staan.
 */
export function pickTeamDutyAssignment(rule, candidates, options = {}) {
  const list = candidates || [];
  if (!list.length) return [];
  const reserved = reservedSpotsForRule(rule);
  if (!reserved) return [];
  const keepId = options.keepTeamId != null ? Number(options.keepTeamId) : null;
  const kept = keepId ? list.find((c) => Number(c.team.id) === keepId) : null;
  const chosen = kept || [...list].sort((a, b) => compareTeamDutyFairness(a, b, options))[0];
  if (!chosen) return [];
  return [{ team: chosen.team, reserved, match: chosen.match }];
}

/**
 * Jeugdteams die op dit dagdeel thuis spelen.
 * Het aantal plekken komt uit de dienstregel; bij meerdere thuisteams krijgt
 * één team de teamplekken (het team dat het minst heeft gestaan).
 */
export function teamDutyAssignments(rule, homeMatches, options = {}) {
  const candidates = eligibleTeamDutyCandidates(rule, homeMatches);
  return pickTeamDutyAssignment(rule, candidates, options);
}

/** Het totaal aantal plekken blijft de dienstregel; teamplekken groeien niet mee. */
export function requiredForTeamDuties(ruleRequired, _role, _assignments) {
  return Math.max(1, Number(ruleRequired) || 1);
}

export function kindForAssignments(required, assignments) {
  const reserved = (assignments || []).reduce((sum, a) => sum + (a.reserved || 0), 0);
  if (!reserved) return 'PERSONAL';
  if (reserved >= required) return 'TEAM';
  return 'MIXED';
}

export function standsFromDutyRows(rows) {
  const counts = new Map();
  const lastAt = new Map();
  for (const row of rows || []) {
    const teamId = row.teamId;
    if (teamId == null) continue;
    counts.set(teamId, (counts.get(teamId) || 0) + 1);
    const t = new Date(row.service?.date || row.date || 0).getTime();
    if (!Number.isFinite(t)) continue;
    if (!lastAt.has(teamId) || t > lastAt.get(teamId)) lastAt.set(teamId, t);
  }
  return { counts, lastAt };
}

export function keepTeamIdFromExisting(service, candidates) {
  if (!service) return null;
  const eligible = new Set((candidates || []).map((c) => Number(c.team.id)));
  const fromEnrollments = (service.enrollments || [])
    .filter((e) => e.kind === 'TEAM' && e.forTeamId && eligible.has(Number(e.forTeamId)) && !e.noShow)
    .map((e) => Number(e.forTeamId));
  if (fromEnrollments.length) return fromEnrollments[0];
  return null;
}

export function recordTeamDutyStand(fairness, teamId, at) {
  if (teamId == null || !fairness) return;
  const counts = fairness.counts || new Map();
  const lastAt = fairness.lastAt || new Map();
  counts.set(teamId, (counts.get(teamId) || 0) + 1);
  const t = at instanceof Date ? at.getTime() : Number(at) || 0;
  if (!lastAt.has(teamId) || t > lastAt.get(teamId)) lastAt.set(teamId, t);
  fairness.counts = counts;
  fairness.lastAt = lastAt;
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

/**
 * Teamplekken tellen meteen als bezet: het team vult die dienst, ook zonder naam.
 * Een genoemde ouder zit ín die reservering en telt niet nog een keer mee.
 */
export function occupiedSlots(capacity) {
  return capacity.personalEnrolled + Math.max(capacity.teamEnrolled, capacity.teamReserved);
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
  if (source === 'GUARDIAN') return 'Ingeschreven door ouder';
  if (source === 'AUTO') {
    if (makeup) return 'Automatisch ingepland: openstaande inhaaldienst.';
    if (obligation === 'VR18') {
      return 'Automatisch ingepland: VR18+ (1 bardienst per 12 weken) stond nog open.';
    }
    return 'Automatisch ingepland: verplichte bardienst (1 per 6 weken) stond nog open.';
  }
  return null;
}
