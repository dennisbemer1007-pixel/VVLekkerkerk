/**
 * Volledige nieuwe planning (stap 1, publiceren, sync) op een tijdelijke database.
 * Gebruikt Chantal's wedstrijd-CSV en haar dienstregels. Raakt de clubdatabase niet.
 *
 * Run: node scripts/chantal-planning-regression.js
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dbFile = path.join(os.tmpdir(), `chantal-planning-${process.pid}.db`);
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
const { ensureDefaultServiceRules } = await import('../src/backend/lib/clubDefaults.js');
const { parseCsv, validateMatchRows } = await import('../src/backend/lib/csvMatches.js');
const { persistValidMatchRows } = await import('../src/backend/lib/importMatches.js');
const { createPlanningRound } = await import('../src/backend/lib/planningRounds.js');
const { proposeFromMatches, publishDraftServices } = await import('../src/backend/lib/proposePlanning.js');
const { toIsoDate } = await import('../src/backend/lib/dates.js');
const {
  datesInRange,
  evaluateRule,
  manualCoversSpec,
  sameCalendarDay,
} = await import('../src/backend/lib/serviceRuleLogic.js');
const {
  eligibleTeamDutyCandidates,
  pickTeamDutyAssignment,
  recordTeamDutyStand,
} = await import('../src/backend/lib/teamDutyPlanning.js');
const { youthTeamAliasKey } = await import('../src/backend/lib/youthTeams.js');
const {
  additionalRosterServices,
  extraServicesForDay,
  isExtraRosterService,
  rosterDaySections,
  rowLabelTime,
  servicesForSlotRow,
} = await import('../src/backend/lib/pdfRoster.js');
const { FIXED_PERSON_REASON } = await import('../src/backend/lib/serviceGeneration.js');

const FROM = '2026-10-19';
const TO = '2026-11-29';
const HOME_EERSTE = ['2026-10-24', '2026-11-07', '2026-11-28'];
const AWAY_EERSTE = ['2026-10-31', '2026-11-14', '2026-11-21'];
let failed = 0;

function assert(name, cond, detail = '') {
  if (cond) {
    console.log(`PASS  ${name}`);
    return;
  }
  failed += 1;
  console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
}

function iso(value) {
  return toIsoDate(value);
}

function ruleTime(rule) {
  return `${rule.startTime} - ${rule.endTime}`;
}

function finger(rule) {
  return {
    id: rule.id,
    name: rule.name,
    weekday: rule.weekday,
    startTime: rule.startTime,
    endTime: rule.endTime,
    type: rule.type,
    required: rule.required,
    slot: rule.slot,
    conditionType: rule.conditionType,
    conditionTeamName: rule.conditionTeamName,
    conditionTeamId: rule.conditionTeamId,
    kickoffAfter: rule.kickoffAfter ?? null,
    active: rule.active,
    fixedPersonId: rule.fixedPersonId ?? null,
    teamDuty: rule.teamDuty,
    teamDutySlotRole: rule.teamDutySlotRole,
  };
}

try {
  const seeded = await ensureDefaultServiceRules();
  assert('lege club krijgt de standaard dienstregels', seeded.seeded === true && seeded.count > 0);

  const piet = await prisma.person.create({
    data: { name: 'Piet', email: 'piet.chantal@example.test', role: 'Vrijwilliger', active: true },
  });

  const csvPath = path.join(root, 'scripts/fixtures/chantal-wedstrijdplanning-5.csv');
  const csv = `${fs.readFileSync(csvPath, 'utf8').trim()}
"2026-10-31";"10:30:00";"Lekkerkerk MO15-1";"Ergens MO15-1";"Geen";"Sportpark Lekkerkerk";"veld 3";;"Geen";"99001";"Reguliere competitie";"A-categorie";
`;
  const parsed = parseCsv(csv);
  const validated = validateMatchRows(parsed.rows, {
    headerError: parsed.headerError,
    format: parsed.format,
  });
  assert('Chantal-csv heeft geldige wedstrijden', validated.rows.length > 100, String(validated.errors?.[0]?.message || ''));
  const imported = await persistValidMatchRows(prisma, validated.rows);
  assert('wedstrijden opgeslagen', imported.created.length > 100 && imported.persistErrors.length === 0);

  const teams = await prisma.team.findMany();
  const zaEerste = teams.find((team) => team.name === 'Lekkerkerk 1 (za)');
  const zoTweede = teams.find((team) => team.name === 'Lekkerkerk 2 (zo)');
  assert('Lekkerkerk 1 (za) en Zondag 2 bestaan', Boolean(zaEerste && zoTweede));

  const byName = new Map(
    (await prisma.serviceRule.findMany()).map((rule) => [rule.name, rule]),
  );
  await prisma.serviceRule.update({
    where: { id: byName.get('Zaterdag bar tweede shift').id },
    data: { startTime: '12:05', endTime: '16:25' },
  });
  await prisma.serviceRule.update({
    where: { id: byName.get('Zaterdag keuken laat (Lekkerkerk 1 thuis)').id },
    data: {
      conditionType: 'HOME_MATCH_TEAM',
      conditionTeamName: 'Lekkerkerk 1',
      conditionTeamId: zaEerste.id,
      kickoffAfter: '12:00',
      startTime: '16:00',
      endTime: '19:00',
      slot: 'EVENING',
      active: true,
    },
  });
  await prisma.serviceRule.update({
    where: { id: byName.get('Zondag bar ochtend').id },
    data: {
      startTime: '08:15',
      endTime: '12:45',
      slot: 'MORNING',
      conditionType: 'NO_HOME_MATCH_TEAM',
      conditionTeamName: 'Lekkerkerk 2',
      conditionTeamId: zoTweede.id,
      fixedPersonId: piet.id,
      active: true,
    },
  });
  await prisma.serviceRule.update({
    where: { id: byName.get('Zondag bar middag').id },
    data: { startTime: '13:15', endTime: '16:15', slot: 'AFTERNOON' },
  });
  await prisma.serviceRule.update({
    where: { id: byName.get('Zondag keuken').id },
    data: { startTime: '12:15', endTime: '15:15', slot: 'AFTERNOON' },
  });

  const before = (await prisma.serviceRule.findMany({ orderBy: { id: 'asc' } })).map(finger);

  await prisma.service.create({
    data: {
      type: 'KITCHEN',
      date: new Date('2026-10-24T12:00:00Z'),
      time: '10:00 - 13:00',
      location: 'Keuken',
      required: 1,
      origin: 'MANUAL',
      slot: 'EXTRA',
      draft: true,
      active: true,
      note: 'Handmatig ontbijt',
    },
  });
  await prisma.service.create({
    data: {
      type: 'BAR',
      origin: 'AUTO',
      date: new Date('2026-10-24T12:00:00Z'),
      time: '19:30 - 00:00',
      location: 'Bar',
      required: 2,
      slot: 'EVENING',
      draft: true,
      locked: true,
      active: true,
    },
  });

  await createPlanningRound(prisma, { label: 'Najaar Chantal', from: FROM, to: TO });
  const step1 = await proposeFromMatches({ from: FROM, to: TO });
  assert('stap 1 maakt diensten', (step1.created || 0) + (step1.updated || 0) > 0, JSON.stringify(step1.error || ''));

  const afterStep1 = await prisma.service.findMany({ where: { active: true } });
  assert(
    'vóór publiceren zijn automatische diensten nog concept',
    afterStep1.some((service) => service.origin === 'AUTO' && service.draft === true),
  );

  const published = await publishDraftServices({ from: FROM, to: TO, volunteerDeadline: '2026-10-26' });
  assert('publiceren zet concepten open', published.published > 0);
  const afterPublish = await prisma.service.findMany({
    where: { active: true, date: { gte: new Date(`${FROM}T00:00:00Z`), lte: new Date(`${TO}T23:59:59Z`) } },
  });
  assert(
    'na publiceren heeft geen dienst nog een conceptlabel',
    afterPublish.every((service) => service.draft === false),
    `${afterPublish.filter((service) => service.draft).length} concept`,
  );

  const kitchenLate = await prisma.service.findFirst({
    where: { type: 'KITCHEN', origin: 'AUTO', time: '16:00 - 19:00', active: true },
  });
  assert('late keuken bestaat vóór de sync', Boolean(kitchenLate));
  if (kitchenLate) {
    await prisma.service.update({
      where: { id: kitchenLate.id },
      data: { active: false, locked: true, draft: false },
    });
  }
  await prisma.service.create({
    data: {
      type: 'BAR',
      origin: 'AUTO',
      date: new Date('2026-11-07T12:00:00Z'),
      time: '19:30 - 00:00',
      location: 'Bar',
      required: 2,
      slot: 'EVENING',
      draft: false,
      locked: true,
      active: true,
    },
  });

  const synced = await proposeFromMatches({ from: FROM, to: TO });
  assert('sync na publiceren lukt', !synced.error, synced.error || '');

  const rules = await prisma.serviceRule.findMany({ orderBy: { id: 'asc' } });
  const after = rules.map(finger);
  assert(
    'sync en repairs laten Chantal\'s dienstregels ongewijzigd',
    JSON.stringify(before) === JSON.stringify(after),
    'een regel is herschreven',
  );

  const services = await prisma.service.findMany({
    where: { active: true },
    include: {
      enrollments: true,
      teamDuties: { include: { team: true } },
      sourceRule: true,
    },
  });
  const matches = await prisma.match.findMany({ include: { team: true } });
  const allTeams = await prisma.team.findMany();

  assert(
    'ook na sync geen conceptlabel',
    services.every((service) => service.draft === false),
  );

  const morningRule = rules.find((rule) => rule.name === 'Zondag bar ochtend');
  const sundays = ['2026-10-25', '2026-11-01', '2026-11-08', '2026-11-15', '2026-11-22', '2026-11-29'];
  let morningOk = true;
  let pietOk = true;
  const pietNotes = [];
  for (const day of sundays) {
    const bar = services.find(
      (service) => iso(service.date) === day && service.type === 'BAR' && service.time === ruleTime(morningRule),
    );
    if (!bar) {
      morningOk = false;
      pietNotes.push(`${day} geen ochtendbar`);
      continue;
    }
    const home = matches.some(
      (match) =>
        iso(match.date) === day &&
        match.home !== false &&
        match.team?.name === 'Lekkerkerk 2 (zo)',
    );
    const hasPiet = bar.enrollments.some(
      (row) => row.personId === piet.id && row.reason === FIXED_PERSON_REASON && !row.noShow,
    );
    if (home && hasPiet) {
      pietOk = false;
      pietNotes.push(`${day} Piet terwijl Zondag 2 thuis speelt`);
    }
    if (!home && !hasPiet) {
      pietOk = false;
      pietNotes.push(`${day} Piet ontbreekt terwijl Zondag 2 niet thuis speelt`);
    }
  }
  assert('ochtendbar ook als Zondag 2 thuis speelt', morningOk, pietNotes.join('; '));
  assert('Piet alleen als Zondag 2 niet thuis speelt', pietOk, pietNotes.join('; '));

  const kitchenRule = rules.find((rule) => rule.name === 'Zaterdag keuken laat (Lekkerkerk 1 thuis)');
  const eveningBar = rules.find((rule) => rule.name === 'Zaterdag bar laatste shift');
  for (const day of HOME_EERSTE) {
    assert(
      `keuken laat op ${day}`,
      services.some(
        (service) => iso(service.date) === day && service.type === 'KITCHEN' && service.time === ruleTime(kitchenRule),
      ),
    );
  }
  for (const day of AWAY_EERSTE) {
    assert(
      `geen keuken laat op uitdag ${day}`,
      !services.some(
        (service) => iso(service.date) === day && service.type === 'KITCHEN' && service.time === ruleTime(kitchenRule),
      ),
    );
  }
  const saturdays = ['2026-10-24', '2026-10-31', '2026-11-07', '2026-11-14', '2026-11-21', '2026-11-28'];
  for (const day of saturdays) {
    assert(
      `avondbar ${ruleTime(eveningBar)} op ${day}`,
      services.some(
        (service) => iso(service.date) === day && service.type === 'BAR' && service.time === ruleTime(eveningBar),
      ),
    );
  }

  const periodStart = new Date(`${FROM}T00:00:00Z`);
  const periodEnd = new Date(`${TO}T23:59:59Z`);
  const activeRules = rules.filter((rule) => rule.active !== false);
  let missing = [];
  for (const date of datesInRange(periodStart, periodEnd)) {
    const dayMatches = matches.filter((match) => match.home !== false && sameCalendarDay(match.date, date));
    const dayServices = services.filter((service) => sameCalendarDay(service.date, date));
    for (const rule of activeRules) {
      const evaluation = evaluateRule(rule, {
        date,
        weekday: date.getUTCDay(),
        homeMatches: dayMatches,
        activities: [],
        teams: allTeams,
      });
      if (!evaluation.ok) continue;
      const time = ruleTime(rule);
      const present = dayServices.some((service) => service.type === rule.type && service.time === time);
      const covered = manualCoversSpec(dayServices, {
        type: rule.type,
        date,
        time,
        slot: rule.slot,
        rule,
      });
      if (!present && !covered) missing.push(`${iso(date)} ${rule.name}`);
    }
  }
  assert('elke geldige dienstregel heeft een dienst', missing.length === 0, missing.slice(0, 8).join(', '));

  const manual = services.find((service) => service.origin === 'MANUAL' && service.type === 'KITCHEN');
  const saturdayRows = rosterDaySections(rules)[5].rows;
  const kitchenMorning = saturdayRows.find((row) => row.type === 'KITCHEN' && row.slot === 'MORNING');
  const dayManual = services.filter((service) => manual && iso(service.date) === iso(manual.date));
  assert(
    'handmatige keuken staat in de keukenkolom en niet bij extra',
    Boolean(manual) &&
      manual.draft === false &&
      isExtraRosterService(manual) === false &&
      servicesForSlotRow(dayManual, kitchenMorning).some((service) => service.id === manual.id) &&
      !extraServicesForDay(dayManual).some((service) => service.id === manual.id) &&
      !additionalRosterServices(dayManual, saturdayRows).some((service) => service.id === manual.id),
  );

  const sundayRows = rosterDaySections(rules)[6].rows;
  const sundayMorning = sundayRows.find((row) => row.type === 'BAR' && row.slot === 'MORNING');
  const sundayAfternoon = sundayRows.find((row) => row.type === 'BAR' && row.slot === 'AFTERNOON');
  const sundayKitchen = sundayRows.find((row) => row.type === 'KITCHEN' && row.slot === 'AFTERNOON');
  assert(
    'zondagrijen nemen de tijden uit de dienstregel',
    sundayMorning?.time === '08:15 - 12:45' &&
      sundayAfternoon?.time === '13:15 - 16:15' &&
      sundayKitchen?.time === '12:15 - 15:15' &&
      rowLabelTime(sundayMorning, [{ time: '09:00 - 13:00' }, { time: '08:15 - 12:45' }]) === '08:15 - 12:45',
  );
  assert(
    'zondagdiensten gebruiken diezelfde tijden',
    services.some((service) => service.type === 'BAR' && service.time === '08:15 - 12:45') &&
      services.some((service) => service.type === 'BAR' && service.time === '13:15 - 16:15') &&
      services.some((service) => service.type === 'KITCHEN' && service.time === '12:15 - 15:15'),
  );

  const afternoonRule = rules.find((rule) => rule.name === 'Zaterdag bar tweede shift');
  assert(
    'aangepaste zaterdagmiddag blijft 12:05–16:25',
    afternoonRule.startTime === '12:05' &&
      afternoonRule.endTime === '16:25' &&
      services.some((service) => service.type === 'BAR' && service.time === '12:05 - 16:25'),
  );

  let unfair = [];
  const fairness = { counts: new Map(), lastAt: new Map() };
  const afternoonTeamByDate = new Map();
  const dutyRules = activeRules
    .filter((rule) => rule.teamDuty && rule.teamDutySlotRole)
    .map((rule) => {
      const specs = [];
      for (const date of datesInRange(periodStart, periodEnd)) {
        if (date.getUTCDay() !== Number(rule.weekday)) continue;
        const homeMatches = matches.filter((match) => match.home !== false && sameCalendarDay(match.date, date));
        const evaluation = evaluateRule(rule, {
          date,
          weekday: date.getUTCDay(),
          homeMatches,
          activities: [],
          teams: allTeams,
        });
        if (!evaluation.ok) continue;
        specs.push({
          rule,
          date,
          candidates: eligibleTeamDutyCandidates(rule, homeMatches),
        });
      }
      return specs;
    })
    .flat();
  const roleOrder = { MORNING: 0, SECOND: 1, LAST: 2 };
  dutyRules.sort(
    (a, b) =>
      (roleOrder[a.rule.teamDutySlotRole] ?? 9) - (roleOrder[b.rule.teamDutySlotRole] ?? 9) ||
      iso(a.date).localeCompare(iso(b.date)),
  );
  for (const spec of dutyRules) {
    const dayKey = iso(spec.date);
    const preferTeamId = spec.rule.teamDutySlotRole === 'LAST' ? afternoonTeamByDate.get(dayKey) || null : null;
    const expected = pickTeamDutyAssignment(spec.rule, spec.candidates, {
      counts: fairness.counts,
      lastAt: fairness.lastAt,
      preferTeamId,
    });
    const actual = services.find(
      (service) =>
        iso(service.date) === dayKey &&
        service.type === spec.rule.type &&
        service.time === ruleTime(spec.rule) &&
        service.origin !== 'MANUAL',
    );
    const actualTeam = actual?.teamDuties?.[0]?.teamId ?? null;
    const expectedTeam = expected[0]?.team?.id ?? null;
    if (actual && actualTeam !== expectedTeam) {
      unfair.push(
        `${dayKey} ${spec.rule.teamDutySlotRole}: verwacht ${expected[0]?.team?.name || '—'}, kreeg ${actual.teamDuties?.[0]?.team?.name || '—'}`,
      );
    }
    if (expected[0]?.team) {
      recordTeamDutyStand(fairness, expected[0].team.id, spec.date, expected[0].reserved);
      if (spec.rule.teamDutySlotRole === 'SECOND') afternoonTeamByDate.set(dayKey, expected[0].team.id);
    }
  }
  assert('teamdiensten volgen de eerlijke verdeling', unfair.length === 0, unfair.slice(0, 6).join('; '));

  const mo = allTeams.find((team) => team.active !== false && /MO15-1/i.test(team.name));
  const boys = allTeams.find((team) => team.active !== false && youthTeamAliasKey(team.name) === 'O15-1');
  const moMatches = matches.filter((match) => mo && match.teamId === mo.id);
  assert(
    'MO15 blijft een ander team dan O15',
    Boolean(mo && boys && mo.id !== boys.id) &&
      youthTeamAliasKey(mo?.name) !== youthTeamAliasKey(boys?.name) &&
      moMatches.length > 0 &&
      moMatches.every((match) => match.teamId === mo.id),
    `mo=${mo?.name || '—'} o=${boys?.name || '—'} wedstrijden=${moMatches.length}`,
  );

  const revived = services.find(
    (service) => service.id === kitchenLate?.id && service.active !== false && service.time === '16:00 - 19:00',
  );
  assert('verborgen gelockte keuken komt in de sync terug', Boolean(revived));

  const stray = await prisma.service.findMany({
    where: { origin: 'AUTO', type: 'BAR', time: '19:30 - 00:00' },
  });
  assert('bardienst 19:30–00:00 zonder regel is weg', stray.length === 0, `${stray.length} over`);

  const orphan = services.filter((service) => {
    if (service.origin !== 'AUTO') return false;
    if (service.type !== 'BAR' && service.type !== 'KITCHEN') return false;
    const rule = service.sourceRule;
    if (!rule || rule.active === false) return true;
    return service.time !== ruleTime(rule);
  });
  assert(
    'elke automatische dienst hoort bij een regel en gebruikt die tijd',
    orphan.length === 0,
    orphan
      .slice(0, 5)
      .map((service) => `${iso(service.date)} ${service.type} ${service.time}`)
      .join(', '),
  );
} catch (err) {
  failed += 1;
  console.error('FAIL  regressie liep vast');
  console.error(err);
} finally {
  await prisma.$disconnect().catch(() => {});
  for (const ext of ['', '-journal', '-wal', '-shm']) {
    if (fs.existsSync(dbFile + ext)) fs.unlinkSync(dbFile + ext);
  }
}

if (failed) {
  console.log(`\n${failed} regressiepunt(en) gefaald`);
  process.exit(1);
}
console.log('\nChantal-planningregressie geslaagd');
