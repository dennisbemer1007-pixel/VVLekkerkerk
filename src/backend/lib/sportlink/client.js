/**
 * Sportlink Club.Dataservice: ophalen en vertalen van het programma.
 * Publieke docs: https://sportlinkservices.freshdesk.com (Lijst met artikelen van Club.Dataservice).
 *
 * Let op: de Client ID is geheim. Hij staat in de URL, dus komt hij NOOIT in een foutmelding,
 * log of rapport terecht (zie scrub()).
 */
import { DEFAULT_CLUB_NAME, clubTeamLabel, deriveClubSides } from '../knvbTeams.js';

export const SPORTLINK_BASE_URL = 'https://data.sportlink.com';
/** Max 42 dagen zonder teamcode. We lopen per venster van 42 dagen, met 1 week overlap. */
export const WINDOW_DAYS = 42;
export const WINDOW_STEP_WEEKS = 5;
export const MAX_ROWS_PER_CALL = 500;
const MAX_WINDOWS = 14;
const TIMEOUT_MS = 20000;

export class SportlinkError extends Error {
  constructor(message, { status = null, code = 'sportlink' } = {}) {
    super(message);
    this.name = 'SportlinkError';
    this.status = status;
    this.code = code;
  }
}

export function normalizeClientId(value) {
  return String(value || '').trim();
}

/** Een Client ID is een korte alfanumerieke code. Weiger alles wat een URL-injectie kan zijn. */
export function isPlausibleClientId(value) {
  return /^[A-Za-z0-9]{6,40}$/.test(normalizeClientId(value));
}

function scrub(text, clientId) {
  let out = String(text || '');
  const id = normalizeClientId(clientId);
  if (id) out = out.split(id).join('***');
  return out.replace(/client_id=[^&\s"']+/gi, 'client_id=***');
}

export function buildUrl(baseUrl, article, params) {
  const url = new URL(`${String(baseUrl).replace(/\/+$/, '')}/${article}`);
  for (const [key, value] of Object.entries(params || {})) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }
  return url;
}

/** Haalt één artikel op en geeft een array met rijen terug. */
export async function fetchArticle(article, params, { clientId, fetchImpl = fetch, baseUrl = SPORTLINK_BASE_URL } = {}) {
  const url = buildUrl(baseUrl, article, { ...params, client_id: normalizeClientId(clientId) });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetchImpl(url.toString(), {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
  } catch (err) {
    const aborted = err?.name === 'AbortError';
    throw new SportlinkError(
      aborted
        ? 'Sportlink antwoordt niet (time-out)'
        : `Sportlink niet bereikbaar: ${scrub(err?.message, clientId)}`,
      { code: aborted ? 'timeout' : 'network' },
    );
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 401 || res.status === 403) {
    throw new SportlinkError('Sportlink weigert de Client ID. Controleer de code in Instellingen.', {
      status: res.status,
      code: 'auth',
    });
  }
  if (!res.ok) {
    throw new SportlinkError(`Sportlink gaf een fout (${res.status}) bij "${article}"`, { status: res.status });
  }
  let body;
  try {
    body = await res.json();
  } catch {
    throw new SportlinkError(`Sportlink gaf geen geldige JSON bij "${article}". Klopt de Client ID?`, {
      code: 'json',
    });
  }
  if (body && !Array.isArray(body) && typeof body === 'object' && body.error) {
    // Sportlink antwoordt bij een ongeldige Client ID met {"error":{"message":"Invalid or expired client id","code":4012}}.
    const code = Number(body.error?.code) || 0;
    const auth = code >= 4010 && code < 4020;
    throw new SportlinkError(
      auth
        ? 'Sportlink weigert de Client ID. Controleer de code in Instellingen.'
        : `Sportlink gaf een foutmelding bij "${article}": ${scrub(body.error?.message || code, clientId)}`,
      { code: auth ? 'auth' : 'sportlink' },
    );
  }
  return rowsFromBody(body);
}

function rowsFromBody(body) {
  if (Array.isArray(body)) return body.filter((row) => row && typeof row === 'object');
  if (body && typeof body === 'object') {
    for (const key of ['data', 'programma', 'wedstrijden', 'afgelastingen', 'result', 'results']) {
      if (Array.isArray(body[key])) return body[key].filter((row) => row && typeof row === 'object');
    }
  }
  return [];
}

const CANCELLED_RE = /afgelast|vervallen|geannuleerd|uitgesteld|niet\s+gespeeld/i;

export function isCancelledStatus(status) {
  return CANCELLED_RE.test(String(status || ''));
}

function pad(n) {
  return String(n).padStart(2, '0');
}

const AMS = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Amsterdam',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function amsterdamParts(date) {
  const parts = Object.fromEntries(AMS.formatToParts(date).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

/**
 * Sportlink geeft `wedstrijddatum` als ISO met offset ("2026-12-06T14:30:00+0100"), soms zonder offset.
 * De aanvangstijd ("14:30") is de lokale clocktijd en wint als hij er is.
 * @returns {{ date: string, time: string|null } | null}
 */
export function parseSportlinkDateTime(row) {
  const raw = String(row?.wedstrijddatum ?? row?.datum ?? '').trim();
  let date = null;
  let time = null;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?(?::\d{2}(?:\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/);
  if (iso) {
    if (iso[6] && iso[4] != null) {
      const offset = iso[6] === 'Z' ? 'Z' : iso[6].replace(/^([+-]\d{2})(\d{2})$/, '$1:$2');
      const instant = new Date(`${iso[1]}-${iso[2]}-${iso[3]}T${iso[4]}:${iso[5]}:00${offset}`);
      if (!Number.isNaN(instant.getTime())) {
        const local = amsterdamParts(instant);
        date = local.date;
        time = local.time;
      }
    }
    if (!date) {
      date = `${iso[1]}-${iso[2]}-${iso[3]}`;
      if (iso[4] != null) time = `${iso[4]}:${iso[5]}`;
    }
  } else {
    const nl = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (nl) date = `${nl[3]}-${pad(nl[2])}-${pad(nl[1])}`;
  }
  if (!date) return null;
  const start = String(row?.aanvangstijd ?? '').trim().match(/^(\d{1,2})[:.](\d{2})/);
  if (start) time = `${pad(start[1])}:${start[2]}`;
  return { date, time };
}

function text(value) {
  return String(value ?? '').trim();
}

/**
 * Vertaalt één Sportlink-rij naar dezelfde vorm als de CSV-import (wedstrijdnummer is de sleutel).
 * Geeft { error } terug voor rijen die we niet kunnen gebruiken.
 */
export function mapProgramRow(row, { clubName = DEFAULT_CLUB_NAME } = {}) {
  const matchNumber = text(row.wedstrijdnummer) || text(row.wedstrijdcode);
  if (!matchNumber) return { error: 'geen wedstrijdnummer' };
  const when = parseSportlinkDateTime(row);
  if (!when) return { matchNumber, error: 'geen geldige datum' };

  const homeName = text(row.thuisteam);
  const awayName = text(row.uitteam);
  if (!homeName && !awayName) return { matchNumber, error: 'geen thuis- en uitteam' };

  const sides = deriveClubSides(homeName, awayName, when.date);
  let team;
  let opponent;
  let home;
  if (sides) {
    ({ team, opponent, home } = sides);
  } else {
    // Sportlink levert alleen de eigen club; zonder naamherkenning vallen we terug op teamnaam.
    const own = text(row.teamnaam);
    home = !own || own.toLowerCase() === homeName.toLowerCase();
    team = clubTeamLabel(own || (home ? homeName : awayName), { date: when.date });
    opponent = home ? awayName : homeName;
  }

  const status = text(row.status);
  return {
    matchNumber,
    date: when.date,
    time: when.time,
    home,
    team,
    opponent,
    matchType: text(row.competitiesoort) || null,
    playLevel: text(row.klasse) || text(row.competitie) || null,
    field: text(row.veld) || text(row.accommodatie) || null,
    cancelled: isCancelledStatus(status),
    status,
    clubName,
  };
}

/** Eerste dag van het venster `index` (0 = nu). */
export function windowParams(index) {
  return {
    weekoffset: index * WINDOW_STEP_WEEKS,
    aantaldagen: WINDOW_DAYS,
    aantalregels: MAX_ROWS_PER_CALL,
    uit: 'nee',
  };
}

/**
 * Haalt het thuisprogramma tot en met `horizon` op (venster per 42 dagen, 1 week overlap) en de
 * afgelastingen. Dubbelen vallen weg op wedstrijdnummer.
 * @returns {{ rows: object[], cancelledNumbers: Set<string>, windows: number, truncated: boolean, warnings: string[] }}
 */
export async function fetchSportlinkProgram({ clientId, from = new Date(), horizon, fetchImpl, baseUrl }) {
  const days = Math.max(WINDOW_DAYS, Math.ceil(((horizon || from) - from) / 86400000) + 1);
  const windows = Math.min(MAX_WINDOWS, Math.max(1, Math.ceil((days - 7) / (WINDOW_STEP_WEEKS * 7))));
  const byNumber = new Map();
  const warnings = [];
  let truncated = false;

  for (let i = 0; i < windows; i += 1) {
    const rows = await fetchArticle('programma', windowParams(i), { clientId, fetchImpl, baseUrl });
    if (rows.length >= MAX_ROWS_PER_CALL) {
      truncated = true;
      warnings.push(`Venster ${i + 1} gaf ${rows.length} regels (limiet ${MAX_ROWS_PER_CALL}); sommige wedstrijden kunnen ontbreken.`);
    }
    for (const row of rows) {
      const key = text(row.wedstrijdnummer) || text(row.wedstrijdcode) || `__${byNumber.size}`;
      if (!byNumber.has(key)) byNumber.set(key, row);
    }
  }

  const cancelledNumbers = new Set();
  try {
    const cancelled = await fetchArticle(
      'afgelastingen',
      { aantaldagen: Math.min(days, 365), aantalregels: MAX_ROWS_PER_CALL },
      { clientId, fetchImpl, baseUrl },
    );
    for (const row of cancelled) {
      const status = text(row.status);
      if (status && !isCancelledStatus(status)) continue;
      const key = text(row.wedstrijdnummer) || text(row.wedstrijdcode);
      if (key) cancelledNumbers.add(key);
    }
  } catch (err) {
    // Auth-fouten gelden voor alles; een kapotte afgelastingen-feed mag de sync niet blokkeren.
    if (err.code === 'auth') throw err;
    warnings.push(`Afgelastingen niet opgehaald: ${err.message}. Alleen de status in het programma is gebruikt.`);
  }

  return { rows: [...byNumber.values()], cancelledNumbers, windows, truncated, warnings };
}
