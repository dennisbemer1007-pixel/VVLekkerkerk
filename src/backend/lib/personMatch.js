/** Vergelijk namen zonder hoofdletters, accenten of dubbele spaties. */
export function normalizePersonName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Ouder die de coördinator alleen op naam heeft gezet: geen login, geen e-mail. */
export function isNamelessRosterPerson(person) {
  if (!person) return false;
  return !String(person.email || '').trim() && !person.passwordHash;
}
