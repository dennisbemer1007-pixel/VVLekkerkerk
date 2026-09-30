/** Bardienst-verplichting (los van access-rol). HALF is verwijderd; legacy wordt FULL. */
export const OBLIGATIONS = {
  NONE: 'NONE',
  FULL: 'FULL',
  VR18: 'VR18',
};

export const OBLIGATION_LABELS = {
  NONE: 'Geen (vrijwilliger)',
  FULL: 'Verplicht (min. 1× / 6 weken)',
  VR18: 'VR18+ (min. 1× / 12 weken)',
};

/** Nederlandse / leesbare waarden die in CSV of Excel mogen staan. */
const OBLIGATION_ALIASES = {
  none: OBLIGATIONS.NONE,
  geen: OBLIGATIONS.NONE,
  vrijwillig: OBLIGATIONS.NONE,
  vrijwilliger: OBLIGATIONS.NONE,
  full: OBLIGATIONS.FULL,
  verplicht: OBLIGATIONS.FULL,
  ja: OBLIGATIONS.FULL,
  half: OBLIGATIONS.FULL,
  vr18: OBLIGATIONS.VR18,
  'vr18+': OBLIGATIONS.VR18,
  vr18plus: OBLIGATIONS.VR18,
};

export function normalizeObligation(value, legacyMandatoryBar) {
  if (value === 'HALF') return OBLIGATIONS.FULL;
  if (value === OBLIGATIONS.FULL || value === OBLIGATIONS.NONE || value === OBLIGATIONS.VR18) {
    return value;
  }
  const key = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
  if (key && OBLIGATION_ALIASES[key]) return OBLIGATION_ALIASES[key];
  if (legacyMandatoryBar === true) return OBLIGATIONS.FULL;
  if (legacyMandatoryBar === false) return OBLIGATIONS.NONE;
  return OBLIGATIONS.NONE;
}

export function isMandatoryObligation(obligation) {
  const value = normalizeObligation(obligation);
  return value === OBLIGATIONS.FULL || value === OBLIGATIONS.VR18;
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

export function isPersonalEnrollment(enrollment) {
  if (!enrollment) return false;
  if (enrollment.kind === 'TEAM') return false;
  if (enrollment.noShow) return false;
  return true;
}

export function personalEnrollmentCount(enrollments, from, to) {
  return (enrollments || []).filter((e) => {
    if (!isPersonalEnrollment(e)) return false;
    const d = new Date(e.service?.date ?? e.createdAt);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  }).length;
}

/** Vrijgesteld zonder datum geldt altijd. Met datum alleen t/m die dag. */
export function isExemptedOn(person, date = new Date()) {
  if (!person?.exempted) return false;
  if (!person.exemptedUntil) return true;
  const until = new Date(person.exemptedUntil);
  if (Number.isNaN(until.getTime())) return true;
  const day = new Date(date);
  until.setHours(23, 59, 59, 999);
  day.setHours(12, 0, 0, 0);
  return day.getTime() <= until.getTime();
}

/**
 * Quota: FULL ≥1 in 6 weken; VR18 ≥1 in 12 weken.
 */
export function underQuota(person, count6w, countYear, count12w = count6w) {
  if (isExemptedOn(person)) return false;
  if ((person?.makeupDue ?? 0) > 0) return true;
  const obligation = normalizeObligation(person.obligation);
  if (obligation === OBLIGATIONS.FULL) {
    return (count6w ?? 0) < 1;
  }
  if (obligation === OBLIGATIONS.VR18) {
    return (count12w ?? 0) < 1;
  }
  return false;
}

export function executedCountForObligation(person, counts) {
  const obligation = normalizeObligation(person.obligation);
  if (obligation === OBLIGATIONS.FULL) return counts.count6w ?? 0;
  if (obligation === OBLIGATIONS.VR18) return counts.count12w ?? 0;
  return 0;
}

export function normalObligationRequired(obligation) {
  const value = normalizeObligation(obligation);
  if (value === OBLIGATIONS.FULL || value === OBLIGATIONS.VR18) return 1;
  return 0;
}

/** Nog te plannen: restant normale verplichting + openstaande inhaaldiensten. */
export function remainingObligation(person, executed) {
  if (isExemptedOn(person)) return 0;
  if (!isMandatoryObligation(person?.obligation)) return 0;
  const normal = normalObligationRequired(person.obligation);
  return Math.max(0, normal - (executed ?? 0)) + Math.max(0, person.makeupDue ?? 0);
}

export const POST_MATCH_BUFFER_MINUTES = 120;
