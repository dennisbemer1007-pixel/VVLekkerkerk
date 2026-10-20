/** Zelf ingeschreven: geen VR18+/sterretje achter de naam. */
export function isSelfEnrollment(enrollment) {
  if (!enrollment) return false;
  if (enrollment.kind === 'TEAM') return false;
  if (enrollment.source === 'TEAM') return false;
  if (enrollment.source === 'SELF') return true;
  return /^Zelf ingeschreven$/i.test(String(enrollment.reason || '').trim());
}

/** Sterretje = verplicht (FULL). VR18+ krijgt een eigen merkteken, ook als mandatoryBar true is. */
export function obligationMark(person, enrollment = null) {
  if (!person) return '';
  if (isSelfEnrollment(enrollment)) return '';
  if (person.obligation === 'VR18') return ' VR18+';
  if (person.obligation === 'FULL' || person.mandatoryBar) return ' *';
  return '';
}
