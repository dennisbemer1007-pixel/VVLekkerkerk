/** Scheidsrechterniveau en teamcategorie. Alleen frontend, geen database. */

export const REFEREE_LEVELS = [
  { id: 'pupillen', label: 'Pupillen' },
  { id: 'junioren', label: 'Junioren' },
  { id: 'senioren', label: 'Senioren' },
];

export const ALL_LEVEL_IDS = REFEREE_LEVELS.map((level) => level.id);

/** Zelfde idee als de bestaande planner: spreiding over een rollend venster. */
export const FAIRNESS_WINDOW_DAYS = 42;

/** "Vlak voor of na" de eigen wedstrijd: alleen een kort gat, niet de hele dag. */
export const ADJACENT_MAX_GAP = 45;

const YOUTH_RE = /(?:^|[^A-Za-z0-9])(JO|MO|O)\s*(\d{1,2})(?!\d)/i;

export function levelLabel(id) {
  return REFEREE_LEVELS.find((level) => level.id === id)?.label || '';
}

export function durationForLevel(level) {
  if (level === 'senioren') return 90;
  if (level === 'junioren') return 70;
  return 60;
}

/**
 * JO/MO/O 7–12 → Pupillen, 13–19 → Junioren, senioren en VR → Senioren.
 * O8 telt als eigen categorie (KNVB-onderbouw), naast JO8 en MO8.
 */
export function categoryOfTeam(teamName) {
  const name = String(teamName || '').trim();
  if (!name) return null;
  if (/(?:^|[^A-Za-z0-9])VR(?:\s*\d+)?(?![A-Za-z])/i.test(name)) {
    return { key: 'VR', level: 'senioren', age: null, prefix: 'VR' };
  }
  if (/senior/i.test(name)) return { key: 'Senioren', level: 'senioren', age: null, prefix: 'Senioren' };
  const match = name.match(YOUTH_RE);
  if (!match) return null;
  const prefix = match[1].toUpperCase();
  const age = Number(match[2]);
  if (!Number.isFinite(age) || age < 7 || age > 19) return null;
  return {
    key: `${prefix}${age}`,
    level: age <= 12 ? 'pupillen' : 'junioren',
    age,
    prefix,
  };
}

/** JO/MO/O8–10 standaard uit: daar is vaak geen scheidsrechter nodig. */
export function defaultCategoryNeeded(key) {
  const youth = /^(JO|MO|O)(\d+)$/.exec(String(key || ''));
  if (youth) {
    const age = Number(youth[2]);
    if (age >= 8 && age <= 10) return false;
    return age >= 7 && age <= 19;
  }
  return key === 'Senioren' || key === 'VR';
}

export function categoryNeeded(key, overrides = {}) {
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, key)) return Boolean(overrides[key]);
  return defaultCategoryNeeded(key);
}

export function categorySort(a, b) {
  const rank = (cat) => {
    if (cat.prefix === 'JO') return 0;
    if (cat.prefix === 'MO') return 1;
    if (cat.prefix === 'O') return 2;
    if (cat.key === 'Senioren') return 3;
    return 4;
  };
  const byPrefix = rank(a) - rank(b);
  if (byPrefix) return byPrefix;
  return (a.age || 0) - (b.age || 0);
}
