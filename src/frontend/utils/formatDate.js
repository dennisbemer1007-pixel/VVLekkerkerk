export const SERVICE_TYPE_LABEL = {
  BAR: 'Bardienst',
  KITCHEN: 'Keukendienst',
};

export function formatServiceDate(date) {
  return new Date(date).toLocaleDateString('nl-NL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function toDateInputValue(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayInputValue() {
  return toDateInputValue(new Date());
}

/** Standaard einddatum planning: tot 31 december als dat minstens 6 weken is, anders +3 maanden. */
export function defaultPlanningEndInput(now = new Date()) {
  const minEnd = new Date(now);
  minEnd.setDate(minEnd.getDate() + 42);
  const yearEnd = new Date(now.getFullYear(), 11, 31);
  if (yearEnd >= minEnd) return toDateInputValue(yearEnd);
  const later = new Date(now);
  later.setMonth(later.getMonth() + 3);
  return toDateInputValue(later);
}

export function formatMatchDate(date) {
  return new Date(date).toLocaleDateString('nl-NL', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function isFutureMatchDate(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d >= today;
}

export function occupancyStatus(enrolled, required) {
  if (enrolled >= required) return 'full';
  if (enrolled === required - 1) return 'almost';
  return 'open';
}

export function statusStyles(status) {
  if (status === 'full') return 'bg-emerald-100 text-emerald-900 border-emerald-400';
  if (status === 'almost') return 'bg-amber-100 text-amber-900 border-amber-400';
  return 'bg-red-100 text-red-900 border-red-400';
}

export function statusLabel(status) {
  if (status === 'full') return 'Vol';
  if (status === 'almost') return 'Nog 1 nodig';
  return 'Open';
}
