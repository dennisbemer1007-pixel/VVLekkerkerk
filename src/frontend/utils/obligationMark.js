/** Sterretje = verplicht (FULL). VR18+ krijgt een eigen merkteken, ook als mandatoryBar true is. */
export function obligationMark(person) {
  if (!person) return '';
  if (person.obligation === 'VR18') return ' VR18+';
  if (person.obligation === 'FULL' || person.mandatoryBar) return ' *';
  return '';
}
