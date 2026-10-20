/**
 * Za 31 okt: O15-1 staat al op de officiële ochtend. Fairness zou O15-3 kiezen.
 * Na 'Ander team' én zonder vlag moet een sync/herstart O15-1 laten staan.
 * Raakt geen clubdatabase.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dbFile = path.join(os.tmpdir(), `team-duty-freeze-${process.pid}.db`);
process.env.DATABASE_URL = `file:${dbFile}`;
process.env.DATA_DIR = '';
process.env.NODE_ENV = 'production';
process.env.SEED_DEMO = '';

const push = spawnSync(
  process.execPath,
  [
    path.join(root, 'node_modules/prisma/build/index.js'),
    'db',
    'push',
    '--schema=src/backend/prisma/schema.prisma',
    '--accept-data-loss',
    '--skip-generate',
  ],
  { cwd: root, env: process.env, encoding: 'utf8' },
);
if (push.status !== 0) {
  console.error(push.stdout);
  console.error(push.stderr);
  process.exit(1);
}

const { default: prisma } = await import('../src/backend/lib/prisma.js');
const { ensureClubDefaults } = await import('../src/backend/lib/clubDefaults.js');
const { generateServicesFromRules } = await import('../src/backend/lib/serviceGeneration.js');
const { mapService, serviceInclude } = await import('../src/backend/lib/serviceHelpers.js');
const { enrollmentNameWithTeam } = await import('../src/frontend/utils/teamLines.js');

let failed = 0;
function assert(name, cond, detail = '') {
  if (cond) {
    console.log(`PASS  ${name}`);
    return;
  }
  failed += 1;
  console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function morningDutyTeamId() {
  const services = await prisma.service.findMany({
    where: {
      type: 'BAR',
      time: { startsWith: '07:30' },
      date: { gte: new Date('2026-10-31T00:00:00.000Z'), lte: new Date('2026-10-31T23:59:59.000Z') },
    },
    include: { teamDuties: { include: { team: true } } },
    orderBy: { id: 'asc' },
  });
  const service = services.find((row) => row.active !== false) || services[0];
  return {
    service,
    count: services.length,
    teamId: service?.teamDuties?.[0]?.teamId ?? null,
    teamName: service?.teamDuties?.[0]?.team?.name ?? null,
  };
}

try {
  await ensureClubDefaults();
  await prisma.serviceRule.updateMany({
    where: { weekday: 6, type: 'BAR', slot: 'MORNING' },
    data: { teamDuty: true, teamDutySlotRole: 'MORNING', teamDutyAgeFrom: 13, teamDutyAgeTo: 17 },
  });

  const o151 = await prisma.team.create({
    data: { name: 'O15-1', teamDutyUse: true, teamDutySlots: JSON.stringify(['MORNING', 'SECOND', 'LAST']), active: true },
  });
  const o153 = await prisma.team.create({
    data: { name: 'O15-3', teamDutyUse: true, teamDutySlots: JSON.stringify(['MORNING', 'SECOND', 'LAST']), active: true },
  });

  const day = new Date('2026-10-31T12:00:00.000Z');
  const earlier = new Date('2026-10-24T12:00:00.000Z');
  for (const team of [o151, o153]) {
    await prisma.match.create({
      data: { date: day, time: '09:30', home: true, opponent: 'Uit', teamId: team.id },
    });
  }

  // O15-1 heeft al meer teamdiensten, dus fairness kiest O15-3 als herverdelen mag.
  const earlierService = await prisma.service.create({
    data: {
      type: 'BAR',
      date: earlier,
      time: '07:30 - 12:00',
      location: 'Bar',
      required: 3,
      slot: 'MORNING',
      origin: 'AUTO',
      locked: true,
      active: true,
      draft: false,
    },
  });
  await prisma.serviceTeamDuty.create({
    data: { serviceId: earlierService.id, teamId: o151.id, reserved: 2 },
  });

  const morning = await prisma.service.create({
    data: {
      type: 'BAR',
      date: day,
      time: '07:30 - 12:00',
      location: 'Bar',
      required: 3,
      slot: 'MORNING',
      origin: 'AUTO',
      locked: true,
      teamDutiesManual: false,
      active: true,
      draft: false,
    },
  });
  const duty = await prisma.serviceTeamDuty.create({
    data: { serviceId: morning.id, teamId: o151.id, reserved: 2 },
  });

  await generateServicesFromRules({ from: '2026-10-31', to: '2026-10-31' });
  let after = await morningDutyTeamId();
  assert(
    'officiële ochtend met O15-1 blijft O15-1 na sync, ook zonder vlag',
    after.teamId === o151.id && after.count === 1,
    `nu ${after.teamName || after.teamId} diensten=${after.count}`,
  );

  // Handmatig 'Ander team': eerst fout team, dan de route-actie (team + vlag).
  await prisma.serviceTeamDuty.update({ where: { id: duty.id }, data: { teamId: o153.id } });
  await prisma.serviceTeamDuty.update({ where: { id: duty.id }, data: { teamId: o151.id } });
  await prisma.service.update({ where: { id: morning.id }, data: { teamDutiesManual: true } });
  await generateServicesFromRules({ from: '2026-10-31', to: '2026-10-31' });
  after = await morningDutyTeamId();
  assert(
    'Ander team naar O15-1 blijft staan na herstart en sync',
    after.teamId === o151.id && after.service?.teamDutiesManual === true && after.count === 1,
    `nu ${after.teamName || after.teamId} vlag=${after.service?.teamDutiesManual} diensten=${after.count}`,
  );

  const jay = await prisma.person.create({
    data: { name: 'Jay de Jong', role: 'Vrijwilliger', teamId: o151.id },
  });
  const hanneke = await prisma.person.create({
    data: { name: 'Hanneke Verhoeff', role: 'Vrijwilliger', teamId: o151.id },
  });
  await prisma.enrollment.create({
    data: {
      serviceId: morning.id,
      personId: jay.id,
      source: 'SELF',
      kind: 'PERSONAL',
      reason: 'Zelf ingeschreven',
    },
  });
  await prisma.enrollment.create({
    data: {
      serviceId: morning.id,
      personId: hanneke.id,
      source: 'TEAM',
      kind: 'PERSONAL',
      reason: 'Ingevuld door de bardienstcoördinator',
    },
  });
  const mapped = mapService(
    await prisma.service.findUnique({ where: { id: morning.id }, include: serviceInclude }),
  );
  const byName = Object.fromEntries(
    mapped.enrollments.map((row) => [row.person.name, enrollmentNameWithTeam(row)]),
  );
  assert('zelf ingeschreven toont geen team', byName['Jay de Jong'] === 'Jay de Jong', byName['Jay de Jong']);
  assert(
    'coördinator-invulling toont Naam (Team)',
    byName['Hanneke Verhoeff'] === 'Hanneke Verhoeff (O15-1)',
    byName['Hanneke Verhoeff'],
  );
} catch (err) {
  console.error(err);
  failed += 1;
} finally {
  await prisma.$disconnect();
  fs.rmSync(dbFile, { force: true });
  fs.rmSync(`${dbFile}-journal`, { force: true });
}

if (failed) process.exit(1);
