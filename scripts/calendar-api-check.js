/**
 * API-check voor de agenda-koppeling, op een kopie van de database.
 * Uit = 404 op feed en accountroutes. Aan = ICS zonder andermans namen.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import { resolveSqliteFilePath } from '../src/backend/lib/environmentReset.js';

process.env.CALENDAR_RATE_MAX = '12';
process.env.APP_URL = 'https://vvl-planning-demo.onrender.com';
process.env.NODE_ENV = 'test';

let failed = 0;

function assert(name, cond) {
  if (!cond) {
    failed += 1;
    console.error(`FAIL ${name}`);
  } else {
    console.log(`ok   ${name}`);
  }
}

function databaseFile() {
  let url = process.env.DATABASE_URL || '';
  if (!url && fs.existsSync(path.resolve('.env'))) {
    const text = fs.readFileSync(path.resolve('.env'), 'utf8');
    const match = text.match(/^DATABASE_URL\s*=\s*"?([^"\n]+)"?/m);
    url = match ? match[1].trim().replace(/^["']|["']$/g, '') : '';
  }
  const fromEnv = url ? resolveSqliteFilePath(url) : null;
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  const fallback = path.resolve('src/backend/prisma/dev.db');
  if (fs.existsSync(fallback)) return fallback;
  return null;
}

const source = databaseFile();
if (!source) {
  console.error('FAIL geen bron-database');
  process.exit(1);
}
const dest = path.join(os.tmpdir(), `vvl-agenda-${process.pid}.db`);
fs.copyFileSync(source, dest);
for (const ext of ['-wal', '-shm']) {
  if (fs.existsSync(source + ext)) fs.copyFileSync(source + ext, dest + ext);
}
process.env.DATABASE_URL = `file:${dest}`;
process.env.DATA_DIR = '';

const { default: prisma } = await import('../src/backend/lib/prisma.js');
const { applyLiveMigrations } = await import('../src/backend/lib/liveDeploy.js');
const { hashPassword } = await import('../src/backend/lib/auth.js');
const { default: authRouter } = await import('../src/backend/routes/auth.js');
const { default: settingsRouter } = await import('../src/backend/routes/settings.js');
const { default: calendarRouter } = await import('../src/backend/routes/calendar.js');
const { unfoldIcs, validateIcs } = await import('../src/backend/lib/ics.js');

await applyLiveMigrations(prisma, path.resolve('.'));

const stamp = Date.now();
const password = 'agenda-test-2026';

async function main() {
  const hash = await hashPassword(password);
  const ids = { people: [], teams: [], matches: [], services: [], tournaments: [] };

  async function makePerson(data) {
    const person = await prisma.person.create({
      data: { active: true, passwordHash: hash, ...data },
    });
    ids.people.push(person.id);
    return person;
  }

  const app = express();
  app.use(express.json());
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    next();
  });
  app.use('/api/auth', authRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/calendar', calendarRouter);
  app.use((err, _req, res, _next) => {
    const status = err.status || 500;
    res.status(status).json({ error: err.message || 'Fout' });
  });
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  async function call(pathname, { method = 'GET', token, body, headers = {} } = {}) {
    const res = await fetch(`${base}${pathname}`, {
      method,
      headers: {
        ...(body == null ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body == null ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = {};
    }
    return { status: res.status, json, text, headers: res.headers };
  }

  try {
    await prisma.clubSettings.upsert({
      where: { id: 1 },
      update: { calendarEnabled: false, refereesEnabled: false, tournamentsEnabled: false },
      create: { id: 1, seasonLabel: '2026-2027', calendarEnabled: false },
    });

    const admin = await makePerson({ name: 'Agenda Admin', email: `agenda-admin-${stamp}@vvl.test`, role: 'Admin' });
    const bar = await makePerson({ name: 'Agenda Bar', email: `agenda-bar-${stamp}@vvl.test`, role: 'Barcommissie' });
    const parent = await makePerson({
      name: 'Nora Ouder',
      email: `agenda-ouder-${stamp}@vvl.test`,
      phone: '06-99998888',
      role: 'Vrijwilliger',
    });
    const team = await prisma.team.create({
      data: { name: 'JO11-1', matchDurationMinutes: 80 },
    });
    ids.teams.push(team.id);
    await makePerson({
      name: 'Kind Agenda',
      role: 'Vrijwilliger',
      teamId: team.id,
      guardianId: parent.id,
    });
    const colleague = await makePerson({
      name: 'Sanne de Geheim',
      email: `agenda-sanne-${stamp}@vvl.test`,
      phone: '06-11112222',
      role: 'Vrijwilliger',
      teamId: team.id,
    });
    const match = await prisma.match.create({
      data: {
        date: new Date('2026-11-14T14:30:00.000Z'),
        time: '14:30',
        home: true,
        opponent: 'SV Capelle, JO11',
        teamId: team.id,
      },
    });
    ids.matches.push(match.id);
    const service = await prisma.service.create({
      data: {
        type: 'BAR',
        date: new Date('2026-11-14T12:00:00.000Z'),
        time: '09:00 - 13:00',
        location: 'Bar',
        required: 2,
        active: true,
        draft: false,
      },
    });
    ids.services.push(service.id);
    await prisma.enrollment.create({ data: { serviceId: service.id, personId: parent.id } });
    await prisma.enrollment.create({ data: { serviceId: service.id, personId: colleague.id } });
    await prisma.serviceTeamDuty.create({ data: { serviceId: service.id, teamId: team.id, reserved: 2 } });
    await prisma.refereeAssignment.create({
      data: {
        matchId: match.id,
        level: 'pupillen',
        categoryKey: 'JO11',
        personId: parent.id,
        status: 'bevestigd',
      },
    });
    const tournament = await prisma.tournament.create({
      data: {
        name: 'Jeugdtoernooi',
        date: '2026-11-21',
        publicToken: `agenda-${stamp}`,
        teams: {
          create: [
            { key: 'a', name: 'JO11-1 Lekkerkerk', category: 'JO11' },
            { key: 'b', name: 'JO11-2 Lekkerkerk', category: 'JO11' },
          ],
        },
      },
    });
    ids.tournaments.push(tournament.id);
    const other = await prisma.tournament.create({
      data: {
        name: 'Niet voor ons',
        date: '2026-11-22',
        publicToken: `agenda-ander-${stamp}`,
        teams: { create: [{ key: 'c', name: 'JO9-2 Andere', category: 'JO9' }] },
      },
    });
    ids.tournaments.push(other.id);

    const offFeed = await call('/api/calendar/feed/dit-is-geen-geldige-token-maar-lang-genoeg-123456');
    const offMe = await call('/api/calendar/me');
    const offStatus = await call('/api/calendar/status');
    assert('uit: status meldt uit', offStatus.status === 200 && offStatus.json.enabled === false);
    assert('uit: feed en mijn agenda zijn 404', offFeed.status === 404 && offMe.status === 404);

    const adminLogin = await call('/api/auth/login', { method: 'POST', body: { email: admin.email, password } });
    const barLogin = await call('/api/auth/login', { method: 'POST', body: { email: bar.email, password } });
    const parentLogin = await call('/api/auth/login', { method: 'POST', body: { email: parent.email, password } });
    const adminToken = adminLogin.json.token;
    const barToken = barLogin.json.token;
    const parentToken = parentLogin.json.token;
    assert('testaccounts kunnen inloggen', Boolean(adminToken && barToken && parentToken));

    const volunteerPatch = await call('/api/settings/club', {
      method: 'PATCH',
      token: parentToken,
      body: { calendarEnabled: true },
    });
    const barPatch = await call('/api/settings/club', {
      method: 'PATCH',
      token: barToken,
      body: { calendarEnabled: true },
    });
    assert('alleen admin zet agenda aan', volunteerPatch.status === 403 && barPatch.status === 403);

    const enabled = await call('/api/settings/club', {
      method: 'PATCH',
      token: adminToken,
      body: { calendarEnabled: true },
    });
    assert('admin zet agenda aan', enabled.status === 200 && enabled.json.calendarEnabled === true);
    await prisma.clubSettings.update({
      where: { id: 1 },
      data: { refereesEnabled: true, tournamentsEnabled: true },
    });

    const statusOn = await call('/api/calendar/status');
    assert('aan: status is open', statusOn.status === 200 && statusOn.json.enabled === true);
    const anonMe = await call('/api/calendar/me');
    assert('aan: mijn agenda zonder login is 401', anonMe.status === 401);

    const mine = await call('/api/calendar/me', { token: parentToken });
    assert(
      'ouder krijgt webcal, google en een teamlink',
      mine.status === 200 &&
        mine.json.webcalUrl?.startsWith('webcal://') &&
        mine.json.googleUrl?.includes('calendar.google.com') &&
        mine.json.httpsUrl?.includes('/api/calendar/feed/') &&
        mine.json.teams?.length === 1 &&
        mine.json.teams[0].name === 'JO11-1',
    );

    const personal = await call(new URL(mine.json.httpsUrl).pathname);
    const personalText = unfoldIcs(personal.text);
    const personalErrors = validateIcs(personal.text);
    assert(
      'persoonlijke feed is geldige ICS met wedstrijd, dienst, fluiten en toernooi',
      personal.status === 200 &&
        personalErrors.length === 0 &&
        personalText.includes('DTSTART;TZID=Europe/Amsterdam:20261114T143000') &&
        personalText.includes('DTSTART;TZID=Europe/Amsterdam:20261114T090000') &&
        personalText.includes('DTEND;TZID=Europe/Amsterdam:20261114T130000') &&
        personalText.includes('Bardienst – Kantine') &&
        personalText.includes('SV Capelle\\, JO11') &&
        personalText.includes('Scheidsrechter – JO11-1 tegen SV Capelle\\, JO11') &&
        personalText.includes('Toernooi – Jeugdtoernooi') &&
        personalText.includes('https://vvl-planning-demo.onrender.com/mijn-diensten') &&
        !personalText.includes('Niet voor ons') &&
        !personalText.includes('Nora') &&
        !personalText.includes('Sanne') &&
        !personalText.includes('06-99998888') &&
        !personalText.includes('06-11112222'),
    );
    assert(
      'feed cache is privé en overschrijft no-store',
      personal.headers.get('cache-control') === 'private, max-age=300' &&
        !personal.headers.get('pragma') &&
        personal.headers.get('content-type')?.includes('text/calendar') &&
        personal.headers.get('etag'),
    );
    const cached = await call(new URL(mine.json.httpsUrl).pathname, {
      headers: { 'If-None-Match': personal.headers.get('etag') },
    });
    assert('ongewijzigde feed geeft 304', cached.status === 304);

    const teamFeed = await call(new URL(mine.json.teams[0].httpsUrl).pathname);
    const teamText = unfoldIcs(teamFeed.text);
    assert(
      'teamfeed heeft wedstrijd en teamdienst, geen namen',
      teamFeed.status === 200 &&
        validateIcs(teamFeed.text).length === 0 &&
        teamText.includes('VVL JO11-1 – SV Capelle\\, JO11 (thuis)') &&
        teamText.includes('Teamdienst – Kantine') &&
        teamText.includes('geen namen') &&
        !teamText.includes('Nora') &&
        !teamText.includes('Sanne') &&
        !teamText.includes('Bardienst') &&
        !teamText.includes('Scheidsrechter'),
    );

    const rotated = await call('/api/calendar/me/rotate', { method: 'POST', token: parentToken, body: {} });
    const oldFeed = await call(new URL(mine.json.httpsUrl).pathname);
    const newFeed = await call(new URL(rotated.json.httpsUrl).pathname);
    assert(
      'nieuwe link maakt de oude ongeldig',
      rotated.status === 200 &&
        rotated.json.httpsUrl !== mine.json.httpsUrl &&
        oldFeed.status === 404 &&
        newFeed.status === 200 &&
        unfoldIcs(newFeed.text).includes('Bardienst – Kantine'),
    );

    const stranger = await call('/api/calendar/teams?scope=managed', { token: parentToken });
    assert('vrijwilliger beheert geen teamlinks', stranger.status === 403);

    let limited = null;
    for (let i = 0; i < 20 && limited?.status !== 429; i += 1) {
      limited = await call(new URL(rotated.json.httpsUrl).pathname);
    }
    assert('feed is begrensd', limited?.status === 429 && String(limited.json.error || '').includes('agenda'));
  } finally {
    server.close();
    await prisma.tournament.deleteMany({ where: { id: { in: ids.tournaments } } }).catch(() => {});
    await prisma.enrollment.deleteMany({ where: { serviceId: { in: ids.services } } }).catch(() => {});
    await prisma.serviceTeamDuty.deleteMany({ where: { serviceId: { in: ids.services } } }).catch(() => {});
    await prisma.refereeAssignment.deleteMany({ where: { matchId: { in: ids.matches } } }).catch(() => {});
    await prisma.service.deleteMany({ where: { id: { in: ids.services } } }).catch(() => {});
    await prisma.match.deleteMany({ where: { id: { in: ids.matches } } }).catch(() => {});
    await prisma.calendarFeed.deleteMany({ where: { OR: [{ personId: { in: ids.people } }, { teamId: { in: ids.teams } }] } }).catch(() => {});
    await prisma.person.deleteMany({ where: { id: { in: ids.people } } }).catch(() => {});
    await prisma.team.deleteMany({ where: { id: { in: ids.teams } } }).catch(() => {});
    await prisma.$disconnect();
    fs.rmSync(dest, { force: true });
  }
}

main()
  .then(() => {
    if (failed) process.exit(1);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
