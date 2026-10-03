/**
 * API-check voor toernooien: schakelaar uit = 404, rollen, live zonder login.
 * Ruimt testdata op en zet de schakelaar terug.
 */
import express from 'express';
import authRouter from '../src/backend/routes/auth.js';
import settingsRouter from '../src/backend/routes/settings.js';
import tournamentsRouter from '../src/backend/routes/tournaments.js';
import { hashPassword } from '../src/backend/lib/auth.js';
import prisma from '../src/backend/lib/prisma.js';
import { getClubSettings } from '../src/backend/lib/season.js';

let failed = 0;

function assert(name, cond) {
  if (!cond) {
    failed += 1;
    console.error(`FAIL ${name}`);
  } else {
    console.log(`ok   ${name}`);
  }
}

async function main() {
  const stamp = Date.now();
  const password = 'toernooi-test-2026';
  const hash = await hashPassword(password);
  const settings = await getClubSettings();
  const previous = Boolean(settings.tournamentsEnabled);
  const people = [];
  const createdIds = [];

  async function makePerson(role, slug) {
    const person = await prisma.person.create({
      data: {
        name: `Toernooi ${slug}`,
        email: `toernooi-${slug}-${stamp}@vvl.test`,
        role,
        passwordHash: hash,
        active: true,
      },
    });
    people.push(person);
    return person;
  }

  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/tournaments', tournamentsRouter);
  app.use((err, _req, res, _next) => {
    const status = err.status || 500;
    res.status(status).json({ error: err.message || 'Fout' });
  });

  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  async function call(path, { method = 'GET', token, body } = {}) {
    const res = await fetch(`${base}${path}`, {
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
    const admin = await makePerson('Admin', 'admin');
    const bar = await makePerson('Barcommissie', 'bar');
    const volunteer = await makePerson('Vrijwilliger', 'vrij');
    await prisma.clubSettings.update({ where: { id: 1 }, data: { tournamentsEnabled: false } });

    const off = await call('/api/tournaments');
    const liveOff = await call('/api/tournaments/live/onbekend');
    const statusOff = await call('/api/tournaments/status');
    assert('uit: lijst en live zijn 404, status meldt uit', off.status === 404 && liveOff.status === 404 && statusOff.status === 200 && statusOff.json.enabled === false);

    const adminLogin = await call('/api/auth/login', {
      method: 'POST',
      body: { email: admin.email, password },
    });
    const barLogin = await call('/api/auth/login', {
      method: 'POST',
      body: { email: bar.email, password },
    });
    const volunteerLogin = await call('/api/auth/login', {
      method: 'POST',
      body: { email: volunteer.email, password },
    });
    const adminToken = adminLogin.json.token;
    const barToken = barLogin.json.token;
    const volunteerToken = volunteerLogin.json.token;
    assert('testdaccounts kunnen inloggen', Boolean(adminToken && barToken && volunteerToken));

    const volunteerPatch = await call('/api/settings/club', {
      method: 'PATCH',
      token: volunteerToken,
      body: { tournamentsEnabled: true },
    });
    const barPatch = await call('/api/settings/club', {
      method: 'PATCH',
      token: barToken,
      body: { tournamentsEnabled: true },
    });
    assert('alleen admin zet de schakelaar', volunteerPatch.status === 403 && barPatch.status === 403);

    const enabled = await call('/api/settings/club', {
      method: 'PATCH',
      token: adminToken,
      body: { tournamentsEnabled: true },
    });
    assert('admin zet toernooien aan', enabled.status === 200 && enabled.json.tournamentsEnabled === true);

    const statusOn = await call('/api/tournaments/status');
    const volunteerList = await call('/api/tournaments', { token: volunteerToken });
    const adminList = await call('/api/tournaments', { token: adminToken });
    assert('aan: status open, vrijwilliger 403, beheer 200', statusOn.status === 200 && volunteerList.status === 403 && adminList.status === 200);

    const created = await call('/api/tournaments', {
      method: 'POST',
      token: barToken,
      body: { seed: 'example' },
    });
    assert('barcommissie maakt een toernooi', created.status === 201 && created.json.publicToken);
    const id = created.json?.id;
    if (id) createdIds.push(id);
    const token = created.json?.publicToken;
    const sample = created.json?.view?.matches?.find((match) => match.phase === 'poule' && match.homeId);

    const live = await call(`/api/tournaments/live/${token}`);
    const liveText = JSON.stringify(live.json);
    assert(
      'live zonder login toont teamnamen en geen e-mail',
      live.status === 200 &&
        live.json.view?.state?.teams?.length === 16 &&
        liveText.includes('Lekkerkerk') &&
        !liveText.includes('@'),
    );

    const scored = await call(`/api/tournaments/${id}/scores`, {
      method: 'POST',
      token: barToken,
      body: { engineKey: sample?.id, home: 2, away: 0, played: true },
    });
    const row = scored.json?.view?.poules
      ?.find((poule) => poule.id === sample?.pouleId)
      ?.table?.find((item) => item.teamId === sample?.homeId);
    assert('uitslag werkt de stand bij', scored.status === 200 && row?.points === 3 && row?.gf === 2);

    const services = id ? await prisma.service.count({ where: { tournamentId: id, active: true, draft: false } }) : 0;
    assert('bar en keuken zijn open diensten', services === 5);

    const offAgain = await call('/api/settings/club', {
      method: 'PATCH',
      token: adminToken,
      body: { tournamentsEnabled: false },
    });
    const hidden = await call(`/api/tournaments/live/${token}`);
    const hiddenList = await call('/api/tournaments', { token: adminToken });
    assert('na uitzetten is ook live 404', offAgain.status === 200 && hidden.status === 404 && hiddenList.status === 404);
  } finally {
    await prisma.clubSettings.update({ where: { id: 1 }, data: { tournamentsEnabled: true } }).catch(() => {});
    for (const id of createdIds) {
      const services = await prisma.service.findMany({ where: { tournamentId: id }, select: { id: true } });
      const serviceIds = services.map((service) => service.id);
      if (serviceIds.length) {
        await prisma.enrollment.deleteMany({ where: { serviceId: { in: serviceIds } } });
        await prisma.serviceTeamDuty.deleteMany({ where: { serviceId: { in: serviceIds } } });
        await prisma.service.deleteMany({ where: { id: { in: serviceIds } } });
      }
      await prisma.tournament.delete({ where: { id } }).catch(() => {});
    }
    await prisma.clubSettings.update({ where: { id: 1 }, data: { tournamentsEnabled: previous } }).catch(() => {});
    const personIds = people.map((person) => person.id);
    if (personIds.length) {
      await prisma.session.deleteMany({ where: { personId: { in: personIds } } });
      await prisma.person.deleteMany({ where: { id: { in: personIds } } });
    }
    await new Promise((resolve) => server.close(resolve));
    await prisma.$disconnect();
  }

  if (failed) {
    console.error(`${failed} api-checks gefaald`);
    process.exit(1);
  }
  console.log('toernooi-api ok');
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
