import { compactHeader } from './csvMatches.js';
import { normalizeObligation } from './obligation.js';
import { normalizeRole } from './appUrl.js';
import { buildTeamIndex, clubTeamLabel, findTeamInIndex } from './knvbTeams.js';
const HEADER_MAP = {
  naam: 'name',
  name: 'name',
  email: 'email',
  emailadres: 'email',
  mail: 'email',
  telefoon: 'phone',
  phone: 'phone',
  tel: 'phone',
  team: 'team',
  elftal: 'team',
  ploeg: 'team',
  rol: 'role',
  role: 'role',
  verplichting: 'obligation',
  obligation: 'obligation',
  hoort_bij: 'guardian',
  hoortbij: 'guardian',
  guardian: 'guardian',
  vrijgesteld: 'exempted',
  exempted: 'exempted',
};

const EXEMPTED_YES = new Set(['ja', 'yes', 'true', '1', 'waar']);

const MAX_ROWS = 1000;

export const PERSON_IMPORT_COLUMNS = 'naam;email;telefoon;team;rol;verplichting;hoort_bij;vrijgesteld';

/**
 * Voorbeeld-CSV met mockdata.
 * Let op: teamnamen moeten al in Beheer → Teams staan (tenzij je ontbrekende teams aanmaakt).
 * verplichting: NONE | FULL | VR18 (of: geen | verplicht | vr18+)
 * rol: Vrijwilliger | Teamcoördinator | Barcommissie | Admin
 * hoort_bij: e-mail of naam van de ouder/verantwoordelijke (optioneel)
 * vrijgesteld: ja | nee (optioneel)
 */
export const PERSON_IMPORT_EXAMPLE = `${PERSON_IMPORT_COLUMNS}
Anna de Vries;anna.mock@example.nl;0612345678;JO15-1;Vrijwilliger;FULL;;nee
Piet Jansen;piet.mock@example.nl;0698765432;JO13-2;Teamcoördinator;NONE;;nee
Sara Bakker;sara.mock@example.nl;;JO15-1;Vrijwilliger;VR18;;nee
Mark de Boer;mark.mock@example.nl;0611223344;;Barcommissie;geen;;nee
Lisa Mock Kind;;0611002200;JO15-1;Vrijwilliger;geen;anna.mock@example.nl;nee
Jan Vrijgesteld;jan.mock@example.nl;;JO11-1;Vrijwilliger;verplicht;;ja
`;

export function mapPersonHeader(value) {
  return HEADER_MAP[compactHeader(value)] || compactHeader(value);
}

/** Zet xlsx-objecten (kolomkoppen als sleutel) om naar dezelfde rijvorm als CSV. */
export function personRowsFromObjects(objects = []) {
  return objects.map((obj) => {
    const mapped = { __row: obj.__row };
    for (const [key, value] of Object.entries(obj)) {
      if (key === '__row') continue;
      const header = mapPersonHeader(key);
      if (!header) continue;
      mapped[header] = value == null ? '' : String(value).trim();
    }
    return mapped;
  });
}

function splitCsvLine(line, sep) {
  const cols = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === sep && !inQuotes) {
      cols.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  cols.push(cur);
  return cols;
}

export function parsePersonCsv(text) {
  const raw = String(text ?? '').replace(/^\uFEFF/, '');
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim());
  if (lines.length < 2) {
    return { headers: [], rows: [], headerError: 'Geen datarijen (minimaal header + 1 rij)' };
  }
  const sep = lines[0].includes(';') ? ';' : ',';
  const rawHeaders = splitCsvLine(lines[0], sep).map((h) => h.trim().replace(/^"|"$/g, ''));
  const headers = rawHeaders.map(mapPersonHeader);
  if (!headers.includes('name')) {
    return { headers: rawHeaders, rows: [], headerError: 'Kolom "naam" ontbreekt' };
  }
  if (lines.length - 1 > MAX_ROWS) {
    return { headers: rawHeaders, rows: [], headerError: `Te veel rijen (max ${MAX_ROWS})` };
  }
  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = splitCsvLine(lines[i], sep);
    const obj = { __row: i + 1 };
    headers.forEach((h, idx) => {
      if (!h) return;
      obj[h] = (cols[idx] ?? '').trim().replace(/^"|"$/g, '');
    });
    rows.push(obj);
  }
  return { headers: rawHeaders, rows, headerError: null };
}

export function validatePersonRows(parsedRows, { teams = [] } = {}) {
  // App-teams zijn leidend: "Lekkerkerk JO15-1" in Excel mag matchen op "JO15-1" in de app.
  const teamIndex = buildTeamIndex(teams);
  const rows = [];
  const invalidRows = [];
  const unknownTeams = [];

  for (const raw of parsedRows || []) {
    const name = String(raw.name || '').trim();
    if (!name) {
      invalidRows.push({ ...raw, error: 'Naam ontbreekt' });
      continue;
    }
    const email = String(raw.email || '').trim().toLowerCase() || null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      invalidRows.push({ ...raw, error: 'Ongeldig e-mailadres' });
      continue;
    }
    const phone = String(raw.phone || '').trim() || null;
    const teamName = String(raw.team || '').trim();
    let teamId = null;
    let matchedTeamName = null;
    if (teamName) {
      const team = findTeamInIndex(teamIndex, teamName);
      if (!team) {
        unknownTeams.push(teamName);
        invalidRows.push({
          ...raw,
          error: `Onbekend team: ${teamName} (gebruik exact de teamnaam uit de app, of zonder clubprefix)`,
        });
        continue;
      }
      teamId = team.id;
      matchedTeamName = team.name;
    }
    const exemptedRaw = String(raw.exempted ?? '').trim().toLowerCase();
    const guardianRef = String(raw.guardian ?? '').trim() || null;
    rows.push({
      name,
      email,
      phone,
      teamName: matchedTeamName || teamName || null,
      teamId,
      role: normalizeRole(raw.role, 'Vrijwilliger'),
      obligation: normalizeObligation(raw.obligation),
      guardianRef,
      exempted: exemptedRaw ? EXEMPTED_YES.has(exemptedRaw) : undefined,
    });
  }

  return {
    ok: invalidRows.length === 0,
    rows,
    invalidRows,
    unknownTeams: [...new Set(unknownTeams)],
  };
}

/** Normaliseer een teamnaam uit Excel naar de app-vorm vóór aanmaken. */
export function normalizeImportedTeamName(name) {
  return clubTeamLabel(name);
}
