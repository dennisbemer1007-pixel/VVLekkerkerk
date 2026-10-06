/**
 * Opschonen op een kopie van de database. De live database blijft onaangeroerd.
 * Run: node scripts/environment-reset-check.js
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import {
  assertBackupNonEmpty,
  confirmWordOk,
  KEPT_ROLES,
  previewEnvironmentReset,
  resolveSqliteFilePath,
  runEnvironmentReset,
} from '../src/backend/lib/environmentReset.js';
import { applyLiveMigrations } from '../src/backend/lib/liveDeploy.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;

function pass(name) {
  console.log(`PASS  ${name}`);
}

function assert(name, cond) {
  if (cond) pass(name);
  else {
    failed += 1;
    console.log(`FAIL  ${name}`);
  }
}

function databaseFile() {
  let url = process.env.DATABASE_URL || '';
  if (!url && fs.existsSync(path.join(root, '.env'))) {
    const text = fs.readFileSync(path.join(root, '.env'), 'utf8');
    const match = text.match(/^DATABASE_URL\s*=\s*"?([^"\n]+)"?/m);
    url = match ? match[1].trim() : '';
  }
  url = url.replace(/^["']|["']$/g, '');
  const fromEnv = url ? resolveSqliteFilePath(url) : null;
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  const fallback = path.join(root, 'src/backend/prisma/dev.db');
  if (fs.existsSync(fallback)) return fallback;
  return null;
}

function clientFor(file) {
  return new PrismaClient({ datasources: { db: { url: `file:${file}` } } });
}

async function snapshotLive(source, dest) {
  const db = clientFor(source);
  try {
    const escaped = dest.replace(/'/g, "''");
    try {
      await db.$executeRawUnsafe(`VACUUM INTO '${escaped}'`);
    } catch (err) {
      console.log(`snapshot via kopie (${err.message})`);
      try {
        await db.$queryRawUnsafe('PRAGMA wal_checkpoint(FULL)');
      } catch {
        /* live bestand kan gelockt zijn; de kopie is dan de terugval */
      }
      fs.copyFileSync(source, dest);
      for (const ext of ['-wal', '-shm']) {
        if (fs.existsSync(source + ext)) fs.copyFileSync(source + ext, dest + ext);
      }
    }
  } finally {
    await db.$disconnect();
  }
}

async function seed(db) {
  let team = await db.team.findFirst({ orderBy: { id: 'asc' } });
  if (!team) {
    team = await db.team.create({
      data: { name: 'Wipe Team', matchDurationMinutes: 80, teamDutySlots: '["MORNING"]' },
    });
  }
  const ruleCount = await db.serviceRule.count();
  if (!ruleCount) {
    await db.serviceRule.create({
      data: { name: 'Wipe regel', startTime: '12:00', endTime: '16:30', type: 'BAR' },
    });
  }
  const mail = await db.mailSettings.findUnique({ where: { id: 1 } });
  if (!mail) {
    await db.mailSettings.create({
      data: { id: 1, templates: '{"invite":{"subject":"Bewaar deze tekst"}}' },
    });
  }
  if (!(await db.clubSettings.findUnique({ where: { id: 1 } }))) {
    await db.clubSettings.create({ data: { id: 1, seasonLabel: '2026-2027' } });
  }

  const volunteer = await db.person.create({
    data: {
      name: 'Wipe Vrijwilliger',
      email: 'wipe-vrij@test.local',
      role: 'Vrijwilliger',
      teamId: team.id,
      inviteToken: 'wipe-invite-vrij',
      inviteExpiresAt: new Date('2026-12-01T00:00:00Z'),
    },
  });
  const coordinator = await db.person.create({
    data: {
      name: 'Wipe Teamcoördinator',
      email: 'wipe-tc@test.local',
      role: 'Teamcoördinator',
      teamId: team.id,
    },
  });
  await db.person.create({
    data: {
      name: 'Wipe Kind',
      email: 'wipe-kind@test.local',
      role: 'Vrijwilliger',
      guardianId: volunteer.id,
    },
  });
  const admin = await db.person.create({
    data: {
      name: 'Wipe Admin',
      email: 'wipe-admin@test.local',
      role: 'Admin',
      teamId: team.id,
      guardianId: volunteer.id,
      inviteToken: 'wipe-invite-admin',
      inviteExpiresAt: new Date('2026-12-01T00:00:00Z'),
      passwordResetToken: 'wipe-reset-admin',
      passwordResetExpiresAt: new Date('2026-12-01T00:00:00Z'),
    },
  });
  const bar = await db.person.create({
    data: {
      name: 'Wipe Bar',
      email: 'wipe-bar@test.local',
      role: 'Barcommissie',
      teamId: team.id,
    },
  });
  await db.person.create({
    data: { name: 'Wipe Bestuur', email: 'wipe-bestuur@test.local', role: 'Bestuur' },
  });
  await db.person.create({
    data: { name: 'Wipe Coördinator', email: 'wipe-coord@test.local', role: 'Coördinator' },
  });

  await db.team.update({
    where: { id: team.id },
    data: { coordinatorId: coordinator.id },
  });
  await db.personTeam.create({
    data: { personId: admin.id, teamId: team.id, season: '2026-2027', active: true },
  });
  await db.personTeam.create({
    data: { personId: bar.id, teamId: team.id, season: '2026-2027', active: true },
  });
  await db.serviceRule.create({
    data: {
      name: 'Wipe teamvoorwaarde',
      startTime: '09:00',
      endTime: '12:00',
      type: 'BAR',
      conditionType: 'HOME_MATCH_TEAM',
      conditionTeamId: team.id,
      conditionTeamName: team.name,
      teamDutyTeamIds: JSON.stringify([team.id]),
    },
  });

  const match = await db.match.create({
    data: { date: new Date('2026-10-04T00:00:00Z'), home: true, opponent: 'Wipe FC', teamId: team.id },
  });
  const serviceA = await db.service.create({
    data: {
      type: 'BAR',
      date: new Date('2026-10-04T00:00:00Z'),
      time: '12:00 - 16:30',
      location: 'Kantine',
      required: 2,
      matchId: match.id,
    },
  });
  const serviceB = await db.service.create({
    data: {
      type: 'KITCHEN',
      date: new Date('2026-10-04T00:00:00Z'),
      time: '12:00 - 16:30',
      location: 'Keuken',
      required: 1,
    },
  });
  const enrollmentA = await db.enrollment.create({
    data: { serviceId: serviceA.id, personId: volunteer.id, noShow: true },
  });
  const enrollmentB = await db.enrollment.create({
    data: { serviceId: serviceB.id, personId: coordinator.id },
  });
  await db.swapRequest.create({
    data: {
      fromEnrollmentId: enrollmentA.id,
      toEnrollmentId: enrollmentB.id,
      requesterId: volunteer.id,
      counterpartyId: coordinator.id,
    },
  });
  await db.notification.create({
    data: { personId: volunteer.id, type: 'SWAP_INCOMING', title: 'Ruil', body: 'Wipe' },
  });
  await db.personAbsence.create({
    data: {
      personId: volunteer.id,
      fromDate: new Date('2026-10-01T00:00:00Z'),
      toDate: new Date('2026-10-08T00:00:00Z'),
      note: 'wipe',
    },
  });
  await db.planningRound.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      status: 'PUBLISHED',
      official: true,
      fromDate: new Date('2026-10-01T00:00:00Z'),
      toDate: new Date('2026-12-31T00:00:00Z'),
    },
    update: {
      status: 'PUBLISHED',
      official: true,
      fromDate: new Date('2026-10-01T00:00:00Z'),
      toDate: new Date('2026-12-31T00:00:00Z'),
    },
  });

  return { adminId: admin.id, teamId: team.id, teamName: team.name };
}

async function fingerprint(db) {
  const [services, enrollments, swaps, notifications, absences, matches, persons, volunteers, coordinators, teams, rules, activities, mail, club, tokens] =
    await Promise.all([
      db.service.count(),
      db.enrollment.count(),
      db.swapRequest.count(),
      db.notification.count(),
      db.personAbsence.count(),
      db.match.count(),
      db.person.count(),
      db.person.count({ where: { role: 'Vrijwilliger' } }),
      db.person.count({ where: { role: 'Teamcoördinator' } }),
      db.team.findMany({ orderBy: { id: 'asc' } }),
      db.serviceRule.findMany({ orderBy: { id: 'asc' } }),
      db.activity.count(),
      db.mailSettings.findUnique({ where: { id: 1 } }),
      db.clubSettings.findUnique({ where: { id: 1 } }),
      db.person.count({
        where: { OR: [{ inviteToken: { not: null } }, { passwordResetToken: { not: null } }] },
      }),
    ]);
  return {
    services,
    enrollments,
    swaps,
    notifications,
    absences,
    matches,
    persons,
    volunteers,
    coordinators,
    teams,
    rules,
    activities,
    mail,
    club,
    tokens,
  };
}

function sameData(a, b) {
  const teamA = a.teams.map(({ coordinatorId, ...rest }) => rest);
  const teamB = b.teams.map(({ coordinatorId, ...rest }) => rest);
  return (
    a.services === b.services &&
    a.enrollments === b.enrollments &&
    a.swaps === b.swaps &&
    a.notifications === b.notifications &&
    a.absences === b.absences &&
    a.matches === b.matches &&
    a.persons === b.persons &&
    a.tokens === b.tokens &&
    a.activities === b.activities &&
    JSON.stringify(teamA) === JSON.stringify(teamB) &&
    JSON.stringify(a.rules) === JSON.stringify(b.rules) &&
    JSON.stringify(a.mail) === JSON.stringify(b.mail) &&
    JSON.stringify(a.club) === JSON.stringify(b.club)
  );
}

async function expectReject(name, fn, status) {
  try {
    await fn();
    assert(name, false);
  } catch (err) {
    assert(name, err.status === status);
  }
}

async function main() {
  assert('woord met spaties en hoofdletters', confirmWordOk('  OpSchonen  ') === true);
  assert('leeg woord telt niet', confirmWordOk('   ') === false);
  assert('extra tekens tellen niet', confirmWordOk('opschonen!') === false && confirmWordOk('op schonen') === false);

  const empty = path.join(os.tmpdir(), `vvl-empty-${process.pid}.db`);
  fs.writeFileSync(empty, '');
  let emptyThrew = false;
  try {
    assertBackupNonEmpty(empty);
  } catch (err) {
    emptyThrew = err.status === 500 && !fs.existsSync(empty);
  }
  assert('lege back-up telt als fout en blijft niet staan', emptyThrew);

  const source = databaseFile();
  assert('bron-database aanwezig', Boolean(source));
  if (!source) {
    console.log(`\n${failed} failed`);
    process.exit(1);
  }

  const prep = clientFor(source);
  try {
    await applyLiveMigrations(prep, root);
  } finally {
    await prep.$disconnect();
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vvl-opschonen-'));
  const snap = path.join(tmp, 'snap.db');
  await snapshotLive(source, snap);

  const seeded = clientFor(snap);
  let seededIds;
  try {
    seededIds = await seed(seeded);
    await seeded.$queryRawUnsafe('PRAGMA wal_checkpoint(TRUNCATE)');
  } finally {
    await seeded.$disconnect();
  }

  function fresh(name) {
    const file = path.join(tmp, name);
    fs.copyFileSync(snap, file);
    for (const ext of ['-wal', '-shm']) {
      if (fs.existsSync(snap + ext) && fs.statSync(snap + ext).size > 0) {
        fs.copyFileSync(snap + ext, file + ext);
      }
    }
    return file;
  }

  const untouched = fresh('untouched.db');
  const baselineDb = clientFor(untouched);
  let baseline;
  try {
    baseline = await fingerprint(baselineDb);
  } finally {
    await baselineDb.$disconnect();
  }
  assert('testdata bevat vrijwilligers en teamcoördinatoren', baseline.volunteers > 0 && baseline.coordinators > 0);
  assert('testdata bevat diensten', baseline.services > 0);

  async function unchangedAfter(file, label, fn) {
    const db = clientFor(file);
    const destDir = path.join(tmp, `${label}-backup`);
    fs.mkdirSync(destDir, { recursive: true });
    try {
      await fn(db, destDir, file);
      const after = await fingerprint(db);
      assert(`${label}: niets gewist`, sameData(baseline, after));
      return destDir;
    } finally {
      await db.$disconnect();
    }
  }

  await unchangedAfter(fresh('wrong.db'), 'verkeerd-woord', async (db, destDir, file) => {
    await expectReject(
      'verkeerd woord geeft 400',
      () => runEnvironmentReset(db, { actorId: seededIds.adminId, confirm: 'wissen', destDir, dbPath: file }),
      400,
    );
    const files = fs.readdirSync(destDir).filter((name) => name.endsWith('.db'));
    assert('verkeerd woord maakt geen back-up', files.length === 0);
  });

  await unchangedAfter(fresh('empty-word.db'), 'geen-woord', async (db, destDir, file) => {
    await expectReject(
      'geen woord geeft 400',
      () => runEnvironmentReset(db, { actorId: seededIds.adminId, confirm: '   ', destDir, dbPath: file }),
      400,
    );
    const files = fs.readdirSync(destDir).filter((name) => name.endsWith('.db'));
    assert('geen woord maakt geen back-up', files.length === 0);
  });

  const blockedParent = path.join(tmp, 'not-a-directory');
  fs.writeFileSync(blockedParent, 'x');
  await unchangedAfter(fresh('backup-fail.db'), 'backup-mislukt', async (db, _destDir, file) => {
    await expectReject(
      'back-up die mislukt geeft 500',
      () =>
        runEnvironmentReset(db, {
          actorId: seededIds.adminId,
          confirm: 'OPSCHONEN',
          destDir: path.join(blockedParent, 'backups'),
          dbPath: file,
        }),
      500,
    );
  });

  await unchangedAfter(fresh('rollback.db'), 'fout-in-transactie', async (db, destDir, file) => {
    await expectReject(
      'fout tijdens wissen geeft 500',
      () =>
        runEnvironmentReset(db, {
          actorId: seededIds.adminId,
          confirm: 'opschonen',
          destDir,
          dbPath: file,
          failForTest: true,
        }),
      500,
    );
  });

  const work = fresh('success.db');
  const destDir = path.join(tmp, 'success-backup');
  const db = clientFor(work);
  try {
    const preview = await previewEnvironmentReset(db, { dbPath: work, destDir });
    assert(
      'voorbeeld toont wissen en blijven',
      preview.wissen.some((row) => row.key === 'diensten' && row.count === baseline.services) &&
        preview.wissen.some((row) => row.key === 'teams' && row.count === baseline.teams.length) &&
        preview.wissen.some((row) => row.key === 'teamKoppelingen' && row.count >= 2) &&
        !preview.blijft.some((row) => row.key === 'teams') &&
        preview.blijft.some((row) => row.key === 'dienstregels' && row.count === baseline.rules.length),
    );

    const result = await runEnvironmentReset(db, {
      actorId: seededIds.adminId,
      confirm: '  OpSchonen  ',
      destDir,
      dbPath: work,
    });
    assert('melding noemt de back-up', result.message.includes(result.backup) && result.backup.startsWith('vvl-opschonen-'));
    assert('back-upbestand bestaat en is niet leeg', fs.existsSync(result.backupPath) && fs.statSync(result.backupPath).size > 0);

    const check = clientFor(result.backupPath);
    try {
      const backed = await check.person.count({ where: { role: 'Vrijwilliger' } });
      assert('back-up bevat de vrijwilligers van vóór het wissen', backed === baseline.volunteers);
    } finally {
      await check.$disconnect();
    }

    assert('diensten leeg', (await db.service.count()) === 0);
    assert('inschrijvingen leeg', (await db.enrollment.count()) === 0);
    assert('ruilverzoeken leeg', (await db.swapRequest.count()) === 0);
    assert('meldingen leeg', (await db.notification.count()) === 0);
    assert('afwezigheden leeg', (await db.personAbsence.count()) === 0);
    assert('no-shows weg met de inschrijvingen', (await db.enrollment.count({ where: { noShow: true } })) === 0);
    assert('wedstrijden leeg', (await db.match.count()) === 0);
    const round = await db.planningRound.findUnique({ where: { id: 1 } });
    assert(
      'planningsronde terug naar concept',
      round && round.official === false && round.status === 'DRAFT' && round.fromDate === null && round.toDate === null,
    );
    assert(
      'geen uitnodigings- of resetlinks meer',
      (await db.person.count({
        where: { OR: [{ inviteToken: { not: null } }, { passwordResetToken: { not: null } }] },
      })) === 0,
    );
    assert('vrijwilligers weg', (await db.person.count({ where: { role: 'Vrijwilliger' } })) === 0);
    assert('teamcoördinatoren weg', (await db.person.count({ where: { role: 'Teamcoördinator' } })) === 0);
    const remaining = await db.person.findMany();
    assert(
      'alleen barcommissie en admin blijven',
      remaining.length > 0 && remaining.every((person) => KEPT_ROLES.includes(person.role)),
    );
    const keptAdmin = remaining.find((person) => person.email === 'wipe-admin@test.local');
    const keptBar = remaining.find((person) => person.email === 'wipe-bar@test.local');
    assert(
      'admin en barcommissie blijven, koppeling naar gewiste persoon is los',
      keptAdmin && keptAdmin.guardianId === null && keptBar && remaining.some((person) => person.role === 'Bestuur') && remaining.some((person) => person.role === 'Coördinator'),
    );
    assert('kind en teamcoördinator zijn verwijderd', !remaining.some((person) => person.email === 'wipe-kind@test.local' || person.email === 'wipe-tc@test.local'));

    const teamsAfter = await db.team.findMany({ orderBy: { id: 'asc' } });
    const rulesAfter = await db.serviceRule.findMany({ orderBy: { id: 'asc' } });
    const mailAfter = await db.mailSettings.findUnique({ where: { id: 1 } });
    const clubAfter = await db.clubSettings.findUnique({ where: { id: 1 } });
    assert('teams en speeltijden zijn weg', teamsAfter.length === 0 && result.gewist.teams === baseline.teams.length);
    assert('persoon-teamkoppelingen zijn weg', (await db.personTeam.count()) === 0);
    assert(
      'blijvende accounts hebben geen team meer',
      remaining.every((person) => person.teamId == null),
    );
    assert(
      'dienstregels blijven, teamvoorwaarden losgekoppeld',
      rulesAfter.length === baseline.rules.length &&
        rulesAfter.every(
          (rule) =>
            rule.conditionTeamId == null &&
            (rule.teamDutyTeamIds === '[]' || rule.teamDutyTeamIds === ''),
        ),
    );
    const namedRule = rulesAfter.find((rule) => rule.name === 'Wipe teamvoorwaarde');
    assert(
      'dienstregel-naam blijft na loskoppelen team',
      namedRule && namedRule.conditionTeamName === seededIds.teamName,
    );
    assert('mailteksten blijven', JSON.stringify(baseline.mail) === JSON.stringify(mailAfter));
    assert('clubgegevens blijven', JSON.stringify(baseline.club) === JSON.stringify(clubAfter));
    assert('jaarplanning blijft', (await db.activity.count()) === baseline.activities);
    assert('resultaat meldt nul teams die blijven', result.blijft.teams === 0);

    const audit = await db.auditLog.findFirst({
      where: { action: 'environment.reset' },
      orderBy: { id: 'desc' },
    });
    assert(
      'audit legt vast wie opschoonde',
      audit && audit.actorId === seededIds.adminId && audit.detail.includes(result.backup) && audit.createdAt instanceof Date,
    );
  } finally {
    await db.$disconnect();
  }

  console.log(failed ? `\n${failed} failed` : '\nomgeving-opschonen geslaagd');
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
