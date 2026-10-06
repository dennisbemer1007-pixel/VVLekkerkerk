export function occupancyStatus(enrolled, required) {
  if (enrolled >= required) return 'full';
  if (enrolled === required - 1) return 'almost';
  return 'open';
}

export function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function startOfWeek(d = new Date()) {
  const x = startOfDay(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}

export function endOfWeek(d = new Date()) {
  const x = startOfWeek(d);
  x.setDate(x.getDate() + 6);
  return endOfDay(x);
}

export function addWeeks(d, weeks) {
  const x = new Date(d);
  x.setDate(x.getDate() + weeks * 7);
  return x;
}

/**
 * Kalenderdag als YYYY-MM-DD. ISO-strings (ook zondag 23:59Z) houden de UTC-dag,
 * zodat Amsterdam niet naar de volgende maandag springt.
 */
export function toIsoDate(d) {
  if (d == null || d === '') return '';
  if (typeof d === 'string') {
    const m = d.trim().match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
  }
  const x = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(x.getTime())) return '';
  const y = x.getUTCFullYear();
  const m = String(x.getUTCMonth() + 1).padStart(2, '0');
  const day = String(x.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** YYYY-MM-DD of Date → 12:00 UTC die kalenderdag (geen timezone-verschuiving). */
export function parseCalendarDate(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 12, 0, 0, 0));
  }
  const s = String(value).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0));
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return parseCalendarDate(d);
}

export function startOfWeekUtc(d = new Date()) {
  const noon = parseCalendarDate(d);
  if (!noon) return startOfWeek(d);
  const day = noon.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  const x = new Date(noon.getTime());
  x.setUTCDate(x.getUTCDate() + diff);
  return parseCalendarDate(x);
}

export function sundayUtcNoon(d = new Date()) {
  const monday = startOfWeekUtc(d);
  const x = new Date(monday.getTime());
  x.setUTCDate(x.getUTCDate() + 6);
  return parseCalendarDate(x);
}

/** Eind van de planning: altijd zondag. Een maandag als t/m wordt de zondag ervoor. */
export function planningEndSunday(d) {
  const noon = parseCalendarDate(d);
  if (!noon) return null;
  if (noon.getUTCDay() === 1) {
    const prev = new Date(noon.getTime());
    prev.setUTCDate(prev.getUTCDate() - 1);
    return sundayUtcNoon(prev);
  }
  return sundayUtcNoon(noon);
}

export function utcDayStart(d) {
  const noon = parseCalendarDate(d);
  if (!noon) return startOfDay(d);
  return new Date(Date.UTC(noon.getUTCFullYear(), noon.getUTCMonth(), noon.getUTCDate(), 0, 0, 0, 0));
}

export function utcDayEnd(d) {
  const noon = parseCalendarDate(d);
  if (!noon) return endOfDay(d);
  return new Date(Date.UTC(noon.getUTCFullYear(), noon.getUTCMonth(), noon.getUTCDate(), 23, 59, 59, 999));
}

/** Kalenderdag in Amsterdam, zodat 23:00 UTC en 00:00 UTC dezelfde clubdag kunnen zijn. */
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
