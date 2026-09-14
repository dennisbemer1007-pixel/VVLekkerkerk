/** JO8–JO12 / O8–O12 = ochtend; JO13–JO17 / O13–O17 = middag + avond */

const YOUNG_RE = /\bJ?O\s*(0?8|0?9|10|11|12)\b/i;
const OLD_RE = /\bJ?O\s*(13|14|15|16|17)\b/i;

export function parseJoAge(teamName) {
  if (!teamName) return null;
  const young = teamName.match(YOUNG_RE);
  if (young) return { age: Number(young[1]), group: 'young' };
  const old = teamName.match(OLD_RE);
  if (old) return { age: Number(old[1]), group: 'old' };
  return null;
}

export function isYoungYouthTeam(teamName) {
  return parseJoAge(teamName)?.group === 'young';
}

export function isOldYouthTeam(teamName) {
  return parseJoAge(teamName)?.group === 'old';
}

/** Standaardtijden bardienst (bezetting 2) */
export const SLOT_TIMES = {
  MORNING: {
    BAR: '09:00 - 12:00',
  },
  AFTERNOON: {
    BAR: '12:00 - 16:00',
  },
  EVENING: {
    BAR: '16:00 - 20:30',
  },
};
