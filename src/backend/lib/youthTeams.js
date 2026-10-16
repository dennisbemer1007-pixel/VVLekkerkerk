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

/** Compacte teamnaam zonder spaties, voor matching. */
export function compactYouthName(teamName) {
  return String(teamName || '')
    .replace(/,/g, ' ')
    .replace(/\s+/g, '')
    .trim();
}

/**
 * Meiden (MO…) vs jongens (O…/JO…). Nooit door elkaar halen.
 * @returns {'girls'|'boys'|null}
 */
export function youthGender(teamName) {
  const compact = compactYouthName(teamName);
  if (/^MO\d/i.test(compact)) return 'girls';
  if (/^(?:J)?O\d/i.test(compact)) return 'boys';
  return null;
}

export function gendersCompatible(a, b) {
  const ga = youthGender(a);
  const gb = youthGender(b);
  if (!ga || !gb) return true;
  return ga === gb;
}

/**
 * Canonieke sleutel voor JO/O-duplicaten: "JO15-1" en "O15-1" → "O15-1".
 * Meiden blijven apart: "MO15-1" → "MO15-1" (nooit gelijk aan O15-1).
 */
export function youthTeamAliasKey(teamName) {
  const compact = compactYouthName(teamName);
  const girls = compact.match(/^MO(\d{1,2}(?:[-.].*)?)$/i);
  if (girls) return `MO${girls[1]}`.toUpperCase();
  // Alleen optionele J (JO↔O), nooit M.
  const boys = compact.match(/^(?:J)?O(\d{1,2}(?:[-.].*)?)$/i);
  if (!boys) return null;
  return `O${boys[1]}`.toUpperCase();
}

/**
 * Zelfde nummer met/zonder JM-suffix (KNVB hernoemde O15-1JM → O15-1).
 * Alleen binnen hetzelfde geslacht; O15-3JM wordt niet O15-3 als die apart bestaat
 * — dat is alleen een lookup-fallback als exacte naam ontbreekt.
 */
export function jmAlternateAliasKeys(teamName) {
  const key = youthTeamAliasKey(teamName);
  if (!key) return [];
  const m = key.match(/^(MO|O)(\d{1,2}-\d+)(JM)?$/i);
  if (!m) return [];
  const prefix = m[1].toUpperCase();
  const num = m[2];
  if (m[3]) return [`${prefix}${num}`];
  return [`${prefix}${num}JM`];
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
