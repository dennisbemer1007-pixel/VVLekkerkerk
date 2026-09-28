/**
 * Sjabloon voor wedstrijdimport (xlsx), exact de KNVB-kolommen zoals de KNVB-export
 * die aanlevert. Alleen headers, geen data — bedoeld om te downloaden en te vullen.
 */
export const MATCH_TEMPLATE_HEADERS = [
  'Datum',
  'Tijd',
  'Thuis',
  'Uit',
  'Wedstrijdnr.',
  'Type',
  'Spelniveau',
  'Opmerkingen',
];

export function matchTemplateSheets() {
  return [{ name: 'Wedstrijden', headers: MATCH_TEMPLATE_HEADERS, rows: [] }];
}
