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

export function toIsoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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
