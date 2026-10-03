/**
 * API-check voor scheidsrechters, op een kopie van de database.
 * Schakelaar uit = 404. Rollen: alleen admin zet aan, barcommissie zet categorieën,
 * een vrijwilliger niet. Daarna één plan en een tweede plek via Ik fluit.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import { resolveSqliteFilePath } from '../src/backend/lib/environmentReset.js';

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
  const nested = path.resolve('src/backend/prisma/src/backend/prisma/dev.db');
  if (fs.existsSync(nested)) return nested;
  return null;
}

const source = databaseFile();
if (!source) {
  console.error('FAIL geen bron-database');
  process.exit(1);
}
const dest = path.join(os.tmpdir(), `vvl-scheids-${process.pid}.db`);
fs.copyFileSync(source, dest);
for (const ext of ['-wal', '-shm']) {
  if (fs.existsSync(source + ext)) fs.copyFileSync(source + ext, dest + ext);
}
process.env.DATABASE_URL = `file:${dest}`;
process.env.DATA_DIR = '';

const { default: prisma } = await import('../src/backend/lib/prisma.js');
const { hashPassword } = await import('../src/backend/lib/auth.js');
const { default: authRouter } = await import('../src/backend/routes/auth.js');
const { default: settingsRouter } = await import('../src/backend/routes/settings.js');
const { default: refereesRouter } = await import('../src/backend/routes/referees.js');

const stamp = Date.now();
const password = 'scheids-test-2026';
const ids = { people: [], teams: [], matches: [] };

async function main() {
  const hash = await hashPassword(password);
  async function makePerson(role, slug, levels = '[]') {
    const person = await prisma.person.create({
      data: {
        name: `Scheids ${slug}`,
        email: `scheids-${slug}-${stamp}@vvl.test`,
        role,
        passwordHash: hash,
        active: true,
        refereeLevels: levels,
      },
    });
    ids.people.push(person.id);
    return person;
  }

  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/referees', refereesRouter);
  app.use((err, _req, res, _next) => {
    const status = err.status || 500;
    res.status(status).json({ error: err.message || 'Fout' });
  });
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  async function call(pathname, { method = 'GET', token, body } = {}) {
    const res = await fetch(`${base}${pathname}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body == null ? undefined : JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
  }

  try {
    await prisma.clubSettings.update({ where: { id: 1 }, data: { refereesEnabled: false } });
    const admin = await makePerson('Admin', 'admin');
    const bar = await makePerson('Barcommissie', 'bar');
    const volunteer = await makePerson('Vrijwilliger', 'vrij', '["pupillen"]');

    const off = await Promise.all([
      call('/api/referees/status'),
      call('/api/referees/overview'),
      call('/api/referees/mine'),
      call('/api/referees/people/1/levels', { method: 'PUT', body: { levels: ['pupillen'] } }),
      call('/api/referees/plan', { method: 'POST', body: {} }),
    ]);
    assert('uit: status, overzicht, mijn, niveaus en plan zijn 404', off.every((row) => row.status === 404));

    const adminLogin = await call('/api/auth/login', { method: 'POST', body: { email: admin.email, password } });
    const barLogin = await call('/api/auth/login', { method: 'POST', body: { email: bar.email, password } });
    const volunteerLogin = await call('/api/auth/login', { method: 'POST', body: { email: volunteer.email, password } });
    const adminToken = adminLogin.json.token;
    const barToken = barLogin.json.token;
    const volunteerToken = volunteerLogin.json.token;
    assert('testaccounts kunnen inloggen', Boolean(adminToken && barToken && volunteerToken));

    const volunteerPatch = await call('/api/settings/club', {
      method: 'PATCH',
      token: volunteerToken,
      body: { refereesEnabled: true },
    });
    const barPatch = await call('/api/settings/club', {
      method: 'PATCH',
      token: barToken,
      body: { refereesEnabled: true },
    });
    assert('alleen admin zet de schakelaar', volunteerPatch.status === 403 && barPatch.status === 403);

    const enabled = await call('/api/settings/club', {
      method: 'PATCH',
      token: adminToken,
      body: { refereesEnabled: true },
    });
    assert('admin zet scheidsrechters aan', enabled.status === 200 && enabled.json.refereesEnabled === true);
    const statusOn = await call('/api/referees/status');
    assert('aan: status is open', statusOn.status === 200 && statusOn.json.enabled === true);

    const volunteerOverview = await call('/api/referees/overview', { token: volunteerToken });
    const volunteerPlan = await call('/api/referees/plan', { method: 'POST', token: volunteerToken, body: {} });
    const volunteerCategory = await call('/api/referees/categories/JO11', {
      method: 'PUT',
      token: volunteerToken,
      body: { needed: false },
    });
    const volunteerLevels = await call(`/api/referees/people/${volunteer.id}/levels`, {
      method: 'PUT',
      token: volunteerToken,
      body: { levels: ['senioren'] },
    });
    assert(
      'vrijwilliger mag niet plannen, categoriseren of niveaus zetten',
      volunteerOverview.status === 403 &&
        volunteerPlan.status === 403 &&
        volunteerCategory.status === 403 &&
        volunteerLevels.status === 403,
    );

    const barCategory = await call('/api/referees/categories/JO12', {
      method: 'PUT',
      token: barToken,
      body: { needed: true },
    });
    const adminLevels = await call(`/api/referees/people/${volunteer.id}/levels`, {
      method: 'PUT',
      token: adminToken,
      body: { levels: ['pupillen'] },
    });
    assert(
      'barcommissie zet nodig en admin zet het niveau',
      barCategory.status === 200 && adminLevels.status === 200 && adminLevels.json.levels?.[0] === 'pupillen',
    );

    const team = await prisma.team.create({
      data: { name: `JO12-4 t${stamp}`, matchDurationMinutes: 60, teamDutySlots: '[]' },
    });
    ids.teams.push(team.id);
    const day = new Date('2031-06-07T12:00:00');
    for (const time of ['10:00', '14:00']) {
      const match = await prisma.match.create({
        data: { date: day, time, home: true, opponent: 'Test', teamId: team.id },
      });
      ids.matches.push(match.id);
    }

    const planned = await call('/api/referees/plan', { method: 'POST', token: barToken, body: {} });
    const ours = (planned.json.slots || []).filter((slot) => ids.matches.includes(slot.matchId));
    const filled = ours.filter((slot) => slot.person?.id === volunteer.id);
    const open = ours.filter((slot) => slot.open);
    assert(
      'planner zet hooguit één automatische plek op dezelfde dag',
      planned.status === 200 && filled.length === 1 && open.length === 1 && String(open[0].reason || '').includes('fluit die dag al'),
    );

    const claimed = await call(`/api/referees/slots/${open[0]?.matchId}/claim`, {
      method: 'POST',
      token: volunteerToken,
      body: {},
    });
    const claimedMine = (claimed.json.mine || []).filter((slot) => ids.matches.includes(slot.matchId));
    assert(
      'ik fluit mag een tweede plek dezelfde dag zijn',
      claimed.status === 200 && claimedMine.length === 2 && claimedMine.some((slot) => slot.source === 'self' && slot.status === 'bevestigd'),
    );

    const swapOpen = await call('/api/referees/swaps', {
      method: 'POST',
      token: volunteerToken,
      body: { fromMatchId: filled[0]?.matchId, toMatchId: open[0]?.matchId },
    });
    assert('ruilen kan niet tegen een plek die je zelf al hebt', swapOpen.status === 400);

    const offAgain = await call('/api/settings/club', {
      method: 'PATCH',
      token: adminToken,
      body: { refereesEnabled: false },
    });
    const hidden = await call('/api/referees/mine', { token: volunteerToken });
    assert('uit daarna is de API weer 404', offAgain.status === 200 && offAgain.json.refereesEnabled === false && hidden.status === 404);
  } finally {
    server.close();
    await prisma.refereeSwap.deleteMany({
      where: { OR: [{ requesterId: { in: ids.people } }, { counterpartyId: { in: ids.people } }] },
    });
    await prisma.refereeAssignment.deleteMany({
      where: { OR: [{ personId: { in: ids.people } }, { matchId: { in: ids.matches.length ? ids.matches : [-1] } }] },
    });
    if (ids.matches.length) await prisma.match.deleteMany({ where: { id: { in: ids.matches } } });
    if (ids.people.length) await prisma.person.deleteMany({ where: { id: { in: ids.people } } });
    if (ids.teams.length) await prisma.team.deleteMany({ where: { id: { in: ids.teams } } });
    await prisma.$disconnect();
    for (const ext of ['', '-wal', '-shm']) {
      if (fs.existsSync(dest + ext)) fs.unlinkSync(dest + ext);
    }
  }
}

try {
  await main();
} catch (err) {
  failed += 1;
  console.error('FAIL', err);
}
console.log(failed ? `\n${failed} mislukt` : '\nAPI-check geslaagd');
process.exit(failed ? 1 : 0);
