/**
 * Lokale unit checks (geen server nodig).
 * Run: node scripts/unit-checks.js
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { confirmWordOk } from '../src/backend/lib/environmentReset.js';
import { clientErrorPayload } from '../src/backend/lib/clientError.js';
import { isUnsafeUploadPath } from '../src/backend/lib/uploads.js';
import { sealSecret, unsealSecret } from '../src/backend/lib/secrets.js';
import { safeHttpUrl } from '../src/backend/lib/mailLayout.js';
import { parseCsv, validateMatchRows, objectsToMatchRows } from '../src/backend/lib/csvMatches.js';
import { workbookToXlsx } from '../src/backend/lib/xlsxWrite.js';
import { xlsxToObjects } from '../src/backend/lib/xlsxWorkbook.js';
import { seasonLabelForDate, nextSeasonLabel, seasonRangeFromLabel } from '../src/backend/lib/season.js';
import { parsePersonCsv, PERSON_IMPORT_EXAMPLE, validatePersonRows, personRowsFromObjects } from '../src/backend/lib/csvPersons.js';
import { includesText, tightenDate } from '../src/backend/lib/listFilters.js';
import { needsVoorWiePopup, voorWieChoices } from '../src/frontend/utils/voorWie.js';
import { unenrollActions } from '../src/frontend/utils/uitschrijven.js';
import { tileGroups } from '../src/frontend/utils/tiles.js';
import { IMPORT_DESKTOP_MESSAGE, importAllowed } from '../src/frontend/utils/importGate.js';
import { navForRole, navItemActive } from '../src/frontend/navConfig.js';
import { dutyReminderEmail, reminderWindow } from '../src/backend/lib/reminders.js';
import {
  customMailTemplates,
  filterMailAudience,
  previewMailTemplate,
  renderMail,
  resolveMailTemplates,
  serializeMailTemplates,
} from '../src/backend/lib/mailTemplates.js';
import {
  ctaLabelForTemplateKey,
  logoAttachment,
  wrapBrandedEmail,
} from '../src/backend/lib/mailLayout.js';
import { isNamelessRosterPerson, normalizePersonName } from '../src/backend/lib/personMatch.js';
import {
  connectionTestMail,
  friendlyMailReason,
  friendlySmtpError,
  isSafeMailbox,
  interpretSendMailResult,
  mailFromMustMatchUser,
  passwordResetEmailContent,
  swapCommitteeEmailContent,
} from '../src/backend/lib/mail.js';
import { isYoungYouthTeam, isOldYouthTeam, parseJoAge } from '../src/backend/lib/youthTeams.js';
import {
  underQuota,
  isUnavailableOn,
  isExemptedOn,
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
  friendlyEnrollmentReason,
  occupiedSlots,
  pickTeamDutyAssignment,
  recordTeamDutyStand,
  requiredForTeamDuties,
  serviceCapacity,
  teamDutyAssignments,
} from '../src/backend/lib/teamDutyPlanning.js';
import { clubTeamLabel, isBareSeniorClubTeam, seniorWeekendSuffix } from '../src/backend/lib/knvbTeams.js';
import { defaultServiceRuleSeed } from '../src/backend/lib/defaultServiceRules.js';
import {
  clampServiceDateFilter,
  isWithinPlanningPeriod,
  resolvePlanningPeriod,
} from '../src/backend/lib/planningPeriod.js';
import { toIsoDate } from '../src/backend/lib/dates.js';
import {
  SLOT_ROWS,
  WEEKDAY_SLOT_ROWS,
  inferSlot,
  rosterDaySections,
  rowLabelTime,
  servicesForSlotRow,
  slotCellHasOpen,
  slotCellText,
  servicesForRoster,
  sixWeekRosterWindow,
  weekStartsInRange,
} from '../src/backend/lib/pdfRoster.js';
import { defaultPlanningEndInput } from '../src/frontend/utils/formatDate.js';
import { isAbsentOn, normalizeAbsenceRange } from '../src/backend/lib/absences.js';
import { personTeamIds } from '../src/backend/lib/teamFunctions.js';
import { skipReasonForPerson } from '../src/backend/lib/autoFill.js';
import { resolveEnrollmentKind } from '../src/backend/lib/teamDutyPlanning.js';
import { occupancyFraction, teamSpotLines } from '../src/frontend/utils/teamLines.js';
import { matchTemplateSheets, MATCH_TEMPLATE_HEADERS } from '../src/backend/lib/matchesXlsx.js';
import {
  PERSON_TEMPLATE_HEADERS,
  personTemplateSheets,
  personExportRowsSheets,
} from '../src/backend/lib/personsXlsx.js';

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
  'weekdays only bar evening; weekend full slots',
  pdfDays[0].rows === WEEKDAY_SLOT_ROWS &&
    pdfDays[0].rows.length === 1 &&
    pdfDays[5].rows === SLOT_ROWS &&
    pdfDays[6].rows.length === 6,
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
assert(
  'pdf toont open plekken en teamnaam',
  slotCellText([
    {
      type: 'BAR',
      slot: 'EVENING',
      required: 3,
      enrollments: [{ person: { name: 'Cheryl' } }],
      teamDuties: [],
    },
  ]) === 'Cheryl, open plek, open plek' &&
    slotCellHasOpen([
      {
        type: 'BAR',
        slot: 'EVENING',
        required: 3,
        enrollments: [{ person: { name: 'Cheryl' } }],
      },
    ]) === true &&
    slotCellText([
      {
        type: 'BAR',
        slot: 'AFTERNOON',
        required: 2,
        enrollments: [],
        teamDuties: [{ team: { name: 'MO17-1' } }],
      },
    ]) === 'MO17-1, open plek',
);
assert(
  'pdf gebruikt echte diensttijd in label',
  rowLabelTime(WEEKDAY_SLOT_ROWS[0], [{ time: '19:00 - 22:00' }]) === '19:00 - 22:00',
);
assert(
  'knvb senior za/zo label',
  clubTeamLabel('Lekkerkerk 2', { date: '2026-10-10' }) === 'Lekkerkerk 2 (za)' &&
    clubTeamLabel('Lekkerkerk 2', { date: '2026-10-11' }) === 'Lekkerkerk 2 (zo)' &&
    clubTeamLabel('Lekkerkerk O16-1', { date: '2026-10-10' }) === 'O16-1' &&
    isBareSeniorClubTeam('Lekkerkerk 2') === true &&
    seniorWeekendSuffix('2026-10-10') === ' (za)',
);
{
  const rule = { required: 2, teamDutyReserved: 2 };
  const recent = { team: { id: 1, name: 'MO17-1' }, match: { id: 10 } };
  const other = { team: { id: 2, name: 'JO15-1' }, match: { id: 11 } };
  const sole = pickTeamDutyAssignment(rule, [recent], {
    counts: new Map([[1, 5]]),
    lastAt: new Map([[1, Date.now()]]),
  });
  assert('enig thuisteam wint ondanks recente stand', sole[0]?.team?.id === 1);
  const coupled = pickTeamDutyAssignment(rule, [recent, other], {
    preferTeamId: 1,
    counts: new Map([[1, 3], [2, 0]]),
    lastAt: new Map(),
  });
  assert('avond koppelt aan middagteam', coupled[0]?.team?.id === 1);
}

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
assert('barcommissie wel inschrijven (eigen diensten)', canAccess('Barcommissie', 'inschrijven') === true);
assert('admin wel inschrijven (eigen diensten)', canAccess('Admin', 'inschrijven') === true);
assert('barcommissie geen ruilen-tab', canAccess('Barcommissie', 'ruilen') === false);
assert('barcommissie geen voorkeuren', canAccess('Barcommissie', 'voorkeuren') === false);
assert('barcommissie wel beheer', canAccess('Barcommissie', 'beheer') === true);
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
const personClubPrefix = validatePersonRows(
  [{ __row: 2, name: 'Kees', email: 'kees@vvl.demo', team: 'Lekkerkerk JO15-1', role: 'Vrijwilliger' }],
  { teams: [{ id: 1, name: 'JO15-1' }] },
);
assert(
  'person csv Lekkerkerk-prefix matcht app-team',
  personClubPrefix.ok &&
    personClubPrefix.rows[0].teamId === 1 &&
    personClubPrefix.rows[0].teamName === 'JO15-1',
);
const personJoAlias = validatePersonRows(
  [{ __row: 3, name: 'Inge', email: 'inge@vvl.demo', team: 'Lekkerkerk O15-1' }],
  { teams: [{ id: 9, name: 'JO15-1' }] },
);
assert('person csv O15/JO15 alias', personJoAlias.ok && personJoAlias.rows[0].teamId === 9);
const personMail = validatePersonRows(
  parsePersonCsv('naam;email\nPiet;niet-email').rows,
  { teams: [] },
);
assert('person csv invalid email rejected', personMail.ok === false);
const personRow = validatePersonRows(
  [{ __row: 4, name: 'Eva Meijer', email: 'eva@vvl.demo', team: 'Onbekend FC' }],
  { teams: [{ id: 1, name: 'O10-1' }] },
);
assert(
  'import noemt rij en onbekend team',
  personRow.ok === false &&
    personRow.invalidRows[0].__row === 4 &&
    personRow.unknownTeams.includes('Onbekend FC') &&
    /Onbekend FC/.test(personRow.invalidRows[0].error),
);
assert(
  'vrijgesteld tot datum telt mee',
  isExemptedOn({ exempted: true, exemptedUntil: '2026-10-01' }, new Date('2026-09-29T12:00:00')) === true &&
    isExemptedOn({ exempted: true, exemptedUntil: '2026-09-01' }, new Date('2026-09-29T12:00:00')) === false &&
    isExemptedOn({ exempted: false, exemptedUntil: '2026-12-01' }, new Date('2026-09-29T12:00:00')) === false,
);
const committeeSpot = resolveEnrollmentKind({
  actorRole: 'Barcommissie',
  dutyTeamIds: [4],
  personTeamIds: [4],
  teamHasOpen: () => true,
});
const coordinatorSpot = resolveEnrollmentKind({
  actorRole: 'Teamcoördinator',
  fillingForSomeoneElse: true,
  requestedTeamId: 4,
  dutyTeamIds: [4],
  actorTeamIds: [4],
  personTeamIds: [4],
  teamHasOpen: () => true,
});
const editedSpot = resolveEnrollmentKind({
  actorRole: 'Barcommissie',
  assignTeamSpot: true,
  requestedTeamId: 4,
  dutyTeamIds: [4],
  personTeamIds: [],
  teamHasOpen: () => true,
});
assert('barcommissie vult geen teamplek', committeeSpot.kind === 'PERSONAL' && committeeSpot.forTeamId == null);
assert('coordinator vult wel een teamplek', coordinatorSpot.kind === 'TEAM' && coordinatorSpot.forTeamId === 4);
assert('bewerk mag een persoon op een teamplek zetten', editedSpot.kind === 'TEAM' && editedSpot.forTeamId === 4);
const spotLines = teamSpotLines({
  teamDuties: [{ id: 1, teamId: 4, reserved: 2, team: { id: 4, name: 'O10-1' } }],
  enrollments: [{ id: 9, kind: 'TEAM', forTeamId: 4, noShow: false, person: { name: 'Eva Meijer' } }],
});
assert(
  'teamplek twee regels: naam en team',
  spotLines.length === 2 && spotLines[0].label === 'Eva Meijer' && spotLines[0].team === false && spotLines[1].label === 'O10-1' && spotLines[1].team === true,
);
assert('bezetting is gevuld/nodig', occupancyFraction({ enrolled: 1, required: 2 }) === '1/2');

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
assert('reminder is two days ahead', reminder.text.includes('twee dagen'));
const window = reminderWindow(new Date('2026-09-22T15:00:00'));
assert(
  'reminder window is day plus two',
  window.from.getDate() === 24 && window.to.getDate() === 24,
);
const filled = renderMail(resolveMailTemplates(null).scheduled, {
  naam: 'Lisa',
  datum: 'zaterdag 3 oktober',
  tijd: '12:00 - 16:30',
  dienst: 'bardienst',
  link: 'https://example.test',
});
assert('scheduled mail has date and time', filled.text.includes('3 oktober') && filled.text.includes('12:00'));
assert('voorbeeld csv heeft kolommen', PERSON_IMPORT_EXAMPLE.startsWith('naam;email;telefoon;team;rol;verplichting'));
assert('naam normaliseren', normalizePersonName('José  van Dijk') === 'jose van dijk');
assert('naamloos niet in beheer', isNamelessRosterPerson({ email: null, passwordHash: null }) === true);
assert('account wel in beheer', isNamelessRosterPerson({ email: 'a@b.c', passwordHash: 'x' }) === false);
assert('verplichting alias verplicht→FULL', normalizeObligation('verplicht') === 'FULL');
assert('verplichting alias geen→NONE', normalizeObligation('geen') === 'NONE');
assert('verplichting alias vr18+→VR18', normalizeObligation('vr18+') === 'VR18');
const exampleParsed = parsePersonCsv(PERSON_IMPORT_EXAMPLE);
assert('voorbeeld csv heeft mockrijen', exampleParsed.rows.length >= 5);
const exampleValidated = validatePersonRows(exampleParsed.rows, {
  teams: [
    { id: 1, name: 'JO15-1' },
    { id: 2, name: 'JO13-2' },
    { id: 3, name: 'JO11-1' },
  ],
});
assert('voorbeeld csv valideert met bekende teams', exampleValidated.ok === true);
assert(
  'voorbeeld csv verplichting FULL',
  exampleValidated.rows.some((r) => r.email === 'anna.mock@example.nl' && r.obligation === 'FULL'),
);

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
const afternoonRule = defaultServiceRuleSeed().find((rule) => rule.name === 'Zaterdag bar tweede shift');
assert(
  'zaterdagmiddag is 3 plekken waarvan 2 team',
  afternoonRule?.required === 3 && afternoonRule?.teamDutyReserved === 2,
);
const emptyAfternoon = serviceCapacity({
  required: 3,
  teamDuties: [{ teamId: 15, reserved: 2 }],
  enrollments: [],
});
assert(
  'teamplekken tellen als bezet zonder naam',
  emptyAfternoon.personalCapacity === 1 && occupiedSlots(emptyAfternoon) === 2,
);
const namedParent = serviceCapacity({
  required: 3,
  teamDuties: [{ teamId: 15, reserved: 2 }],
  enrollments: [{ kind: 'TEAM', forTeamId: 15, noShow: false }],
});
assert(
  'genoemde ouder zit in de teamplekken',
  occupiedSlots(namedParent) === 2 && namedParent.teamOpen === 1,
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

const volunteerBounds = resolvePlanningPeriod({ from: '2026-09-19', to: '2026-10-13' });
const upcomingWindow = clampServiceDateFilter(
  { gte: new Date('2026-09-22T00:00:00') },
  volunteerBounds,
);
assert(
  'vrijwilliger plant niet voorbij de planningsdatum',
  toIsoDate(upcomingWindow.gte) === '2026-09-22' && toIsoDate(upcomingWindow.lte) === '2026-10-13',
);
const farQuery = clampServiceDateFilter(
  { gte: new Date('2026-09-22T00:00:00'), lte: new Date('2026-12-31T23:59:59') },
  volunteerBounds,
);
assert(
  'gevraagde einddatum wordt afgekapt op de planning',
  toIsoDate(farQuery.lte) === '2026-10-13',
);
const beforeStart = clampServiceDateFilter(
  { gte: new Date('2026-09-01T00:00:00') },
  volunteerBounds,
);
assert(
  'vrijwilliger plant niet voor de start van de planning',
  toIsoDate(beforeStart.gte) === '2026-09-19',
);
assert(
  'einddag van de planning telt nog mee',
  isWithinPlanningPeriod(new Date('2026-10-13T12:00:00'), volunteerBounds) === true,
);
assert(
  'dag na de planning telt niet mee',
  isWithinPlanningPeriod(new Date('2026-10-14T00:00:00'), volunteerBounds) === false,
);

const absencePeriod = normalizeAbsenceRange({ fromDate: '2026-10-05', toDate: '2026-10-12' });
assert(
  'afwezigheid: normaliseert van/tot',
  toIsoDate(absencePeriod.fromDate) === '2026-10-05' && toIsoDate(absencePeriod.toDate) === '2026-10-12',
);
assert(
  'afwezigheid: binnen periode is afwezig',
  isAbsentOn([absencePeriod], new Date('2026-10-08T09:00:00')) === true,
);
assert(
  'afwezigheid: buiten periode niet afwezig',
  isAbsentOn([absencePeriod], new Date('2026-10-13T09:00:00')) === false,
);
assert(
  'afwezigheid: einddatum vóór begindatum wordt afgewezen',
  (() => {
    try {
      normalizeAbsenceRange({ fromDate: '2026-10-12', toDate: '2026-10-05' });
      return false;
    } catch (e) {
      return e.status === 400;
    }
  })(),
);
assert(
  'skipReasonForPerson: afwezigheid geeft eigen reden',
  skipReasonForPerson({ obligation: 'FULL', exempted: false }, 1, {
    hadOverlap: false,
    hadEligible: false,
    exempted: false,
    hadAbsence: true,
  }) === 'Afwezig in de betreffende periode.',
);

assert(
  'personTeamIds bevat primaire teamId ook zonder membership',
  personTeamIds({ teamId: 7, teamMemberships: [] }).includes(7),
);

assert(
  'wedstrijdsjabloon heeft alleen KNVB-kolommen',
  MATCH_TEMPLATE_HEADERS.join(';') === 'Datum;Tijd;Thuis;Uit;Wedstrijdnr.;Type;Spelniveau;Opmerkingen' &&
    matchTemplateSheets()[0].rows.length === 0,
);

// Occupancy-tegels (punt 2): aantal op de tegel = lengte van de gefilterde lijst
const tileServices = [
  { enrolled: 2, required: 2 },
  { enrolled: 1, required: 2 },
  { enrolled: 0, required: 2 },
  { enrolled: 3, required: 3 },
];
const tiles = tileGroups(tileServices);
assert('tegel Vol: aantal = gefilterde lijst', tiles.full.length === 2 && tiles.full.length === tileServices.filter((s) => s.enrolled >= s.required).length);
assert('tegel Nog 1 nodig: aantal = gefilterde lijst', tiles.almost.length === 1 && tiles.almost.length === tileServices.filter((s) => s.enrolled === s.required - 1).length);

const personSheets = personTemplateSheets([{ name: 'JO11-1' }]);
assert(
  'personen template: mockdata + waarden + uitleg',
  personSheets.length === 3 &&
    personSheets[0].headers.join(';') === PERSON_TEMPLATE_HEADERS.join(';') &&
    personSheets[0].rows.length >= 5 &&
    personSheets[1].headers.includes('rol') &&
    personSheets[2].name === 'Uitleg',
);
const exportSheets = personExportRowsSheets(
  [
    {
      name: 'Test',
      email: 't@x.nl',
      phone: '',
      team: { name: 'JO11-1' },
      role: 'Vrijwilliger',
      obligation: 'NONE',
      guardian: null,
      exempted: false,
    },
  ],
  [{ name: 'JO11-1' }],
);
assert(
  'personen export:zelfde structuur als template',
  exportSheets.length === 2 &&
    exportSheets[0].headers.join(';') === PERSON_TEMPLATE_HEADERS.join(';') &&
    exportSheets[0].rows.length === 1,
);

const rosterKept = servicesForRoster([
  { active: true, draft: false, enrollments: [{ person: { name: 'Lisa' } }] },
  { active: true, draft: false, enrollments: [] },
  { active: true, draft: false, enrollments: [{ person: { name: '  ' } }] },
  { active: false, draft: false, enrollments: [{ person: { name: 'Tom' } }] },
  { active: true, draft: true, enrollments: [{ person: { name: 'Noa' } }] },
]);
assert(
  'pdf-filter: actieve niet-concept diensten (ook open plekken)',
  rosterKept.length === 3 &&
    rosterKept.some((s) => s.enrollments?.[0]?.person?.name === 'Lisa') &&
    rosterKept.some((s) => (s.enrollments || []).length === 0),
);
const sixWeeks = sixWeekRosterWindow(new Date('2026-09-29T15:00:00'));
const farEnd = new Date('2027-06-01T12:00:00');
assert(
  'pdf blijft 6 weken ook als de periode veel langer is',
  weekStartsInRange(sixWeeks.from, farEnd, sixWeeks.maxWeeks).length === 6 &&
    sixWeeks.maxWeeks === 6 &&
    (sixWeeks.to.getTime() - sixWeeks.from.getTime()) / 86400000 < 43,
);

const roundSheets = personExportRowsSheets(
  [
    {
      name: 'Kind Roundtrip',
      email: 'kind.roundtrip@example.nl',
      phone: '0611111111',
      team: { name: 'JO11-1' },
      role: 'Vrijwilliger',
      obligation: 'NONE',
      guardian: { email: 'ouder.roundtrip@example.nl' },
      exempted: true,
    },
  ],
  [{ name: 'JO11-1' }],
);
const roundObjects = xlsxToObjects(workbookToXlsx(roundSheets));
const roundRows = validatePersonRows(personRowsFromObjects(roundObjects), {
  teams: [{ id: 3, name: 'JO11-1' }],
});
assert(
  'xlsx-import roundtrip houdt hoort_bij en vrijgesteld',
  roundRows.ok &&
    roundRows.rows[0].email === 'kind.roundtrip@example.nl' &&
    roundRows.rows[0].guardianRef === 'ouder.roundtrip@example.nl' &&
    roundRows.rows[0].exempted === true &&
    roundRows.rows[0].teamId === 3,
);

const voorWie = voorWieChoices({ id: 1, name: 'Lisa' }, [{ id: 2, name: 'Sem' }]);
assert(
  'voor-wie popup bij gekoppelde persoon',
  needsVoorWiePopup(voorWie) && voorWie[0].label === 'Jezelf' && voorWie[1].name === 'Sem',
);
assert(
  'voor-wie geen popup zonder koppeling',
  needsVoorWiePopup(voorWieChoices({ id: 1, name: 'Lisa' }, [])) === false,
);

const childOnly = unenrollActions(
  [{ id: 9, personId: 2, person: { name: 'Sem' } }],
  [1, 2],
);
const bothOnDuty = unenrollActions(
  [
    { id: 3, personId: 1, person: { name: 'Lisa' } },
    { id: 4, personId: 2, person: { name: 'Sem' } },
    { id: 5, personId: 8, person: { name: 'Ander' } },
  ],
  [1, 2],
);
assert(
  'ouder schrijft gekoppeld kind uit als alleen het kind staat',
  childOnly.length === 1 && childOnly[0].enrollmentId === 9 && childOnly[0].label === 'Uitschrijven Sem',
);
assert(
  'ouder schrijft zichzelf en elk gekoppeld kind uit',
  bothOnDuty.map((row) => row.label).join('|') === 'Uitschrijven Lisa|Uitschrijven Sem',
);

assert(
  'import alleen op desktop',
  importAllowed(true) === true &&
    importAllowed(false) === false &&
    IMPORT_DESKTOP_MESSAGE === 'Importeren kan alleen op de computer',
);

const tightened = tightenDate({ gte: new Date('2026-01-01') }, { from: '2026-02-01', to: '2026-02-10' });
assert(
  'datumfilter vernauwt van/tot',
  tightened.gte.toISOString().slice(0, 10) === '2026-02-01' &&
    tightened.lte.toISOString().slice(0, 10) === '2026-02-10',
);
assert('persoonfilter is hoofdletterongevoelig', includesText('Lisa de Vries', 'lisa'));
const storedMail = JSON.parse(
  serializeMailTemplates({
    invite: { subject: 'Uitnodiging eigen', body: 'Hoi {naam}' },
    custom: [{ id: 'eigen-1', name: 'Oproep', subject: 'Kom helpen', body: 'Hoi {naam}' }],
  }),
);
assert(
  'eigen e-mailtekst blijft naast de systeemtekst',
  customMailTemplates(storedMail)[0]?.name === 'Oproep' && storedMail.invite.subject === 'Uitnodiging eigen',
);
const mailPeople = [
  { name: 'Lisa', email: 'lisa@vvl.demo', role: 'Vrijwilliger', teamId: 2, active: true, serviceIds: [9] },
  { name: 'Mark', email: 'mark@vvl.demo', role: 'Barcommissie', teamId: 2, active: true, serviceIds: [9] },
  { name: 'Zonder', email: '', role: 'Vrijwilliger', teamId: 2, active: true },
];
assert(
  'mailgroep vrijwilligers en dienst',
  filterMailAudience(mailPeople, { audience: 'volunteers' }).map((p) => p.name).join() === 'Lisa' &&
    filterMailAudience(mailPeople, { audience: 'shift', serviceId: 9 }).map((p) => p.name).join() === 'Lisa,Mark' &&
    filterMailAudience(mailPeople, { audience: 'team', teamId: 2 }).length === 2,
);
assert(
  'zachte mailfout telt niet als verstuurd',
  interpretSendMailResult({ sent: false, reason: 'Mailserver staat uit of is niet volledig ingesteld' }).sent ===
    false &&
    interpretSendMailResult({ sent: false, reason: 'not_configured' }).sent === false &&
    interpretSendMailResult({ sent: true, messageId: 'abc' }).sent === true &&
    interpretSendMailResult({ sent: true, messageId: 'abc' }).messageId === 'abc',
);
assert(
  'mailfouttekst is Nederlands en bruikbaar',
  friendlyMailReason('not_configured').includes('E-mail versturen') &&
    friendlyMailReason('no_email') === 'Geen e-mailadres' &&
    friendlyMailReason('Server weigerde ontvanger: x@y.nl').includes('weigerde'),
);
assert(
  'Instellingen heeft testmail-knop voor admin',
  fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/frontend/pages/Instellingen.jsx'), 'utf8')
    .includes('data-testid="instellingen-testmail-send"') &&
    fs
      .readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/frontend/pages/PersonenBeheer.jsx'), 'utf8')
      .includes('invite-mail-failed'),
);
{
  const branded = wrapBrandedEmail({
    text: 'Hoi Jan,\n\nKlik hier:\nhttps://example.com/x\n\nGroet',
    ctaLabel: 'Account activeren',
    ctaUrl: 'https://example.com/x',
  });
  assert(
    'branded mail heeft logo CID, knop en footer',
    branded.html.includes('cid:vvl-logo') &&
      branded.html.includes('background:#ffffff;padding:8px;border-radius:4px;') &&
      branded.html.includes('Account activeren') &&
      branded.html.includes('V.V. Lekkerkerk') &&
      branded.text.includes('Hoi Jan') &&
      !branded.text.includes('<table'),
  );
  assert('logo-bestand voor CID bestaat', Boolean(logoAttachment()?.path));
const connection = connectionTestMail();
assert(
  'verbindings-testmail gebruikt huisstijl',
  connection.html.includes('cid:vvl-logo') &&
    connection.html.includes('Planning bar- en keukendiensten') &&
    connection.html.includes('Open de app') &&
    connection.text.includes('testmail') &&
    !connection.html.includes('<p>Dit is een <strong>testmail</strong>'),
);
assert(
  'Gmail eist dezelfde afzender, eigen server niet',
  mailFromMustMatchUser({ host: 'smtp.gmail.com', fromEmail: 'a@gmail.com', user: 'b@gmail.com' }).includes('Gmail') &&
    mailFromMustMatchUser({ host: 'smtp.gmail.com', fromEmail: 'a@gmail.com', user: 'a@gmail.com' }) === '' &&
    mailFromMustMatchUser({ host: '127.0.0.1', fromEmail: 'planning@vvl.test', user: 'vvl-sink' }) === '',
);
assert(
  'SMTP-fout noemt Gmail alleen bij Gmail',
  friendlySmtpError('connect ECONNREFUSED', 'smtp.gmail.com').includes('smtp.gmail.com') &&
    friendlySmtpError('connect ECONNREFUSED', 'mail.club.nl').includes('mail.club.nl') &&
    !friendlySmtpError('connect ECONNREFUSED', 'mail.club.nl').includes('smtp.gmail.com'),
);
const stylesCss = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/frontend/styles.css'),
  'utf8',
);
assert(
  'lettertype staat lokaal, niet via Google',
  stylesCss.includes('@fontsource/inter') && !stylesCss.includes('fonts.googleapis.com'),
);
const planningSrc = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/frontend/pages/Planning.jsx'),
  'utf8',
);
assert(
  'rooster start leeg tot een filter',
  /const \[showAllRooster, setShowAllRooster\] = useState\(false\)/.test(planningSrc) &&
    planningSrc.includes('Kies een filter of klik Alles tonen'),
);
  const invite = renderMail(
    resolveMailTemplates(null).invite,
    { naam: 'Lisa', link: 'https://app.example/invite' },
    { templateKey: 'invite' },
  );
  assert(
    'systeemtekst invite gebruikt layout + knop',
    invite.html.includes('Account activeren') && invite.text.includes('Lisa'),
  );
  assert('cta-labels per sjabloon', ctaLabelForTemplateKey('reminder') === 'Bekijk dienst');
  const preview = previewMailTemplate({
    key: 'invite',
    logoBaseUrl: 'http://localhost:5173',
  });
  assert(
    'preview gebruikt publieke logo-URL',
    preview.html.includes('http://localhost:5173/logo.png') && preview.subject.includes('Uitnodiging'),
  );
  const reset = passwordResetEmailContent({ name: 'Bo', link: 'https://app/reset' });
  assert('wachtwoord-reset ook branded', reset.html.includes('Nieuw wachtwoord') && reset.html.includes('cid:vvl-logo'));
  const beheerSrc = fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/frontend/pages/Beheer.jsx'),
    'utf8',
  );
  assert(
    'Beheer e-mailteksten hebben voorbeeld en testmail per sjabloon',
    beheerSrc.includes('mail-test-${key}') &&
      beheerSrc.includes('mail-preview-${key}') &&
      beheerSrc.includes('data-testid="mail-layout-preview"') &&
      beheerSrc.includes('Testmail versturen'),
  );
  const settingsSrc = fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/backend/routes/settings.js'),
    'utf8',
  );
  assert(
    'API preview en test-template bestaan',
    settingsSrc.includes("/mail/preview") && settingsSrc.includes("/mail/test-template"),
  );
}

const labels = (role) => navForRole(role).map((item) => item.label).join('|');
assert('menu vrijwilliger', labels('Vrijwilliger') === 'Diensten|Mijn diensten|Ruilen|Mijn gegevens');
assert('menu teamcoördinator', labels('Teamcoördinator') === 'Diensten|Mijn diensten|Team|Ruilen|Mijn gegevens');
assert('menu barcommissie', labels('Barcommissie') === 'Dashboard|Mijn diensten|Personen|Mijn ruilen|Beheer');
assert('menu admin', labels('Admin') === 'Dashboard|Mijn diensten|Personen|Mijn ruilen|Instellingen|Beheer');
assert(
  'admin-instellingen niet onder Meer',
  navItemActive({ to: '/instellingen' }, '/beheer', '?tab=regels', 'Admin') &&
    navItemActive({ to: '/meer', match: ['/meer', '/beheer'] }, '/beheer', '?tab=regels', 'Admin') === false,
);
assert(
  'auto-inschrijving toont Automatisch ingepland',
  friendlyEnrollmentReason('AUTO', { obligation: 'FULL' }) === 'Automatisch ingepland' &&
    friendlyEnrollmentReason('AUTO', { obligation: 'VR18' }) === 'Automatisch ingepland' &&
    friendlyEnrollmentReason('AUTO', { makeup: true }) ===
      'Automatisch ingepland: openstaande inhaaldienst.',
);
{
  const ikSrc = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/frontend/pages/Ik.jsx'),
    'utf8',
  );
  assert(
    'ik-pagina heeft mijn diensten en kinderen',
    ikSrc.includes('/mijn-diensten') && ikSrc.includes('/kinderen') && ikSrc.includes('Mijn kinderen'),
  );
  const inschrijfSrc = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/frontend/pages/Inschrijven.jsx'),
    'utf8',
  );
  assert(
    'vrijwilliger lijst-default met bar/keuken-filter en bevestiging',
    inschrijfSrc.includes('filter-dienst-type') &&
      inschrijfSrc.includes('inschrijf-bevestiging') &&
      inschrijfSrc.includes('listScrollRef') &&
      inschrijfSrc.includes("useState(null)") &&
      /onlyOpen.*mode === 'open'|mode === 'open'.*onlyOpen/.test(inschrijfSrc.replace(/\n/g, ' ')),
  );
}
{
  const { publicPerson, publicPersonBrief } = await import('../src/backend/lib/roles.js');
  const pending = {
    id: 9,
    name: 'Nieuw',
    role: 'Vrijwilliger',
    inviteToken: 'tok-xyz',
    passwordHash: null,
    email: 'nieuw@vvl.demo',
  };
  const asCommittee = publicPerson(pending, { viewerRole: 'Barcommissie' });
  const asVolunteer = publicPerson(pending, { viewerRole: 'Vrijwilliger' });
  assert(
    'uitnodigingstoken alleen voor barcommissie/admin',
    asCommittee.inviteToken === 'tok-xyz' &&
      asCommittee.invitePending === true &&
      asVolunteer.inviteToken == null &&
      publicPersonBrief(pending).inviteToken == null,
  );
}
const meerSrc = fs.readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/frontend/pages/Meer.jsx'),
  'utf8',
);
const meerLabels = [...meerSrc.matchAll(/label:\s*'([^']+)'/g)].map((m) => m[1]);
assert(
  'beheer-knoppenrij heeft aandacht tot club',
  meerLabels.join('|') ===
    'Aandacht|Wedstrijden|Diensten|Planning|Ruilen|Dienstregels|Jaarplanning|Teams|E-mail|Club' &&
    !/Mijn gegevens|Personen/.test(meerSrc),
);

assert('opschonen-woord met spaties en hoofdletters', confirmWordOk('  OpSchonen  ') === true);
assert('opschonen-woord leeg of fout doet niets', confirmWordOk('') === false && confirmWordOk('wissen') === false && confirmWordOk('op schonen') === false);

{
  const evil = renderMail(
    { subject: 'Onderwerp <script>alert(1)</script>', body: 'Hoi {naam}\n\n<script>alert(1)</script>\n{link}' },
    { naam: '<img src=x onerror=alert(1)>', link: 'javascript:alert(1)' },
    { templateKey: 'custom' },
  );
  assert(
    'eigen mailtekst en placeholders worden ge-escaped',
    !evil.html.includes('<script>') &&
      !evil.html.includes('<img src=x') &&
      !evil.html.includes('href="javascript:') &&
      evil.html.includes('&lt;script&gt;') &&
      evil.html.includes('&lt;img'),
  );
  assert('javascript-link wordt geen knop', safeHttpUrl('javascript:alert(1)') === '' && safeHttpUrl('https://example.test/pad') === 'https://example.test/pad');
  assert(
    'mailbox weigert kop-injectie',
    isSafeMailbox('jan@example.nl') &&
      !isSafeMailbox('jan@example.nl\nBcc: a@b.c') &&
      !isSafeMailbox('jan@example.nl<script>'),
  );
}

{
  let tooBig = false;
  try {
    xlsxToObjects(
      workbookToXlsx([{ name: 'Diensten', headers: ['A'], rows: [['xxxxxxxx']] }]),
      { maxUncompressed: 20 },
    );
  } catch (err) {
    tooBig = /te groot/i.test(err.message);
  }
  assert('te groot excel-bestand wordt geweigerd', tooBig);
}

assert(
  'uploads serveren geen database of back-up',
  isUnsafeUploadPath('/photos/vvl-opschonen.db') &&
    isUnsafeUploadPath('/../vvl.db') &&
    !isUnsafeUploadPath('/photos/p-abc.jpg'),
);

{
  const leaked = Object.assign(new Error('kapot\n    at internal (/src/server.js:1:1)'), {
    stack: 'Error: kapot\n    at secret',
  });
  const hidden = clientErrorPayload(leaked, true);
  const shown = clientErrorPayload(Object.assign(new Error('Typ OPSCHONEN\n    at x'), { status: 400 }), true);
  assert(
    'productiefout verbergt stack en interne 500',
    hidden.status === 500 &&
      hidden.body.error === 'Internal server error' &&
      hidden.body.stack == null &&
      shown.status === 400 &&
      shown.body.error === 'Typ OPSCHONEN',
  );
}

{
  const prevNode = process.env.NODE_ENV;
  const prevMail = process.env.MAIL_SECRET;
  const prevApp = process.env.APP_URL;
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.MAIL_SECRET;
    process.env.APP_URL = 'https://vvl-planning-demo.onrender.com';
    let refused = false;
    try {
      sealSecret('smtp-geheim');
    } catch {
      refused = true;
    }
    assert('productie zonder MAIL_SECRET slaat smtp-wachtwoord niet op', refused);

    process.env.MAIL_SECRET = 'unit-test-mail-secret';
    const sealed = sealSecret('smtp-geheim');
    assert(
      'MAIL_SECRET versleutelt het smtp-wachtwoord',
      sealed.startsWith('enc:v1:') && !sealed.includes('smtp-geheim') && unsealSecret(sealed) === 'smtp-geheim',
    );
    delete process.env.MAIL_SECRET;
    let locked = false;
    try {
      locked = unsealSecret(sealed) !== 'smtp-geheim';
    } catch {
      locked = true;
    }
    assert('productie leest het smtp-wachtwoord niet met alleen APP_URL', locked);
  } finally {
    if (prevNode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNode;
    if (prevMail === undefined) delete process.env.MAIL_SECRET;
    else process.env.MAIL_SECRET = prevMail;
    if (prevApp === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = prevApp;
  }
}

const unitRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const resetCheck = spawnSync(process.execPath, ['scripts/environment-reset-check.js'], {
  cwd: unitRoot,
  stdio: 'inherit',
});
assert('omgeving opschonen op een databasekopie', resetCheck.status === 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
