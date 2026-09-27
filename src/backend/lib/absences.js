import { endOfDay, startOfDay } from './dates.js';

/** True als de dienstdatum binnen een afwezigheidsperiode valt. */
export function isAbsentOn(absences, date) {
  if (!absences?.length || !date) return false;
  const day = startOfDay(date);
  return absences.some((a) => {
    const from = startOfDay(a.fromDate ?? a.from);
    const to = endOfDay(a.toDate ?? a.to);
    return day >= from && day <= to;
  });
}

export function normalizeAbsenceRange({ fromDate, toDate }) {
  if (!fromDate || !toDate) {
    const err = new Error('Begin- en einddatum zijn verplicht');
    err.status = 400;
    throw err;
  }
  const from = startOfDay(new Date(fromDate));
  const to = endOfDay(new Date(toDate));
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    const err = new Error('Ongeldige datum');
    err.status = 400;
    throw err;
  }
  if (from > to) {
    const err = new Error('Einddatum moet op of na de begindatum liggen');
    err.status = 400;
    throw err;
  }
  return { fromDate: from, toDate: to };
}
