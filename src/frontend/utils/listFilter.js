export function includesPerson(name, query) {
  const needle = String(query || '').trim().toLowerCase();
  if (!needle) return true;
  return String(name || '').toLowerCase().includes(needle);
}

export function withinDates(value, from, to) {
  if (!from && !to) return true;
  const day = String(value || '').slice(0, 10);
  if (!day) return false;
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}
