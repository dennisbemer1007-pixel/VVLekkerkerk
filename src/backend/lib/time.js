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

/** Combineer kalenderdatum + "HH:MM" tot Date. */
export function combineDateAndTime(date, timeStr) {
  const mins = parseTimeStartMinutes(timeStr);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  if (mins == null) return d;
  d.setMinutes(mins);
  return d;
}
