import { toIsoDate } from './dates.js';

function asDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Per persoon: aantal diensten, no-shows en laatste dienstdatum in de gegeven diensten. */
export function personShiftRows(services, people = []) {
  const byPerson = new Map();
  for (const service of services || []) {
    const day = asDate(service.date);
    for (const enrollment of service.enrollments || []) {
      const id = Number(enrollment.personId || enrollment.person?.id);
      if (!id) continue;
      const cur = byPerson.get(id) || {
        name: enrollment.person?.name || '',
        shifts: 0,
        noShows: 0,
        last: null,
      };
      cur.shifts += 1;
      if (enrollment.noShow) cur.noShows += 1;
      if (enrollment.person?.name) cur.name = enrollment.person.name;
      if (day && (!cur.last || day > cur.last)) cur.last = day;
      byPerson.set(id, cur);
    }
  }

  const list = (people || []).length
    ? people
    : [...byPerson.entries()].map(([id, row]) => ({ id, name: row.name }));

  return list
    .slice()
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'nl'))
    .map((person) => {
      const row = byPerson.get(person.id) || { shifts: 0, noShows: 0, last: null };
      return [
        person.name || row.name || '',
        row.shifts,
        row.noShows,
        row.last ? toIsoDate(row.last) : '',
      ];
    });
}
