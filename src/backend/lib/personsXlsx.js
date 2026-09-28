import { OBLIGATION_LABELS } from './obligation.js';

/**
 * Kolommen voor het personen-import/exportsjabloon (xlsx).
 * "hoort_bij" verwijst naar het e-mailadres van de "hoort bij"-persoon
 * (voor kinderen/personen zonder eigen account die aan een ouder hangen).
 */
export const PERSON_TEMPLATE_HEADERS = [
  'naam',
  'email',
  'telefoon',
  'team',
  'rol',
  'verplichting',
  'hoort_bij',
  'vrijgesteld',
];

export const PERSON_ROLE_CHOICES = ['Vrijwilliger', 'Teamcoördinator', 'Barcommissie', 'Admin'];

export const PERSON_OBLIGATION_CHOICES = Object.entries(OBLIGATION_LABELS).map(([value, label]) => ({
  value,
  label,
}));

function choicesSheet(teams = []) {
  const rows = [];
  const maxLen = Math.max(
    PERSON_ROLE_CHOICES.length,
    PERSON_OBLIGATION_CHOICES.length,
    teams.length,
    2,
  );
  for (let i = 0; i < maxLen; i += 1) {
    rows.push([
      PERSON_ROLE_CHOICES[i] ?? '',
      PERSON_OBLIGATION_CHOICES[i]?.value ?? '',
      teams[i]?.name ?? '',
      i === 0 ? 'ja' : i === 1 ? 'nee' : '',
    ]);
  }
  return {
    name: 'Toegestane waarden',
    headers: ['rol', 'verplichting', 'team', 'vrijgesteld'],
    rows,
  };
}

/** Sjabloon: alleen headers + toegestane waarden, geen data. */
export function personTemplateSheets(teams = []) {
  return [
    { name: 'Personen', headers: PERSON_TEMPLATE_HEADERS, rows: [] },
    choicesSheet(teams),
  ];
}

/** Export: zelfde structuur, gevuld met alle personen (her-importeerbaar). */
export function personExportRowsSheets(persons = [], teams = []) {
  const rows = persons.map((p) => [
    p.name || '',
    p.email || '',
    p.phone || '',
    p.team?.name || '',
    p.role || '',
    p.obligation || 'NONE',
    p.guardian?.email || p.guardian?.name || '',
    p.exempted ? 'ja' : 'nee',
  ]);
  return [
    { name: 'Personen', headers: PERSON_TEMPLATE_HEADERS, rows },
    choicesSheet(teams),
  ];
}
