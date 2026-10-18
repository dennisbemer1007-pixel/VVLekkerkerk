/**
 * Inschrijven mag geen 500 geven nadat de rij al is opgeslagen.
 * Nabootst zondag 22 nov 2026, bardienst 13:00–16:00, met een wedstrijd
 * die de dienst overlapt, en een bevestigingsmail die daarna stukgaat.
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dest = path.join(os.tmpdir(), `vvl-enroll-${process.pid}.db`);
process.env.DATABASE_URL = `file:${dest}`;
delete process.env.DATA_DIR;
process.env.NODE_ENV = 'test';

const push = spawnSync(
  process.execPath,
  [
    path.join(root, 'node_modules/prisma/build/index.js'),
    'db',
    'push',
    '--schema=src/backend/prisma/schema.prisma',
    '--skip-generate',
    '--accept-data-loss',
  ],
  { cwd: root, env: process.env, encoding: 'utf8' },
);
if (push.status !== 0) {
  console.error(push.stdout);
  console.error(push.stderr);
  process.exit(1);
}

const { default: prisma } = await import('../src/backend/lib/prisma.js');
const { createSession } = await import('../src/backend/lib/auth.js');
const { default: authRouter } = await import('../src/backend/routes/auth.js');
const { default: enrollmentsRouter, enrollmentFollowUp } = await import(
  '../src/backend/routes/enrollments.js'
);
const { clientErrorPayload } = await import('../src/backend/lib/clientError.js');

let failed = 0;
function assert(name, cond, extra = '') {
  if (!cond) {
    failed += 1;
    console.error(`FAIL ${name}${extra ? ` — ${extra}` : ''}`);
  } else {
    console.log(`ok   ${name}`);
  }
}

const day = new Date('2026-11-22T12:00:00.000Z');

async function main() {
  enrollmentFollowUp.confirm = async () => {
    throw new Error('smtp kapot');
  };

  const team = await prisma.team.create({
    data: { name: 'Zondag test', availabilityUse: true },
  });
  const volunteer = await prisma.person.create({
    data: {
      name: 'Vrijwilliger Test',
      email: `enroll-${process.pid}@vvl.test`,
      role: 'Vrijwilliger',
      active: true,
      teamId: team.id,
    },
  });
  const committee = await prisma.person.create({
    data: {
      name: 'Barcommissie Test',
      email: `bar-${process.pid}@vvl.test`,
      role: 'Barcommissie',
      active: true,
    },
  });
  await prisma.planningRound.create({
    data: {
      label: 'Najaar test',
      fromDate: new Date('2026-10-19T00:00:00.000Z'),
      toDate: new Date('2026-11-29T23:59:59.999Z'),
      publishedAt: new Date('2026-10-18T12:00:00.000Z'),
      active: true,
      status: 'PUBLISHED',
    },
  });
  await prisma.match.create({
    data: {
      date: day,
      time: '14:30',
      home: true,
      opponent: 'FC Test',
      teamId: team.id,
    },
  });
  const service = await prisma.service.create({
    data: {
      type: 'BAR',
      date: day,
      time: '13:00 - 16:00',
      location: 'Bar',
      required: 1,
      active: true,
      draft: false,
      locked: true,
      slot: 'AFTERNOON',
      origin: 'AUTO',
    },
  });
  const second = await prisma.service.create({
    data: {
      type: 'BAR',
      date: day,
      time: '13:00 - 16:00',
      location: 'Bar',
      required: 1,
      active: true,
      draft: false,
      locked: true,
      slot: 'AFTERNOON',
      origin: 'AUTO',
    },
  });

  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  app.use('/api/enrollments', enrollmentsRouter);
  app.use((err, _req, res, _next) => {
    const { status, body } = clientErrorPayload(err, true);
    res.status(status).json(body);
  });
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const volunteerToken = await createSession(volunteer.id);
  const committeeToken = await createSession(committee.id);

  async function call(token, body) {
    const res = await fetch(`${base}/api/enrollments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
  }

  try {
    const blocked = await call(volunteerToken, {
      serviceId: service.id,
      personId: volunteer.id,
    });
    const before = await prisma.enrollment.count({ where: { serviceId: service.id } });
    assert(
      'wedstrijd blokkeert de eerste klik en schrijft nog niemand in',
      blocked.status === 409 && blocked.json.code === 'MATCH_BLOCK' && before === 0,
      `${blocked.status} ${blocked.json.code || blocked.json.error} n=${before}`,
    );

    const saved = await call(volunteerToken, {
      serviceId: service.id,
      personId: volunteer.id,
      ignoreMatchBlock: true,
    });
    const rows = await prisma.enrollment.findMany({ where: { serviceId: service.id } });
    assert(
      'toch inschrijven lukt ook als de bevestigingsmail stuk is',
      saved.status === 201 && rows.length === 1 && rows[0].personId === volunteer.id,
      `${saved.status} ${saved.json.error || ''} n=${rows.length}`,
    );

    const again = await call(volunteerToken, {
      serviceId: service.id,
      personId: volunteer.id,
      ignoreMatchBlock: true,
    });
    const after = await prisma.enrollment.count({ where: { serviceId: service.id } });
    assert(
      'tweede klik maakt geen tweede inschrijving',
      (again.status === 403 || again.status === 409) &&
        again.json.error !== 'Internal server error' &&
        after === 1,
      `${again.status} ${again.json.error || ''} n=${after}`,
    );

    const committeeEnroll = await call(committeeToken, {
      serviceId: second.id,
      personId: volunteer.id,
      ignoreMatchBlock: true,
    });
    const committeeRows = await prisma.enrollment.count({ where: { serviceId: second.id } });
    assert(
      'barcommissie schrijft in ondanks wedstrijd, zonder serverfout',
      committeeEnroll.status === 201 && committeeRows === 1,
      `${committeeEnroll.status} ${committeeEnroll.json.error || ''} n=${committeeRows}`,
    );
  } finally {
    server.close();
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
console.log(failed ? `\n${failed} mislukt` : '\ninschrijf-check geslaagd');
process.exit(failed ? 1 : 0);
