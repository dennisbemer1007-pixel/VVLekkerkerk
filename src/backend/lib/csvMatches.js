/**
 * CSV/XLSX-validatie voor wedstrijdimport (KNVB-export en legacy).
 * Alleen volledig geldige rijen mogen de database in.
 */
import { deriveClubSides } from './knvbTeams.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_OPPONENT = 160;
const MAX_TEAM = 80;
const MAX_NOTE = 200;
const MAX_MATCH_NUMBER = 32;
const MAX_MATCH_TYPE = 160;
const MAX_PLAY_LEVEL = 80;
const MAX_ROWS = 2000;

const HOME_TRUE = new Set(['1', 'true', 'ja', 'thuis', 'home', 'j', 'y']);
const HOME_FALSE = new Set(['0', 'false', 'nee', 'uit', 'away', 'n']);

const HEADER_ALIASES = {
  date: 'date',
  datum: 'date',
  time: 'time',
  tijd: 'time',
  aanvang: 'time',
  aanvangstijd: 'time',
  home: 'home',
  thuis: 'thuis',
  hometeam: 'thuis',
  uit: 'uit',
  awayteam: 'uit',
  away: 'uit',
  opponent: 'opponent',
  tegenstander: 'opponent',
  team: 'team',
  ploeg: 'team',
  elftal: 'team',
  note: 'note',
  opmerking: 'note',
  opmerkingen: 'note',
  wedstrijdnr: 'matchNumber',
  wedstrijdnummer: 'matchNumber',
  matchnumber: 'matchNumber',
  matchnr: 'matchNumber',
  type: 'matchType',
  wedstrijdtype: 'matchType',
  spelniveau: 'playLevel',
  niveau: 'playLevel',
  playlevel: 'playLevel',
};

export function compactHeader(value) {
  return String(value || '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/^"|"$/g, '')
    .replace(/\.+$/, '')
    .replace(/\s+/g, '');
}

export function canonicalHeader(value) {
  const compact = compactHeader(value);
  return HEADER_ALIASES[compact] || compact;
}

function detectSep(headerLine) {
  return headerLine.includes(';') ? ';' : ',';
}

export function parseCsv(text) {
  let raw = String(text ?? '').replace(/^\uFEFF/, '');
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim());

  if (lines.length < 2) {
    return { headers: [], rows: [], headerError: 'Geen datarijen (minimaal header + 1 rij)' };
  }

  const sep = detectSep(lines[0]);
  const rawHeaders = splitCsvLine(lines[0], sep).map((h) => h.trim().replace(/^"|"$/g, ''));
  const headers = rawHeaders.map(canonicalHeader);
  const format = detectFormat(headers);
  const headerError = headerErrorFor(headers, format);

  if (headerError) {
    return { headers: rawHeaders, rows: [], headerError, format };
  }

  if (lines.length - 1 > MAX_ROWS) {
    return {
      headers: rawHeaders,
      rows: [],
      headerError: `Te veel rijen (max ${MAX_ROWS}). Splits het bestand.`,
      format,
    };
  }

  const rows = [];
  for (let index = 0; index < lines.length - 1; index += 1) {
    const line = lines[index + 1];
    if (!line.trim()) continue;
    const cols = splitCsvLine(line, sep);
    const obj = { __row: index + 2 };
    headers.forEach((h, i) => {
      if (!h) return;
      obj[h] = (cols[i] ?? '').trim().replace(/^"|"$/g, '');
    });
    rows.push(normalizeRow(obj, format));
  }

  return { headers: rawHeaders, rows, headerError: null, format };
}

export function objectsToMatchRows(objects, formatHint) {
  if (!Array.isArray(objects) || objects.length === 0) {
    return { headers: [], rows: [], headerError: 'Geen datarijen (minimaal header + 1 rij)', format: formatHint || 'legacy' };
  }
  if (objects.length > MAX_ROWS) {
    return {
      headers: [],
      rows: [],
      headerError: `Te veel rijen (max ${MAX_ROWS}). Splits het bestand.`,
      format: formatHint || 'legacy',
    };
  }

  const firstKeys = Object.keys(objects[0] || {}).filter((k) => k !== '__row');
  const headers = firstKeys.map(canonicalHeader);
  const format = formatHint || detectFormat(headers);
  const headerError = headerErrorFor(headers, format);
  if (headerError) {
    return { headers: firstKeys, rows: [], headerError, format };
  }

  const rows = objects.map((raw, i) => {
    const obj = { __row: raw.__row ?? i + 2 };
    for (const [key, value] of Object.entries(raw || {})) {
      if (key === '__row') continue;
      const canon = canonicalHeader(key);
      if (!canon) continue;
      obj[canon] = value == null ? '' : String(value).trim();
    }
    return normalizeRow(obj, format);
  });

  return { headers: firstKeys, rows, headerError: null, format };
}

function detectFormat(headers) {
  const set = new Set(headers);
  if (set.has('thuis') && set.has('uit')) return 'knvb';
  return 'legacy';
}

function headerErrorFor(headers, format) {
  const set = new Set(headers);
  if (format === 'knvb') {
    if (!set.has('date')) {
      return 'Verplichte kolom ontbreekt: Datum. Verwacht Datum; Tijd; Thuis; Uit; Wedstrijdnr.; Type; Spelniveau; Opmerkingen';
    }
    return null;
  }
  if (!set.has('date')) {
    return 'Verplichte kolom ontbreekt: date of datum. Verwacht KNVB-kolommen (Datum; Thuis; Uit) of date;home;opponent;team';
  }
  return null;
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

function emptyRow(rowNum) {
  return {
    __row: rowNum,
    format: 'legacy',
    date: '',
    time: '',
    home: '',
    opponent: '',
    team: '',
    note: '',
    matchNumber: '',
    matchType: '',
    playLevel: '',
    homeTeam: '',
    awayTeam: '',
  };
}

function normalizeRow(row, format) {
  const base = emptyRow(row.__row);
  const detected = format || (row.thuis != null && row.uit != null ? 'knvb' : 'legacy');
  const dateRaw = row.date ?? '';
  const timeRaw = row.time ?? '';
  const { date, time } = splitDateAndTime(dateRaw, timeRaw);

  if (detected === 'knvb') {
    const homeTeam = String(row.thuis ?? row.homeTeam ?? '').trim();
    const awayTeam = String(row.uit ?? row.awayTeam ?? '').trim();
    const sides = deriveClubSides(homeTeam, awayTeam);
    return {
      ...base,
      format: 'knvb',
      date,
      time: time || '',
      home: sides ? (sides.home ? 'true' : 'false') : '',
      opponent: sides?.opponent || '',
      team: sides?.team || '',
      note: String(row.note || '').trim(),
      matchNumber: String(row.matchNumber || '').trim(),
      matchType: String(row.matchType || '').trim(),
      playLevel: String(row.playLevel || '').trim(),
      homeTeam,
      awayTeam,
    };
  }

  return {
    ...base,
    format: 'legacy',
    date,
    time: time || '',
    home: row.home ?? '',
    opponent: String(row.opponent || '').trim(),
    team: String(row.team || '').trim(),
    note: String(row.note || '').trim(),
    matchNumber: String(row.matchNumber || '').trim(),
    matchType: String(row.matchType || '').trim(),
    playLevel: String(row.playLevel || '').trim(),
    homeTeam: '',
    awayTeam: '',
  };
}

/** Excel-seriële datum (bijv. 46270) of breuk met tijd. */
export function excelSerialToIso(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 20000 || n > 80000) return null;
  const whole = Math.floor(n);
  const frac = n - whole;
  const d = new Date(Date.UTC(1899, 11, 30) + whole * 86400000);
  const iso = d.toISOString().slice(0, 10);
  let time = '';
  if (frac > 0.000001) {
    const total = Math.round(frac * 24 * 60);
    const h = Math.floor(total / 60) % 24;
    const m = total % 60;
    time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  return { date: iso, time };
}

export function parseFlexibleTime(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  const hm = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (hm) {
    const h = Number(hm[1]);
    const m = Number(hm[2]);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
    return null;
  }
  const n = Number(s.replace(',', '.'));
  if (Number.isFinite(n) && n >= 0 && n < 1) {
    const total = Math.round(n * 24 * 60);
    const h = Math.floor(total / 60) % 24;
    const min = total % 60;
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  }
  return null;
}

export function parseFlexibleDate(value) {
  const s = String(value || '').trim();
  if (!s) return null;

  const serial = excelSerialToIso(s);
  if (serial && DATE_RE.test(serial.date)) {
    return parseStrictDate(serial.date);
  }

  const isoSlice = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoSlice) return parseStrictDate(isoSlice[1]);

  const dmy = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (dmy) {
    const iso = `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
    return parseStrictDate(iso);
  }

  return null;
}

function splitDateAndTime(dateRaw, timeRaw) {
  let date = String(dateRaw || '').trim();
  let time = String(timeRaw || '').trim();

  const serial = excelSerialToIso(date);
  if (serial) {
    date = serial.date;
    if (!time && serial.time) time = serial.time;
  } else {
    const dmy = date.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    if (dmy) {
      date = `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
    } else {
      const iso = date.match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{1,2}:\d{2}))?/);
      if (iso) {
        date = iso[1];
        if (!time && iso[2]) time = iso[2];
      }
    }
  }

  const parsedTime = parseFlexibleTime(time);
  return { date, time: parsedTime == null ? time : parsedTime };
}

/** Alleen YYYY-MM-DD, en een echte kalenderdatum. */
export function parseStrictDate(value) {
  const s = String(value || '').trim();
  if (!DATE_RE.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
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

function tooLong(value, max) {
  return String(value || '').length > max;
}

function hasControlChars(value) {
  return /[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(value || '');
}

function validateOneRow(row) {
  const line = row.__row ?? '?';
  const rowErrors = [];
  const isKnvb = row.format === 'knvb';

  const date = parseFlexibleDate(row.date) || parseStrictDate(row.date);
  const isoDate = date
    ? `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
    : '';

  if (!row.date) {
    rowErrors.push({ row: line, field: 'date', message: 'Datum ontbreekt (verplicht)' });
  } else if (!date) {
    rowErrors.push({
      row: line,
      field: 'date',
      message: `Ongeldige datum: "${row.date}" (gebruik YYYY-MM-DD of DD-MM-YYYY)`,
    });
  }

  const timeParsed = parseFlexibleTime(row.time);
  if (row.time && timeParsed == null) {
    rowErrors.push({
      row: line,
      field: 'time',
      message: `Ongeldige tijd: "${row.time}" (gebruik HH:MM, bijv. 08:30)`,
    });
  }

  let home;
  if (isKnvb) {
    if (!row.homeTeam && !row.awayTeam) {
      rowErrors.push({
        row: line,
        field: 'thuis',
        message: 'Thuis- en uitploeg ontbreken',
      });
    } else if (!row.team) {
      rowErrors.push({
        row: line,
        field: 'team',
        message: `Geen Lekkerkerk-team in Thuis/Uit ("${row.homeTeam}" vs "${row.awayTeam}")`,
      });
    }
    home = row.home === 'false' ? false : true;
    if (!row.homeTeam) {
      rowErrors.push({ row: line, field: 'thuis', message: 'Kolom Thuis is verplicht' });
    }
    if (!row.awayTeam) {
      rowErrors.push({ row: line, field: 'uit', message: 'Kolom Uit is verplicht' });
    }
  } else {
    home = parseHome(row.home);
    if (home === null) {
      rowErrors.push({
        row: line,
        field: 'home',
        message: `Thuis/uit ongeldig: "${row.home}" (gebruik true/false, ja/nee, thuis/uit)`,
      });
    }
  }

  if (tooLong(row.opponent, MAX_OPPONENT)) {
    rowErrors.push({
      row: line,
      field: 'opponent',
      message: `Tegenstander te lang (max ${MAX_OPPONENT})`,
    });
  }
  if (tooLong(row.team, MAX_TEAM)) {
    rowErrors.push({
      row: line,
      field: 'team',
      message: `Teamnaam te lang (max ${MAX_TEAM})`,
    });
  }
  if (tooLong(row.note, MAX_NOTE)) {
    rowErrors.push({
      row: line,
      field: 'note',
      message: `Opmerking te lang (max ${MAX_NOTE})`,
    });
  }
  if (tooLong(row.matchNumber, MAX_MATCH_NUMBER)) {
    rowErrors.push({
      row: line,
      field: 'matchNumber',
      message: `Wedstrijdnummer te lang (max ${MAX_MATCH_NUMBER})`,
    });
  }
  if (tooLong(row.matchType, MAX_MATCH_TYPE)) {
    rowErrors.push({
      row: line,
      field: 'matchType',
      message: `Type te lang (max ${MAX_MATCH_TYPE})`,
    });
  }
  if (tooLong(row.playLevel, MAX_PLAY_LEVEL)) {
    rowErrors.push({
      row: line,
      field: 'playLevel',
      message: `Spelniveau te lang (max ${MAX_PLAY_LEVEL})`,
    });
  }

  for (const field of ['opponent', 'team', 'note', 'matchNumber', 'matchType', 'playLevel', 'homeTeam', 'awayTeam']) {
    if (hasControlChars(row[field] || '')) {
      rowErrors.push({
        row: line,
        field,
        message: `Ongeldige tekens in ${field}`,
      });
    }
  }

  return { date: isoDate, time: timeParsed || '', home, rowErrors };
}

/**
 * @returns {{
 *   ok: boolean,
 *   errors: object[],
 *   rows: object[],
 *   invalidRows: object[],
 *   headerError?: string|null,
 *   format: string
 * }}
 */
export function validateMatchRows(rows, options = {}) {
  const errors = [];
  const validRows = [];
  const invalidRows = [];
  const format = options.format || (rows?.[0]?.format === 'knvb' ? 'knvb' : 'legacy');

  if (options.headerError) {
    return {
      ok: false,
      errors: [{ row: 0, field: 'csv', message: options.headerError }],
      rows: [],
      invalidRows: [],
      headerError: options.headerError,
      format,
    };
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    return {
      ok: false,
      errors: [{ row: 0, field: 'csv', message: 'Geen datarijen (minimaal header + 1 rij)' }],
      rows: [],
      invalidRows: [],
      headerError: 'Geen datarijen (minimaal header + 1 rij)',
      format,
    };
  }

  for (const row of rows) {
    const line = row.__row ?? '?';
    const normalized =
      row.format === 'knvb' || row.homeTeam || row.awayTeam || row.thuis || row.uit
        ? normalizeRow(
            {
              __row: line,
              date: row.date,
              time: row.time,
              thuis: row.homeTeam || row.thuis,
              uit: row.awayTeam || row.uit,
              note: row.note,
              matchNumber: row.matchNumber,
              matchType: row.matchType,
              playLevel: row.playLevel,
            },
            'knvb',
          )
        : normalizeRow(
            {
              __row: line,
              date: row.date,
              time: row.time,
              home: row.home,
              opponent: row.opponent,
              team: row.team,
              note: row.note,
              matchNumber: row.matchNumber,
              matchType: row.matchType,
              playLevel: row.playLevel,
            },
            row.format || 'legacy',
          );

    const { date, time, home, rowErrors } = validateOneRow(normalized);

    if (rowErrors.length) {
      errors.push(...rowErrors);
      invalidRows.push({
        ...normalized,
        date: normalized.date,
        time: normalized.time,
        home:
          normalized.home === '' || normalized.home === undefined
            ? 'true'
            : String(normalized.home),
        errors: rowErrors,
      });
    } else {
      validRows.push({
        date,
        time: time || null,
        home,
        opponent: normalized.opponent || null,
        team: normalized.team || null,
        note: normalized.note || null,
        matchNumber: normalized.matchNumber || null,
        matchType: normalized.matchType || null,
        playLevel: normalized.playLevel || null,
        homeTeam: normalized.homeTeam || null,
        awayTeam: normalized.awayTeam || null,
        format: normalized.format,
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
    format,
  };
}

export function csvToRows(csvText) {
  return parseCsv(csvText);
}

/** Valideer één handmatig gecorrigeerde rij (voor grid). */
export function validateSingleMatchInput(input) {
  const row = {
    __row: input.__row ?? 1,
    date: input.date,
    time: input.time,
    home: input.home,
    opponent: input.opponent,
    team: input.team,
    note: input.note,
    matchNumber: input.matchNumber,
    matchType: input.matchType,
    playLevel: input.playLevel,
    thuis: input.thuis || input.homeTeam,
    uit: input.uit || input.awayTeam,
    format: input.format,
  };
  return validateMatchRows([row], { format: input.format });
}
