import { compactHeader } from './csvMatches.js';
import { normalizeObligation } from './obligation.js';
import { normalizeRole } from './appUrl.js';

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
};

const MAX_ROWS = 1000;

export const PERSON_IMPORT_COLUMNS = 'naam;email;telefoon;team;rol;verplichting';

export const PERSON_IMPORT_EXAMPLE = `${PERSON_IMPORT_COLUMNS}
Anna de Vries;anna@example.nl;0612345678;JO15-1;Vrijwilliger;verplicht
Piet Jansen;piet@example.nl;;JO13-2;Teamcoördinator;geen
`;

export function mapPersonHeader(value) {
  return HEADER_MAP[compactHeader(value)] || compactHeader(value);
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
  const teamByKey = new Map(teams.map((t) => [compactHeader(t.name), t]));
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
    if (teamName) {
      const team = teamByKey.get(compactHeader(teamName));
      if (!team) {
        unknownTeams.push(teamName);
        invalidRows.push({ ...raw, error: `Onbekend team: ${teamName}` });
        continue;
      }
      teamId = team.id;
    }
    rows.push({
      name,
      email,
      phone,
      teamName: teamName || null,
      teamId,
      role: normalizeRole(raw.role, 'Vrijwilliger'),
      obligation: normalizeObligation(raw.obligation),
    });
  }

  return {
    ok: invalidRows.length === 0,
    rows,
    invalidRows,
    unknownTeams: [...new Set(unknownTeams)],
  };
}
