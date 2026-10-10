import { addWeeks, endOfDay, startOfDay, toIsoDate } from './dates.js';
import { kickoffTimeFromMatch } from './matchPlanning.js';
import { parseTimeStartMinutes } from './time.js';
import { findTeamInIndex, buildTeamIndex } from './knvbTeams.js';
import { eligibleTeamDutyCandidates } from './teamDutyPlanning.js';

export function serviceKey(date, type, startTime) {
  return `${toIsoDate(startOfDay(date))}|${type}|${startTime}`;
}

export function startTimeFromService(service) {
  const m = String(service?.time || '').match(/(\d{1,2}:\d{2})/);
  return m ? m[1].padStart(5, '0') : '';
}

export function datesInRange(from, to) {
  const days = [];
  const cursor = startOfDay(from);
  const last = startOfDay(to);
  while (cursor <= last) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export function sameCalendarDay(a, b) {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

export function resolveConditionTeam(rule, teams) {
  if (rule.conditionTeamId) {
    return (teams || []).find((t) => t.id === rule.conditionTeamId) || null;
  }
  if (!rule.conditionTeamName) return null;
  const index = buildTeamIndex(teams || []);
  return findTeamInIndex(index, rule.conditionTeamName);
}

function baseScheduleOk(rule, ctx) {
  if (rule.active === false) return { ok: false, reason: 'inactive' };
  if (rule.weekday != null && Number(rule.weekday) !== ctx.weekday) {
    return { ok: false, reason: 'weekday' };
  }
  if (rule.validFrom && ctx.date < startOfDay(rule.validFrom)) {
    return { ok: false, reason: 'validFrom' };
  }
  if (rule.validTo && ctx.date > endOfDay(rule.validTo)) {
    return { ok: false, reason: 'validTo' };
  }
  return { ok: true };
}

/** Thuiswedstrijden van het voorwaardeteam (zonder aftrap-filter). */
export function homeMatchesForConditionTeam(rule, ctx) {
  let matches = ctx.homeMatches || [];
  const team = resolveConditionTeam(rule, ctx.teams);
  if (!team) return { team: null, matches: [] };
  matches = matches.filter((m) => m.teamId === team.id);
  return { team, matches };
}

/**
 * Mag de vaste persoon op deze dag worden ingeschreven?
 * Voor NO_HOME_MATCH_TEAM: alleen als het team die dag géén thuiswedstrijd heeft
 * (hele dag, aftrap-filter telt niet — anders mist de ochtendregel een middagwedstrijd).
 */
export function evaluateFixedPersonCondition(rule, ctx) {
  const base = baseScheduleOk(rule, ctx);
  if (!base.ok) return base;
  const type = rule.conditionType || 'ALWAYS';
  if (type === 'MANUAL') return { ok: false, reason: 'manual' };
  if (type === 'ALWAYS') return { ok: true };
  if (type === 'NO_HOME_MATCH_TEAM') {
    const { team, matches } = homeMatchesForConditionTeam(rule, ctx);
    if (!team) {
      return {
        ok: false,
        reason: 'unknown-team',
        unknownTeam: rule.conditionTeamName || rule.conditionTeamId,
      };
    }
    return { ok: matches.length === 0, matches: [], team };
  }
  // Overige voorwaarden: zelfde logica als dienstaanmaak.
  return evaluateRule(rule, ctx);
}

/**
 * Mag deze regel een dienst aanmaken?
 * NO_HOME_MATCH_TEAM maakt de dienst altijd (als weekdag/geldigheid klopt);
 * die voorwaarde stuurt alleen de vaste persoon.
 */
export function evaluateRule(rule, ctx) {
  const base = baseScheduleOk(rule, ctx);
  if (!base.ok) return base;

  const type = rule.conditionType;
  if (type === 'MANUAL') return { ok: false, reason: 'manual' };
  if (type === 'ALWAYS' || type === 'NO_HOME_MATCH_TEAM') {
    return { ok: true, fixedPersonOnlyCondition: type === 'NO_HOME_MATCH_TEAM' };
  }

  if (type === 'HOME_MATCH' || type === 'HOME_MATCH_TEAM') {
    let matches = ctx.homeMatches || [];
    if (type === 'HOME_MATCH_TEAM') {
      const team = resolveConditionTeam(rule, ctx.teams);
      if (!team) return { ok: false, reason: 'unknown-team', unknownTeam: rule.conditionTeamName };
      matches = matches.filter((m) => m.teamId === team.id);
    }
    if (rule.kickoffAfter) {
      const min = parseTimeStartMinutes(rule.kickoffAfter);
      if (min != null) {
        matches = matches.filter((m) => {
          const k = parseTimeStartMinutes(kickoffTimeFromMatch(m));
          return k != null && k >= min;
        });
      }
    }
    return { ok: matches.length > 0, matches };
  }

  if (type === 'ACTIVITY') {
    const wanted = String(rule.conditionActivityType || '').toLowerCase();
    const activities = (ctx.activities || []).filter(
      (a) => !wanted || String(a.type || '').toLowerCase() === wanted,
    );
    return { ok: activities.length > 0, activities };
  }

  return { ok: false, reason: 'unknown-condition' };
}

export function teamDutyCandidates(rule, homeMatches) {
  return eligibleTeamDutyCandidates(rule, homeMatches).map((a) => a.team);
}

export { addWeeks, endOfDay, startOfDay };
