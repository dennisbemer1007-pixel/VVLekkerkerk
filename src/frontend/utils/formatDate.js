import { endOfWeek, startOfWeek, toIsoDate } from '../../backend/lib/dates.js';

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

export function serviceCalendarKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-CA', { timeZone: 'Europe/Amsterdam' });
}

export function serviceStartMinutes(time) {
  const match = String(time || '').match(/(\d{1,2}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
}

export function compareServicesByDateThenTime(a, b) {
  const da = serviceCalendarKey(a?.date).localeCompare(serviceCalendarKey(b?.date));
  if (da) return da;
  return serviceStartMinutes(a?.time) - serviceStartMinutes(b?.time);
}

export function todayInputValue() {
  return toDateInputValue(new Date());
}

/** Standaard einddatum planning: tot 31 december als dat minstens 6 weken is, anders +3 maanden. Afronden op zondag. */
export function defaultPlanningEndInput(now = new Date()) {
  const minEnd = new Date(now);
  minEnd.setDate(minEnd.getDate() + 42);
  const yearEnd = new Date(now.getFullYear(), 11, 31);
  const raw = yearEnd >= minEnd ? yearEnd : (() => {
    const later = new Date(now);
    later.setMonth(later.getMonth() + 3);
    return later;
  })();
  return toIsoDate(endOfWeek(raw));
}

export function defaultPlanningStartInput(now = new Date()) {
  return toIsoDate(startOfWeek(now));
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
