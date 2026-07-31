/** Bardienst-verplichting (los van access-rol). */
export const OBLIGATIONS = {
  NONE: 'NONE',
  FULL: 'FULL',
  HALF: 'HALF',
};

export const OBLIGATION_LABELS = {
  NONE: 'Geen (vrijwilliger)',
  FULL: 'Verplicht (min. 1× / 6 weken)',
  HALF: 'Half verplicht (min. 3× / jaar)',
};

export function normalizeObligation(value, legacyMandatoryBar) {
  if (value === OBLIGATIONS.FULL || value === OBLIGATIONS.HALF || value === OBLIGATIONS.NONE) {
    return value;
  }
  if (legacyMandatoryBar === true) return OBLIGATIONS.FULL;
  if (legacyMandatoryBar === false) return OBLIGATIONS.NONE;
  return OBLIGATIONS.NONE;
}

export function isMandatoryObligation(obligation) {
  return obligation === OBLIGATIONS.FULL || obligation === OBLIGATIONS.HALF;
}

export function parseJsonArray(raw, allowed = null) {
  try {
    const parsed = JSON.parse(raw || '[]');
    if (!Array.isArray(parsed)) return [];
    const cleaned = parsed.map(String).filter(Boolean);
    if (!allowed) return cleaned;
    return cleaned.filter((v) => allowed.includes(v));
  } catch {
    return [];
  }
}

export function serializeJsonArray(value) {
  if (!Array.isArray(value)) return '[]';
  return JSON.stringify(value.map(String));
}

const WEEKDAY_ALLOWED = ['0', '1', '2', '3', '4', '5', '6'];
const SLOT_ALLOWED = ['MORNING', 'AFTERNOON', 'EVENING'];

export function parseUnavailableWeekdays(raw) {
  return parseJsonArray(raw, WEEKDAY_ALLOWED).map(Number);
}

export function parsePreferredSlots(raw) {
  return parseJsonArray(raw, SLOT_ALLOWED);
}

/** Weekdag van service-datum (0=zo … 6=za). */
export function serviceWeekday(date) {
  return new Date(date).getDay();
}

export function isUnavailableOn(person, date) {
  const days = parseUnavailableWeekdays(person.unavailableWeekdays);
  return days.includes(serviceWeekday(date));
}

export function prefersSlot(person, slot) {
  const prefs = parsePreferredSlots(person.preferredSlots);
  if (!prefs.length || !slot || slot === 'EXTRA') return true;
  return prefs.includes(slot);
}

/**
 * Quota: FULL ≥1 in laatste 6 weken; HALF ≥3 in kalenderjaar.
 * countsByPersonId = aantal BAR-inschrijvingen in relevant venster.
 */
export function underQuota(person, barCountLast6Weeks, barCountThisYear) {
  if (person.obligation === OBLIGATIONS.FULL) {
    return (barCountLast6Weeks ?? 0) < 1;
  }
  if (person.obligation === OBLIGATIONS.HALF) {
    return (barCountThisYear ?? 0) < 3;
  }
  return false;
}

export const POST_MATCH_BUFFER_MINUTES = 120;
