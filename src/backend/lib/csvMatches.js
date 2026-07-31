/**
 * Strikte CSV-validatie voor wedstrijdimport (KNVB / handmatig).
 * Alleen volledig geldige rijen mogen de database in.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_OPPONENT = 120;
const MAX_TEAM = 80;
const MAX_NOTE = 200;
const MAX_ROWS = 2000;

const HOME_TRUE = new Set(['1', 'true', 'ja', 'thuis', 'home', 'j', 'y']);
const HOME_FALSE = new Set(['0', 'false', 'nee', 'uit', 'away', 'n']);

export function parseCsv(text) {
  let raw = String(text ?? '').replace(/^\uFEFF/, '');
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim());

  if (lines.length < 2) {
    return { headers: [], rows: [], headerError: 'Geen datarijen (minimaal header + 1 rij)' };
  }

  const sep = lines[0].includes(';') ? ';' : ',';
  const headers = lines[0].split(sep).map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ''));

  if (!headers.some((h) => ['date', 'datum'].includes(h))) {
    return {
      headers,
      rows: [],
      headerError:
        'Verplichte kolom ontbreekt: date of datum. Verwacht bijv. date;home;opponent;team',
    };
  }

  if (lines.length - 1 > MAX_ROWS) {
    return {
      headers,
      rows: [],
      headerError: `Te veel rijen (max ${MAX_ROWS}). Splits het bestand.`,
    };
  }

  const rows = [];
  for (let index = 0; index < lines.length - 1; index += 1) {
    const line = lines[index + 1];
    if (!line.trim()) continue;
    const cols = splitCsvLine(line, sep);
    const obj = { __row: index + 2 };
    headers.forEach((h, i) => {
      obj[h] = (cols[i] ?? '').trim().replace(/^"|"$/g, '');
    });
    rows.push(normalizeRow(obj));
  }

  return { headers, rows, headerError: null };
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

function normalizeRow(row) {
  return {
    __row: row.__row,
    date: String(row.date || row.datum || '').trim(),
    home: row.home ?? row.thuis ?? '',
    opponent: String(row.opponent || row.tegenstander || '').trim(),
    team: String(row.team || row.ploeg || row.elftal || '').trim(),
    note: String(row.note || row.opmerking || '').trim(),
  };
}

/** Alleen YYYY-MM-DD, en een echte kalenderdatum. */
export function parseStrictDate(value) {
  const s = String(value || '').trim();
  if (!DATE_RE.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    return null;
  }
  return dt;
}

export function parseHome(value) {
  if (value === undefined || value === null || String(value).trim() === '') return true;
  const v = String(value).trim().toLowerCase();
  if (HOME_FALSE.has(v)) return false;
  if (HOME_TRUE.has(v)) return true;
  return null;
}

function validateOneRow(row) {
  const line = row.__row ?? '?';
  const rowErrors = [];

  const date = parseStrictDate(row.date);
  if (!row.date) {
    rowErrors.push({ row: line, field: 'date', message: 'Datum ontbreekt (verplicht: YYYY-MM-DD)' });
  } else if (!date) {
    rowErrors.push({
      row: line,
      field: 'date',
      message: `Ongeldige datum: "${row.date}" (alleen YYYY-MM-DD, bijv. 2026-08-29)`,
    });
  }

  const home = parseHome(row.home);
  if (home === null) {
    rowErrors.push({
      row: line,
      field: 'home',
      message: `Thuis/uit ongeldig: "${row.home}" (gebruik true/false, ja/nee, thuis/uit)`,
    });
  }

  if (row.opponent.length > MAX_OPPONENT) {
    rowErrors.push({
      row: line,
      field: 'opponent',
      message: `Tegenstander te lang (max ${MAX_OPPONENT})`,
    });
  }

  if (row.team.length > MAX_TEAM) {
    rowErrors.push({
      row: line,
      field: 'team',
      message: `Teamnaam te lang (max ${MAX_TEAM})`,
    });
  }

  if (row.note.length > MAX_NOTE) {
    rowErrors.push({
      row: line,
      field: 'note',
      message: `Opmerking te lang (max ${MAX_NOTE})`,
    });
  }

  // Geen verdachte control characters in tekstvelden
  for (const field of ['opponent', 'team', 'note']) {
    if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(row[field] || '')) {
      rowErrors.push({
        row: line,
        field,
        message: `Ongeldige tekens in ${field}`,
      });
    }
  }

  return { date, home, rowErrors };
}

/**
 * @returns {{
 *   ok: boolean,
 *   errors: object[],
 *   rows: object[],
 *   invalidRows: object[],
 *   headerError?: string|null
 * }}
 */
export function validateMatchRows(rows, options = {}) {
  const errors = [];
  const validRows = [];
  const invalidRows = [];

  if (options.headerError) {
    return {
      ok: false,
      errors: [{ row: 0, field: 'csv', message: options.headerError }],
      rows: [],
      invalidRows: [],
      headerError: options.headerError,
    };
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    return {
      ok: false,
      errors: [{ row: 0, field: 'csv', message: 'Geen datarijen (minimaal header + 1 rij)' }],
      rows: [],
      invalidRows: [],
      headerError: 'Geen datarijen (minimaal header + 1 rij)',
    };
  }

  for (const row of rows) {
    const line = row.__row ?? '?';
    const normalized = {
      __row: line,
      date: String(row.date || '').trim(),
      home: row.home ?? '',
      opponent: String(row.opponent || '').trim(),
      team: String(row.team || '').trim(),
      note: String(row.note || '').trim(),
    };

    const { date, home, rowErrors } = validateOneRow(normalized);

    if (rowErrors.length) {
      errors.push(...rowErrors);
      invalidRows.push({
        ...normalized,
        home:
          normalized.home === '' || normalized.home === undefined
            ? 'true'
            : String(normalized.home),
        errors: rowErrors,
      });
    } else {
      validRows.push({
        date: normalized.date,
        home,
        opponent: normalized.opponent || null,
        team: normalized.team || null,
        note: normalized.note || null,
        __row: line,
      });
    }
  }

  return {
    ok: errors.length === 0 && validRows.length > 0,
    errors,
    rows: validRows,
    invalidRows,
    headerError: null,
  };
}

export function csvToRows(csvText) {
  const parsed = parseCsv(csvText);
  return parsed;
}

/** Valideer één handmatig gecorrigeerde rij (voor grid). */
export function validateSingleMatchInput(input) {
  const row = {
    __row: input.__row ?? 1,
    date: input.date,
    home: input.home,
    opponent: input.opponent,
    team: input.team,
    note: input.note,
  };
  return validateMatchRows([row]);
}
