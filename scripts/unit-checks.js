/**
 * Lokale unit checks (geen server nodig).
 * Run: node scripts/unit-checks.js
 */
import fs from 'fs';
import { parseCsv, validateMatchRows, objectsToMatchRows } from '../src/backend/lib/csvMatches.js';
import { workbookToXlsx } from '../src/backend/lib/xlsxWrite.js';
import { xlsxToObjects } from '../src/backend/lib/xlsxWorkbook.js';
import { seasonLabelForDate, nextSeasonLabel, seasonRangeFromLabel } from '../src/backend/lib/season.js';
import { parsePersonCsv, validatePersonRows } from '../src/backend/lib/csvPersons.js';
import { dutyReminderEmail } from '../src/backend/lib/reminders.js';
import { swapCommitteeEmailContent } from '../src/backend/lib/mail.js';
import { isYoungYouthTeam, isOldYouthTeam, parseJoAge } from '../src/backend/lib/youthTeams.js';
import {
  underQuota,
  isUnavailableOn,
  prefersSlot,
  normalizeObligation,
  remainingObligation,
} from '../src/backend/lib/obligation.js';
import { isCanonicalPersonNumber } from '../src/backend/lib/personNumber.js';
import { compareFillCandidates } from '../src/backend/lib/plannerOrder.js';
import { swapBlockers } from '../src/backend/lib/swapRules.js';
import { normalizeRole } from '../src/backend/lib/appUrl.js';
import { canAccess, canonicalAccessRole } from '../src/backend/lib/roles.js';
import { evaluateRule } from '../src/backend/lib/serviceRuleLogic.js';
import { matchBlockRange, serviceOutsideMatchBlocks } from '../src/backend/lib/matchBlocks.js';
import { defaultTeamFunctions, isO13FirstTeam } from '../src/backend/lib/teamFunctions.js';
import {
  groupHomeMatchesByKickoff,
  pickServicesMatchingHomeMatches,
  serviceWindowForKickoff,
} from '../src/backend/lib/matchPlanning.js';
import {
  eligibleTeamDutyCandidates,
  recordTeamDutyStand,
  requiredForTeamDuties,
  teamDutyAssignments,
} from '../src/backend/lib/teamDutyPlanning.js';
import { resolvePlanningPeriod } from '../src/backend/lib/planningPeriod.js';
import { toIsoDate } from '../src/backend/lib/dates.js';
import {
  SLOT_ROWS,
  inferSlot,
  rosterDaySections,
  servicesForSlotRow,
  slotCellText,
} from '../src/backend/lib/pdfRoster.js';
import { defaultPlanningEndInput } from '../src/frontend/utils/formatDate.js';

let pass = 0;
let fail = 0;

function assert(name, cond) {
  if (cond) {
    pass += 1;
    console.log(`PASS  ${name}`);
  } else {
    fail += 1;
    console.log(`FAIL  ${name}`);
  }
}

const goodParsed = parseCsv('date;home;opponent;team\n2026-08-29;true;A;JO11-1');
const good = validateMatchRows(goodParsed.rows, { headerError: goodParsed.headerError });
assert('csv all valid', good.ok && good.rows.length === 1);

const mixedParsed = parseCsv(
  'date;home;opponent;team\nbad;true;A;JO\n2026-08-29;true;B;JO15-1',
);
const mixed = validateMatchRows(mixedParsed.rows);
assert('csv partial import split', mixed.rows.length === 1 && mixed.invalidRows.length === 1);

const noHeader = parseCsv('foo;bar\n1;2');
assert('csv missing date header', Boolean(noHeader.headerError));

const cal = validateMatchRows(
  parseCsv('date;home;opponent;team\n2026-02-30;true;A;T').rows,
);
assert('reject impossible date Feb 30', cal.rows.length === 0);

const badHome = validateMatchRows(
  parseCsv('date;home;opponent;team\n2026-08-29;maybe;A;T').rows,
);
assert('reject invalid home', badHome.invalidRows.length === 1);

const knvb = parseCsv(
  'Datum;Tijd;Thuis;Uit;Wedstrijdnr.;Type;Spelniveau;Opmerkingen\n' +
    '2026-09-12;08:30;Lekkerkerk O11-1;SV Capelle O11-1;40584;Reguliere competitie;B-categorie;\n' +
    '5-9-2026;11:15;Olympia O15-1;Lekkerkerk O15-1;40477;Reguliere competitie;;',
);
const knvbVal = validateMatchRows(knvb.rows, { headerError: knvb.headerError, format: knvb.format });
assert('knvb format detected', knvb.format === 'knvb');
assert('knvb both rows valid without required niveau/note', knvbVal.ok && knvbVal.rows.length === 2);
assert('knvb home derived from Thuis column', knvbVal.rows[0].home === true && knvbVal.rows[0].team === 'O11-1');
assert('knvb away derived from Uit column', knvbVal.rows[1].home === false && knvbVal.rows[1].team === 'O15-1');
assert('knvb dutch date parsed', knvbVal.rows[1].date === '2026-09-05');
assert('knvb empty spelniveau allowed', knvbVal.rows[1].playLevel == null);

const knvbNoClub = validateMatchRows(
  parseCsv(
    'Datum;Thuis;Uit\n2026-09-12;Capelle O11-1;SVS O11-2',
  ).rows,
);
assert('knvb rejects row without Lekkerkerk', knvbNoClub.invalidRows.length === 1);

const serial = validateMatchRows(
  parseCsv('Datum;Tijd;Thuis;Uit\n46270;0.35416666666666669;Lekkerkerk O16-1;NOCKralingen O16-1').rows,
);
assert(
  'excel serial date+time',
  serial.rows.length === 1 && serial.rows[0].date === '2026-09-05' && serial.rows[0].time === '08:30',
);

assert('O11-1 is young youth', isYoungYouthTeam('O11-1') === true);
assert('JO15-1 is old youth', isOldYouthTeam('JO15-1') === true);
assert('O16-1 is old youth', isOldYouthTeam('O16-1') === true);
assert('MO17-1 is old youth', isOldYouthTeam('MO17-1') === true);
assert('MO12-1 is young youth', isYoungYouthTeam('MO12-1') === true);
assert('O8-2JM is young youth', isYoungYouthTeam('O8-2JM') === true);
assert('parseJoAge MO17', parseJoAge('MO17-1')?.age === 17);

const win9 = serviceWindowForKickoff('09:00');
assert('kickoff 09:00 → 07:30 - 12:00', win9.time === '07:30 - 12:00' && win9.slot === 'MORNING');
assert('kickoff 08:30 → ochtend 07:30 - 12:00', serviceWindowForKickoff('08:30').time === '07:30 - 12:00');
assert('kickoff 15:00 → middag 12:00 - 16:30', serviceWindowForKickoff('15:00').time === '12:00 - 16:30');
assert('kickoff 16:00 → middag 12:00 - 16:30', serviceWindowForKickoff('16:00').time === '12:00 - 16:30');
assert('kickoff 16:30 → avond 16:30 - 19:30', serviceWindowForKickoff('16:30').time === '16:30 - 19:30');

const day = new Date('2026-09-12T12:00:00');
const fiveSameTime = [1, 2, 3, 4, 5].map((n) => ({
  home: true,
  date: day,
  time: '09:00',
  opponent: `Tegen ${n}`,
  team: { name: `O11-${n}` },
}));
const groupedSame = groupHomeMatchesByKickoff(fiveSameTime);
assert('five home matches same kickoff → one slot', groupedSame.length === 1 && groupedSame[0].matches.length === 5);

const morningSpread = groupHomeMatchesByKickoff([
  { home: true, date: day, time: '08:30', opponent: 'A' },
  { home: true, date: day, time: '10:15', opponent: 'B' },
  { home: true, date: day, time: '11:00', opponent: 'C' },
]);
assert('morning kickoffs share 07:30-12:00', morningSpread.length === 1 && morningSpread[0].window.time === '07:30 - 12:00');

const mixedTimes = groupHomeMatchesByKickoff([
  { home: true, date: day, time: '09:00', opponent: 'A' },
  { home: true, date: day, time: '15:00', opponent: 'B' },
  { home: false, date: day, time: '09:00', opponent: 'Uit' },
]);
assert('morning and afternoon are separate slots', mixedTimes.length === 2);
assert('away matches are ignored', mixedTimes.every((g) => g.matches.every((m) => m.home)));

const groupsForPick = groupHomeMatchesByKickoff([
  { id: 10, home: true, date: day, time: '09:00', opponent: 'A' },
]);
const picked = pickServicesMatchingHomeMatches(
  [
    { id: 1, type: 'BAR', date: day, time: '09:00 - 12:00', matchId: 10 },
    { id: 2, type: 'KITCHEN', date: day, time: '09:00 - 12:00', matchId: 10 },
    { id: 3, type: 'BAR', date: day, time: '18:00 - 22:00', matchId: null },
    { id: 4, type: 'BAR', date: day, time: '09:00 - 13:00', matchId: null },
  ],
  groupsForPick,
);
assert('matching bar is kept', picked.keep.length === 1 && picked.keep[0].id === 1);
assert('kitchen and evening bar are unmatched', picked.remove.map((s) => s.id).sort().join(',') === '2,3,4');

const pdfDays = rosterDaySections();
assert('pdf has 7 days', pdfDays.length === 7);
assert(
  'weekdays use same slot rows as weekend',
  pdfDays[0].rows === SLOT_ROWS && pdfDays[5].rows === SLOT_ROWS && pdfDays[6].rows.length === 6,
);
assert('pdf includes kitchen rows', SLOT_ROWS.some((row) => row.type === 'KITCHEN'));
assert(
  'pdf slot times bar',
  SLOT_ROWS.filter((r) => r.type === 'BAR')
    .map((r) => r.time)
    .join('|') === '07:30 - 12:00|12:00 - 16:30|16:30 - 19:30',
);
assert('infer 19:00 as evening', inferSlot({ time: '19:00 - 22:00', slot: 'EXTRA' }) === 'EVENING');
assert('infer 09:00 as morning', inferSlot({ time: '09:00 - 12:00' }) === 'MORNING');
assert(
  'empty slot cell is gesloten',
  slotCellText(servicesForSlotRow([], SLOT_ROWS[0])) === 'gesloten',
);
assert(
  'named bar fills morning bar row',
  slotCellText(
    servicesForSlotRow(
      [
        {
          type: 'BAR',
          slot: 'MORNING',
          time: '09:00 - 13:00',
          enrollments: [{ person: { name: 'Lisa' } }],
        },
      ],
      SLOT_ROWS[0],
    ),
  ) === 'Lisa',
);
assert(
  'kitchen is ignored in bar-only pdf rows',
  slotCellText(
    servicesForSlotRow(
      [{ type: 'KITCHEN', slot: 'MORNING', time: '09:00 - 12:00', enrollments: [] }],
      SLOT_ROWS[0],
    ),
  ) === 'gesloten',
);
assert(
  'kitchen fills kitchen pdf row',
  slotCellText(
    servicesForSlotRow(
      [
        {
          type: 'KITCHEN',
          slot: 'MORNING',
          time: '10:00 - 13:00',
          enrollments: [{ person: { name: 'Piet' } }],
        },
      ],
      SLOT_ROWS.find((r) => r.type === 'KITCHEN' && r.slot === 'MORNING'),
    ),
  ) === 'Piet',
);

const xlsxPath = 'C:/Users/dbeme/Documents/KNVB-Wedstrijden.xlsx';
if (fs.existsSync(xlsxPath)) {
  const objects = xlsxToObjects(fs.readFileSync(xlsxPath));
  const parsed = objectsToMatchRows(objects, 'knvb');
  const val = validateMatchRows(parsed.rows, { headerError: parsed.headerError, format: parsed.format });
  assert('xlsx parses 86 knvb rows', objects.length === 86);
  assert('xlsx all rows valid', val.ok && val.rows.length === 86);
  assert('xlsx optional remarks empty ok', val.rows.every((r) => r.note == null));
  const first = val.rows[0];
  assert(
    'xlsx first row mapped',
    first.date === '2026-09-05' &&
      first.time === '08:30' &&
      first.home === false &&
      first.team === 'O16-1' &&
      first.matchNumber === '40584',
  );
}

assert('FULL under quota', underQuota({ obligation: 'FULL' }, 0, 5) === true);
assert('FULL met', underQuota({ obligation: 'FULL' }, 1, 5) === false);
assert('HALF normalizes to FULL', normalizeObligation('HALF') === 'FULL');
assert('HALF uses FULL 6-week quota', underQuota({ obligation: 'HALF' }, 0, 5) === true);
assert('HALF met after one 6w duty', underQuota({ obligation: 'HALF' }, 1, 2) === false);
assert('VR18 under quota 12w', underQuota({ obligation: 'VR18' }, 1, 4, 0) === true);
assert('VR18 met 12w', underQuota({ obligation: 'VR18' }, 1, 4, 1) === false);
assert('exempted not under quota', underQuota({ obligation: 'FULL', exempted: true }, 0, 0, 0) === false);
assert('makeup remaining on top', remainingObligation({ obligation: 'FULL', makeupDue: 2 }, 1) === 2);
assert('normalize legacy mandatory', normalizeObligation(undefined, true) === 'FULL');
assert('normalize VR18', normalizeObligation('VR18') === 'VR18');

const friday = {
  name: 'Vrijdag bar',
  weekday: 5,
  conditionType: 'ACTIVITY',
  conditionActivityType: 'klaverjas',
  active: true,
};
assert(
  'vrijdag bar zonder klaverjas',
  evaluateRule(friday, { date: new Date('2026-09-18T12:00:00'), weekday: 5, activities: [] }).ok === false,
);
assert(
  'vrijdag bar met klaverjas',
  evaluateRule(friday, {
    date: new Date('2026-09-18T12:00:00'),
    weekday: 5,
    activities: [{ type: 'klaverjas', name: 'Klaverjasavond' }],
  }).ok === true,
);

const homeBlock = matchBlockRange({
  home: true,
  date: new Date('2026-09-12T14:30:00'),
  time: '14:30',
  team: { matchDurationMinutes: 105, availabilityUse: true },
});
assert(
  'thuisblokkade 1 uur voor/na',
  homeBlock.from.getHours() === 13 && homeBlock.from.getMinutes() === 30,
);
const afternoonBar = { date: new Date('2026-09-12T12:00:00'), time: '12:00 - 16:30' };
const morningBar = { date: new Date('2026-09-12T12:00:00'), time: '07:30 - 12:00' };
assert('middag bar valt in blokkade', serviceOutsideMatchBlocks(afternoonBar, [homeBlock]) === false);
assert('ochtend bar valt buiten blokkade', serviceOutsideMatchBlocks(morningBar, [homeBlock]) === true);

assert('O11 is teamdienst ochtend', defaultTeamFunctions('O11-1').teamDutySlots[0] === 'MORNING');
assert('O15 is tweede+laatste', defaultTeamFunctions('O15-1').teamDutySlots.join(',') === 'SECOND,LAST');
assert('JO15 is tweede+laatste', defaultTeamFunctions('JO15-1').teamDutySlots.join(',') === 'SECOND,LAST');
assert('O13-1JM is tweede+laatste', defaultTeamFunctions('O13-1JM').teamDutySlots.join(',') === 'SECOND,LAST');
assert('O13-1 is eerste O13', isO13FirstTeam('O13-1') === true);
assert('JO13-2 wel teamdienst middag+avond', defaultTeamFunctions('JO13-2').teamDutyUse === true);
assert('JO13-2 tweede+laatste', defaultTeamFunctions('JO13-2').teamDutySlots.join(',') === 'SECOND,LAST');
assert('Lekkerkerk 3 alleen beschikbaarheid', defaultTeamFunctions('Lekkerkerk 3').teamDutyUse === false);

assert('person number 7 digits', isCanonicalPersonNumber('4829103') === true);
assert('person number rejects VVL prefix', isCanonicalPersonNumber('VVL-00001') === false);
assert('role Coördinator becomes Barcommissie', normalizeRole('Coördinator') === 'Barcommissie');
assert('role Bestuur becomes Admin', normalizeRole('Bestuur') === 'Admin');
assert('canonical Bestuur is Admin', canonicalAccessRole('Bestuur') === 'Admin');
assert('vrijwilliger geen dashboard', canAccess('Vrijwilliger', 'dashboard') === false);
assert('vrijwilliger wel inschrijven', canAccess('Vrijwilliger', 'inschrijven') === true);
assert('vrijwilliger geen voorkeuren-tab', canAccess('Vrijwilliger', 'voorkeuren') === false);
assert('vrijwilliger geen planning', canAccess('Vrijwilliger', 'planning') === false);
assert('barcommissie geen inschrijven', canAccess('Barcommissie', 'inschrijven') === false);
assert('barcommissie geen ruilen-tab', canAccess('Barcommissie', 'ruilen') === false);
assert('barcommissie geen voorkeuren', canAccess('Barcommissie', 'voorkeuren') === false);
assert('barcommissie wel beheer', canAccess('Barcommissie', 'beheer') === true);
assert('admin geen inschrijven', canAccess('Admin', 'inschrijven') === false);
assert('admin wel beheer', canAccess('Admin', 'beheer') === true);
assert('teamco wel inschrijven', canAccess('Teamcoördinator', 'inschrijven') === true);
assert('teamco wel mijn team', canAccess('Teamcoördinator', 'teams') === true);
assert('teamco geen voorkeuren-tab', canAccess('Teamcoördinator', 'voorkeuren') === false);

const makeupFirst = compareFillCandidates(
  { person: { makeupDue: 1, obligation: 'FULL', personNumber: '2000000' }, counts: { countYear: 4 }, lastPersonalAt: new Date('2026-06-01') },
  { person: { makeupDue: 0, obligation: 'FULL', personNumber: '1000000' }, counts: { countYear: 0 }, lastPersonalAt: null },
  { slot: 'MORNING' },
);
assert('planner: inhaal gaat voor', makeupFirst < 0);

const fullBeforeVr18 = compareFillCandidates(
  { person: { makeupDue: 0, obligation: 'FULL', personNumber: '2000000' }, counts: { countYear: 2 }, lastPersonalAt: new Date('2026-06-01') },
  { person: { makeupDue: 0, obligation: 'VR18', personNumber: '1000000' }, counts: { countYear: 0 }, lastPersonalAt: null },
  { slot: 'MORNING' },
);
assert('planner: FULL voor VR18+', fullBeforeVr18 < 0);

const neverServed = compareFillCandidates(
  { person: { makeupDue: 0, obligation: 'FULL', personNumber: '2000000' }, counts: { countYear: 0 }, lastPersonalAt: null },
  { person: { makeupDue: 0, obligation: 'FULL', personNumber: '1000000' }, counts: { countYear: 0 }, lastPersonalAt: new Date('2026-01-01') },
  { slot: 'MORNING' },
);
assert('planner: nooit gestaan eerst', neverServed < 0);

const teamSwap = swapBlockers({
  fromEnrollment: { id: 1, personId: 1, kind: 'TEAM', noShow: false, service: { active: true, draft: false, date: new Date('2026-10-01') } },
  toEnrollment: { id: 2, personId: 2, kind: 'PERSONAL', noShow: false, service: { active: true, draft: false, date: new Date('2026-10-08') } },
  fromPerson: { blocks: [] },
  toPerson: { blocks: [] },
  now: new Date('2026-09-13'),
});
assert('ruil weigert teamdienst', teamSwap.ok === false);

const futureSwap = swapBlockers({
  fromEnrollment: {
    id: 1,
    personId: 1,
    kind: 'PERSONAL',
    noShow: false,
    service: { active: true, draft: false, date: new Date('2026-10-01'), enrollments: [{ personId: 1, id: 1 }] },
  },
  toEnrollment: {
    id: 2,
    personId: 2,
    kind: 'PERSONAL',
    noShow: false,
    service: { active: true, draft: false, date: new Date('2026-10-08'), enrollments: [{ personId: 2, id: 2 }] },
  },
  fromPerson: { blocks: [] },
  toPerson: { blocks: [] },
  now: new Date('2026-09-13'),
});
assert('ruil twee toekomstige persoonlijke diensten ok', futureSwap.ok === true);

const lockedSwap = swapBlockers({
  fromEnrollment: {
    id: 1,
    personId: 1,
    kind: 'PERSONAL',
    noShow: false,
    service: { active: true, draft: false, locked: true, date: new Date('2026-10-01'), enrollments: [{ personId: 1, id: 1 }] },
  },
  toEnrollment: {
    id: 2,
    personId: 2,
    kind: 'PERSONAL',
    noShow: false,
    service: { active: true, draft: false, locked: true, date: new Date('2026-10-08'), enrollments: [{ personId: 2, id: 2 }] },
  },
  fromPerson: { blocks: [] },
  toPerson: { blocks: [] },
  now: new Date('2026-09-13'),
});
assert(
  'ruil mag op officieel rooster',
  lockedSwap.ok === true && lockedSwap.errors.length === 0,
);

assert(
  'unavailable Monday',
  isUnavailableOn({ unavailableWeekdays: '[1]' }, new Date('2026-07-27T12:00:00')) === true,
);
assert(
  'prefers evening',
  prefersSlot({ preferredSlots: '["EVENING"]' }, 'EVENING') === true,
);
assert(
  'rejects morning when evening preferred',
  prefersSlot({ preferredSlots: '["EVENING"]' }, 'MORNING') === false,
);

assert('season Sep 2026 is 2026-2027', seasonLabelForDate(new Date('2026-09-13T12:00:00')) === '2026-2027');
assert('season Jul 2026 is 2025-2026', seasonLabelForDate(new Date('2026-07-31T12:00:00')) === '2025-2026');
const season2026 = seasonRangeFromLabel('2026-2027', 8);
assert(
  'seizoensgrenzen 2026-2027',
  toIsoDate(season2026.from) === '2026-08-01' && toIsoDate(season2026.to) === '2027-07-31',
);
assert('next season after 2026-2027', nextSeasonLabel('2026-2027') === '2027-2028');

const personCsv = parsePersonCsv(
  'naam;email;telefoon;team;rol;verplichting\nAnna de Vries;anna@vvl.demo;0612345678;JO15-1;Vrijwilliger;FULL',
);
assert('person csv parses naam', personCsv.rows.length === 1 && personCsv.rows[0].name === 'Anna de Vries');
const personOk = validatePersonRows(personCsv.rows, { teams: [{ id: 1, name: 'JO15-1' }] });
assert('person csv known team ok', personOk.ok && personOk.rows[0].teamId === 1);
const personBad = validatePersonRows(personCsv.rows, { teams: [{ id: 2, name: 'MO17-1' }] });
assert(
  'person csv unknown team rejected',
  personBad.ok === false && personBad.unknownTeams.includes('JO15-1'),
);
const personMail = validatePersonRows(
  parsePersonCsv('naam;email\nPiet;niet-email').rows,
  { teams: [] },
);
assert('person csv invalid email rejected', personMail.ok === false);

const xlsxBuf = workbookToXlsx([
  {
    name: 'Diensten',
    headers: ['Datum', 'Type', 'Namen'],
    rows: [['2026-09-13', 'Bar', 'Lisa']],
  },
]);
const xlsxRound = xlsxToObjects(xlsxBuf);
assert(
  'xlsx roundtrip first sheet',
  xlsxRound.length === 1 && xlsxRound[0].Datum === '2026-09-13' && xlsxRound[0].Namen === 'Lisa',
);
const xlsxFormula = workbookToXlsx([
  { name: 'Test', headers: ['Naam'], rows: [['=CMD|calc']] },
]);
assert('xlsx formula injection prefixed', xlsxFormula.toString('utf8').includes("'=CMD|calc"));

const reminder = dutyReminderEmail({
  name: 'Lisa',
  dateText: 'maandag 14 september',
  time: '09:00 - 12:00',
  typeLabel: 'bardienst',
  appUrl: 'https://example.test',
});
assert('reminder subject has date', reminder.subject.includes('14 september'));

const swapMail = swapCommitteeEmailContent({
  name: 'Mark',
  requesterName: 'Lisa',
  counterpartyName: 'Tom',
  fromLabel: 'za 19 sep · 12:00 - 16:30 · bar',
  toLabel: 'zo 20 sep · 12:00 - 15:00 · keuken',
  appUrl: 'https://example.test',
});
assert('ruilmail naar barcommissie', swapMail.subject.includes('goedkeuring') && swapMail.text.includes('barcommissie'));
assert('ruilmail link naar beheer', swapMail.text.includes('/beheer?tab=ruilen'));

const o12 = {
  id: 12,
  name: 'O12-1',
  teamDutyUse: true,
  teamDutySlots: JSON.stringify(['MORNING']),
};
const o15 = {
  id: 15,
  name: 'O15-1',
  teamDutyUse: true,
  teamDutySlots: JSON.stringify(['SECOND', 'LAST']),
};
const morningRule = {
  teamDuty: true,
  teamDutySlotRole: 'MORNING',
  required: 3,
  teamDutyReserved: 2,
  teamDutyAgeFrom: 8,
  teamDutyAgeTo: 12,
};
const secondRule = {
  teamDuty: true,
  teamDutySlotRole: 'SECOND',
  required: 2,
  teamDutyReserved: 2,
  teamDutyAgeFrom: 13,
  teamDutyAgeTo: 17,
};
const lastRule = {
  teamDuty: true,
  teamDutySlotRole: 'LAST',
  required: 2,
  teamDutyReserved: 1,
  teamDutyAgeFrom: 13,
  teamDutyAgeTo: 17,
};
const o12Home = {
  team: o12,
  home: true,
  time: '09:00',
  date: new Date('2026-09-19T12:00:00'),
};
const o15Home = {
  team: o15,
  home: true,
  time: '14:00',
  date: new Date('2026-09-19T12:00:00'),
};
const morningAssign = teamDutyAssignments(morningRule, [o12Home]);
assert('O12 thuis ochtend 2 teamplekken', morningAssign.length === 1 && morningAssign[0].reserved === 2);
assert(
  'ochtend 2 team + 1 open = 3 nodig',
  requiredForTeamDuties(3, 'MORNING', morningAssign) === 3,
);
assert(
  'O15 thuis → middag teamdienst',
  teamDutyAssignments(secondRule, [o15Home]).length === 1,
);
assert(
  'O15 thuis → ook avond teamdienst',
  teamDutyAssignments(lastRule, [o15Home]).length === 1 &&
    teamDutyAssignments(lastRule, [o15Home])[0].reserved === 1,
);
assert(
  'avond 1 team + 1 open = 2 nodig',
  requiredForTeamDuties(2, 'LAST', teamDutyAssignments(lastRule, [o15Home])) === 2,
);

const o8 = {
  id: 8,
  name: 'O8-2JM',
  teamDutyUse: true,
  teamDutySlots: JSON.stringify(['MORNING']),
};
const o9 = {
  id: 9,
  name: 'O9-3',
  teamDutyUse: true,
  teamDutySlots: JSON.stringify(['MORNING']),
};
const o10 = {
  id: 10,
  name: 'O10-2',
  teamDutyUse: true,
  teamDutySlots: JSON.stringify(['MORNING']),
};
const jo11 = {
  id: 11,
  name: 'JO11-1',
  teamDutyUse: true,
  teamDutySlots: JSON.stringify(['MORNING']),
};
function morningHome(team) {
  return { team, home: true, time: '09:00', date: new Date('2026-09-19T12:00:00') };
}
const fiveMorningHomes = [o8, o9, o10, jo11, o12].map(morningHome);
const fiveAssign = teamDutyAssignments(morningRule, fiveMorningHomes);
assert(
  'vijf jeugdteams thuis → één team op de ochtenddienst',
  fiveAssign.length === 1 && fiveAssign[0].reserved === 2,
);
assert(
  'ochtend blijft 3 plekken, groeit niet mee',
  requiredForTeamDuties(3, 'MORNING', fiveAssign) === 3,
);
assert(
  'vijf thuisteams zijn wel allemaal kandidaat',
  eligibleTeamDutyCandidates(morningRule, fiveMorningHomes).length === 5,
);
const leastStood = teamDutyAssignments(morningRule, fiveMorningHomes, {
  counts: new Map([
    [8, 4],
    [9, 1],
    [10, 3],
    [11, 2],
    [12, 2],
  ]),
});
assert('minst gestaan krijgt de ochtenddienst', leastStood[0]?.team?.id === 9);
const fairness = { counts: new Map() };
const firstSat = teamDutyAssignments(morningRule, fiveMorningHomes, fairness);
recordTeamDutyStand(fairness, firstSat[0].team.id, new Date('2026-09-19'));
const secondSat = teamDutyAssignments(morningRule, fiveMorningHomes, fairness);
assert(
  'volgende zaterdag een ander team',
  firstSat[0].team.id !== secondSat[0].team.id,
);
const kept = teamDutyAssignments(morningRule, fiveMorningHomes, {
  counts: new Map([[8, 9], [9, 0]]),
  keepTeamId: 8,
});
assert('al ingevulde ouders houden hun team', kept[0]?.team?.id === 8);
const mo17 = {
  id: 17,
  name: 'MO17-1',
  teamDutyUse: true,
  teamDutySlots: JSON.stringify([]),
};
const mo17Home = {
  team: mo17,
  home: true,
  time: '14:00',
  date: new Date('2026-09-19T12:00:00'),
};
assert(
  'MO17 valt in O13–O17 middagregel',
  teamDutyAssignments(secondRule, [mo17Home, o12Home]).length === 1 &&
    teamDutyAssignments(secondRule, [mo17Home, o12Home])[0].team.id === 17,
);
assert(
  'twee oudere teams thuis → middag blijft 2 plekken',
  requiredForTeamDuties(
    2,
    'SECOND',
    teamDutyAssignments(secondRule, [o15Home, mo17Home]),
  ) === 2 && teamDutyAssignments(secondRule, [o15Home, mo17Home]).length === 1,
);

const period = resolvePlanningPeriod({ from: '2026-10-01', to: '2026-12-31' });
assert(
  'planperiode okt–dec',
  toIsoDate(period.from) === '2026-10-01' && toIsoDate(period.to) === '2026-12-31',
);
assert(
  'standaard einddatum tot 31 dec in september',
  defaultPlanningEndInput(new Date('2026-09-17T12:00:00')) === '2026-12-31',
);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
