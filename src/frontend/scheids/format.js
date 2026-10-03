export function formatSlotDate(date) {
  const [year, month, day] = String(date || '').split('-').map(Number);
  if (!year || !month || !day) return date || '';
  return new Date(year, month - 1, day).toLocaleDateString('nl-NL', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}
