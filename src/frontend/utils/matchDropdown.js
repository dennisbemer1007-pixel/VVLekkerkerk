import { toDateInputValue } from './formatDate.js';

/**
 * Wedstrijden voor «Koppel aan wedstrijd» in Dienst toevoegen.
 * Toont komende wedstrijden (inclusief december) en wedstrijden op de
 * gekozen datum, plus de al gekozen wedstrijd. Niet de eerste 80 van het
 * seizoen: die lijst stopte daardoor in september.
 */
export function matchesForDienstKoppeling(matches, { formDate, selectedId, today } = {}) {
  const list = Array.isArray(matches) ? matches : [];
  const todayKey = toDateInputValue(today || new Date());
  const formKey = formDate ? toDateInputValue(formDate) : '';
  const selected = selectedId != null && selectedId !== '' ? String(selectedId) : '';

  const filtered = list.filter((match) => {
    const day = toDateInputValue(match.date);
    if (selected && String(match.id) === selected) return true;
    if (formKey && day === formKey) return true;
    return Boolean(day) && day >= todayKey;
  });

  return filtered.sort((a, b) => {
    const byDate = toDateInputValue(a.date).localeCompare(toDateInputValue(b.date));
    if (byDate) return byDate;
    const byTime = String(a.time || '').localeCompare(String(b.time || ''));
    if (byTime) return byTime;
    return Number(a.id || 0) - Number(b.id || 0);
  });
}
