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

export function isBareSeniorClubTeam(name) {
  const n = String(name || '')
    .replace(/\s*\((za|zo)\)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  return SENIOR_BARE_RE.test(n);
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
    const m = base.match(/^(j)?o(\d{1,2}.*)$/);
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

export function findTeamInIndex(index, name) {
  for (const key of teamLookupKeys(name)) {
    const found = index.get(key);
    if (found) return found;
  }
  return null;
}

export function addTeamToIndex(index, team) {
  for (const key of teamLookupKeys(team.name)) {
    index.set(key, team);
  }
}
