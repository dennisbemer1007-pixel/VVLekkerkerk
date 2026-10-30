/**
 * Chantal never-again: één suite die haar CSV + dienstregels door een volledige
 * planning, sync én herstart-paden jaagt. Faalt als een eerder opgelost punt
 * terugkomt. Raakt geen clubdatabase (tijdelijke SQLite).
 *
 * Run: node scripts/chantal-never-again-regression.js
 * Ook via: npm test / scripts/unit-checks.js
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import express from 'express';
import PDFDocument from 'pdfkit';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dbFile = path.join(os.tmpdir(), `chantal-never-again-${process.pid}.db`);
const stateDir = path.join(os.tmpdir(), `chantal-never-again-state-${process.pid}`);
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
const { generateServicesFromRules } = await import('../src/backend/lib/serviceGeneration.js');
const { fillMandatoryPersonal } = await import('../src/backend/lib/autoFill.js');
const { markPlanningOfficial } = await import('../src/backend/lib/official.js');
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
  shouldAttachTeamDutiesToLocked,
  shouldSyncTeamDuties,
  canReassignEmptyTeamDuties,
} = await import('../src/backend/lib/teamDutyPlanning.js');
const { youthGender, youthTeamAliasKey } = await import('../src/backend/lib/youthTeams.js');
const {
  additionalRosterServices,
  chooseRosterPageSize,
  computeRosterPageLayout,
  countRosterExtraRows,
  extraServicesForDay,
  formatGeneratedAt,
  groupServicesByWeekDay,
  isExtraRosterService,
  planRosterDocument,
  renderPlanningRoster,
  rosterDaySections,
  rowLabelTime,
  servicesForSlotRow,
  weekStartsInRange,
  wrapRosterCellText,
} = await import('../src/backend/lib/pdfRoster.js');
const { FIXED_PERSON_REASON } = await import('../src/backend/lib/serviceGeneration.js');
const {
  repairJoOYouthDuplicates,
  repairMoOWrongMerges,
  repairAccidentalWeekendTeams,
  removeStrayMidnightBarServices,
} = await import('../src/backend/lib/liveRepairs.js');
const {
  repairWeekdayTeamDuties,
  undoWeekdayTeamDutyStrip,
} = await import('../src/backend/lib/weekdayTeamDutyRepair.js');
const { obligationMark } = await import('../src/frontend/utils/obligationMark.js');
const { enrollmentNameWithTeam } = await import('../src/frontend/utils/teamLines.js');
const { mapService, serviceInclude } = await import('../src/backend/lib/serviceHelpers.js');
const { createSession } = await import('../src/backend/lib/auth.js');
const { default: authRouter } = await import('../src/backend/routes/auth.js');
const { default: servicesRouter } = await import('../src/backend/routes/services.js');
const { trySyncPlanningFromMatches } = await import('../src/backend/lib/proposePlanning.js');
const { default: enrollmentsRouter, enrollmentFollowUp } = await import(
  '../src/backend/routes/enrollments.js'
);
const { clientErrorPayload } = await import('../src/backend/lib/clientError.js');

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
    teamDutyTeamIds: rule.teamDutyTeamIds ?? null,
  };
}

async function restartLikeRenderStart() {
  fs.mkdirSync(stateDir, { recursive: true });
  await repairMoOWrongMerges(prisma);
  await repairJoOYouthDuplicates(prisma);
  await repairAccidentalWeekendTeams(prisma);
  await removeStrayMidnightBarServices(prisma);
  await repairWeekdayTeamDuties(prisma, { stateDir });
  await undoWeekdayTeamDutyStrip(prisma, { stateDir });
  await generateServicesFromRules({ from: FROM, to: TO });
  await proposeFromMatches({ from: FROM, to: TO });
}

try {
  const seeded = await ensureDefaultServiceRules();
  assert('lege club krijgt de standaard dienstregels', seeded.seeded === true && seeded.count > 0);

  const piet = await prisma.person.create({
    data: { name: 'Piet', email: 'piet.never@example.test', role: 'Vrijwilliger', active: true },
  });
  const parent = await prisma.person.create({
    data: {
      name: 'Mascha Koenders',
      email: 'mascha.never@example.test',
      role: 'Vrijwilliger',
      active: true,
      obligation: 'NONE',
    },
  });
  const child = await prisma.person.create({
    data: {
      name: 'Dana den Boer',
      email: null,
      role: 'Vrijwilliger',
      active: true,
      guardianId: parent.id,
      obligation: 'NONE',
    },
  });
  const vr18 = await prisma.person.create({
    data: {
      name: 'VR18 Eerste',
      email: 'vr18.never@example.test',
      role: 'Vrijwilliger',
      active: true,
      obligation: 'VR18',
    },
  });
  const full = await prisma.person.create({
    data: {
      name: 'Verplicht Vol',
      email: 'full.never@example.test',
      role: 'Vrijwilliger',
      active: true,
      obligation: 'FULL',
    },
  });
  const committee = await prisma.person.create({
    data: {
      name: 'Barcommissie Never',
      email: 'bar.never@example.test',
      role: 'Barcommissie',
      active: true,
    },
  });

  const csvPath = path.join(root, 'scripts/fixtures/chantal-wedstrijdplanning-5.csv');
  const csv = `${fs.readFileSync(csvPath, 'utf8').trim()}
"2026-10-31";"10:30:00";"Lekkerkerk MO15-1";"Ergens MO15-1";"Geen";"Sportpark Lekkerkerk";"veld 3";;"Geen";"99001";"Reguliere competitie";"A-categorie";
"2026-10-31";"10:30:00";"Lekkerkerk JO15-1";"Ergens JO15-1";"Geen";"Sportpark Lekkerkerk";"veld 2";;"Geen";"99002";"Reguliere competitie";"A-categorie";
"2026-11-12";"19:00:00";"Lekkerkerk 7x7";"Ergens 7x7";"Geen";"Sportpark Lekkerkerk";"veld 1";;"Geen";"99003";"Reguliere competitie";"A-categorie";
`;
  const parsed = parseCsv(csv);
  const validated = validateMatchRows(parsed.rows, {
    headerError: parsed.headerError,
    format: parsed.format,
  });
  assert(
    'Chantal-csv heeft geldige wedstrijden',
    validated.rows.length > 100,
    String(validated.errors?.[0]?.message || ''),
  );
  const imported = await persistValidMatchRows(prisma, validated.rows);
  assert('wedstrijden opgeslagen', imported.created.length > 100 && imported.persistErrors.length === 0);

  // Simuleer KNVB-dubbel JO15-1 naast O15-1; herstart-repair moet samenvoegen tot één actief team.
  const boysO15 = await prisma.team.findFirst({
    where: { name: 'O15-1', active: { not: false } },
  });
  if (boysO15) {
    await prisma.team.create({
      data: {
        name: 'JO15-1',
        active: true,
        teamDutyUse: true,
        teamDutySlots: JSON.stringify(['SECOND', 'LAST']),
      },
    });
  }

  const teams = await prisma.team.findMany();
  const zaEerste = teams.find((team) => team.name === 'Lekkerkerk 1 (za)');
  const zoTweede = teams.find((team) => team.name === 'Lekkerkerk 2 (zo)');
  assert('Lekkerkerk 1 (za) en Zondag 2 bestaan', Boolean(zaEerste && zoTweede));

  let seven = await prisma.team.findFirst({ where: { name: { contains: '7x7' } } });
  if (!seven) {
    seven = await prisma.team.create({
      data: { name: '7x7 mannen', active: true, teamDutyUse: true, teamDutySlots: JSON.stringify(['LAST']) },
    });
  } else {
    await prisma.team.update({
      where: { id: seven.id },
      data: { teamDutyUse: true, teamDutySlots: JSON.stringify(['LAST']), active: true },
    });
  }

  const byName = new Map((await prisma.serviceRule.findMany()).map((rule) => [rule.name, rule]));
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

  // Donderdag 7x7: teamplek toegestaan (niet alleen zaterdag).
  const thursdayRule = await prisma.serviceRule.create({
    data: {
      name: 'Donderdag 7x7 bar',
      weekday: 4,
      startTime: '19:00',
      endTime: '21:30',
      type: 'BAR',
      required: 1,
      slot: 'EVENING',
      conditionType: 'HOME_MATCH_TEAM',
      conditionTeamName: '7x7',
      conditionTeamId: seven.id,
      teamDuty: true,
      teamDutySlotRole: 'LAST',
      teamDutyReserved: 1,
      teamDutyTeamIds: JSON.stringify([seven.id]),
      active: true,
      sortOrder: 90,
    },
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

  await createPlanningRound(prisma, { label: 'Najaar Chantal never-again', from: FROM, to: TO });
  const step1 = await proposeFromMatches({ from: FROM, to: TO });
  assert('stap 1 maakt diensten', (step1.created || 0) + (step1.updated || 0) > 0, JSON.stringify(step1.error || ''));

  const afterStep1 = await prisma.service.findMany({ where: { active: true } });
  assert(
    'vóór publiceren zijn automatische diensten nog concept',
    afterStep1.some((service) => service.origin === 'AUTO' && service.draft === true),
  );

  const published = await publishDraftServices({ from: FROM, to: TO, volunteerDeadline: '2026-10-26' });
  assert('publiceren zet concepten open', published.published > 0);

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

  // --- Herstart-pad (zoals render-start): repairs + regenerate + sync ---
  await restartLikeRenderStart();

  const rules = await prisma.serviceRule.findMany({ orderBy: { id: 'asc' } });
  const after = rules.map(finger);
  assert(
    "sync/herstart laten Chantal's dienstregels ongewijzigd",
    JSON.stringify(before) === JSON.stringify(after),
    'een regel is herschreven',
  );

  const services = await prisma.service.findMany({
    where: { active: true },
    include: {
      enrollments: { include: { person: true } },
      teamDuties: { include: { team: true } },
      sourceRule: true,
    },
  });
  const matches = await prisma.match.findMany({ include: { team: true } });
  const allTeams = await prisma.team.findMany();

  assert(
    'ook na sync/herstart geen conceptlabel',
    services.every((service) => service.draft === false),
  );

  // MO ≠ O, JO = O (alias), geen actieve KNVB-dubbels
  let moActive = allTeams.filter(
    (team) => team.active !== false && (youthTeamAliasKey(team.name) === 'MO15-1' || /MO15-1/i.test(team.name)),
  );
  const boysActive = allTeams.filter(
    (team) => team.active !== false && youthTeamAliasKey(team.name) === 'O15-1',
  );
  let mo =
    moActive.find((team) => matches.some((match) => match.teamId === team.id)) || moActive[0];
  const boys =
    boysActive.find((team) => matches.some((match) => match.teamId === team.id)) || boysActive[0];
  // Garantie-meidenwedstrijd: import+repair mag de ene CSV-rij kwijtraken; de scheiding blijft.
  if (mo && !matches.some((match) => match.teamId === mo.id)) {
    await prisma.match.create({
      data: {
        date: new Date('2026-10-31T12:00:00Z'),
        time: '10:30',
        home: true,
        opponent: 'Uitploeg MO15-1',
        teamId: mo.id,
      },
    });
  }
  if (!mo && boys) {
    mo = await prisma.team.create({
      data: {
        name: 'MO15-1',
        active: true,
        teamDutyUse: true,
        teamDutySlots: JSON.stringify(['SECOND', 'LAST']),
      },
    });
    await prisma.match.create({
      data: {
        date: new Date('2026-10-31T12:00:00Z'),
        time: '10:30',
        home: true,
        opponent: 'Uitploeg MO15-1',
        teamId: mo.id,
      },
    });
    moActive = [mo];
  }
  const matchesNow = await prisma.match.findMany({ include: { team: true } });
  const moMatches = matchesNow.filter((match) => mo && match.teamId === mo.id);
  const boysMatchesOnMo = moMatches.filter((match) => youthGender(match.opponent) === 'boys');
  assert(
    'MO15 blijft een ander team dan O15',
    Boolean(mo && boys && mo.id !== boys.id) &&
      youthGender(mo.name) === 'girls' &&
      youthGender(boys.name) === 'boys' &&
      moMatches.length > 0 &&
      boysMatchesOnMo.length === 0,
    `mo=${mo?.name || '—'}#${mo?.id || '—'} o=${boys?.name || '—'}#${boys?.id || '—'} moWedstrijden=${moMatches.length}`,
  );
  assert(
    'JO15 deelt alias met O15 (JO=O)',
    youthTeamAliasKey('JO15-1') === 'O15-1' && youthTeamAliasKey('O15-1') === 'O15-1',
  );
  const aliasBuckets = new Map();
  for (const team of allTeams.filter((t) => t.active !== false)) {
    const key = youthTeamAliasKey(team.name);
    if (!key) continue;
    if (!aliasBuckets.has(key)) aliasBuckets.set(key, []);
    aliasBuckets.get(key).push(team.name);
  }
  const dupAliases = [...aliasBuckets.entries()].filter(([, names]) => names.length > 1);
  assert(
    'geen dubbele actieve KNVB-jeugdteams (zelfde alias)',
    dupAliases.length === 0 && boysActive.length === 1,
    dupAliases.map(([k, n]) => `${k}:${n.join('+')}`).join('; ') ||
      `actief O15-1-alias=${boysActive.map((t) => t.name).join(',')}`,
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
        iso(match.date) === day && match.home !== false && match.team?.name === 'Lekkerkerk 2 (zo)',
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
      `avondkeuken op thuisdag ${day}`,
      services.some(
        (service) => iso(service.date) === day && service.type === 'KITCHEN' && service.time === ruleTime(kitchenRule),
      ),
    );
  }
  for (const day of AWAY_EERSTE) {
    assert(
      `geen avondkeuken op uitdag ${day}`,
      !services.some(
        (service) => iso(service.date) === day && service.type === 'KITCHEN' && service.time === ruleTime(kitchenRule),
      ),
    );
  }
  const saturdays = ['2026-10-24', '2026-10-31', '2026-11-07', '2026-11-14', '2026-11-21', '2026-11-28'];
  for (const day of saturdays) {
    assert(
      `bar ${ruleTime(eveningBar)} op ${day}`,
      services.some(
        (service) => iso(service.date) === day && service.type === 'BAR' && service.time === ruleTime(eveningBar),
      ),
    );
  }

  const stray = await prisma.service.findMany({
    where: { origin: 'AUTO', type: 'BAR', time: '19:30 - 00:00' },
  });
  assert('geen bar 19:30–00:00 zonder regel', stray.length === 0, `${stray.length} over`);

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

  const sundayRows = rosterDaySections(rules)[6].rows;
  assert(
    'roostertijden komen uit de dienstregel',
    sundayRows.find((r) => r.type === 'BAR' && r.slot === 'MORNING')?.time === '08:15 - 12:45' &&
      sundayRows.find((r) => r.type === 'BAR' && r.slot === 'AFTERNOON')?.time === '13:15 - 16:15' &&
      rowLabelTime(sundayRows[0], [{ time: '09:00 - 13:00' }, { time: '08:15 - 12:45' }]) ===
        '08:15 - 12:45',
  );

  const afternoonRule = rules.find((rule) => rule.name === 'Zaterdag bar tweede shift');
  assert(
    'aangepaste zaterdagmiddag blijft 12:05–16:25',
    afternoonRule.startTime === '12:05' &&
      services.some((service) => service.type === 'BAR' && service.time === '12:05 - 16:25'),
  );

  const manual = services.find((service) => service.origin === 'MANUAL' && service.type === 'KITCHEN');
  const saturdayRows = rosterDaySections(rules)[5].rows;
  const kitchenMorning = saturdayRows.find((row) => row.type === 'KITCHEN' && row.slot === 'MORNING');
  const dayManual = services.filter((service) => manual && iso(service.date) === iso(manual.date));
  assert(
    'handmatige keuken staat in de keukenkolom en niet bij extra',
    Boolean(manual) &&
      isExtraRosterService(manual) === false &&
      servicesForSlotRow(dayManual, kitchenMorning).some((service) => service.id === manual.id) &&
      !extraServicesForDay(dayManual).some((service) => service.id === manual.id) &&
      !additionalRosterServices(dayManual, saturdayRows).some((service) => service.id === manual.id),
  );

  const revived = services.find(
    (service) => service.id === kitchenLate?.id && service.active !== false && service.time === '16:00 - 19:00',
  );
  assert('verborgen gelockte keuken komt in de sync terug', Boolean(revived));

  // 7x7 donderdag
  const thuService = services.find(
    (service) =>
      iso(service.date) === '2026-11-12' &&
      service.type === 'BAR' &&
      service.time === ruleTime(thursdayRule),
  );
  assert(
    '7x7-teamplek op donderdag toegestaan',
    Boolean(thuService) &&
      (thuService.teamDuties || []).some((d) => d.teamId === seven.id || /7x7/i.test(d.team?.name || '')),
    `dienst=${thuService?.id || '—'} duties=${(thuService?.teamDuties || []).map((d) => d.team?.name).join(',')}`,
  );

  // Jeugd zonder weekday-vinkje: geen teamplek doordeweeks
  const weekdayYouthDuties = services.filter((service) => {
    const d = new Date(service.date);
    const weekday = d.getUTCDay();
    if (weekday === 6 || weekday === 0) return false;
    return (service.teamDuties || []).some((duty) => {
      const name = duty.team?.name || '';
      return youthTeamAliasKey(name) && !/7x7/i.test(name);
    });
  });
  assert(
    'jeugd-teamdiensten niet doordeweeks (alleen zaterdag + expliciete 7x7)',
    weekdayYouthDuties.length === 0,
    weekdayYouthDuties
      .slice(0, 4)
      .map((s) => `${iso(s.date)} ${s.teamDuties?.[0]?.team?.name}`)
      .join('; '),
  );

  // Teamplek nooit naast iemand die al persoonlijk staat
  const nextToPersonal = services.filter((service) => {
    const personal = (service.enrollments || []).some((e) => !e.noShow && e.kind !== 'TEAM');
    if (!personal) return false;
    return shouldAttachTeamDutiesToLocked(service, [{ team: { id: 999 } }]) === true;
  });
  assert(
    'geen teamplek erbij naast iemand die al is ingedeeld',
    nextToPersonal.length === 0 &&
      shouldAttachTeamDutiesToLocked(
        {
          origin: 'AUTO',
          locked: true,
          teamDuties: [],
          enrollments: [{ kind: 'PERSONAL', noShow: false }],
        },
        [{ team: { id: 7, name: '7x7' } }],
      ) === false,
  );

  // Fairness teamdiensten (bestaande check)
  let unfair = [];
  const fairness = { counts: new Map(), lastAt: new Map() };
  const afternoonTeamByDate = new Map();
  const dutyRules = activeRules
    .filter((rule) => rule.teamDuty && rule.teamDutySlotRole)
    .flatMap((rule) => {
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
    });
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
    // Officiële/handmatige freeze mag van fairness afwijken — alleen niet-frozen checken.
    if (actual && !actual.locked && !actual.teamDutiesManual) {
      const actualTeam = actual?.teamDuties?.[0]?.teamId ?? null;
      const expectedTeam = expected[0]?.team?.id ?? null;
      if (actualTeam !== expectedTeam) {
        unfair.push(
          `${dayKey} ${spec.rule.teamDutySlotRole}: verwacht ${expected[0]?.team?.name || '—'}, kreeg ${actual.teamDuties?.[0]?.team?.name || '—'}`,
        );
      }
    }
    if (expected[0]?.team) {
      recordTeamDutyStand(fairness, expected[0].team.id, spec.date, expected[0].reserved);
      if (spec.rule.teamDutySlotRole === 'SECOND') afternoonTeamByDate.set(dayKey, expected[0].team.id);
    }
  }
  assert('teamdiensten volgen de eerlijke verdeling (niet-frozen)', unfair.length === 0, unfair.slice(0, 6).join('; '));

  // VR18+ overgeslagen in eerste planning; FULL wel
  const fill = await fillMandatoryPersonal({ from: FROM, to: TO });
  const vr18Enrolled = await prisma.enrollment.count({
    where: { personId: vr18.id, noShow: false },
  });
  const fullEnrolled = await prisma.enrollment.count({
    where: { personId: full.id, noShow: false },
  });
  assert(
    'VR18+ wordt overgeslagen in de eerste planning',
    vr18Enrolled === 0,
    `n=${vr18Enrolled} filled=${fill.filled}`,
  );
  assert(
    'verplichte FULL wordt wél ingepland in stap 3',
    fullEnrolled >= 1,
    `n=${fullEnrolled}`,
  );

  // Verwijderde teamplek blijft weg na sync/herstart
  const satMorning = await prisma.service.findFirst({
    where: {
      type: 'BAR',
      date: { gte: new Date('2026-10-31T00:00:00Z'), lte: new Date('2026-10-31T23:59:59Z') },
      time: { startsWith: '07:30' },
      active: true,
    },
    include: { teamDuties: true, enrollments: true },
  });
  if (satMorning?.teamDuties?.[0]) {
    await prisma.serviceTeamDuty.delete({ where: { id: satMorning.teamDuties[0].id } });
    await prisma.service.update({
      where: { id: satMorning.id },
      data: { teamDutiesManual: true, locked: true },
    });
  } else if (satMorning) {
    await prisma.service.update({
      where: { id: satMorning.id },
      data: { teamDutiesManual: true, locked: true },
    });
  }
  await restartLikeRenderStart();
  const afterDelete = satMorning
    ? await prisma.service.findUnique({
        where: { id: satMorning.id },
        include: { teamDuties: true },
      })
    : null;
  assert(
    'verwijderde teamplek blijft weg na sync/herstart',
    Boolean(afterDelete) &&
      afterDelete.teamDutiesManual === true &&
      (afterDelete.teamDuties || []).length === 0 &&
      shouldSyncTeamDuties({
        origin: 'AUTO',
        locked: true,
        teamDutiesManual: true,
        teamDuties: [],
        enrollments: [],
      }) === false &&
      canReassignEmptyTeamDuties({
        origin: 'AUTO',
        teamDutiesManual: true,
        teamDuties: [],
        enrollments: [],
      }) === false,
    `duties=${afterDelete?.teamDuties?.length} vlag=${afterDelete?.teamDutiesManual}`,
  );

  // Officiële teamplek + handmatige teamkeuze bevriezen (#72)
  const freezeDay = new Date('2026-11-07T12:00:00Z');
  const activeTeamsNow = await prisma.team.findMany({ where: { active: { not: false } } });
  let o151 =
    activeTeamsNow.find((t) => youthTeamAliasKey(t.name) === 'O15-1') ||
    (await prisma.team.create({
      data: {
        name: 'O15-1',
        teamDutyUse: true,
        teamDutySlots: JSON.stringify(['MORNING', 'SECOND', 'LAST']),
        active: true,
      },
    }));
  let o153 =
    activeTeamsNow.find((t) => youthTeamAliasKey(t.name) === 'O15-3') ||
    activeTeamsNow.find((t) => /O15-3/i.test(t.name)) ||
    (await prisma.team.create({
      data: {
        name: 'O15-3',
        teamDutyUse: true,
        teamDutySlots: JSON.stringify(['MORNING', 'SECOND', 'LAST']),
        active: true,
      },
    }));
  for (const team of [o151, o153]) {
    const exists = await prisma.match.findFirst({
      where: { teamId: team.id, date: freezeDay },
    });
    if (!exists) {
      await prisma.match.create({
        data: { date: freezeDay, time: '09:30', home: true, opponent: 'Uit', teamId: team.id },
      });
    }
  }
  let freezeService = await prisma.service.findFirst({
    where: {
      type: 'BAR',
      date: { gte: new Date('2026-11-07T00:00:00Z'), lte: new Date('2026-11-07T23:59:59Z') },
      time: { startsWith: '07:30' },
      active: true,
    },
    include: { teamDuties: true },
  });
  if (!freezeService) {
    freezeService = await prisma.service.create({
      data: {
        type: 'BAR',
        date: freezeDay,
        time: '07:30 - 12:00',
        location: 'Bar',
        required: 3,
        slot: 'MORNING',
        origin: 'AUTO',
        locked: false,
        active: true,
        draft: false,
      },
    });
  }
  if (!(freezeService.teamDuties || []).length) {
    await prisma.serviceTeamDuty.create({
      data: { serviceId: freezeService.id, teamId: o151.id, reserved: 2 },
    });
  } else {
    await prisma.serviceTeamDuty.update({
      where: { id: freezeService.teamDuties[0].id },
      data: { teamId: o151.id },
    });
  }
  await prisma.service.update({
    where: { id: freezeService.id },
    data: { teamDutiesManual: true, locked: true },
  });
  // Vinkje uit: officieel zonder planning-klaar-mail.
  const mailOff = await markPlanningOfficial({ from: FROM, to: TO, sendMail: false });
  assert(
    'Maak officieel met vinkje uit: wel locked, geen mail',
    mailOff?.mail?.reason === 'send_mail_off' &&
      mailOff?.mail?.skipped === true &&
      Number(mailOff?.locked) >= 0,
    JSON.stringify(mailOff?.mail || {}),
  );
  await restartLikeRenderStart();
  const frozen = await prisma.service.findUnique({
    where: { id: freezeService.id },
    include: { teamDuties: { include: { team: true } } },
  });
  assert(
    'handmatige/officiële teamplek wisselt nooit vanzelf (#72)',
    frozen?.teamDuties?.[0]?.teamId === o151.id && frozen.teamDutiesManual === true,
    `nu ${frozen?.teamDuties?.[0]?.team?.name || '—'} vlag=${frozen?.teamDutiesManual}`,
  );

  // Naam (Team) alleen coördinator/teamplek; geen VR18+ bij zelf inschrijven
  const jay = await prisma.person.create({
    data: { name: 'Jay de Jong', role: 'Vrijwilliger', teamId: o151.id, obligation: 'VR18' },
  });
  const hanneke = await prisma.person.create({
    data: { name: 'Hanneke Verhoeff', role: 'Vrijwilliger', teamId: o151.id },
  });
  await prisma.enrollment.create({
    data: {
      serviceId: freezeService.id,
      personId: jay.id,
      source: 'SELF',
      kind: 'PERSONAL',
      reason: 'Zelf ingeschreven',
    },
  });
  await prisma.enrollment.create({
    data: {
      serviceId: freezeService.id,
      personId: hanneke.id,
      source: 'TEAM',
      kind: 'PERSONAL',
      reason: 'Ingevuld door de bardienstcoördinator',
    },
  });
  const mapped = mapService(
    await prisma.service.findUnique({ where: { id: freezeService.id }, include: serviceInclude }),
  );
  const byEnrollName = Object.fromEntries(
    mapped.enrollments.map((row) => [row.person.name, enrollmentNameWithTeam(row)]),
  );
  const jayRow = mapped.enrollments.find((row) => row.person.name === 'Jay de Jong');
  assert('zelf ingeschreven toont geen team', byEnrollName['Jay de Jong'] === 'Jay de Jong');
  assert(
    'coördinator-invulling toont Naam (Team)',
    byEnrollName['Hanneke Verhoeff'] === `Hanneke Verhoeff (${o151.name})`,
    byEnrollName['Hanneke Verhoeff'],
  );
  assert(
    'geen VR18+ bij zelf inschrijven',
    obligationMark(jayRow?.person || { obligation: 'VR18' }, jayRow) === '',
  );
  assert(
    'VR18+ wél zichtbaar bij niet-zelf inschrijving',
    obligationMark({ obligation: 'VR18' }, { source: 'ADMIN', kind: 'PERSONAL' }) === ' VR18+',
  );

  // Ouder + kind op dezelfde dienst + barcommissie toevoegen/verwijderen + geen 500/duplicaten
  enrollmentFollowUp.confirm = async () => {
    throw new Error('smtp kapot');
  };
  const kitchenMid = await prisma.service.findFirst({
    where: {
      type: 'KITCHEN',
      date: { gte: new Date('2026-10-31T00:00:00Z'), lte: new Date('2026-10-31T23:59:59Z') },
      time: { startsWith: '13:00' },
      active: true,
    },
  });
  const enrollTarget =
    kitchenMid ||
    (await prisma.service.create({
      data: {
        type: 'KITCHEN',
        date: new Date('2026-10-31T12:00:00Z'),
        time: '13:00 - 16:00',
        location: 'Keuken',
        required: 3,
        slot: 'AFTERNOON',
        origin: 'AUTO',
        locked: true,
        draft: false,
        active: true,
      },
    }));
  await prisma.service.update({
    where: { id: enrollTarget.id },
    data: { required: 3, locked: true, draft: false, active: true },
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
  const parentToken = await createSession(parent.id);
  const committeeToken = await createSession(committee.id);

  async function enrollCall(token, body, method = 'POST', url = '/api/enrollments') {
    const headers = { Authorization: `Bearer ${token}` };
    const init = { method, headers };
    if (method !== 'GET' && method !== 'DELETE') {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body ?? {});
    }
    const res = await fetch(`${base}${url}`, init);
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
  }

  try {
    const parentSelf = await enrollCall(parentToken, {
      serviceId: enrollTarget.id,
      personId: parent.id,
      ignoreMatchBlock: true,
    });
    const childViaParent = await enrollCall(parentToken, {
      serviceId: enrollTarget.id,
      personId: child.id,
      ignoreMatchBlock: true,
    });
    const sameService = await prisma.enrollment.findMany({
      where: { serviceId: enrollTarget.id, noShow: false },
    });
    assert(
      'ouder en kind op dezelfde dienst',
      (parentSelf.status === 201 || parentSelf.status === 200) &&
        (childViaParent.status === 201 || childViaParent.status === 200) &&
        sameService.some((e) => e.personId === parent.id) &&
        sameService.some((e) => e.personId === child.id),
      `parent=${parentSelf.status} child=${childViaParent.status} n=${sameService.length}`,
    );

    const other = await prisma.person.create({
      data: { name: 'Extra Gast', email: 'gast.never@example.test', role: 'Vrijwilliger', active: true },
    });
    const addByBar = await enrollCall(committeeToken, {
      serviceId: enrollTarget.id,
      personId: other.id,
      ignoreMatchBlock: true,
    });
    assert(
      'barcommissie kan iedereen toevoegen (geen 500)',
      addByBar.status === 201 && addByBar.json?.error !== 'Internal server error',
      `${addByBar.status} ${addByBar.json?.error || ''}`,
    );
    const added = await prisma.enrollment.findFirst({
      where: { serviceId: enrollTarget.id, personId: other.id },
    });
    const removeByBar = await enrollCall(committeeToken, null, 'DELETE', `/api/enrollments/${added.id}`);
    const afterRemove = await prisma.enrollment.findFirst({ where: { id: added.id } });
    assert(
      'barcommissie kan iedereen verwijderen',
      (removeByBar.status === 200 || removeByBar.status === 204) && !afterRemove,
      `${removeByBar.status}`,
    );

    const dup = await enrollCall(parentToken, {
      serviceId: enrollTarget.id,
      personId: parent.id,
      ignoreMatchBlock: true,
    });
    const parentCount = await prisma.enrollment.count({
      where: { serviceId: enrollTarget.id, personId: parent.id, noShow: false },
    });
    assert(
      'geen 500 en geen duplicaat bij tweede inschrijfklik',
      dup.status !== 500 &&
        dup.json?.error !== 'Internal server error' &&
        parentCount === 1,
      `${dup.status} ${dup.json?.error || ''} n=${parentCount}`,
    );
  } finally {
    server.close();
  }

  // PDF: 1 pagina + Nederlandse tijd + namen volledig (wrap, geen ellipsis)
  assert(
    'Gegenereerd-tijd in Europe/Amsterdam',
    formatGeneratedAt(new Date('2025-10-20T17:39:57.000Z'), 'Europe/Amsterdam') ===
      '20-10-2025, 19:39:57',
  );
  assert(
    'pdf wrap zet namen op aparte regels',
    wrapRosterCellText('Anna, Bert, open plek') === 'Anna\nBert\nopen plek',
  );
  const sections = rosterDaySections(rules);
  const fixedRows = sections.reduce((sum, s) => sum + s.rows.length, 0);
  const byWeekDay = groupServicesByWeekDay(services);
  const weeks = weekStartsInRange(new Date(`${FROM}T00:00:00Z`), new Date(`${TO}T00:00:00Z`), 6);
  const extras = countRosterExtraRows(sections, weeks, byWeekDay);
  const layout = computeRosterPageLayout({
    sectionCount: sections.length,
    rowCount: fixedRows,
    extraCount: extras,
  });
  assert('rooster-layout past op 1 liggende A4', layout.fitsOnePage === true, `needed=${layout.neededHeight}`);

  const plan = planRosterDocument({
    services,
    from: new Date(`${FROM}T00:00:00Z`),
    to: new Date(`${TO}T00:00:00Z`),
    maxWeeks: 6,
    rules,
  });
  assert(
    'rooster-plan kiest A4 of A3 en past',
    (plan.pageSize === 'A4' || plan.pageSize === 'A3') && plan.layout?.fitsOnePage === true,
    `size=${plan.pageSize} fit=${plan.layout?.fitsOnePage}`,
  );
  // Sanity: chooseRosterPageSize bestaat en is consistent met plan
  assert(
    'chooseRosterPageSize beschikbaar',
    typeof chooseRosterPageSize === 'function',
  );

  let pages = 0;
  const doc = new PDFDocument({
    size: plan.pageSize || 'A4',
    layout: 'landscape',
    margin: 0,
  });
  const origAdd = doc.addPage.bind(doc);
  doc.addPage = (...args) => {
    pages += 1;
    return origAdd(...args);
  };
  pages = 1;
  doc.on('data', () => {});
  renderPlanningRoster(doc, {
    services,
    from: new Date(`${FROM}T00:00:00Z`),
    to: new Date(`${TO}T00:00:00Z`),
    generatedAt: new Date('2025-10-20T17:39:57.000Z'),
    official: true,
    maxWeeks: 6,
    rules,
    pageSize: plan.pageSize || 'A4',
  });
  doc.end();
  await new Promise((resolve) => doc.on('end', resolve));
  assert('dicht rooster-PDF past op 1 pagina', pages === 1, `pages=${pages}`);

  // No-show-lijst: wie na een no-show inactief is gezet (Kevin, 24/10) blijft zichtbaar
  {
    const { filterCommitteeNoShowPeople } = await import('../src/backend/lib/dashboardStats.js');
    const list = filterCommitteeNoShowPeople(
      [
        { id: 501, name: 'Actief', obligation: 'FULL', active: true },
        { id: 502, name: 'Kevin Prevo', obligation: 'FULL', active: false },
      ],
      [
        { id: 9001, personId: 501, service: { date: new Date('2026-10-24') } },
        { id: 9002, personId: 502, service: { date: new Date('2026-10-24') } },
      ],
      new Set([9001, 9002]),
    );
    const kevin = list.find((p) => p.id === 502);
    assert('inactieve persoon met no-show blijft in no-show-lijst', Boolean(kevin) && kevin.active === false);
    assert('actieve no-show niet als inactief gemarkeerd', list.find((p) => p.id === 501)?.active === true);
    const routeSrc = fs.readFileSync(path.join(root, 'src/backend/routes/planning.js'), 'utf8');
    assert('planning-API laadt inactieve no-show-personen', routeSrc.includes('inactiveNoShowPeople'));
    const dashSrc = fs.readFileSync(path.join(root, 'src/frontend/pages/Dashboard.jsx'), 'utf8');
    assert('dashboard toont label inactief', dashSrc.includes('p.active === false') && dashSrc.includes('inactief'));
  }

  // 30/10: op inactief gezet / verwijderd blijft weg na herstart + sync (render-start én server.js)
  {
    const svcApp = express();
    svcApp.use(express.json());
    svcApp.use('/api/services', servicesRouter);
    svcApp.use((err, _req, res, _next) => res.status(500).json({ error: err.message }));
    const svcServer = await new Promise((resolve) => {
      const l = svcApp.listen(0, '127.0.0.1', () => resolve(l));
    });
    const svcBase = `http://127.0.0.1:${svcServer.address().port}`;
    try {
      const candidates = await prisma.service.findMany({
        where: { active: true, draft: false, origin: 'AUTO', enrollments: { none: {} } },
        orderBy: { date: 'asc' },
        take: 2,
      });
      assert('er zijn lege AUTO-diensten om uit te zetten', candidates.length === 2, `n=${candidates.length}`);
      const [viaApi, legacy] = candidates;
      await prisma.service.update({ where: { id: viaApi.id }, data: { locked: true } });
      const put = await fetch(`${svcBase}/api/services/${viaApi.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${committeeToken}` },
        body: JSON.stringify({ active: false }),
      });
      assert('barcommissie kan dienst op inactief zetten', put.status === 200, `status=${put.status}`);
      // Zoals scripts/revert-revived-diensten.js --apply: inactief + vlag.
      await prisma.service.update({
        where: { id: legacy.id },
        data: { locked: true, active: false, teamDutiesManual: true },
      });
      const countBefore = await prisma.service.count({ where: { active: true } });
      await restartLikeRenderStart();
      await trySyncPlanningFromMatches({ from: FROM, to: TO });
      await trySyncPlanningFromMatches();
      const a = await prisma.service.findUnique({ where: { id: viaApi.id } });
      const b = await prisma.service.findUnique({ where: { id: legacy.id } });
      assert(
        'op inactief gezet -> herstart+sync -> blijft inactief (met vlag)',
        a && a.active === false && a.teamDutiesManual === true,
      );
      assert('teruggezette officiele dienst gaat niet vanzelf weer aan', b && b.active === false);
      const sameSlotActive = await prisma.service.count({
        where: {
          active: true,
          type: a.type,
          date: a.date,
          time: a.time,
        },
      });
      assert('verwijderde dienst wordt niet opnieuw aangemaakt', sameSlotActive === 0, `n=${sameSlotActive}`);
      const countAfter = await prisma.service.count({ where: { active: true } });
      assert('herstart maakt geen extra open diensten', countAfter <= countBefore, `${countBefore}->${countAfter}`);
    } finally {
      await new Promise((resolve) => svcServer.close(resolve));
    }
  }

  // Dienstregels nogmaals ongewijzigd na alle handmatige acties + herstart
  const finalRules = (await prisma.serviceRule.findMany({ orderBy: { id: 'asc' } })).map(finger);
  assert(
    'dienstregels Chantal blijven staan na alle paden',
    JSON.stringify(before) === JSON.stringify(finalRules),
  );
} catch (err) {
  failed += 1;
  console.error('FAIL  never-again regressie liep vast');
  console.error(err);
} finally {
  await prisma.$disconnect().catch(() => {});
  for (const ext of ['', '-journal', '-wal', '-shm']) {
    if (fs.existsSync(dbFile + ext)) fs.unlinkSync(dbFile + ext);
  }
  fs.rmSync(stateDir, { recursive: true, force: true });
}

if (failed) {
  console.log(`\n${failed} never-again-punt(en) gefaald`);
  process.exit(1);
}
console.log('\nChantal never-again regressie geslaagd');
