import { maskEmail, maskPhone } from './contactMask.js';
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

/** Sjabloon: headers + mockrijen + toegestane waarden. */
export function personTemplateSheets(teams = []) {
  const teamNames = teams.map((t) => t.name).filter(Boolean);
  const t1 = teamNames[0] || 'JO15-1';
  const t2 = teamNames[1] || teamNames[0] || 'JO13-2';
  const t3 = teamNames[2] || teamNames[0] || 'JO11-1';
  const mockRows = [
    ['Anna de Vries', 'anna.mock@example.nl', '0612345678', t1, 'Vrijwilliger', 'FULL', '', 'nee'],
    ['Piet Jansen', 'piet.mock@example.nl', '0698765432', t2, 'Teamcoördinator', 'NONE', '', 'nee'],
    ['Sara Bakker', 'sara.mock@example.nl', '', t1, 'Vrijwilliger', 'VR18', '', 'nee'],
    ['Mark de Boer', 'mark.mock@example.nl', '0611223344', '', 'Barcommissie', 'NONE', '', 'nee'],
    ['Lisa Mock Kind', '', '0611002200', t1, 'Vrijwilliger', 'NONE', 'anna.mock@example.nl', 'nee'],
    ['Jan Vrijgesteld', 'jan.mock@example.nl', '', t3, 'Vrijwilliger', 'FULL', '', 'ja'],
  ];
  return [
    { name: 'Personen', headers: PERSON_TEMPLATE_HEADERS, rows: mockRows },
    choicesSheet(teams),
    {
      name: 'Uitleg',
      headers: ['veld', 'uitleg'],
      rows: [
        ['naam', 'Verplicht. Voor- en achternaam.'],
        ['email', 'Optioneel. Uniek; bestaand adres wordt bijgewerkt.'],
        ['telefoon', 'Optioneel.'],
        [
          'team',
          'Leidend: exacte naam uit Beheer → Teams. “Lekkerkerk JO15-1” in Excel mag matchen op “JO15-1” in de app.',
        ],
        ['rol', 'Vrijwilliger | Teamcoördinator | Barcommissie | Admin'],
        ['verplichting', 'NONE / geen | FULL / verplicht | VR18 / vr18+'],
        ['hoort_bij', 'Optioneel. E-mail of naam van ouder/verantwoordelijke in dit bestand of in de app.'],
        ['vrijgesteld', 'ja of nee'],
      ],
    },
  ];
}

/** Export: zelfde structuur, gevuld met alle personen (her-importeerbaar). */
export function personExportRowsSheets(persons = [], teams = [], { maskContact = false } = {}) {
  const rows = persons.map((p) => [
    p.name || '',
    maskContact ? maskEmail(p.email) : p.email || '',
    maskContact ? maskPhone(p.phone) : p.phone || '',
    p.team?.name || '',
    p.role || '',
    p.obligation || 'NONE',
    maskContact
      ? p.guardian?.name || ''
      : p.guardian?.email || p.guardian?.name || '',
    p.exempted ? 'ja' : 'nee',
  ]);
  return [
    { name: 'Personen', headers: PERSON_TEMPLATE_HEADERS, rows },
    choicesSheet(teams),
  ];
}
