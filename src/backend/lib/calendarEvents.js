/**
 * Pure agenda-regels: welke afspraken in een feed horen, zonder database.
 * Tijden zijn de wandklok van de club (Europe/Amsterdam), niet de klok van de server.
 */

export const CALENDAR_PAST_DAYS = 30;
export const CALENDAR_RATE_WINDOW_MS = 15 * 60 * 1000;
export const CALENDAR_RATE_MAX = Number(process.env.CALENDAR_RATE_MAX || 60);
const UID_HOST = 'vvl-planning';
const CLUB = 'V.V. Lekkerkerk';

export function calendarBlocked(enabled) {
  return enabled !== true;
}

export function clubDay(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return value.trim();
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Amsterdam',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  const year = get('year');
  const month = get('month');
  const day = get('day');
  if (!year || !month || !day) return null;
  return `${year}-${month}-${day}`;
}

export function addDaysIso(iso, days) {
  const [year, month, day] = String(iso || '').split('-').map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}-${p(date.getUTCMonth() + 1)}-${p(date.getUTCDate())}`;
}

export function inCalendarWindow(day, now = new Date()) {
  if (!day) return false;
  const today = clubDay(now);
  const from = addDaysIso(today, -CALENDAR_PAST_DAYS);
  return Boolean(from) && day >= from;
}

export function namesOverlap(clubTeam, tournamentTeam) {
  const compact = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const needle = compact(clubTeam);
  const hay = compact(tournamentTeam);
  if (!needle || !hay || needle.length < 4) return false;
  let from = 0;
  while (from < hay.length) {
    const at = hay.indexOf(needle, from);
    if (at < 0) return false;
    const next = hay[at + needle.length];
    if (!next || !/[0-9]/.test(next)) return true;
    from = at + 1;
  }
  return false;
}

function laterDate(values) {
  let best = null;
  let bestTime = -1;
  for (const value of values) {
    if (!value) continue;
    const time = new Date(value).getTime();
    if (Number.isNaN(time) || time < bestTime) continue;
    bestTime = time;
    best = value;
  }
  return best;
}

export function parseClockRange(timeStr) {
  const found = String(timeStr || '').match(/\d{1,2}:\d{2}/g);
  if (!found?.length) return null;
  const norm = (value) => {
    const [hour, minute] = value.split(':');
    const h = Number(hour);
    const m = Number(minute);
    if (h > 23 || m > 59) return null;
    return `${String(h).padStart(2, '0')}:${minute}`;
  };
  const start = norm(found[0]);
  if (!start) return null;
  const end = found[1] ? norm(found[1]) : null;
  return { start, end };
}

function minutesOf(hhmm) {
  const [hour, minute] = hhmm.split(':').map(Number);
  return hour * 60 + minute;
}

export function shiftClock(day, hhmm, minutes) {
  const total = minutesOf(hhmm) + Number(minutes || 0);
  const dayShift = Math.floor(total / 1440);
  const rest = ((total % 1440) + 1440) % 1440;
  const hour = String(Math.floor(rest / 60)).padStart(2, '0');
  const minute = String(rest % 60).padStart(2, '0');
  return { day: addDaysIso(day, dayShift), clock: `${hour}${minute}00` };
}

function compactText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function dutyPlace(type, location) {
  const loc = compactText(location);
  if (!loc || /^bar$/i.test(loc)) return type === 'KITCHEN' ? 'Keuken' : 'Kantine';
  if (/^keuken$/i.test(loc)) return 'Keuken';
  if (/^kantine$/i.test(loc)) return 'Kantine';
  return loc;
}

export function dutyTitle(type, location) {
  const kind = type === 'KITCHEN' ? 'Keukendienst' : 'Bardienst';
  return `${kind} – ${dutyPlace(type, location)}`;
}

function appLink(appUrl, path) {
  const root = String(appUrl || '').replace(/\/$/, '');
  if (!root) return '';
  return `${root}${path}`;
}

function timed(day, timeStr, durationMinutes) {
  const range = parseClockRange(timeStr);
  if (!range) {
    return {
      allDay: true,
      startDate: day.replace(/-/g, ''),
      endDate: addDaysIso(day, 1).replace(/-/g, ''),
      clockLabel: '',
    };
  }
  const start = shiftClock(day, range.start, 0);
  let end;
  if (range.end) {
    const startMin = minutesOf(range.start);
    const endMin = minutesOf(range.end);
    if (endMin < startMin) end = shiftClock(day, range.end, 1440);
    else if (endMin === startMin) end = shiftClock(day, range.start, 60);
    else end = shiftClock(day, range.end, 0);
  } else {
    const mins = Number(durationMinutes) > 0 ? Number(durationMinutes) : 90;
    end = shiftClock(day, range.start, mins);
  }
  return {
    allDay: false,
    start: `${start.day.replace(/-/g, '')}T${start.clock}`,
    end: `${end.day.replace(/-/g, '')}T${end.clock}`,
    clockLabel: range.end ? `${range.start}–${range.end}` : range.start,
  };
}

function matchSummary(teamName, opponent, home) {
  const side = home === false ? 'uit' : 'thuis';
  const who = compactText(teamName);
  const against = compactText(opponent);
  if (who && against) return `VVL ${who} – ${against} (${side})`;
  if (who) return `VVL ${who} (${side})`;
  if (against) return `VVL – ${against} (${side})`;
  return `VVL – Wedstrijd (${side})`;
}

function matchEvent(row, { appUrl, now, classification }) {
  const day = clubDay(row?.date);
  if (!inCalendarWindow(day, now)) return null;
  const home = row.home !== false;
  const opponent = compactText(row.opponent);
  const teamName = compactText(row.teamName);
  const when = timed(day, row.time, row.durationMinutes || 90);
  const summary = matchSummary(teamName, opponent, home);
  const where = teamName ? `${home ? 'Thuiswedstrijd' : 'Uitwedstrijd'} ${teamName}` : home ? 'Thuiswedstrijd' : 'Uitwedstrijd';
  const link = appLink(appUrl, '/mijn-diensten');
  const description = [
    opponent ? `${where} tegen ${opponent}.` : `${where}.`,
    when.clockLabel ? `Aanvang ${when.clockLabel}.` : '',
    link ? `Open de app: ${link}` : '',
  ]
    .filter(Boolean)
    .join(' ');
  return {
    uid: `match-${row.id}@${UID_HOST}`,
    summary,
    description,
    location: home ? CLUB : opponent ? `Uit, bij ${opponent}` : 'Uit',
    url: link,
    categories: 'WEDSTRIJD',
    classification,
    lastModified: row.updatedAt || row.date,
    ...when,
  };
}

function dutyEvent(row, { appUrl, now }) {
  if (!row || row.draft || row.active === false || row.noShow) return null;
  const day = clubDay(row.date);
  if (!inCalendarWindow(day, now)) return null;
  const when = timed(day, row.time, row.type === 'KITCHEN' ? 180 : 180);
  const place = dutyPlace(row.type, row.location);
  const kind = row.type === 'KITCHEN' ? 'keukendienst' : 'bardienst';
  const link = appLink(appUrl, '/mijn-diensten');
  return {
    uid: `duty-${row.enrollmentId}@${UID_HOST}`,
    summary: dutyTitle(row.type, row.location),
    description: [`Jouw ${kind}.`, link ? `Open de app: ${link}` : ''].filter(Boolean).join(' '),
    location: `${place}, ${CLUB}`,
    url: link,
    categories: 'DIENST',
    classification: 'PRIVATE',
    lastModified: row.updatedAt || row.date,
    ...when,
  };
}

function refereeEvent(row, { appUrl, now }) {
  const match = row?.match;
  if (!match) return null;
  const day = clubDay(match.date);
  if (!inCalendarWindow(day, now)) return null;
  const when = timed(day, match.time, match.durationMinutes || 90);
  const teamName = compactText(match.teamName);
  const opponent = compactText(match.opponent);
  const confirmed = row.status === 'bevestigd';
  const prefix = confirmed ? 'Scheidsrechter' : 'Scheidsrechter (voorstel)';
  const summary = teamName
    ? opponent
      ? `${prefix} – ${teamName} tegen ${opponent}`
      : `${prefix} – ${teamName}`
    : prefix;
  const link = appLink(appUrl, '/mijn-diensten');
  const description = confirmed
    ? 'Jij fluit deze wedstrijd.'
    : 'Voorstel: jij fluit deze wedstrijd. Dit kan nog wijzigen.';
  const modified = laterDate([row.updatedAt, match.updatedAt]);
  return {
    uid: `referee-${row.id}@${UID_HOST}`,
    summary,
    description: [description, link ? `Open de app: ${link}` : ''].filter(Boolean).join(' '),
    location: match.home === false ? (opponent ? `Uit, bij ${opponent}` : 'Uit') : CLUB,
    url: link,
    categories: 'SCHEIDSRECHTER',
    classification: 'PRIVATE',
    lastModified: modified || match.date,
    ...when,
  };
}

function tournamentEvent(row, { appUrl, now, uid, classification }) {
  const day = clubDay(row?.date);
  if (!inCalendarWindow(day, now)) return null;
  const when = timed(day, `${row.startTime || '09:00'} - ${row.endTime || '16:00'}`, 180);
  const name = compactText(row.name) || 'Toernooi';
  const link = appLink(appUrl, '/');
  return {
    uid,
    summary: `Toernooi – ${name}`,
    description: [`Toernooi bij ${CLUB}.`, link ? `Open de app: ${link}` : ''].filter(Boolean).join(' '),
    location: CLUB,
    url: link,
    categories: 'TOERNOOI',
    classification,
    lastModified: row.updatedAt || row.date,
    ...when,
  };
}

function teamDutyEvent(row, { appUrl, now }) {
  if (!row || row.draft || row.active === false) return null;
  const day = clubDay(row.date);
  if (!inCalendarWindow(day, now)) return null;
  const when = timed(day, row.time, 180);
  const place = dutyPlace(row.type, row.location);
  const teamName = compactText(row.teamName);
  const link = appLink(appUrl, '/');
  return {
    uid: `teamduty-${row.serviceId}-team-${row.teamId}@${UID_HOST}`,
    summary: `Teamdienst – ${place}`,
    description: [
      teamName ? `Gereserveerde dienst voor ${teamName}.` : 'Gereserveerde teamdienst.',
      'Deze agenda noemt geen namen.',
      link ? `Open de app: ${link}` : '',
    ]
      .filter(Boolean)
      .join(' '),
    location: `${place}, ${CLUB}`,
    url: link,
    categories: 'TEAMDIENST',
    classification: 'PUBLIC',
    lastModified: row.updatedAt || row.date,
    ...when,
  };
}

function dedupe(events) {
  const map = new Map();
  for (const event of events) {
    if (!event?.uid) continue;
    const prev = map.get(event.uid);
    if (!prev) {
      map.set(event.uid, event);
      continue;
    }
    const nextTime = new Date(event.lastModified || 0).getTime();
    const prevTime = new Date(prev.lastModified || 0).getTime();
    if (nextTime >= prevTime) map.set(event.uid, event);
  }
  return [...map.values()].sort((a, b) => String(a.start || a.startDate).localeCompare(String(b.start || b.startDate)));
}

function relevantTournament(row, teamNames) {
  const names = row?.teamNames || [];
  return (teamNames || []).some((club) => names.some((name) => namesOverlap(club, name)));
}

export function personalEvents({
  matches = [],
  duties = [],
  referees = [],
  tournaments = [],
  teamNames = [],
  refereesEnabled = false,
  tournamentsEnabled = false,
  appUrl = '',
  now = new Date(),
} = {}) {
  const events = [];
  for (const match of matches) {
    events.push(matchEvent(match, { appUrl, now, classification: 'PUBLIC' }));
  }
  for (const duty of duties) {
    events.push(dutyEvent(duty, { appUrl, now }));
  }
  if (refereesEnabled) {
    for (const referee of referees) {
      events.push(refereeEvent(referee, { appUrl, now }));
    }
  }
  if (tournamentsEnabled) {
    for (const tournament of tournaments) {
      if (!relevantTournament(tournament, teamNames)) continue;
      events.push(
        tournamentEvent(tournament, {
          appUrl,
          now,
          uid: `tournament-${tournament.id}@${UID_HOST}`,
          classification: 'PUBLIC',
        }),
      );
    }
  }
  return dedupe(events);
}

export function teamEvents({
  teamId,
  teamName,
  matches = [],
  teamDuties = [],
  tournaments = [],
  tournamentsEnabled = false,
  appUrl = '',
  now = new Date(),
} = {}) {
  const events = [];
  for (const match of matches) {
    events.push(matchEvent({ ...match, teamName: match.teamName || teamName }, { appUrl, now, classification: 'PUBLIC' }));
  }
  for (const duty of teamDuties) {
    events.push(teamDutyEvent({ ...duty, teamId, teamName }, { appUrl, now }));
  }
  if (tournamentsEnabled) {
    for (const tournament of tournaments) {
      if (!relevantTournament(tournament, [teamName])) continue;
      events.push(
        tournamentEvent(tournament, {
          appUrl,
          now,
          uid: `tournament-${tournament.id}-team-${teamId}@${UID_HOST}`,
          classification: 'PUBLIC',
        }),
      );
    }
  }
  return dedupe(events);
}

export function collectTeamIds({ person, memberships, children, coordinatedIds } = {}) {
  const ids = new Set();
  const add = (who, rows) => {
    if (who?.teamId) ids.add(who.teamId);
    for (const row of rows || who?.teamMemberships || []) {
      if (row?.active === false) continue;
      if (row?.teamId) ids.add(row.teamId);
    }
  };
  add(person, memberships);
  for (const child of children || []) add(child, child.teamMemberships);
  for (const id of coordinatedIds || []) {
    if (id) ids.add(id);
  }
  return [...ids];
}
