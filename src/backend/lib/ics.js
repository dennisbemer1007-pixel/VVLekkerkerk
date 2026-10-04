import crypto from 'crypto';

const CRLF = '\r\n';

/** Europa/Amsterdam, zomertijd laatste zondag van maart, wintertijd laatste zondag van oktober. */
const AMSTERDAM_ZONE = [
  'BEGIN:VTIMEZONE',
  'TZID:Europe/Amsterdam',
  'X-LIC-LOCATION:Europe/Amsterdam',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'TZNAME:CEST',
  'DTSTART:19700329T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'TZNAME:CET',
  'DTSTART:19701025T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
];

export function icsEscapeText(value) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

export function icsUnescape(value) {
  return String(value ?? '').replace(/\\([nN,;\\])/g, (_, ch) => {
    if (ch === 'n' || ch === 'N') return '\n';
    return ch;
  });
}

/** RFC 5545: vouw op 75 octets, vervolgregel begint met een spatie. */
export function foldLine(line) {
  const buf = Buffer.from(String(line ?? ''), 'utf8');
  if (buf.length <= 75) return String(line ?? '');
  const parts = [];
  let offset = 0;
  let budget = 75;
  while (offset < buf.length) {
    let end = Math.min(offset + budget, buf.length);
    if (end < buf.length) {
      while (end > offset && (buf[end] & 0xc0) === 0x80) end -= 1;
      if (end === offset) end = Math.min(offset + budget, buf.length);
    }
    const chunk = buf.subarray(offset, end).toString('utf8');
    parts.push(offset === 0 ? chunk : ` ${chunk}`);
    offset = end;
    budget = 74;
  }
  return parts.join(CRLF);
}

export function unfoldIcs(ics) {
  return String(ics ?? '').replace(/\r\n[ \t]/g, '');
}

export function formatUtc(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '19700101T000000Z';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}

/** Zelfde stempel binnen een venster van 5 minuten, zodat een feed cachebaar blijft. */
export function feedStamp(now = new Date()) {
  const t = new Date(now).getTime();
  if (Number.isNaN(t)) return new Date(0);
  return new Date(t - (t % (5 * 60 * 1000)));
}

function eventLines(event, stamp) {
  const lastModified = event.lastModified ? new Date(event.lastModified) : stamp;
  const sequence = Number.isNaN(lastModified.getTime())
    ? 0
    : Math.max(0, Math.floor(lastModified.getTime() / 1000));
  const lines = [
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `DTSTAMP:${formatUtc(stamp)}`,
    `LAST-MODIFIED:${formatUtc(lastModified)}`,
    `SEQUENCE:${sequence}`,
    `SUMMARY:${icsEscapeText(event.summary)}`,
  ];
  if (event.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${event.startDate}`);
    lines.push(`DTEND;VALUE=DATE:${event.endDate}`);
  } else {
    lines.push(`DTSTART;TZID=Europe/Amsterdam:${event.start}`);
    lines.push(`DTEND;TZID=Europe/Amsterdam:${event.end}`);
  }
  if (event.location) lines.push(`LOCATION:${icsEscapeText(event.location)}`);
  if (event.description) lines.push(`DESCRIPTION:${icsEscapeText(event.description)}`);
  if (event.url) lines.push(`URL:${icsEscapeText(event.url)}`);
  if (event.categories) lines.push(`CATEGORIES:${icsEscapeText(event.categories)}`);
  lines.push(`CLASS:${event.classification === 'PUBLIC' ? 'PUBLIC' : 'PRIVATE'}`);
  lines.push('STATUS:CONFIRMED');
  lines.push('TRANSP:OPAQUE');
  lines.push('END:VEVENT');
  return lines;
}

export function renderIcs({ name, events, now = new Date() }) {
  const stamp = feedStamp(now);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//V.V. Lekkerkerk//Planning//NL',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${icsEscapeText(name || 'VVL-agenda')}`,
    'X-WR-TIMEZONE:Europe/Amsterdam',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
    ...AMSTERDAM_ZONE,
    ...(events || []).flatMap((event) => eventLines(event, stamp)),
    'END:VCALENDAR',
  ];
  return `${lines.map(foldLine).join(CRLF)}${CRLF}`;
}

export function validateIcs(ics) {
  const errors = [];
  const text = String(ics ?? '');
  if (!text.startsWith('BEGIN:VCALENDAR\r\n')) errors.push('begin');
  if (!text.endsWith('END:VCALENDAR\r\n')) errors.push('end');
  if (text.replace(/\r\n/g, '').includes('\n')) errors.push('bare-lf');
  if (text.replace(/\r\n/g, '').includes('\r')) errors.push('bare-cr');
  const physical = text.split('\r\n');
  for (const line of physical) {
    if (line === '') continue;
    if (Buffer.byteLength(line, 'utf8') > 75) errors.push(`lang:${line.slice(0, 40)}`);
  }
  const unfolded = unfoldIcs(text);
  if (!unfolded.includes('VERSION:2.0')) errors.push('version');
  if (!unfolded.includes('BEGIN:VTIMEZONE') || !unfolded.includes('TZID:Europe/Amsterdam')) errors.push('tz');
  const events = [...unfolded.matchAll(/BEGIN:VEVENT\r\n([\s\S]*?)END:VEVENT/g)];
  const uids = new Set();
  for (const match of events) {
    const body = match[1];
    for (const key of ['UID:', 'DTSTAMP:', 'LAST-MODIFIED:', 'SUMMARY:', 'DTSTART']) {
      if (!body.includes(key)) errors.push(`mist-${key}`);
    }
    const uid = body.match(/^UID:(.+)$/m)?.[1];
    if (uid) {
      if (uids.has(uid)) errors.push(`dubbel-${uid}`);
      uids.add(uid);
    }
    if (!/DTSTART(?:;TZID=Europe\/Amsterdam|;VALUE=DATE):/.test(body)) errors.push('dtstart-tz');
  }
  return errors;
}

export function unfoldedLines(ics) {
  return unfoldIcs(ics).split('\r\n').filter(Boolean);
}

export function feedUrls(base, token) {
  const root = String(base || '').replace(/\/$/, '');
  const httpsUrl = `${root}/api/calendar/feed/${token}.ics`;
  const webcalUrl = httpsUrl.replace(/^https:/i, 'webcal:').replace(/^http:/i, 'webcal:');
  const googleUrl = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(httpsUrl)}`;
  return { httpsUrl, webcalUrl, googleUrl };
}

export function calendarResponseHeaders(body) {
  const etag = `"${crypto.createHash('sha256').update(body).digest('hex')}"`;
  return {
    'Content-Type': 'text/calendar; charset=utf-8',
    'Content-Disposition': 'inline; filename="vvl-agenda.ics"',
    'Cache-Control': 'private, max-age=300',
    ETag: etag,
  };
}

export function etagMatches(header, etag) {
  if (!header || !etag) return false;
  return String(header)
    .split(',')
    .map((part) => part.trim())
    .includes(etag);
}

export function normalizeFeedToken(raw) {
  const token = String(raw || '').replace(/\.ics$/i, '');
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) return null;
  return token;
}
