import { endOfDay, startOfDay } from './dates.js';

export function queryText(query, key = 'q') {
  return String(query?.[key] || '').trim().toLowerCase();
}

export function includesText(value, needle) {
  if (!needle) return true;
  return String(value || '').toLowerCase().includes(needle);
}

/** Vernauw een bestaand datumbereik met from/to uit de query. */
export function tightenDate(existing, query = {}) {
  const next = existing ? { ...existing } : {};
  if (query.from) {
    const gte = startOfDay(new Date(query.from));
    if (!Number.isNaN(gte.getTime()) && (!next.gte || next.gte < gte)) next.gte = gte;
  }
  if (query.to) {
    const lte = endOfDay(new Date(query.to));
    if (!Number.isNaN(lte.getTime()) && (!next.lte || next.lte > lte)) next.lte = lte;
  }
  return Object.keys(next).length ? next : existing;
}

export function dateInQuery(date, query = {}) {
  if (!query.from && !query.to) return true;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return false;
  if (query.from && d < startOfDay(new Date(query.from))) return false;
  if (query.to && d > endOfDay(new Date(query.to))) return false;
  return true;
}
