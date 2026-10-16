import { gendersCompatible, jmAlternateAliasKeys, youthTeamAliasKey } from './youthTeams.js';

/** Clubnaam in KNVB-export (Thuis / Uit). */
const CLUB_RE = /\blekkerkerk\b/i;
const SENIOR_BARE_RE = /^lekkerkerk\s+\d+[a-z]?$/i;

export function isClubTeamName(name) {
  return CLUB_RE.test(String(name || ''));
}

/** Zaterdag/zondag-suffix voor seniorenteams die in KNVB dezelfde naam delen. */
export function seniorWeekendSuffix(date) {
  if (!date) return '';
  const day = new Date(date).getDay();
  if (day === 6) return ' (za)';
  if (day === 0) return ' (zo)';
  return '';
}

export function stripWeekendSuffix(name) {
  return String(name || '')
    .replace(/\s*\((za|zo)\)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isBareSeniorClubTeam(name) {
  return SENIOR_BARE_RE.test(stripWeekendSuffix(name));
}

/**
 * KNVB zet de club in Thuis of Uit, bijv. "Lekkerkerk O16-1".
 * @returns {{ home: boolean, team: string, opponent: string } | null}
 */
export function deriveClubSides(homeTeamName, awayTeamName, date) {
  const thuis = String(homeTeamName || '').trim();
  const uit = String(awayTeamName || '').trim();
  const clubHome = isClubTeamName(thuis);
  const clubAway = isClubTeamName(uit);

  if (clubHome && !clubAway) {
    return { home: true, team: clubTeamLabel(thuis, { date }), opponent: uit };
  }
  if (clubAway && !clubHome) {
    return { home: false, team: clubTeamLabel(uit, { date }), opponent: thuis };
  }
  if (clubHome && clubAway) {
    return { home: true, team: clubTeamLabel(thuis, { date }), opponent: uit };
  }
  return null;
}

/**
 * "Lekkerkerk O16-1" → "O16-1"; "Lekkerkerk 2" op zaterdag → "Lekkerkerk 2 (za)".
 * @param {string} fullName
 * @param {{ date?: Date|string }} [opts]
 */
export function clubTeamLabel(fullName, opts = {}) {
  const cleaned = String(fullName || '')
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Al gesplitst behouden
  if (/\((za|zo)\)$/i.test(cleaned)) return cleaned;
  const stripped = cleaned.replace(/^lekkerkerk\s+/i, '').trim();
  if (!stripped) return cleaned;
  let label = /^\d+[a-z]?$/i.test(stripped) ? `Lekkerkerk ${stripped}` : stripped;
  if (isBareSeniorClubTeam(label)) {
    label = `${label}${seniorWeekendSuffix(opts.date)}`;
  }
  return label;
}

export function teamLookupKeys(name) {
  const n = String(name || '')
    .toLowerCase()
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const keys = new Set([n, n.replace(/\s+/g, '')]);
  const stripped = n.replace(/^lekkerkerk\s+/, '');
  if (stripped && stripped !== n) {
    keys.add(stripped);
    keys.add(stripped.replace(/\s+/g, ''));
  }
  for (const base of [...keys]) {
    // Meiden (MO…): nooit o…/jo…-sleutels — anders matcht O15 op MO15.
    if (/^mo\d/i.test(base)) {
      const girls = base.match(/^mo(\d{1,2}.*)$/i);
      if (girls) keys.add(`mo${girls[1]}`);
      continue;
    }
    const m = base.match(/^(j)?o(\d{1,2}.*)$/i);
    if (m) {
      keys.add(`o${m[2]}`);
      keys.add(`jo${m[2]}`);
    }
  }
  return keys;
}

export function buildTeamIndex(teams) {
  const map = new Map();
  for (const team of teams) {
    for (const key of teamLookupKeys(team.name)) {
      if (!map.has(key)) map.set(key, team);
    }
  }
  return map;
}

function findInIndexWithKeys(index, name, keySets) {
  for (const keys of keySets) {
    for (const key of keys) {
      const found = index.get(String(key).toLowerCase());
      if (found && gendersCompatible(name, found.name)) return found;
    }
  }
  return null;
}

/**
 * Zoek team op naam. opts.date: bij bare senior ("Lekkerkerk 1") verkies
 * de za/zo-variant van die dag — nodig na weekend-split voor dienstregels.
 */
export function findTeamInIndex(index, name, opts = {}) {
  const primary = findInIndexWithKeys(index, name, [teamLookupKeys(name)]);
  if (primary) return primary;

  // Fallback: O15-1JM ↔ O15-1 (KNVB-hernoeming), nooit MO↔O.
  const alias = youthTeamAliasKey(name);
  const jmAlts = jmAlternateAliasKeys(name);
  if (alias || jmAlts.length) {
    const altKeys = new Set();
    if (alias) {
      for (const k of teamLookupKeys(alias)) altKeys.add(k);
    }
    for (const alt of jmAlts) {
      for (const k of teamLookupKeys(alt)) altKeys.add(k);
    }
    const viaJm = findInIndexWithKeys(index, name, [altKeys]);
    if (viaJm) return viaJm;
  }

  const unsuffixed = stripWeekendSuffix(name);
  if (unsuffixed && unsuffixed.toLowerCase() !== String(name || '').trim().toLowerCase()) {
    const viaBare = findInIndexWithKeys(index, unsuffixed, [teamLookupKeys(unsuffixed)]);
    if (viaBare) return viaBare;
  }

  // "Lekkerkerk 1" → "Lekkerkerk 1 (za)" / "(zo)" na senior-weekend-split.
  const cleaned = String(name || '')
    .replace(/\s*\(za\/zo\s*[—–-]\s*controleer\)\s*$/i, '')
    .trim();
  const bareSenior = stripWeekendSuffix(cleaned);
  if (isBareSeniorClubTeam(bareSenior) || isBareSeniorClubTeam(cleaned)) {
    const base = isBareSeniorClubTeam(cleaned) ? stripWeekendSuffix(cleaned) : bareSenior;
    const labels = [];
    if (opts.date) labels.push(`${base}${seniorWeekendSuffix(opts.date)}`);
    labels.push(`${base} (za)`, `${base} (zo)`, base);
    for (const label of labels) {
      const found = findInIndexWithKeys(index, label, [teamLookupKeys(label)]);
      if (found) return found;
    }
  }
  return null;
}

/** Alle team-ids van dezelfde seniorenploeg (bare + za + zo). */
export function relatedSeniorTeamIds(team, teams) {
  if (!team) return [];
  const bare = stripWeekendSuffix(team.name);
  if (!isBareSeniorClubTeam(bare)) return [team.id];
  return (teams || [])
    .filter((t) => t && stripWeekendSuffix(t.name) === bare)
    .map((t) => t.id);
}

export function addTeamToIndex(index, team) {
  for (const key of teamLookupKeys(team.name)) {
    index.set(key, team);
  }
}
