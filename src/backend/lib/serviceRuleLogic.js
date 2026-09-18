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

export function evaluateRule(rule, ctx) {
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

  const type = rule.conditionType;
  if (type === 'MANUAL') return { ok: false, reason: 'manual' };
  if (type === 'ALWAYS') return { ok: true };

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
