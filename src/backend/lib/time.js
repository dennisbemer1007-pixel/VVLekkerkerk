/** Parse "09:00 - 13:00" of "09:00" → minuten sinds middernacht, of null. */
export function parseTimeStartMinutes(timeStr) {
  if (!timeStr) return null;
  const m = String(timeStr).match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function addMinutesToDate(date, minutes) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() + minutes);
  return d;
}

export function formatHm(totalMinutes) {
  const clamped = Math.max(0, Number(totalMinutes) || 0);
  const normalized = clamped % (24 * 60);
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Eindtijd van "09:00 - 12:00". 00:00 na een latere start = volgende dag. */
export function parseTimeEndMinutes(timeStr) {
  const parts = String(timeStr || '').split(/\s*[-–]\s*/);
  if (parts.length < 2) return parseTimeStartMinutes(timeStr);
  const start = parseTimeStartMinutes(parts[0]);
  const end = parseTimeStartMinutes(parts[1]);
  if (end == null) return start;
  if (start != null && end <= start) return end + 24 * 60;
  return end;
}

/** Combineer kalenderdatum + "HH:MM" tot Date. */
export function combineDateAndTime(date, timeStr) {
  const mins = parseTimeStartMinutes(timeStr);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  if (mins == null) return d;
  d.setMinutes(mins);
  return d;
}

export function serviceDateRange(service) {
  const from = combineDateAndTime(service.date, service.time);
  const endMins = parseTimeEndMinutes(service.time);
  const to = new Date(from);
  to.setHours(0, 0, 0, 0);
  if (endMins == null) {
    to.setTime(from.getTime());
  } else {
    to.setMinutes(endMins);
  }
  return { from, to };
}

export function rangesOverlap(a, b) {
  return a.from < b.to && b.from < a.to;
}
