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
const { createPlanningRound, activatePlanningRound } = await import('../src/backend/lib/planningRounds.js');
const { proposeFromMatches, publishDraftServices } = await import('../src/backend/lib/proposePlanning.js');
const { generateServicesFromRules, shouldKeepServiceOutsideGeneratedPeriod } = await import('../src/backend/lib/serviceGeneration.js');
const { deactivateOrphanAutoServices } = await import('../src/backend/lib/serviceDedup.js');
const { restoreMissingSecondPlanningServices } = await import('../src/backend/lib/restoreMissingSecondPlanning.js');
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
const { splitPlanningWizardServices, summarizeMandatoryFillServices } = await import('../src/frontend/pages/planningLabels.js');
const { matchesForDienstKoppeling } = await import('../src/frontend/utils/matchDropdown.js');
const { parseMatchDateInput } = await import('../src/backend/lib/authz.js');
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
  // Altijd een toekomstige dienst: inschrijven in het verleden is voor vrijwilligers geblokkeerd.
  const enrollDate = new Date();
  enrollDate.setDate(enrollDate.getDate() + 21);
  enrollDate.setHours(12, 0, 0, 0);
  const enrollActivity = await prisma.activity.create({
    data: {
      name: 'Inschrijftest toekomst',
      type: 'overig',
      date: enrollDate,
      startTime: '13:00',
      endTime: '16:00',
      openForEnrollment: true,
      barRequired: 3,
    },
  });
  const enrollTarget = await prisma.service.create({
    data: {
      type: 'KITCHEN',
      date: enrollDate,
      time: '13:00 - 16:00',
      location: 'Keuken',
      required: 3,
      slot: 'AFTERNOON',
      origin: 'MANUAL',
      locked: true,
      draft: false,
      active: true,
      activityId: enrollActivity.id,
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

  // 16/11: jaarplanning-bardiensten zichtbaar in de concept-wizard, blijven geen concept
  {
    const brigitta = await prisma.person.create({
      data: { name: 'Brigitta Verhoog', email: 'brigitta.jaar@example.test', role: 'Vrijwilliger', active: true },
    });
    const claudia = await prisma.person.create({
      data: { name: 'Claudia den Hoed', email: 'claudia.jaar@example.test', role: 'Vrijwilliger', active: true },
    });
    const ronald = await prisma.person.create({
      data: { name: 'Ronald Rijke', email: 'ronald.jaar@example.test', role: 'Vrijwilliger', active: true },
    });

    async function addJaarplanningItem(fields, personIds = []) {
      const activity = await prisma.activity.create({
        data: {
          name: fields.name,
          type: fields.type,
          date: parseMatchDateInput(fields.date),
          startTime: fields.startTime,
          endTime: fields.endTime,
          locked: true,
          openForEnrollment: fields.open,
          barRequired: fields.barRequired,
        },
      });
      const service = await prisma.service.create({
        data: {
          type: 'BAR',
          date: activity.date,
          time: `${activity.startTime} - ${activity.endTime}`,
          location: 'Bar',
          required: fields.barRequired,
          origin: 'MANUAL',
          slot: 'EXTRA',
          activityId: activity.id,
          active: true,
          draft: false,
        },
      });
      for (const personId of personIds) {
        await prisma.enrollment.create({
          data: {
            serviceId: service.id,
            personId,
            source: 'ADMIN',
            kind: 'PERSONAL',
            reason: 'Vooraf ingepland via jaarplanning',
          },
        });
      }
      return service;
    }

    const pubquiz = await addJaarplanningItem({
      name: 'Pubquiz', type: 'overig', date: '2026-12-12', startTime: '19:30', endTime: '00:00', barRequired: 2, open: false,
    });
    const klaverjas = await addJaarplanningItem({
      name: 'Klaverjas', type: 'klaverjas', date: '2026-12-18', startTime: '18:30', endTime: '00:00', barRequired: 2, open: false,
    }, [brigitta.id, claudia.id]);
    const zaalMiddag = await addJaarplanningItem({
      name: 'Zaalvoetbaltoernooi', type: 'toernooi', date: '2026-12-28', startTime: '12:30', endTime: '17:00', barRequired: 1, open: true,
    });
    const zaalOchtend = await addJaarplanningItem({
      name: 'Zaalvoetbaltoernooi', type: 'toernooi', date: '2026-12-28', startTime: '08:30', endTime: '12:30', barRequired: 1, open: true,
    });
    const zaalAvond = await addJaarplanningItem({
      name: 'Zaalvoetbaltoernooi', type: 'toernooi', date: '2026-12-29', startTime: '18:30', endTime: '22:30', barRequired: 1, open: true,
    }, [ronald.id]);
    const ochtendbar = await prisma.service.create({
      data: {
        type: 'BAR',
        date: parseMatchDateInput('2026-12-12'),
        time: '07:30 - 12:00',
        location: 'Bar',
        required: 3,
        origin: 'AUTO',
        slot: 'MORNING',
        active: true,
        draft: true,
      },
    });

    const periodRows = await prisma.service.findMany({
      where: {
        active: true,
        date: { gte: parseMatchDateInput('2026-12-07'), lte: parseMatchDateInput('2027-01-03') },
        id: { in: [pubquiz.id, klaverjas.id, zaalMiddag.id, zaalOchtend.id, zaalAvond.id, ochtendbar.id] },
      },
      include: { activity: true, enrollments: { include: { person: true } } },
    });
    const split = splitPlanningWizardServices(periodRows);
    const jaarIds = split.jaarplanning.map((s) => s.id).sort((a, b) => a - b);
    const expectedJaar = [pubquiz.id, klaverjas.id, zaalMiddag.id, zaalOchtend.id, zaalAvond.id].sort((a, b) => a - b);
    assert('concept-ochtendbar blijft in de conceptlijst', split.drafts.some((s) => s.id === ochtendbar.id && s.draft === true));
    assert('vijf jaarplanning-diensten in de wizard-periode', jaarIds.join(',') === expectedJaar.join(','), `ids=${jaarIds}`);
    assert(
      'jaarplanning-diensten blijven geen concept (open inschrijving blijft)',
      split.jaarplanning.every((s) => s.draft === false && s.activity?.openForEnrollment === (s.id === zaalMiddag.id || s.id === zaalOchtend.id || s.id === zaalAvond.id)),
    );
    const klaverjasRow = split.jaarplanning.find((s) => s.id === klaverjas.id);
    const klaverjasNames = (klaverjasRow?.enrollments || []).map((e) => e.person?.name).sort();
    assert(
      'klaverjas toont Brigitta en Claudia',
      klaverjasNames.join(',') === 'Brigitta Verhoog,Claudia den Hoed',
      `names=${klaverjasNames}`,
    );
    const avondRow = split.jaarplanning.find((s) => s.id === zaalAvond.id);
    assert(
      'zaalvoetbal 29-12 toont Ronald Rijke',
      (avondRow?.enrollments || []).some((e) => e.person?.name === 'Ronald Rijke'),
    );
    assert('open toernooi-items blijven open', zaalMiddag && (await prisma.service.findUnique({ where: { id: zaalOchtend.id } })).draft === false);
    const afterCounts = await prisma.enrollment.groupBy({
      by: ['serviceId'],
      where: { serviceId: { in: [klaverjas.id, zaalAvond.id] } },
      _count: { id: true },
    });
    const countBy = Object.fromEntries(afterCounts.map((r) => [r.serviceId, r._count.id]));
    assert('inschrijvingen jaarplanning ongewijzigd', countBy[klaverjas.id] === 2 && countBy[zaalAvond.id] === 1, JSON.stringify(countBy));

    const beheerSrc = fs.readFileSync(path.join(root, 'src/frontend/pages/Beheer.jsx'), 'utf8');
    const activitiesSrc = fs.readFileSync(path.join(root, 'src/backend/routes/activities.js'), 'utf8');
    const cardSrc = fs.readFileSync(path.join(root, 'src/frontend/components/DienstCard.jsx'), 'utf8');
    assert(
      'wizard toont blok Jaarplanning in deze periode',
      beheerSrc.includes('splitPlanningWizardServices') && beheerSrc.includes('Jaarplanning in deze periode'),
    );
    assert('jaarplanning-aanmaak blijft draft: false', /draft:\s*false/.test(activitiesSrc) && !/draft:\s*true/.test(activitiesSrc));
    assert('dienstkaart heeft label Jaarplanning', cardSrc.includes('jaarplanning-label') && cardSrc.includes('Jaarplanning'));
    const wedSrc = fs.readFileSync(path.join(root, 'src/frontend/pages/Wedstrijden.jsx'), 'utf8');
    assert('Wedstrijden meldt verborgen gespeelde wedstrijden', wedSrc.includes('hiddenPastCount') && wedSrc.includes('gespeelde verborgen'));
    assert(
      'alleen barcommissie staat op de jaarplanning-kaart',
      cardSrc.includes('alleen barcommissie'),
    );

    // 25/11: niet-open jaarplanning mag niet automatisch worden gevuld;
    // een open jaarplanning-dienst in dezelfde periode wel.
    const mandatoryForJaar = await prisma.person.create({
      data: {
        name: 'Verplicht Jaarplanning',
        email: `verplicht-jaar-${process.pid}@vvl.test`,
        role: 'Vrijwilliger',
        active: true,
        obligation: 'FULL',
      },
    });
    const klaverjasBefore = await prisma.enrollment.findMany({
      where: { serviceId: klaverjas.id },
      select: { id: true, personId: true, source: true },
      orderBy: { id: 'asc' },
    });
    const fillJaar = await fillMandatoryPersonal({ from: '2026-12-07', to: '2027-01-10' });
    const pubquizAfter = await prisma.service.findUnique({
      where: { id: pubquiz.id },
      include: { enrollments: true },
    });
    const zaalMiddagAfter = await prisma.service.findUnique({
      where: { id: zaalMiddag.id },
      include: { enrollments: true },
    });
    const zaalOchtendAfter = await prisma.service.findUnique({
      where: { id: zaalOchtend.id },
      include: { enrollments: true },
    });
    const klaverjasAfter = await prisma.enrollment.findMany({
      where: { serviceId: klaverjas.id },
      select: { id: true, personId: true, source: true },
      orderBy: { id: 'asc' },
    });
    const openZaalFilled =
      (zaalMiddagAfter.enrollments || []).some((e) => e.source === 'AUTO') ||
      (zaalOchtendAfter.enrollments || []).some((e) => e.source === 'AUTO');
    assert(
      'niet-open jaarplanningdienst wordt niet automatisch gevuld',
      (pubquizAfter.enrollments || []).length === 0,
      `n=${(pubquizAfter.enrollments || []).length} skipped=${fillJaar.skippedNotOpen}`,
    );
    assert(
      'open jaarplanningdienst doet wél mee met automatisch inschrijven',
      openZaalFilled,
      `middag=${(zaalMiddagAfter.enrollments || []).length} ochtend=${(zaalOchtendAfter.enrollments || []).length}`,
    );
    assert(
      'bestaande inschrijvingen op een niet-open jaarplanning blijven ongewijzigd',
      JSON.stringify(klaverjasBefore) === JSON.stringify(klaverjasAfter),
    );
    const fillSummary = summarizeMandatoryFillServices(
      [pubquizAfter, klaverjas, zaalMiddagAfter, zaalOchtendAfter, zaalAvond].map((s) => ({
        ...s,
        draft: false,
        enrolled: (s.enrollments || []).filter((e) => !e.noShow).length,
        activity: s.activity || { openForEnrollment: s.id === pubquiz.id || s.id === klaverjas.id ? false : true },
      })),
    );
    assert(
      'telling stap 3 slaat niet-open jaarplanning over',
      fillSummary.skippedNotOpen === 2,
      JSON.stringify(fillSummary),
    );
    assert(
      'wizard meldt overgeslagen niet-open jaarplanning',
      beheerSrc.includes('worden overgeslagen omdat ze niet open staan voor inschrijving'),
    );
  }

  // 17/11: CSV tweede planning — O10-1 12-12 moet in preview, import én ochtendbar (ook als concept)
  {
    const csvPathCandidates = [
      '/home/box/agent-data/agents/7857ba09-8345-4c94-b604-e26595fe244e/attachments/7c81db92901e0c55b23a72866568dbd8f464af2923b037c0dcb397a2d59f2a24.csv',
      path.join(root, 'scripts/fixtures/wedstrijdplanning-6.csv'),
    ];
    const csvPath = csvPathCandidates.find((p) => fs.existsSync(p));
    assert('CSV van Chantal is beschikbaar voor regressie', Boolean(csvPath), csvPathCandidates.join(','));
    const csvText = fs.readFileSync(csvPath, 'utf8');
    const parsed = parseCsv(csvText);
    const validated = validateMatchRows(parsed.rows, { format: parsed.format, headerError: parsed.headerError });
    assert('CSV heeft 42 geldige rijen', validated.ok && validated.rows.length === 42, `n=${validated.rows.length}`);
    const o10Home = validated.rows.find((r) => r.matchNumber === '72442');
    assert(
      'O10-1 thuis 12-12 09:30 tegen Perkouw zit in de file (niet XerxesDZB)',
      o10Home?.team === 'O10-1' && o10Home.date === '2026-12-12' && o10Home.time === '09:30' && o10Home.home === true && /Perkouw/i.test(o10Home.opponent || ''),
      JSON.stringify(o10Home),
    );
    const matchesSrc = fs.readFileSync(path.join(root, 'src/backend/routes/matches.js'), 'utf8');
    assert(
      'import-preview toont alle geldige rijen (niet alleen de eerste 10)',
      matchesSrc.includes('preview: result.rows') && !matchesSrc.includes('preview: result.rows.slice(0, 10)'),
    );
    assert(
      'import-sync gebruikt de periode van de actieve (ook concept) planning',
      matchesSrc.includes('toIsoDate(round.fromDate)') && matchesSrc.includes('trySyncPlanningFromMatches({ from:'),
    );

    const decFrom = '2026-12-07';
    const decTo = '2027-01-10';
    const secondRound = await createPlanningRound(prisma, {
      label: 'Tweede planning never-again',
      from: decFrom,
      to: decTo,
    });
    await activatePlanningRound(prisma, secondRound.id);
    await generateServicesFromRules({ from: decFrom, to: decTo });
    const barBefore = await prisma.service.findFirst({
      where: {
        type: 'BAR',
        time: { startsWith: '07:30' },
        date: { gte: new Date('2026-12-12T00:00:00'), lte: new Date('2026-12-12T23:59:59') },
        active: true,
      },
      include: { teamDuties: true },
    });
    assert('ochtendbar 12-12 bestaat na stap 1 zonder wedstrijden, zonder teamplek', Boolean(barBefore) && (barBefore.teamDuties || []).length === 0, `bar=${barBefore?.id}`);

    const firstImport = await persistValidMatchRows(prisma, validated.rows);
    const firstTotal =
      firstImport.created.length + firstImport.skippedDuplicates + (firstImport.updatedExisting || []).length;
    assert('eerste import verwerkt alle 42 rijen', firstTotal === 42, `n=${firstTotal} created=${firstImport.created.length}`);
    const storedO10 = await prisma.match.findFirst({ where: { matchNumber: '72442' }, include: { team: true } });
    assert('wedstrijd 72442 staat als O10-1 thuis vs Perkouw', storedO10?.team?.name === 'O10-1' && storedO10.home === true && /Perkouw/i.test(storedO10.opponent || ''));
    if (storedO10?.teamId) {
      await prisma.team.update({
        where: { id: storedO10.teamId },
        data: { teamDutyUse: true, teamDutySlots: JSON.stringify(['MORNING']), active: true },
      });
    }

    const afterImportSync = await trySyncPlanningFromMatches({ from: decFrom, to: decTo });

    const barAfter = await prisma.service.findUnique({
      where: { id: barBefore.id },
      include: { teamDuties: { include: { team: true } } },
    });
    assert(
      'na import+sync krijgt ochtendbar 12-12 teamplek O10-1',
      (barAfter?.teamDuties || []).some((d) => /O10-1|JO10-1/i.test(d.team?.name || '')),
      `duties=${(barAfter?.teamDuties || []).map((d) => d.team?.name).join(',') || '—'} updated=${afterImportSync.updated}`,
    );

    const second = await persistValidMatchRows(prisma, validated.rows);
    const secondTotal = second.created.length + second.skippedDuplicates + (second.updatedExisting || []).length;
    assert(
      'tweede import slaat identieke rijen over',
      second.created.length === 0 && secondTotal === 42,
      `created=${second.created.length} skipped=${second.skippedDuplicates} updated=${(second.updatedExisting || []).length}`,
    );

    await prisma.match.update({
      where: { id: storedO10.id },
      data: { opponent: 'XerxesDZB', date: parseMatchDateInput('2026-11-01') },
    });
    const third = await persistValidMatchRows(prisma, validated.rows);
    const repaired = await prisma.match.findUnique({ where: { id: storedO10.id }, include: { team: true } });
    assert(
      'herimport herstelt afwijkende wedstrijd met hetzelfde nummer',
      (third.updatedExisting || []).some((m) => m.matchNumber === '72442') &&
        /Perkouw/i.test(repaired?.opponent || '') &&
        repaired.home === true,
      `updated=${(third.updatedExisting || []).length} opp=${repaired?.opponent}`,
    );

    // Alleen-barcommissie jaarplanning blijft in de wizard, ook zonder open inschrijving
    const pub = splitPlanningWizardServices([
      { id: 1, draft: true, time: '07:30 - 12:00' },
      { id: 2, draft: false, activityId: 9, activity: { id: 9, name: 'Iets', openForEnrollment: false } },
    ]);
    const earlierPath = path.join(root, 'scripts/fixtures/wedstrijdplanning-eerder.csv');
    assert('eerdere KNVB-export is beschikbaar', fs.existsSync(earlierPath));
    const earlier = validateMatchRows(parseCsv(fs.readFileSync(earlierPath, 'utf8')).rows, { format: 'knvb' });
    const earlier72442 = earlier.rows.find((r) => r.matchNumber === '72442');
    assert(
      'in de eerdere export is 72442 O10-1 thuis vs Perkouw op 24-10 09:00',
      earlier72442?.date === '2026-10-24' && earlier72442.time === '09:00' && earlier72442.team === 'O10-1' && /Perkouw/i.test(earlier72442.opponent || ''),
      JSON.stringify(earlier72442),
    );
    const today = new Date('2026-11-17T12:00:00');
    // Standaardlijst Wedstrijden verbergt 24-10 op 17-11; 12-12 blijft zichtbaar.
    assert('24-10 is vóór 17-11 (verborgen zonder “toon alle”)', new Date('2026-10-24T09:00:00') < today);
    assert('12-12 is ná 17-11 (zichtbaar in de standaardlijst)', new Date('2026-12-12T09:30:00') > today);

    assert(
      'wizard toont alleen-barcommissie jaarplanning-dienst',
      pub.jaarplanning.length === 1 && pub.jaarplanning[0].id === 2 && pub.drafts.length === 1,
    );
    const planningSrc = fs.readFileSync(path.join(root, 'src/backend/routes/planning.js'), 'utf8');
    assert(
      'ongepubliceerde Planning-lijst toont wel jaarplanning-diensten',
      planningSrc.includes("where.activityId = { not: null }"),
    );
  }

  // 17/11: bewerkte 7x7-teamdienst blijft staan na planning, handmatig toevoegen werkt,
  // en Koppel-aan-wedstrijd toont december (niet alleen t/m september).
  {
    const decFrom = '2026-12-07';
    const decTo = '2027-01-10';
    const thuDate = new Date('2026-12-10T12:00:00Z');
    await prisma.match.create({
      data: {
        date: thuDate,
        time: '20:00',
        home: true,
        opponent: 'Ergens 7x7',
        matchNumber: '7x7-2026-12-10',
        teamId: seven.id,
      },
    });
    await generateServicesFromRules({ from: decFrom, to: decTo });
    let sevenDuty = await prisma.service.findFirst({
      where: {
        type: 'BAR',
        date: { gte: new Date('2026-12-10T00:00:00Z'), lte: new Date('2026-12-10T23:59:59Z') },
        active: true,
        teamDuties: { some: { teamId: seven.id } },
      },
      include: { teamDuties: { include: { team: true } }, enrollments: true },
      orderBy: { id: 'asc' },
    });
    // Zoals Chantal die had: AUTO-teamdienst 19:00 na thuiswedstrijd (ook als de generator hem overslaat).
    if (!sevenDuty) {
      sevenDuty = await prisma.service.create({
        data: {
          type: 'BAR',
          date: thuDate,
          time: '19:00 - 21:30',
          location: 'Bar',
          required: 1,
          active: true,
          draft: true,
          locked: false,
          kind: 'TEAM',
          origin: 'AUTO',
          slot: 'EVENING',
          assignedTeamId: seven.id,
          sourceRuleId: thursdayRule.id,
          teamDuties: { create: { teamId: seven.id, reserved: 1 } },
        },
        include: { teamDuties: { include: { team: true } }, enrollments: true },
      });
    }
    assert(
      '7x7 heeft een donderdag-teamdienst op 10-12 (19:00, concept)',
      Boolean(sevenDuty) && /19:00/.test(sevenDuty.time || ''),
      `id=${sevenDuty?.id} time=${sevenDuty?.time} duties=${(sevenDuty?.teamDuties || []).map((d) => d.team?.name).join(',')}`,
    );

    const svcApp = express();
    svcApp.use(express.json());
    svcApp.use('/api/services', servicesRouter);
    svcApp.use((err, _req, res, _next) => res.status(500).json({ error: err.message }));
    const svcServer = await new Promise((resolve) => {
      const l = svcApp.listen(0, '127.0.0.1', () => resolve(l));
    });
    const svcBase = `http://127.0.0.1:${svcServer.address().port}`;
    const authHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${committeeToken}` };
    try {
      const putTime = await fetch(`${svcBase}/api/services/${sevenDuty.id}`, {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({ time: '22:00 - 00:00' }),
      });
      const edited = await putTime.json();
      assert('tijd wijzigen van 7x7-dienst lukt', putTime.status === 200, `status=${putTime.status}`);
      assert(
        'tijdswijziging zet de handmatig-vlag',
        edited.time.startsWith('22:00') && edited.teamDutiesManual === true,
        `time=${edited.time} flag=${edited.teamDutiesManual}`,
      );

      const createVol = await fetch(`${svcBase}/api/services`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          type: 'BAR',
          date: '2026-12-10',
          time: '19:00 - 22:00',
          required: 2,
          draft: true,
          active: true,
        }),
      });
      const volunteerShift = await createVol.json();
      assert('handmatige bardienst 19:00-22:00 wordt aangemaakt', createVol.status === 201 && volunteerShift.origin === 'MANUAL', `status=${createVol.status}`);

      const extraPerson = await prisma.person.create({
        data: { name: 'Chantal Test 19-22', email: `chantal-1922-${process.pid}@vvl.test`, active: true },
      });
      await prisma.enrollment.create({
        data: { serviceId: volunteerShift.id, personId: extraPerson.id, source: 'ADMIN', kind: 'PERSONAL' },
      });

      const createTeam = await fetch(`${svcBase}/api/services`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          type: 'BAR',
          date: '2026-12-17',
          time: '22:00 - 00:00',
          required: 2,
          draft: true,
          active: true,
          assignedTeamId: seven.id,
        }),
      });
      const manualTeam = await createTeam.json();
      assert(
        'handmatige teamdienst via Dienst toevoegen werkt',
        createTeam.status === 201 &&
          manualTeam.origin === 'MANUAL' &&
          (manualTeam.kind === 'TEAM' || manualTeam.kind === 'MIXED') &&
          (manualTeam.teamDuties || []).some((d) => d.teamId === seven.id || /7x7/i.test(d.team?.name || '')),
        `status=${createTeam.status} kind=${manualTeam.kind} duties=${JSON.stringify(manualTeam.teamDuties)}`,
      );

      const bare = await fetch(`${svcBase}/api/services`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          type: 'BAR',
          date: '2026-12-17',
          time: '19:00 - 22:00',
          required: 2,
          draft: true,
          active: true,
        }),
      });
      const bareShift = await bare.json();
      const addDuty = await fetch(`${svcBase}/api/services/${bareShift.id}/team-duties`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ teamId: seven.id, reserved: 2 }),
      });
      const addedDuty = await addDuty.json();
      assert(
        'teamplek achteraf toevoegen op een bestaande dienst werkt',
        addDuty.status === 201 && Number(addedDuty.teamId) === seven.id,
        `status=${addDuty.status} ${JSON.stringify(addedDuty)}`,
      );

      await generateServicesFromRules({ from: decFrom, to: decTo });
      await trySyncPlanningFromMatches({ from: decFrom, to: decTo });

      const stillSeven = await prisma.service.findUnique({
        where: { id: sevenDuty.id },
        include: { teamDuties: { include: { team: true } } },
      });
      const stillVolunteer = await prisma.service.findUnique({
        where: { id: volunteerShift.id },
        include: { enrollments: true },
      });
      const stillManualTeam = await prisma.service.findUnique({
        where: { id: manualTeam.id },
        include: { teamDuties: true },
      });
      assert(
        'bewerkte 7x7-dienst 22:00 overleeft planning genereren',
        stillSeven &&
          stillSeven.active === true &&
          stillSeven.time.startsWith('22:00') &&
          stillSeven.teamDutiesManual === true &&
          (stillSeven.teamDuties || []).some((d) => d.teamId === seven.id),
        `id=${stillSeven?.id} active=${stillSeven?.active} time=${stillSeven?.time} flag=${stillSeven?.teamDutiesManual} duties=${(stillSeven?.teamDuties || []).map((d) => d.team?.name).join(',')}`,
      );
      assert(
        'handmatige 19:00-22:00 blijft staan',
        stillVolunteer && stillVolunteer.active === true && stillVolunteer.time.startsWith('19:00'),
        `id=${stillVolunteer?.id} time=${stillVolunteer?.time}`,
      );
      assert(
        'inschrijving op de 19:00-dienst blijft ongewijzigd',
        (stillVolunteer?.enrollments || []).some((e) => e.personId === extraPerson.id) &&
          (stillVolunteer?.enrollments || []).length === 1,
        `n=${stillVolunteer?.enrollments?.length}`,
      );
      assert(
        'handmatig toegevoegde teamdienst blijft na sync',
        stillManualTeam && (stillManualTeam.teamDuties || []).some((d) => d.teamId === seven.id),
      );
    } finally {
      await new Promise((resolve) => svcServer.close(resolve));
    }

    const manyMatches = [];
    let id = 1;
    for (let d = new Date('2026-08-01T12:00:00'); d <= new Date('2027-01-10T12:00:00'); d = new Date(d.getTime() + 2 * 24 * 60 * 60 * 1000)) {
      manyMatches.push({
        id: id++,
        date: d.toISOString(),
        time: '09:00',
        team: { name: `O11-${id}` },
        opponent: 'Tegenstander',
      });
    }
    manyMatches.push({
      id: 9001,
      date: '2026-12-10T20:00:00.000Z',
      time: '20:00',
      team: { name: '7x7 mannen' },
      opponent: 'Ergens 7x7',
    });
    manyMatches.push({
      id: 9002,
      date: '2026-12-12T09:30:00.000Z',
      time: '09:30',
      team: { name: 'O10-1' },
      opponent: 'Perkouw O10-1JM',
    });
    assert('testdata heeft meer dan 80 wedstrijden (zoals een seizoen)', manyMatches.length > 80, `n=${manyMatches.length}`);
    const shown = matchesForDienstKoppeling(manyMatches, {
      formDate: '2026-12-10',
      selectedId: '',
      today: new Date('2026-11-17T12:00:00'),
    });
    const shownDays = shown.map((m) => String(m.date).slice(0, 10));
    assert(
      'dropdown toont decemberwedstrijden (7x7 10-12 en O10-1 12-12)',
      shown.some((m) => m.id === 9001) && shown.some((m) => m.id === 9002),
      `days=${[...new Set(shownDays)].join(',')}`,
    );
    assert(
      'dropdown toont niet alleen de eerste 80 van augustus/september',
      shown.some((m) => String(m.date).startsWith('2026-12')) &&
        !shown.some((m) => String(m.date).startsWith('2026-08') || String(m.date).startsWith('2026-09')),
      `first=${shownDays[0]} last=${shownDays[shownDays.length - 1]} n=${shown.length}`,
    );
    const beheerSrc = fs.readFileSync(path.join(root, 'src/frontend/pages/Beheer.jsx'), 'utf8');
    assert(
      'Dienst toevoegen gebruikt komende wedstrijden i.p.v. slice(0, 80)',
      beheerSrc.includes('matchesForDienstKoppeling') && !beheerSrc.includes('matches.slice(0, 80)'),
    );
    assert(
      'formulier Dienst toevoegen heeft veld Teamdienst',
      beheerSrc.includes('Teamdienst (optioneel)') && beheerSrc.includes('Teamdienst toevoegen'),
    );
  }

  // 17/11 na #82: donderdag 3-12, keuken 12-12 en bar 16:30–19:30 mogen niet
  // verdwijnen als de eerste (gepubliceerde) periode opnieuw gesynct wordt,
  // of als de tweede conceptplanning wordt gegenereerd.
  {
    const seedAuto = (date, type, time, extra = {}) =>
      prisma.service.create({
        data: {
          type,
          date: new Date(date),
          time,
          location: type === 'KITCHEN' ? 'Keuken' : 'Bar',
          required: 2,
          active: true,
          draft: true,
          locked: false,
          kind: 'PERSONAL',
          origin: 'AUTO',
          ...extra,
        },
      });
    const dayRange = (isoDay) => ({
      gte: new Date(`${isoDay}T00:00:00.000Z`),
      lte: new Date(`${isoDay}T23:59:59.999Z`),
    });
    async function ensureSlot(isoDay, type, time, extra = {}) {
      const existing = await prisma.service.findFirst({
        where: { type, time, date: dayRange(isoDay), active: true },
      });
      if (existing) return existing;
      return seedAuto(`${isoDay}T12:00:00Z`, type, time, extra);
    }
    async function slotExists(isoDay, type, time) {
      return prisma.service.findFirst({
        where: { type, time, date: dayRange(isoDay), active: { not: false } },
        select: { id: true, time: true, active: true, draft: true },
      });
    }
    const thu1830 = await ensureSlot('2026-12-03', 'BAR', '18:30 - 00:00');
    const thu1900 = await ensureSlot('2026-12-03', 'BAR', '19:00 - 21:30', { kind: 'TEAM', assignedTeamId: seven.id });
    const thuDuty = await prisma.serviceTeamDuty.findFirst({ where: { serviceId: thu1900.id, teamId: seven.id } });
    if (!thuDuty) {
      await prisma.serviceTeamDuty.create({ data: { serviceId: thu1900.id, teamId: seven.id, reserved: 1 } });
    }
    await ensureSlot('2026-12-12', 'KITCHEN', '10:00 - 13:00');
    await ensureSlot('2026-12-12', 'KITCHEN', '13:00 - 16:00');
    await ensureSlot('2026-12-12', 'KITCHEN', '16:00 - 19:00');
    await ensureSlot('2026-12-12', 'BAR', '16:30 - 19:30');

    assert(
      'concept-AUTO in een latere ronde wordt niet als buiten-periode gewist (regel)',
      shouldKeepServiceOutsideGeneratedPeriod(
        { origin: 'AUTO', draft: true, locked: false, date: new Date('2026-12-03T12:00:00Z'), enrollments: [] },
        { rounds: [{ fromDate: new Date('2026-12-07T00:00:00Z'), toDate: new Date('2027-01-10T00:00:00Z') }] },
      ) === true,
    );

    const firstRound = await prisma.planningRound.findFirst({
      where: { fromDate: { not: null }, publishedAt: { not: null } },
      orderBy: { fromDate: 'asc' },
    });
    assert('er is een gepubliceerde eerste planning', Boolean(firstRound));
    await activatePlanningRound(prisma, firstRound.id);
    const syncFirst = await trySyncPlanningFromMatches();
    const afterFirstSlots = await Promise.all([
      slotExists('2026-12-03', 'BAR', '18:30 - 00:00'),
      slotExists('2026-12-03', 'BAR', '19:00 - 21:30'),
      slotExists('2026-12-12', 'KITCHEN', '10:00 - 13:00'),
      slotExists('2026-12-12', 'KITCHEN', '13:00 - 16:00'),
      slotExists('2026-12-12', 'KITCHEN', '16:00 - 19:00'),
      slotExists('2026-12-12', 'BAR', '16:30 - 19:30'),
    ]);
    assert(
      'startup-sync van de eerste gepubliceerde periode wist 3-12 en 12-12 niet',
      afterFirstSlots.every(Boolean),
      `removed=${syncFirst.removed} missing=${['3-12 18:30','3-12 19:00','12-12 keuken ochtend','12-12 keuken middag','12-12 keuken laat','12-12 16:30'].filter((_, i) => !afterFirstSlots[i]).join(',')}`,
    );

    const secondRound = await prisma.planningRound.findFirst({
      where: { label: { contains: 'Tweede' } },
      orderBy: { id: 'desc' },
    });
    if (secondRound) await activatePlanningRound(prisma, secondRound.id);
    const genSecond = await generateServicesFromRules({ from: '2026-12-07', to: '2027-01-10' });
    const afterSecondSlots = await Promise.all([
      slotExists('2026-12-03', 'BAR', '18:30 - 00:00'),
      slotExists('2026-12-03', 'BAR', '19:00 - 21:30'),
      slotExists('2026-12-12', 'KITCHEN', '10:00 - 13:00'),
      slotExists('2026-12-12', 'KITCHEN', '13:00 - 16:00'),
      slotExists('2026-12-12', 'KITCHEN', '16:00 - 19:00'),
      slotExists('2026-12-12', 'BAR', '16:30 - 19:30'),
    ]);
    assert(
      'generatie tweede planning wist donderdag 3-12 niet (gat vóór 7-12)',
      Boolean(afterSecondSlots[0] && afterSecondSlots[1]),
      `removed=${genSecond.removed}`,
    );
    assert(
      'generatie tweede planning behoudt keukendiensten 12-12',
      afterSecondSlots[2] && afterSecondSlots[3] && afterSecondSlots[4],
    );
    assert(
      'generatie tweede planning behoudt bardienst 12-12 16:30–19:30',
      Boolean(afterSecondSlots[5] && afterSecondSlots[5].time.startsWith('16:30')),
    );
    const enrollAfter = await prisma.enrollment.count();
    assert('herstelsync raakt geen inschrijvingen-telling (smoke)', Number.isInteger(enrollAfter));

    // Situatie ná #82-deploy: de drie doel-diensten zijn hard gewist. Een herstart
    // met #83 mag geen overgebleven AUTO uitzetten. Herstel komt uit de backup van
    // render-start vlak vóór die deploy, niet uit de dienstregels — zodat een
    // winterstop-dienst die Chantal al had weggehaald weg blijft.
    const hasSevenMatch = await prisma.match.findFirst({
      where: { teamId: seven.id, home: true, date: dayRange('2026-12-03') },
    });
    if (!hasSevenMatch) {
      await prisma.match.create({
        data: {
          date: new Date('2026-12-03T20:00:00Z'),
          time: '20:00',
          home: true,
          opponent: 'Ergens 7x7',
          matchNumber: '7x7-2026-12-03',
          teamId: seven.id,
        },
      });
    }
    const manualKeep = await prisma.service.create({
      data: {
        type: 'BAR',
        date: new Date('2026-12-12T12:00:00Z'),
        time: '20:00 - 22:00',
        location: 'Bar',
        required: 1,
        active: true,
        draft: true,
        locked: false,
        kind: 'PERSONAL',
        origin: 'MANUAL',
        note: 'Handmatig laten staan',
      },
    });
    const manualPerson = await prisma.person.create({
      data: { name: 'Herstel Test', email: `herstel-${process.pid}@vvl.test`, active: true },
    });
    const manualEnroll = await prisma.enrollment.create({
      data: { serviceId: manualKeep.id, personId: manualPerson.id, source: 'ADMIN', kind: 'PERSONAL' },
    });
    const frozenInactive = await prisma.service.create({
      data: {
        type: 'BAR',
        date: new Date('2026-12-17T12:00:00Z'),
        time: '18:30 - 00:00',
        location: 'Bar',
        required: 1,
        active: false,
        draft: true,
        locked: false,
        kind: 'PERSONAL',
        origin: 'AUTO',
        teamDutiesManual: true,
        note: 'Bewust uit gezet',
      },
    });

    const targetWhere = {
      origin: 'AUTO',
      OR: [
        { date: dayRange('2026-12-03') },
        { date: dayRange('2026-12-12'), type: 'KITCHEN' },
        { date: dayRange('2026-12-12'), type: 'BAR', time: { startsWith: '16:30' } },
      ],
    };
    const targetRows = await prisma.service.findMany({
      where: targetWhere,
      include: { teamDuties: true, enrollments: true },
      orderBy: { id: 'asc' },
    });
    assert('doel-diensten 3-12 en 12-12 staan klaar voor de backup', targetRows.length >= 6, `n=${targetRows.length}`);
    const targetEnroll = await prisma.enrollment.create({
      data: { serviceId: targetRows[0].id, personId: manualPerson.id, source: 'ADMIN', kind: 'PERSONAL' },
    });

    let winter = await prisma.service.findFirst({
      where: { date: dayRange('2026-12-26'), origin: 'AUTO' },
    });
    if (!winter) {
      winter = await seedAuto('2026-12-26T12:00:00Z', 'KITCHEN', '10:00 - 13:00', { note: 'Winterstop' });
    }
    const winterId = winter.id;
    const winterStamp = { type: winter.type, time: winter.time };
    await prisma.serviceTeamDuty.deleteMany({ where: { serviceId: winterId } });
    await prisma.enrollment.deleteMany({ where: { serviceId: winterId } });
    await prisma.service.delete({ where: { id: winterId } });

    const restoreDir = path.join(os.tmpdir(), `herstel-tweede-planning-${process.pid}`);
    const backupDir = path.join(restoreDir, 'backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const backupFile = path.join(backupDir, 'vvl-2026-11-17T18-28-00-000Z.db');
    await prisma.$executeRawUnsafe(`VACUUM INTO '${backupFile.replace(/'/g, "''")}'`);
    assert('testdubbel van de #82-backup is weggeschreven', fs.existsSync(backupFile) && fs.statSync(backupFile).size > 0);

    const early = await prisma.service.findFirst({
      where: {
        origin: 'AUTO',
        date: { lt: new Date('2026-11-17T00:00:00.000Z') },
        enrollments: { none: {} },
      },
      select: { id: true, date: true, type: true, time: true },
    });

    const wipe = await prisma.service.findMany({ where: targetWhere, select: { id: true } });
    await prisma.serviceTeamDuty.deleteMany({ where: { serviceId: { in: wipe.map((s) => s.id) } } });
    await prisma.enrollment.deleteMany({ where: { serviceId: { in: wipe.map((s) => s.id) } } });
    await prisma.service.deleteMany({ where: { id: { in: wipe.map((s) => s.id) } } });
    if (early) {
      await prisma.serviceTeamDuty.deleteMany({ where: { serviceId: early.id } });
      await prisma.service.delete({ where: { id: early.id } });
    }

    const snapshot = await prisma.service.findMany({
      select: { id: true, active: true, draft: true, time: true, type: true, origin: true, teamDutiesManual: true, note: true, required: true },
      orderBy: { id: 'asc' },
    });
    const enrollBeforeRestore = await prisma.enrollment.count();
    await activatePlanningRound(prisma, firstRound.id);
    const restartSync = await trySyncPlanningFromMatches();
    const orphanAfter = await deactivateOrphanAutoServices(prisma);
    const afterRestart = await prisma.service.findMany({
      where: { id: { in: snapshot.map((s) => s.id) } },
      select: { id: true, active: true, draft: true, time: true, type: true, origin: true, teamDutiesManual: true, note: true, required: true },
      orderBy: { id: 'asc' },
    });
    const snapMap = new Map(snapshot.map((s) => [s.id, s]));
    const missingAfterRestart = snapshot.filter((s) => !afterRestart.some((x) => x.id === s.id));
    const deactivatedAfterRestart = afterRestart.filter((s) => s.active === false && snapMap.get(s.id)?.active !== false);
    assert(
      'herstart na #82 zet of verwijdert geen bestaande AUTO-diensten extra',
      missingAfterRestart.length === 0 && deactivatedAfterRestart.length === 0,
      `missing=${missingAfterRestart.map((s) => s.id).join(',')} deactivated=${deactivatedAfterRestart.map((s) => s.id).join(',')} orphan=${orphanAfter.deactivated} removed=${restartSync.removed}`,
    );

    const emptyDir = path.join(os.tmpdir(), `herstel-geen-backup-${process.pid}`);
    fs.mkdirSync(emptyDir, { recursive: true });
    const withoutBackup = await restoreMissingSecondPlanningServices(prisma, { stateDir: emptyDir });
    assert(
      'zonder exacte #82-backup wordt niets hersteld en geen marker gezet',
      withoutBackup.skipped === true &&
        withoutBackup.restored === 0 &&
        !fs.existsSync(path.join(emptyDir, 'repaired-restore-from-backup-2026-11-17T18-28.json')) &&
        !(await slotExists('2026-12-03', 'BAR', '18:30 - 00:00')),
      `reason=${withoutBackup.reason}`,
    );

    const restored = await restoreMissingSecondPlanningServices(prisma, { stateDir: restoreDir });
    const broughtBack = await Promise.all(targetRows.map((row) => prisma.service.findUnique({ where: { id: row.id } })));
    const restoredSlots = await Promise.all([
      slotExists('2026-12-03', 'BAR', '18:30 - 00:00'),
      slotExists('2026-12-03', 'BAR', '19:00 - 21:30'),
      slotExists('2026-12-12', 'KITCHEN', '10:00 - 13:00'),
      slotExists('2026-12-12', 'KITCHEN', '13:00 - 16:00'),
      slotExists('2026-12-12', 'KITCHEN', '16:00 - 19:00'),
      slotExists('2026-12-12', 'BAR', '16:30 - 19:30'),
    ]);
    const enrollBack = await prisma.enrollment.findUnique({ where: { id: targetEnroll.id } });
    assert(
      'herstel uit de #82-backup zet 3-12, keukens 12-12 en bar 16:30–19:30 terug met dezelfde id’s',
      broughtBack.every((s, i) => s && s.id === targetRows[i].id && s.type === targetRows[i].type && s.time === targetRows[i].time && s.draft === targetRows[i].draft && s.origin === targetRows[i].origin) &&
        restoredSlots.every(Boolean) &&
        restored.restored >= 6,
      `restored=${restored.restored} missing=${broughtBack.map((s, i) => (s ? '' : targetRows[i].id)).filter(Boolean).join(',')}`,
    );
    assert(
      'inschrijving uit de backup komt terug op de herstelde dienst',
      enrollBack && enrollBack.serviceId === targetRows[0].id && enrollBack.personId === manualPerson.id,
    );
    const winterAfter = await prisma.service.findUnique({ where: { id: winterId } });
    const winterSlotAfter = await prisma.service.findFirst({
      where: { date: dayRange('2026-12-26'), type: winterStamp.type, time: winterStamp.time },
    });
    assert(
      'handmatig verwijderde winterstop-dienst blijft weg (niet in de #82-backup)',
      !winterAfter && !winterSlotAfter,
    );
    if (early) {
      const earlyAfter = await prisma.service.findUnique({ where: { id: early.id } });
      assert('dienst van vóór 17-11 uit de backup wordt niet teruggezet', !earlyAfter);
    }
    const manualAfter = await prisma.service.findUnique({ where: { id: manualKeep.id }, include: { enrollments: true } });
    const frozenAfter = await prisma.service.findUnique({ where: { id: frozenInactive.id } });
    const extraDec17 = await prisma.service.count({
      where: { date: dayRange('2026-12-17'), type: 'BAR', time: { startsWith: '18:30' }, active: true },
    });
    const leftoverChanged = (await prisma.service.findMany({
      where: { id: { in: snapshot.map((s) => s.id) } },
      select: { id: true, active: true, draft: true, time: true, type: true, origin: true, teamDutiesManual: true, note: true, required: true },
      orderBy: { id: 'asc' },
    })).filter((s) => JSON.stringify(s) !== JSON.stringify(snapMap.get(s.id)));
    assert(
      'herstel laat bestaande rijen, handmatige dienst en inschrijving ongemoeid',
      leftoverChanged.length === 0 &&
        manualAfter &&
        manualAfter.origin === 'MANUAL' &&
        manualAfter.note === 'Handmatig laten staan' &&
        manualAfter.enrollments.some((e) => e.id === manualEnroll.id) &&
        (await prisma.enrollment.count()) === enrollBeforeRestore + 1,
      `changed=${leftoverChanged.length} enroll=${await prisma.enrollment.count()} expected=${enrollBeforeRestore + 1}`,
    );
    assert(
      'bewust inactieve dienst (#78) wordt niet teruggezet of gedupliceerd',
      frozenAfter && frozenAfter.active === false && frozenAfter.teamDutiesManual === true && extraDec17 === 0,
    );
    const again = await restoreMissingSecondPlanningServices(prisma, { stateDir: restoreDir });
    assert('herstelstap is idempotent (marker, geen extra creates)', again.already === true && (again.restored || 0) === 0);
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
