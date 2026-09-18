/** JO8–JO12 / O8–O12 / MO8–MO12 = ochtend; JO13–JO17 / O13–O17 / MO13–MO17 = middag + avond */

const AGE_RE = /(?:^|[^A-Za-z0-9])(?:[JM])?O\s*(0?8|0?9|10|11|12|13|14|15|16|17)\b/i;

export function parseJoAge(teamName) {
  if (!teamName) return null;
  const match = String(teamName).match(AGE_RE);
  if (!match) return null;
  const age = Number(match[1]);
  if (!Number.isFinite(age)) return null;
  return { age, group: age <= 12 ? 'young' : 'old' };
}

export function isYoungYouthTeam(teamName) {
  return parseJoAge(teamName)?.group === 'young';
}

export function isOldYouthTeam(teamName) {
  return parseJoAge(teamName)?.group === 'old';
}

export function ageInRuleRange(age, from, to) {
  if (age == null) return false;
  if (from != null && age < from) return false;
  if (to != null && age > to) return false;
  return true;
}

/** Standaardtijden zaterdagse bardienst */
export const SLOT_TIMES = {
  MORNING: {
    BAR: '07:30 - 12:00',
  },
  AFTERNOON: {
    BAR: '12:00 - 16:30',
  },
  EVENING: {
    BAR: '16:30 - 19:30',
  },
};
