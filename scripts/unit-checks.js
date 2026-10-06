/**
 * Lokale unit checks (geen server nodig).
 * Run: node scripts/unit-checks.js
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { confirmWordOk } from '../src/backend/lib/environmentReset.js';
import { splitSqlStatements, isIgnorableMigrationError } from '../src/backend/lib/liveDeploy.js';
import { classifyServiceGap, sqlIntList, toId, shouldAttemptIncidentRestore } from '../src/backend/lib/serviceDiff.js';
import { inHousehold } from '../src/backend/lib/household.js';
import { personShiftRows } from '../src/backend/lib/planningExport.js';
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
import { mobileNavForRole, navForRole, navItemActive } from '../src/frontend/navConfig.js';
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
  exampleMailVars,
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
  fillExecutedCount,
  vr18NeedsFillInCurrent,
  vr18PeriodCounts,
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
  displayEnrollmentReason,
  occupiedSlots,
  pickTeamDutyAssignment,
  recordTeamDutyStand,
  requiredForTeamDuties,
  serviceCapacity,
  shouldAttachTeamDutiesToLocked,
  teamDutyAssignments,
  teamFitsDutyRule,
} from '../src/backend/lib/teamDutyPlanning.js';
import {
  buildTeamIndex,
  clubTeamLabel,
  findTeamInIndex,
  isBareSeniorClubTeam,
  seniorWeekendSuffix,
} from '../src/backend/lib/knvbTeams.js';
import { defaultServiceRuleSeed } from '../src/backend/lib/defaultServiceRules.js';
import {
  clampServiceDateFilter,
  inferPrecedingPeriod,
  isWithinPlanningPeriod,
  pickPreviousRound,
  resolvePlanningPeriod,
  resolvePreviousPeriod,
} from '../src/backend/lib/planningPeriod.js';
import { compareServicesByDateThenTime, toIsoDate } from '../src/backend/lib/dates.js';
import {
  SLOT_ROWS,
  WEEKDAY_SLOT_ROWS,
  inferSlot,
  isExtraRosterService,
  additionalRosterServices,
  extraServicesForDay,
  extraCellText,
  rosterDaySections,
  rowLabelTime,
  servicesForSlotRow,
  slotCellHasOpen,
  slotCellText,
  servicesForRoster,
  sixWeekRosterWindow,
  weekStartsInRange,
} from '../src/backend/lib/pdfRoster.js';
import { defaultPlanningEndInput, toDateInputValue } from '../src/frontend/utils/formatDate.js';
import { obligationMark } from '../src/frontend/utils/obligationMark.js';
import {
  assessFit,
  buildShifts,
  createExample,
  normalizeTournament,
  partsForField,
  present,
  roundRobin,
  unusedFullFields,
} from '../src/frontend/toernooi/engine.js';
import { isAbsentOn, normalizeAbsenceRange } from '../src/backend/lib/absences.js';
import { personTeamIds } from '../src/backend/lib/teamFunctions.js';
import { skipReasonForPerson } from '../src/backend/lib/autoFill.js';
import { isOrphanAutoService } from '../src/backend/lib/serviceDedup.js';
import { resolveEnrollmentKind } from '../src/backend/lib/teamDutyPlanning.js';
import { occupancyFraction, teamSpotLines } from '../src/frontend/utils/teamLines.js';
import { matchTemplateSheets, MATCH_TEMPLATE_HEADERS } from '../src/backend/lib/matchesXlsx.js';
import {
  PERSON_TEMPLATE_HEADERS,
  personTemplateSheets,
  personExportRowsSheets,
} from '../src/backend/lib/personsXlsx.js';
import {
  calendarResponseHeaders,
  etagMatches,
  feedUrls,
  foldLine,
  icsEscapeText,
  icsUnescape,
  renderIcs,
  unfoldIcs,
  validateIcs,
} from '../src/backend/lib/ics.js';
import {
  CALENDAR_RATE_MAX,
  CALENDAR_RATE_WINDOW_MS,
  calendarBlocked,
  collectTeamIds,
  dutyTitle,
  namesOverlap,
  personalEvents,
  teamEvents,
} from '../src/backend/lib/calendarEvents.js';

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
  'pubquiz extra hoort niet in de vaste avondrij',
  isExtraRosterService({ slot: 'EXTRA', time: '19:30 - 00:00', activity: { name: 'Pubquiz' } }) === true &&
    servicesForSlotRow(
      [
        {
          id: 1,
          type: 'BAR',
          slot: 'EVENING',
          time: '16:30 - 19:30',
          required: 2,
          enrollments: [{ kind: 'PERSONAL', person: { name: 'Zoe Jonker' } }],
        },
        {
          id: 2,
          type: 'BAR',
          slot: 'EXTRA',
          time: '19:30 - 00:00',
          activity: { name: 'Pubquiz' },
          required: 2,
          enrollments: [{ kind: 'PERSONAL', person: { name: 'Bram Hendriks' } }],
        },
      ],
      SLOT_ROWS.find((r) => r.type === 'BAR' && r.slot === 'EVENING'),
    ).map((s) => s.id).join(',') === '1',
);
assert(
  'dubbele ochtenddienst telt één keer in de pdf-cel',
  slotCellText(
    servicesForSlotRow(
      [
        {
          id: 10,
          type: 'BAR',
          slot: 'MORNING',
          date: '2026-11-07',
          time: '07:30 - 12:00',
          required: 3,
          enrollments: [],
          teamDuties: [{ teamId: 1, reserved: 2, team: { name: 'O12-2' } }],
        },
        {
          id: 11,
          type: 'BAR',
          slot: 'MORNING',
          date: '2026-11-07',
          time: '07:30 - 12:00',
          required: 3,
          enrollments: [],
          teamDuties: [{ teamId: 1, reserved: 2, team: { name: 'O12-2' } }],
        },
      ],
      SLOT_ROWS[0],
    ),
  ) === 'O12-2, O12-2, open plek',
);
{
  const extras = additionalRosterServices(
    [
      {
        id: 1,
        type: 'BAR',
        slot: 'EVENING',
        time: '16:30 - 19:30',
        required: 2,
        enrollments: [{ kind: 'PERSONAL', person: { name: 'Zoe' } }],
      },
      {
        id: 2,
        type: 'BAR',
        slot: 'EXTRA',
        time: '19:30 - 00:00',
        activity: { name: 'Pubquiz' },
        required: 2,
        enrollments: [{ kind: 'PERSONAL', person: { name: 'Bram' } }],
      },
    ],
    SLOT_ROWS.filter((r) => r.type === 'BAR'),
  );
  assert('extra pubquiz-rij op starttijd', extras.length === 1 && extras[0].id === 2);
  assert(
    'extra cel toont evenementnaam',
    extraCellText(extras[0]).includes('Pubquiz') && extraCellText(extras[0]).includes('Bram'),
  );
  assert('extraServicesForDay vindt pubquiz', extraServicesForDay([{ slot: 'EXTRA', activity: { name: 'Pubquiz' }, active: true }]).length === 1);
}
{
  const leftoverEvening = additionalRosterServices(
    [
      {
        id: 1,
        type: 'BAR',
        slot: 'EVENING',
        time: '16:30 - 19:30',
        required: 2,
        enrollments: [{ kind: 'PERSONAL', person: { name: 'Zoe' } }],
      },
      {
        id: 9,
        type: 'BAR',
        slot: 'EVENING',
        origin: 'AUTO',
        locked: true,
        time: '18:30 - 22:00',
        required: 2,
        enrollments: [],
      },
      {
        id: 2,
        type: 'BAR',
        slot: 'EXTRA',
        time: '19:30 - 00:00',
        activity: { name: 'Pubquiz' },
        required: 2,
        enrollments: [{ kind: 'PERSONAL', person: { name: 'Bram' } }],
      },
    ],
    SLOT_ROWS.filter((r) => r.type === 'BAR'),
  );
  assert(
    'rest-avond 18:30 en pubquiz staan als extra rijen op starttijd',
    leftoverEvening.map((s) => s.id).join(',') === '9,2',
  );
  const saturdayRules = defaultServiceRuleSeed();
  assert(
    'lege zaterdag 18:30 is wees-auto (geen dienstregel)',
    isOrphanAutoService(
      {
        origin: 'AUTO',
        date: '2026-10-24',
        type: 'BAR',
        time: '18:30 - 22:00',
        enrollments: [],
      },
      saturdayRules,
    ) === true,
  );
  assert(
    'woensdag 18:30 is geen wees',
    isOrphanAutoService(
      {
        origin: 'AUTO',
        date: '2026-10-21',
        type: 'BAR',
        time: '18:30 - 22:00',
        enrollments: [],
      },
      saturdayRules,
    ) === false,
  );
  assert(
    'jaarplanning-extra is geen wees-auto',
    isOrphanAutoService(
      {
        origin: 'MANUAL',
        slot: 'EXTRA',
        activityId: 4,
        date: '2026-10-24',
        type: 'BAR',
        time: '19:30 - 00:00',
        enrollments: [],
      },
      saturdayRules,
    ) === false,
  );
}
assert(
  'verplicht telt in de planningsperiode, VR18 over twee planningen',
  fillExecutedCount({ obligation: 'FULL' }, { countPeriod: 0, count6w: 1, count12w: 1 }) === 0 &&
    fillExecutedCount({ obligation: 'VR18' }, { countPrevious: 1, countPeriod: 0 }) === 1 &&
    fillExecutedCount({ obligation: 'VR18' }, { countPrevious: 0, countPeriod: 0 }) === 0,
);
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
    ]) === 'MO17-1, open plek' &&
    slotCellText([
      {
        type: 'BAR',
        slot: 'MORNING',
        required: 3,
        enrollments: [{ kind: 'PERSONAL', person: { name: 'Denise de Groot' } }],
        teamDuties: [{ teamId: 8, reserved: 2, team: { name: 'O8-1JM' } }],
      },
    ]) === 'Denise de Groot, O8-1JM, O8-1JM',
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
  const index = buildTeamIndex([
    { id: 1, name: 'Lekkerkerk 1' },
    { id: 2, name: 'O16-1' },
  ]);
  assert(
    'import za-naam koppelt aan bestaand Lekkerkerk 1',
    findTeamInIndex(index, 'Lekkerkerk 1 (za)')?.id === 1 &&
      findTeamInIndex(index, 'Lekkerkerk 1')?.id === 1,
  );
  const split = buildTeamIndex([
    { id: 3, name: 'Lekkerkerk 1 (za)' },
    { id: 4, name: 'Lekkerkerk 1 (zo)' },
  ]);
  assert(
    'bestaande za/zo-split blijft de juiste ploeg',
    findTeamInIndex(split, 'Lekkerkerk 1 (za)')?.id === 3 &&
      findTeamInIndex(split, 'Lekkerkerk 1 (zo)')?.id === 4,
  );
}
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
assert('VR18 under quota zonder vorige en huidige dienst', underQuota({ obligation: 'VR18' }, 1, 4, { previousCount: 0, currentCount: 0 }) === true);
assert('VR18 met vorige planning voldaan', underQuota({ obligation: 'VR18' }, 1, 4, { previousCount: 1, currentCount: 0 }) === false);
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
assert(
  'bezetting is gevuld/nodig',
  occupancyFraction({ enrolled: 1, required: 2 }) === '1/2',
);
assert(
  'excel-reden open wordt automatisch ingepland',
  displayEnrollmentReason('open') === 'Automatisch ingepland' &&
    displayEnrollmentReason('Automatisch ingepland') === 'Automatisch ingepland',
);
assert(
  'officiële lege dienst mag teamplekken krijgen',
  shouldAttachTeamDutiesToLocked({ origin: 'AUTO', locked: true, teamDuties: [] }, [{ team: { id: 1 } }]) === true &&
    shouldAttachTeamDutiesToLocked({ origin: 'MANUAL', teamDuties: [] }, [{ team: { id: 1 } }]) === false &&
    shouldAttachTeamDutiesToLocked({ origin: 'AUTO', teamDuties: [{ id: 1 }] }, [{ team: { id: 1 } }]) === false,
);
assert(
  '7x7 mag op teamdienst via gekozen team-id',
  teamFitsDutyRule(
    { id: 88, name: '7x7 mannen', teamDutyUse: false },
    { teamDutySlotRole: 'LAST', teamDutyTeamIds: [88] },
  ) === true &&
    teamFitsDutyRule(
      { id: 88, name: '7x7 mannen', teamDutyUse: false },
      { teamDutySlotRole: 'LAST', teamDutyAgeFrom: 8, teamDutyAgeTo: 12 },
    ) === false,
);

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
  'planperiode hele weken ma–zo',
  toIsoDate(period.from) === '2026-09-28' && toIsoDate(period.to) === '2027-01-03',
);
assert(
  'standaard einddatum afronden op zondag',
  defaultPlanningEndInput(new Date('2026-09-17T12:00:00')) === '2027-01-03',
);

// Dennis ronde 4 (a): VR18+ 1× per 2 planningen
{
  const firstEver = vr18NeedsFillInCurrent({ previousCount: 0, currentCount: 0 });
  assert('VR18 eerste planning ooit: moet ingedeeld', firstEver === true);
  assert(
    'VR18 eerste planning: remaining 1',
    remainingObligation({ obligation: 'VR18' }, fillExecutedCount({ obligation: 'VR18' }, { countPrevious: 0, countPeriod: 0 })) === 1,
  );

  assert(
    'VR18 stond in vorige planning: overslaan',
    vr18NeedsFillInCurrent({ previousCount: 1, currentCount: 0 }) === false &&
      remainingObligation({ obligation: 'VR18' }, fillExecutedCount({ obligation: 'VR18' }, { countPrevious: 1, countPeriod: 0 })) === 0,
  );

  assert(
    'VR18 niet in vorige en niet in huidige: moet ingedeeld',
    vr18NeedsFillInCurrent({ previousCount: 0, currentCount: 0 }) === true &&
      remainingObligation({ obligation: 'VR18' }, fillExecutedCount({ obligation: 'VR18' }, { countPrevious: 0, countPeriod: 0 })) === 1,
  );

  assert(
    'VR18 zelf ingeschreven in huidige: overslaan',
    vr18NeedsFillInCurrent({ previousCount: 0, currentCount: 1 }) === false &&
      remainingObligation({ obligation: 'VR18' }, fillExecutedCount({ obligation: 'VR18' }, { countPrevious: 0, countPeriod: 1 })) === 0,
  );

  const enrollments = [
    { kind: 'PERSONAL', noShow: false, service: { date: new Date('2026-10-10T12:00:00.000Z') } },
  ];
  const current = { from: new Date('2026-12-07T00:00:00.000Z'), to: new Date('2027-01-17T23:59:59.999Z') };
  const previous = { from: new Date('2026-10-05T00:00:00.000Z'), to: new Date('2026-11-15T23:59:59.999Z') };
  assert(
    'VR18 period counts: vorige dienst telt, huidige leeg',
    (() => {
      const c = vr18PeriodCounts(enrollments, current, previous);
      return c.previousCount === 1 && c.currentCount === 0 && vr18NeedsFillInCurrent(c) === false;
    })(),
  );
  assert(
    'VR18 eerste planning ooit: geen vorige ronde',
    pickPreviousRound([], '2026-12-07') === null &&
      vr18NeedsFillInCurrent(vr18PeriodCounts([], current, null)) === true,
  );
  assert(
    'VR18 pickPreviousRound kiest de ronde die eerder eindigt',
    pickPreviousRound(
      [
        { id: 1, fromDate: '2026-10-05', toDate: '2026-11-15' },
        { id: 2, fromDate: '2026-08-01', toDate: '2026-09-13' },
      ],
      '2026-12-07',
    )?.id === 1,
  );
}

assert('VR18 merkteken ook als mandatoryBar true is', obligationMark({ obligation: 'VR18', mandatoryBar: true }) === ' VR18+');
assert('FULL merkteken blijft sterretje', obligationMark({ obligation: 'FULL', mandatoryBar: true }) === ' *');

// Levi-scenario: 3 aaneengesloten 6-weekse planningen (17 okt, 2 dec, 30 jan)
{
  const p1 = resolvePlanningPeriod({ from: '2026-10-12', weeks: 6 });
  const p2 = resolvePlanningPeriod({ from: '2026-11-23', weeks: 6 });
  const p3 = resolvePlanningPeriod({ from: '2027-01-04', weeks: 6 });
  assert(
    'Levi-periodes: okt/dec/jan zijn drie opeenvolgende 6-weken',
    toIsoDate(p1.from) === '2026-10-12' &&
      toIsoDate(p1.to) === '2026-11-22' &&
      toIsoDate(p2.from) === '2026-11-23' &&
      toIsoDate(p2.to) === '2027-01-03' &&
      toIsoDate(p3.from) === '2027-01-04' &&
      toIsoDate(p3.to) === '2027-02-14' &&
      isWithinPlanningPeriod(new Date('2026-10-17T12:00:00.000Z'), p1) &&
      isWithinPlanningPeriod(new Date('2026-12-02T12:00:00.000Z'), p2) &&
      isWithinPlanningPeriod(new Date('2027-01-30T12:00:00.000Z'), p3),
  );

  const octDuty = {
    kind: 'PERSONAL',
    noShow: false,
    service: { date: new Date('2026-10-17T12:00:00.000Z') },
  };
  const decDuty = {
    kind: 'PERSONAL',
    noShow: false,
    service: { date: new Date('2026-12-02T12:00:00.000Z') },
  };
  const janDuty = {
    kind: 'PERSONAL',
    noShow: false,
    service: { date: new Date('2027-01-30T12:00:00.000Z') },
  };

  const rounds = [
    { id: 1, fromDate: p1.from, toDate: p1.to },
    { id: 2, fromDate: p2.from, toDate: p2.to },
    { id: 3, fromDate: p3.from, toDate: p3.to },
  ];
  const prevOfP2 = resolvePreviousPeriod(rounds, p2.from, p2.to);
  const prevOfP3 = resolvePreviousPeriod(rounds, p3.from, p3.to);
  assert(
    'VR18 2e planning overslaan als 17 okt in vorige ronde staat',
    vr18NeedsFillInCurrent(vr18PeriodCounts([octDuty], p2, prevOfP2)) === false,
  );
  assert(
    'VR18 3e planning mag als 2e leeg is (1× per 2: stand-skip-stand)',
    vr18NeedsFillInCurrent(vr18PeriodCounts([octDuty], p3, prevOfP3)) === true,
  );
  assert(
    'VR18 3e planning overslaan als 2 dec wél in vorige staat',
    vr18NeedsFillInCurrent(vr18PeriodCounts([octDuty, decDuty], p3, prevOfP3)) === false,
  );

  const jumped = [{ id: 1, fromDate: '2026-10-12', toDate: '2026-11-30' }];
  assert(
    'overlappende t/m door datum-sprong telt nog als vorige planning',
    pickPreviousRound(jumped, p2.from)?.id === 1 &&
      vr18NeedsFillInCurrent(
        vr18PeriodCounts([octDuty], p2, resolvePreviousPeriod(jumped, p2.from, p2.to)),
      ) === false,
  );

  const inferred = inferPrecedingPeriod(p2.from, p2.to);
  assert(
    'zonder ronde-rij: vorige venster bevat 17 okt dus 2 dec niet opnieuw vullen',
    inferred &&
      toIsoDate(inferred.from) === '2026-10-12' &&
      toIsoDate(inferred.to) === '2026-11-22' &&
      vr18NeedsFillInCurrent(vr18PeriodCounts([octDuty], p2, inferred)) === false,
  );
  assert(
    'zonder ronde-rij: eerste planning ooit blijft vullen',
    vr18NeedsFillInCurrent(vr18PeriodCounts([], p1, inferPrecedingPeriod(p1.from, p1.to))) === true,
  );
  assert(
    'drie AUTO-diensten achter elkaar schendt 1× per 2 (2 dec is de extra)',
    vr18NeedsFillInCurrent(vr18PeriodCounts([octDuty, decDuty, janDuty], p2, prevOfP2)) === false &&
      vr18NeedsFillInCurrent(vr18PeriodCounts([octDuty, decDuty, janDuty], p3, prevOfP3)) === false,
  );
}

// Dennis ronde 4 (b): start maandag, eind zondag, 6 weken stabiel, jaarwisseling t/m 17/1/2027
{
  const six = resolvePlanningPeriod({ from: '2026-12-07', weeks: 6 });
  assert(
    '6 weken vanaf maandag 7/12/2026 eindigt zondag 17/1/2027',
    toIsoDate(six.from) === '2026-12-07' && toIsoDate(six.to) === '2027-01-17',
  );
  assert('start altijd maandag', six.from.getUTCDay() === 1);
  assert('eind altijd zondag', six.to.getUTCDay() === 0);

  const afterSync = resolvePlanningPeriod({
    from: toDateInputValue(six.from.toISOString()),
    to: toDateInputValue(six.to.toISOString()),
  });
  assert(
    '6 weken blijft gelijk na Diensten aanmaken/bijwerken',
    toIsoDate(afterSync.from) === '2026-12-07' && toIsoDate(afterSync.to) === '2027-01-17',
  );
  const afterPublish = resolvePlanningPeriod({
    from: toDateInputValue(afterSync.from.toISOString()),
    to: toDateInputValue(afterSync.to.toISOString()),
  });
  assert(
    '6 weken blijft gelijk na Concept publiceren',
    toIsoDate(afterPublish.from) === '2026-12-07' && toIsoDate(afterPublish.to) === '2027-01-17',
  );

  const jumpedSundayEod = toDateInputValue('2027-01-17T23:59:59.999Z');
  assert(
    'zondag 23:59Z blijft t/m 17/1 (geen sprong naar maandag)',
    jumpedSundayEod === '2027-01-17',
  );
  const yearTurnMonday = resolvePlanningPeriod({ from: '2026-12-07', to: '2027-01-18' });
  assert(
    'jaarwisseling: maandag 18/1/2027 als t/m wordt zondag 17/1/2027',
    toIsoDate(yearTurnMonday.from) === '2026-12-07' && toIsoDate(yearTurnMonday.to) === '2027-01-17',
  );

  const samples = [
    resolvePlanningPeriod({ from: '2026-10-01', to: '2026-12-31' }),
    resolvePlanningPeriod({ from: '2026-09-19', to: '2026-10-13' }),
    resolvePlanningPeriod({ from: '2027-01-18', to: '2027-01-18' }),
    resolvePlanningPeriod({ from: '2026-12-07', weeks: 6 }),
  ];
  assert(
    'elke periode start op maandag en eindigt op zondag',
    samples.every((p) => p.from.getUTCDay() === 1 && p.to.getUTCDay() === 0),
  );
}

const volunteerBounds = resolvePlanningPeriod({ from: '2026-09-19', to: '2026-10-13' });
const upcomingWindow = clampServiceDateFilter(
  { gte: new Date('2026-09-22T00:00:00') },
  volunteerBounds,
);
assert(
  'vrijwilliger plant niet voorbij de planningsdatum',
  toIsoDate(upcomingWindow.gte) === '2026-09-22' && toIsoDate(upcomingWindow.lte) === '2026-10-18',
);
const farQuery = clampServiceDateFilter(
  { gte: new Date('2026-09-22T00:00:00'), lte: new Date('2026-12-31T23:59:59') },
  volunteerBounds,
);
assert(
  'gevraagde einddatum wordt afgekapt op de planning',
  toIsoDate(farQuery.lte) === '2026-10-18',
);
const beforeStart = clampServiceDateFilter(
  { gte: new Date('2026-09-01T00:00:00') },
  volunteerBounds,
);
assert(
  'vrijwilliger plant niet voor de start van de planning',
  toIsoDate(beforeStart.gte) === '2026-09-14',
);
assert(
  'einddag van de planning telt nog mee',
  isWithinPlanningPeriod(new Date('2026-10-18T12:00:00'), volunteerBounds) === true,
);
assert(
  'dag na de planning telt niet mee',
  isWithinPlanningPeriod(new Date('2026-10-19T00:00:00'), volunteerBounds) === false,
);
assert(
  'diensten op dezelfde Amsterdamse dag op begintijd',
  compareServicesByDateThenTime(
    { date: '2026-11-24T23:00:00.000Z', time: '18:30 - 22:00' },
    { date: '2026-11-25T00:00:00.000Z', time: '15:00 - 18:00' },
  ) > 0,
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
const mobileLabels = (role) => mobileNavForRole(role).map((item) => item.label).join('|');
assert('menu vrijwilliger', labels('Vrijwilliger') === 'Diensten|Mijn diensten|Ruilen|Mijn gegevens');
assert('menu teamcoördinator', labels('Teamcoördinator') === 'Diensten|Mijn diensten|Team|Ruilen|Mijn gegevens');
assert('menu barcommissie', labels('Barcommissie') === 'Dashboard|Mijn diensten|Mijn ruilen|Mijn gegevens|Personen|Beheer');
assert('menu admin', labels('Admin') === 'Dashboard|Mijn diensten|Mijn ruilen|Mijn gegevens|Personen|Beheer|Instellingen');
assert(
  'menu barcommissie mobiel zelfde volgorde',
  mobileLabels('Barcommissie') === 'Dashboard|Mijn diensten|Mijn ruilen|Mijn gegevens|Personen|Beheer',
);
assert(
  'menu admin mobiel zonder instellingen',
  mobileLabels('Admin') === 'Dashboard|Mijn diensten|Mijn ruilen|Mijn gegevens|Personen|Beheer',
);
assert(
  'mijn gegevens zelfde pad voor alle rollen',
  ['Vrijwilliger', 'Teamcoördinator', 'Barcommissie', 'Admin'].every((role) =>
    navForRole(role).some((item) => item.to === '/mijn-gegevens' && item.label === 'Mijn gegevens'),
  ),
);
assert(
  'personen blijft top-level, niet onder beheer',
  navForRole('Barcommissie').some((item) => item.to === '/mensen' && item.label === 'Personen') &&
    !navForRole('Barcommissie').find((item) => item.to === '/meer').match.includes('/mensen'),
);
{
  const layoutSrc = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/frontend/components/Layout.jsx'),
    'utf8',
  );
  assert(
    'desktop en mobiel menu uit dezelfde config, uitloggen op beide',
    layoutSrc.includes('navForRole') &&
      layoutSrc.includes('mobileNavForRole') &&
      (layoutSrc.match(/Uitloggen/g) || []).length >= 2,
  );
  assert(
    'header heeft alleen het belletje als dropdown',
    layoutSrc.includes('<NotificationBell />') && !layoutSrc.includes('PageHelp'),
  );
}
{
  const bellSrc = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/frontend/components/NotificationBell.jsx'),
    'utf8',
  );
  assert(
    'meldingenpaneel valt binnen het scherm op telefoon en desktop',
    bellSrc.includes('createPortal') &&
      bellSrc.includes('data-testid="notification-panel"') &&
      bellSrc.includes('left-2') &&
      bellSrc.includes('right-2') &&
      bellSrc.includes('md:right-4') &&
      bellSrc.includes('overflow-y-auto') &&
      !/className="absolute right-0/.test(bellSrc),
  );
}
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
    'ik-pagina heeft kinderen en wachtwoord wijzigen',
    !ikSrc.includes('Mijn diensten') &&
      ikSrc.includes('/kinderen') &&
      ikSrc.includes('Mijn kinderen') &&
      ikSrc.includes('Wachtwoord wijzigen') &&
      !ikSrc.includes('Wachtwoord via e-mail'),
  );
  const inschrijfSrc = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/frontend/pages/Inschrijven.jsx'),
    'utf8',
  );
  assert(
    'vrijwilliger lijst-default met alle open diensten en bevestiging',
    inschrijfSrc.includes('filter-dienst-type') &&
      inschrijfSrc.includes('Alle open diensten') &&
      inschrijfSrc.includes('inschrijf-bevestiging') &&
      inschrijfSrc.includes('listScrollRef') &&
      inschrijfSrc.includes("useState(null)") &&
      /onlyOpen.*mode === 'open'|mode === 'open'.*onlyOpen/.test(inschrijfSrc.replace(/\n/g, ' ')) &&
      inschrijfSrc.includes('link-inschrijven') &&
      inschrijfSrc.includes('Ook de diensten van je kinderen'),
  );
}
{
  assert('huishouden herkent ouder en kind', inHousehold([10, 22], 22) && !inHousehold([10, 22], 3));
  const rows = personShiftRows(
    [
      {
        date: '2026-10-10',
        enrollments: [
          { personId: 1, person: { name: 'Lisa' }, noShow: false },
          { personId: 1, person: { name: 'Lisa' }, noShow: true },
        ],
      },
      {
        date: '2026-11-01',
        enrollments: [{ personId: 2, person: { name: 'Bo' }, noShow: false }],
      },
    ],
    [
      { id: 1, name: 'Lisa' },
      { id: 2, name: 'Bo' },
      { id: 3, name: 'Cheryl' },
    ],
  );
  assert(
    'excel per persoon telt diensten, no-shows en laatste datum',
    rows[0][0] === 'Bo' &&
      rows[0][1] === 1 &&
      rows[1][0] === 'Cheryl' &&
      rows[1][1] === 0 &&
      rows[2][0] === 'Lisa' &&
      rows[2][1] === 2 &&
      rows[2][2] === 1 &&
      rows[2][3] === '2026-10-10',
  );
  const dashSrc = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/frontend/pages/Dashboard.jsx'),
    'utf8',
  );
  assert(
    'dashboard-tegels linken naar beheer-diensten en aandacht',
    dashSrc.includes('/meer?tab=diensten&status=') &&
      dashSrc.includes('/aandacht#niet-ingepland') &&
      dashSrc.includes('/aandacht#no-show') &&
      dashSrc.includes('download-pdf') === false &&
      dashSrc.includes('DownloadPlanningButtons') &&
      !dashSrc.includes('dash-inschrijven') &&
      !dashSrc.includes('/rooster?status='),
  );
  const appSrc = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/frontend/App.jsx'),
    'utf8',
  );
  assert('dashboard-route is /open', appSrc.includes('<Dashboard />') && appSrc.includes('path="/open"'));
  assert(
    'mijn gegevens en kinderen zonder rolbeperking',
    /path="\/mijn-gegevens" element=\{<Protected><Ik/.test(appSrc) &&
      /path="\/kinderen" element=\{<Protected><Kinderen/.test(appSrc),
  );
  const personsRouteSrc = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/backend/routes/persons.js'),
    'utf8',
  );
  assert(
    'kind via mijn gegevens krijgt geen team van de ouder',
    personsRouteSrc.includes("'/me/children'") &&
      /teamId:\s*null/.test(personsRouteSrc) &&
      !/teamId:\s*guardian\.teamId/.test(personsRouteSrc),
  );
  const personenSrc = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/frontend/pages/PersonenBeheer.jsx'),
    'utf8',
  );
  assert(
    'personen heeft actief-toggle zonder kind-koppeling in beheer',
    personenSrc.includes('Activeren') &&
      personenSrc.includes('Deactiveren') &&
      personenSrc.includes('filterActive') &&
      !personenSrc.includes('beheer-kinderen') &&
      !personenSrc.includes('PersonChildrenEditor') &&
      !personenSrc.includes('Kind toevoegen (alleen naam)') &&
      !personenSrc.includes('Kinderen van') &&
      !personenSrc.includes('Kind van / gekoppeld aan ouder') &&
      !personenSrc.includes('GuardianPicker'),
  );
  {
    const kinderenSrc = fs.readFileSync(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/frontend/pages/Kinderen.jsx'),
      'utf8',
    );
    assert(
      'mijn gegevens blijft kinderen koppelen',
      kinderenSrc.includes('Mijn kinderen') &&
        kinderenSrc.includes('Kind toevoegen') &&
        kinderenSrc.includes('addMyChild') &&
        !personenSrc.includes('addPersonChild'),
    );
  }
  assert(
    'personen-rijacties staan op één regel, zelfde hoogte',
    personenSrc.includes('flex-nowrap') &&
      personenSrc.includes('data-testid="person-row-actions"') &&
      personenSrc.includes("title={inactive ? 'Activeren' : 'Deactiveren'}") &&
      personenSrc.includes('PersonStatusIcon') &&
      !personenSrc.includes('flex flex-wrap justify-end gap-1') &&
      !personenSrc.includes('min-w-[5.5rem]'),
  );
  assert(
    'deactiveren en activeren vragen bevestiging',
    personenSrc.includes("const verb = active ? 'activeren' : 'deactiveren'") &&
      personenSrc.includes('window.confirm(`${p.name} ${verb}?`)'),
  );
  assert(
    'laatst-ingelogd kolom alleen voor admin in personen',
    personenSrc.includes('Laatst ingelogd') &&
      personenSrc.includes('isAdminViewer') &&
      personenSrc.includes('lastLoginAt') &&
      personenSrc.includes("canonicalRole(user?.role) === 'Admin'"),
  );
  const planningExportSrc = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/backend/routes/planning.js'),
    'utf8',
  );
  assert('planning-excel heeft blad Per persoon', planningExportSrc.includes("name: 'Per persoon'"));
  assert(
    'excel diensten-blad heeft kolom Activiteit',
    planningExportSrc.includes("'Activiteit'") && planningExportSrc.includes('s.activity?.name'),
  );
  const downloadSrc = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/frontend/components/DownloadPlanningButtons.jsx'),
    'utf8',
  );
  assert('excel- en pdf-knoppen heten Excel-lijst en PDF rooster', downloadSrc.includes('Excel-lijst') && downloadSrc.includes('PDF rooster'));
  const planningUiSrc = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/frontend/pages/Planning.jsx'),
    'utf8',
  );
  assert(
    'barcommissie kan teamplek vullen vanuit toewijzen',
    planningUiSrc.includes('assignTeamSpot: teamOnlyLeft') && !planningUiSrc.includes('disabled={teamOnlyLeft}'),
  );
  assert(
    'diensten-lijst sorteert op datum en begintijd',
    planningUiSrc.includes('compareServicesByDateThenTime'),
  );
  const beheerDienstenSrc = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/frontend/pages/Beheer.jsx'),
    'utf8',
  );
  assert(
    'beheer-diensten sorteert op datum en begintijd',
    beheerDienstenSrc.includes('compareServicesByDateThenTime') &&
      beheerDienstenSrc.includes('s.active === false'),
  );
  const authSrc = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/backend/routes/auth.js'),
    'utf8',
  );
  assert('ingelogd wachtwoord wijzigen zonder mail', authSrc.includes("'/password'") && authSrc.includes('currentPassword'));
  const acceptStart = authSrc.indexOf("'/invite/:token/accept'");
  const acceptNext = authSrc.indexOf('router.post(', acceptStart + 10);
  const inviteAcceptSrc = authSrc.slice(acceptStart, acceptNext > acceptStart ? acceptNext : acceptStart + 900);
  assert(
    'eerste login wijzigt de naam niet via de API',
    inviteAcceptSrc.includes('passwordHash') &&
      inviteAcceptSrc.includes("const { password }") &&
      !inviteAcceptSrc.includes('name.trim()') &&
      !inviteAcceptSrc.includes('name: name'),
  );
  const uitnodigingSrc = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/frontend/pages/Uitnodiging.jsx'),
    'utf8',
  );
  assert(
    'uitnodiging toont naam alleen-lezen',
    uitnodigingSrc.includes('value={invite.name}') &&
      uitnodigingSrc.includes('disabled') &&
      uitnodigingSrc.includes('readOnly') &&
      !uitnodigingSrc.includes('setName') &&
      uitnodigingSrc.includes('acceptInvite(token, { password })'),
  );
  const loginSrc = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/frontend/pages/Login.jsx'),
    'utf8',
  );
  assert(
    'inlogpagina zonder i-icoon of page-help',
    loginSrc.includes('<h1 className="page-title">Inloggen</h1>') &&
      !loginSrc.includes('PageTitle') &&
      !loginSrc.includes('PageHelp') &&
      !loginSrc.includes('PAGE_HELP'),
  );
  const forgotSrc = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/frontend/pages/WachtwoordVergeten.jsx'),
    'utf8',
  );
  const resetSrc = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/frontend/pages/WachtwoordReset.jsx'),
    'utf8',
  );
  const privacySrc = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/frontend/pages/Privacy.jsx'),
    'utf8',
  );
  const invitePageSrc = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/frontend/pages/Uitnodiging.jsx'),
    'utf8',
  );
  assert(
    'publieke pagina’s zonder i-icoon',
    !forgotSrc.includes('PageTitle') &&
      !resetSrc.includes('PageTitle') &&
      !privacySrc.includes('PageTitle') &&
      !invitePageSrc.includes('PageTitle'),
  );
  const teamDashSrc = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/frontend/pages/TeamDashboard.jsx'),
    'utf8',
  );
  assert(
    'team-ouders heeft geen kolom Verplichting',
    !teamDashSrc.includes('Verplichting') &&
      !teamDashSrc.includes('obligationLabel') &&
      teamDashSrc.includes('Ouder toevoegen (alleen naam)'),
  );
  const renderStartLiveSrc = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../scripts/render-start.js'),
    'utf8',
  );
  assert(
    'live-start herstelt dubbele en wees-auto-diensten',
    renderStartLiveSrc.includes('deactivateDuplicateServices') &&
      renderStartLiveSrc.includes('deactivateOrphanAutoServices') &&
      renderStartLiveSrc.includes('orphanAutoServices'),
  );
  const pdfRouteSrc = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/backend/routes/pdf.js'),
    'utf8',
  );
  assert(
    'pdf-rooster laadt jaarplanning-activiteit',
    pdfRouteSrc.includes('activity: { select: { id: true, name: true, type: true } }'),
  );
  assert(
    'excel-export laadt jaarplanning-activiteit',
    planningExportSrc.includes("activity: { select: { id: true, name: true, type: true } }"),
  );
}
{
  const { publicPerson, publicPersonBrief } = await import('../src/backend/lib/roles.js');
  const {
    maskEmail,
    maskPhone,
    contactUpdateFromBody,
    isUnchangedMaskedEmail,
  } = await import('../src/backend/lib/contactMask.js');
  const { personExportRowsSheets } = await import('../src/backend/lib/personsXlsx.js');
  const pending = {
    id: 9,
    name: 'Nieuw',
    role: 'Vrijwilliger',
    inviteToken: 'tok-xyz',
    passwordHash: null,
    email: 'nieuw@vvl.demo',
    phone: '06-12345615',
  };
  const asCommittee = publicPerson(pending, { viewerRole: 'Barcommissie' });
  const asVolunteer = publicPerson(pending, { viewerRole: 'Vrijwilliger' });
  const asAdmin = publicPerson(pending, { viewerRole: 'Admin' });
  const asBestuur = publicPerson(pending, { viewerRole: 'Bestuur' });
  const asCoordinator = publicPerson(pending, { viewerRole: 'Coördinator' });
  const asOwn = publicPerson(pending, { includeContact: true, viewerRole: 'Admin' });
  assert(
    'uitnodigingstoken alleen voor barcommissie/admin',
    asCommittee.inviteToken === 'tok-xyz' &&
      asCommittee.invitePending === true &&
      asVolunteer.inviteToken == null &&
      publicPersonBrief(pending).inviteToken == null,
  );
  assert('maskeer e-mail d***@domain', maskEmail('dennis@live.com') === 'd***@live.com');
  assert('maskeer telefoon 06 **** 15', maskPhone('0612345615') === '06 **** 15' && maskPhone('06-12345615') === '06 **** 15');
  assert(
    'admin ziet contact gemaskeerd, barcommissie voluit, vrijwilliger niet',
    asAdmin.email === 'n***@vvl.demo' &&
      asAdmin.phone === '06 **** 15' &&
      asBestuur.email === 'n***@vvl.demo' &&
      asCoordinator.email === 'nieuw@vvl.demo' &&
      asCommittee.email === 'nieuw@vvl.demo' &&
      asCommittee.phone === '06-12345615' &&
      asVolunteer.email === undefined &&
      asVolunteer.phone === undefined,
  );
  assert(
    'eigen gegevens blijven volledig ook voor admin',
    asOwn.email === 'nieuw@vvl.demo' && asOwn.phone === '06-12345615',
  );
  assert(
    'gemaskeerde waarde overschrijft het echte adres niet',
    isUnchangedMaskedEmail('n***@vvl.demo', 'nieuw@vvl.demo') &&
      contactUpdateFromBody({ email: 'n***@vvl.demo', phone: '06 **** 15' }, pending).email === undefined &&
      contactUpdateFromBody({ email: 'n***@vvl.demo', phone: '06 **** 15' }, pending).phone === undefined &&
      contactUpdateFromBody({ email: 'ander@vvl.demo', phone: '0699988877' }, pending).email === 'ander@vvl.demo',
  );
  const maskedSheet = personExportRowsSheets([pending], [], { maskContact: true });
  const fullSheet = personExportRowsSheets([pending], [], { maskContact: false });
  assert(
    'personen-excel: admin gemaskeerd, barcommissie voluit',
    maskedSheet[0].rows[0][1] === 'n***@vvl.demo' &&
      maskedSheet[0].rows[0][2] === '06 **** 15' &&
      fullSheet[0].rows[0][1] === 'nieuw@vvl.demo' &&
      fullSheet[0].rows[0][2] === '06-12345615',
  );
  const maskedImport = validatePersonRows(
    [{ name: 'Nieuw', email: 'n***@vvl.demo', phone: '06 **** 15' }],
    { teams: [] },
  );
  assert(
    'personen-import weigert gemaskeerde contactgegevens',
    maskedImport.ok === false &&
      /sterretjes/i.test(maskedImport.invalidRows[0]?.error || ''),
  );
  const pendingWithLogin = {
    ...pending,
    sessions: [{ createdAt: '2026-10-06T11:00:00.000Z' }],
  };
  assert(
    'laatst ingelogd alleen voor admin, niet in API naar barcommissie',
    publicPerson(pendingWithLogin, { viewerRole: 'Admin' }).lastLoginAt === '2026-10-06T11:00:00.000Z' &&
      publicPerson(pendingWithLogin, { viewerRole: 'Barcommissie' }).lastLoginAt === undefined &&
      publicPerson(pendingWithLogin, { viewerRole: 'Vrijwilliger' }).lastLoginAt === undefined &&
      publicPerson(pending, { includeContact: true, viewerRole: 'Admin' }).lastLoginAt === null,
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

const { categoryOfTeam, categoryNeeded, planReferees } = await import('../src/backend/lib/refereePlan.js');
assert(
  'scheidsniveau volgt teamcategorie',
  categoryOfTeam('JO11-1')?.level === 'pupillen' &&
    categoryOfTeam('JO11-1')?.key === 'JO11' &&
    categoryOfTeam('MO15-1')?.level === 'junioren' &&
    categoryOfTeam('JO19-1')?.level === 'junioren' &&
    categoryOfTeam('O9-3')?.level === 'pupillen' &&
    categoryOfTeam('O8-1')?.key === 'O8' &&
    categoryOfTeam('Senioren 1')?.key === 'Senioren' &&
    categoryOfTeam('VR1')?.key === 'VR' &&
    categoryOfTeam('VR1')?.level === 'senioren',
);
assert(
  'JO8-JO10 en MO8-MO10 hebben standaard geen scheidsrechter',
  categoryNeeded('JO8') === false &&
    categoryNeeded('JO10') === false &&
    categoryNeeded('MO9') === false &&
    categoryNeeded('O8') === false &&
    categoryNeeded('JO11') === true &&
    categoryNeeded('JO7') === true &&
    categoryNeeded('Senioren') === true,
);
{
  const people = [
    { id: 1, name: 'Anne', teams: ['JO11-1'], levels: ['pupillen'] },
    { id: 2, name: 'Bas', teams: [], levels: ['pupillen'] },
    { id: 3, name: 'Cees', teams: [], levels: ['pupillen'] },
  ];
  const matches = [
    { id: 10, date: '2026-10-10', time: '09:30', home: true, team: 'JO11-1', opponent: 'X' },
    { id: 11, date: '2026-10-10', time: '10:45', home: true, team: 'JO12-1', opponent: 'Y' },
  ];
  const planned = planReferees({ people, matches, isNeeded: () => true });
  const bySlot = Object.fromEntries(planned.assignments.map((row) => [row.matchId, row.personId]));
  assert(
    'nooit het eigen team, wel vlak erna als dat kan',
    bySlot[10] === 2 && bySlot[11] === 1 && planned.open.length === 0,
  );
}
{
  const planned = planReferees({
    people: [
      { id: 1, name: 'Aaf', teams: [], levels: ['pupillen'] },
      { id: 2, name: 'Bas', teams: [], levels: ['pupillen'] },
    ],
    matches: [
      { id: 1, date: '2026-10-10', time: '10:00', home: true, team: 'JO12-1', opponent: 'X' },
      { id: 2, date: '2026-10-17', time: '10:00', home: true, team: 'JO12-1', opponent: 'Y' },
    ],
    isNeeded: () => true,
  });
  const second = planned.assignments.find((row) => row.matchId === 2);
  assert('rollend venster geeft de volgende plek aan wie nog niet floot', second?.personId === 2);
}
{
  const planned = planReferees({
    people: [{ id: 1, name: 'Bo', teams: [], levels: ['pupillen'] }],
    matches: [
      { id: 1, date: '2026-10-10', time: '09:00', home: true, team: 'JO12-1', opponent: 'A' },
      { id: 2, date: '2026-10-10', time: '12:00', home: true, team: 'JO12-2', opponent: 'B' },
    ],
    isNeeded: () => true,
  });
  assert(
    'hooguit één automatische plek per persoon per dag',
    planned.assignments.length === 1 &&
      planned.open.length === 1 &&
      planned.open[0].reason.includes('fluit die dag al'),
  );
}
{
  const planned = planReferees({
    people: [{ id: 1, name: 'Anne', teams: ['JO11-1'], levels: ['pupillen'] }],
    matches: [
      { id: 1, date: '2026-10-10', time: '10:00', home: true, team: 'JO11-1', opponent: 'X' },
      { id: 2, date: '2026-10-10', time: '09:00', home: true, team: 'JO8-1', opponent: 'Y' },
    ],
    isNeeded: (key) => categoryNeeded(key),
  });
  assert(
    'open plek noemt waarom en JO8 telt niet mee',
    planned.assignments.length === 0 &&
      planned.open.length === 1 &&
      planned.open[0].matchId === 1 &&
      planned.open[0].reason.includes('Pupillen'),
  );
}
{
  const migration = fs.readFileSync(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../src/backend/prisma/migrations/20261003180000_referees/migration.sql',
    ),
    'utf8',
  );
  const instellingenSrc = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/frontend/pages/Instellingen.jsx'),
    'utf8',
  );
  assert(
    'scheids-migratie is additief en staat uit',
    migration.includes('refereesEnabled') &&
      /DEFAULT false/i.test(migration) &&
      migration.includes('refereeLevels') &&
      !/DROP TABLE/i.test(migration) &&
      !/DROP COLUMN/i.test(migration),
  );
  assert(
    'instellingen heeft de scheidsrechters-schakelaar',
    instellingenSrc.includes('data-testid="scheids-schakelaar"'),
  );
}

{
  const tournamentMigration = fs.readFileSync(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../src/backend/prisma/migrations/20261003160000_tournaments/migration.sql',
    ),
    'utf8',
  );
  const instellingenSrc = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/frontend/pages/Instellingen.jsx'),
    'utf8',
  );
  const renderStartSrc = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../scripts/render-start.js'),
    'utf8',
  );
  const schemaSrc = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/backend/prisma/schema.prisma'),
    'utf8',
  );
  const seasonSrc = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/backend/lib/season.js'),
    'utf8',
  );
  assert(
    'toernooi-migratie is additief en staat uit',
    tournamentMigration.includes('tournamentsEnabled') &&
      /DEFAULT false/i.test(tournamentMigration) &&
      !/DROP TABLE/i.test(tournamentMigration) &&
      !/DROP COLUMN/i.test(tournamentMigration),
  );
  assert(
    'instellingen heeft de toernooien-schakelaar',
    instellingenSrc.includes('data-testid="toernooien-schakelaar"') &&
      instellingenSrc.includes('data-testid="toernooien-switch"'),
  );
  const liveDeploySrc = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/backend/lib/liveDeploy.js'),
    'utf8',
  );
  assert(
    'live-start back-upt en past alleen SQL toe, geen db push',
    liveDeploySrc.includes('20261003160000_tournaments') &&
      liveDeploySrc.includes('20261003180000_referees') &&
      liveDeploySrc.includes('20261004150000_chantal_tester') &&
      liveDeploySrc.includes('20261006100000_chantal_ronde3') &&
      renderStartSrc.includes('CHANTAL3_MIGRATION') &&
      renderStartSrc.includes('backupSqlite') &&
      renderStartSrc.includes('applyNamedMigrationsOnce') &&
      renderStartSrc.includes('repairAccidentalWeekendTeams') &&
      renderStartSrc.includes('unlinkGuardianCopiedTeam') &&
      renderStartSrc.includes('shouldAttemptIncidentRestore') &&
      renderStartSrc.includes('Dienst-herstel niet fataal') &&
      !/prisma db push/.test(renderStartSrc) &&
      !/accept-data-loss/.test(renderStartSrc),
  );
  const renderYamlSrc = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../render.yaml'),
    'utf8',
  );
  assert(
    'render.yaml zet APP_URL op het clubdomein',
    /key:\s*APP_URL/.test(renderYamlSrc) &&
      renderYamlSrc.includes('https://planning.vvlekkerkerk.nl') &&
      !renderYamlSrc.includes('https://planning.vvlekkerkerk.nl/'),
  );
  assert(
    'live-start gebruikt het clubdomein als APP_URL',
    renderStartSrc.includes("https://planning.vvlekkerkerk.nl") &&
      renderStartSrc.includes('CANONICAL_APP_URL'),
  );
  assert(
    'mailvoorbeeld niet hardcoded op onrender',
    !fs
      .readFileSync(
        path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/backend/lib/mailLayout.js'),
        'utf8',
      )
      .includes('vvl-planning-demo.onrender.com'),
  );
  {
    const prevApp = process.env.APP_URL;
    process.env.APP_URL = 'https://planning.vvlekkerkerk.nl';
    assert('mailvoorbeeld volgt APP_URL', exampleMailVars().link === 'https://planning.vvlekkerkerk.nl');
    if (prevApp === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = prevApp;
  }
  const liveRepairsSrc = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/backend/lib/liveRepairs.js'),
    'utf8',
  );
  const settingsSrc = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/backend/routes/settings.js'),
    'utf8',
  );
  assert(
    'live-repair logt verplaatste wedstrijden/diensten/koppelingen',
    liveRepairsSrc.includes('matches: matches.count') &&
      liveRepairsSrc.includes('duties: duties.count') &&
      liveRepairsSrc.includes('memberships: memberships.length') &&
      liveRepairsSrc.includes('membershipsRemoved: links.count') &&
      settingsSrc.includes('repairs: status.repairs'),
  );
  assert(
    'clubsettings heeft beide schakelaars, standaard uit',
    /tournamentsEnabled\s+Boolean\s+@default\(false\)/.test(schemaSrc) &&
      /refereesEnabled\s+Boolean\s+@default\(false\)/.test(schemaSrc) &&
      seasonSrc.includes('tournamentsEnabled: Boolean(s.tournamentsEnabled)') &&
      seasonSrc.includes('refereesEnabled: Boolean(s.refereesEnabled)'),
  );
}

{
  const parts = splitSqlStatements('-- comment\nALTER TABLE "ClubSettings" ADD COLUMN "x" BOOLEAN NOT NULL DEFAULT false;\nCREATE TABLE "T" ("id" INTEGER);\n');
  assert('sql-splitter negeert commentaar', parts.length === 2 && parts[0].startsWith('ALTER TABLE'));
  assert(
    'dubbele kolom of tabel is onschuldig bij herstart',
    isIgnorableMigrationError('duplicate column name: tournamentsEnabled') &&
      isIgnorableMigrationError('table Tournament already exists') &&
      !isIgnorableMigrationError('syntax error'),
  );
}

{
  const now = new Date('2026-10-03T12:00:00');
  const empty = classifyServiceGap({
    service: { id: 1, date: '2026-10-10', type: 'BAR', time: '09:00 - 12:00', origin: 'AUTO', locked: false, kind: 'PERSONAL', matchId: null },
    now,
  });
  const assigned = classifyServiceGap({
    service: { id: 2, date: '2026-09-01', type: 'KITCHEN', time: '16:30 - 19:30', origin: 'AUTO', locked: false, kind: 'MIXED', matchId: 9 },
    enrollments: [{ id: 1, noShow: false }, { id: 2, noShow: true }],
    swaps: [{ id: 3 }],
    match: { id: 9, opponent: 'X', home: true, teamName: 'JO12-1' },
    now,
  });
  const manual = classifyServiceGap({
    service: { id: 3, date: '2026-10-04', type: 'BAR', time: '12:00 - 16:30', origin: 'MANUAL', locked: false, kind: 'PERSONAL' },
    now,
  });
  assert('lege auto-dienst niet herstellen', empty.shouldRestore === false && empty.when === 'future' && empty.hasPerson === false);
  assert(
    'dienst met inschrijvingen wel herstellen',
    assigned.shouldRestore && assigned.hasPerson && assigned.when === 'past' && assigned.noShows === 1 && assigned.swaps === 1 && assigned.match.team === 'JO12-1',
  );
  assert('handmatige dienst wel herstellen', manual.shouldRestore && manual.manual && manual.when === 'future');
  assert(
    'oude kleinere backup niet massaal terugzetten op grotere live-db',
    shouldAttemptIncidentRestore({ liveCount: 208, backupCount: 177, withPerson: 1, manual: 39 }) === false,
  );
  assert(
    'kleinere live met personen wel herstellen',
    shouldAttemptIncidentRestore({ liveCount: 10, backupCount: 177, withPerson: 1, manual: 0 }) === true,
  );
  assert(
    'zonder personen of handmatig niets herstellen',
    shouldAttemptIncidentRestore({ liveCount: 10, backupCount: 177, withPerson: 0, manual: 0 }) === false,
  );
  assert('sqlite-ids als bigint matchen gewone ids', toId(69n) === 69 && toId('69') === 69);
  assert('sql-id-lijst negeert ongeldige waarden', sqlIntList([1n, 1, 'x', null, 2]) === '1,2');
  const healthSrc = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/backend/server.js'),
    'utf8',
  );
  assert(
    'publieke health lekt geen mail, backuppad of dienst-diff',
    !healthSrc.includes('inspectMail') &&
      !healthSrc.includes('extra.backup') &&
      !healthSrc.includes('fromEmail') &&
      !healthSrc.includes('serviceDiff'),
  );
  assert(
    'publieke health is alleen ok/name/db',
    healthSrc.includes("res.json({ ok: true, name: 'VVL Planning App', db: true })"),
  );
}

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
  const names = partsForField({ id: 'f3', name: 'Veld 3', split: 'quarter', partNames: {} }).map((part) => part.name);
  assert('kwartveld heet Veld 3a t/m 3d', names.join(',') === 'Veld 3a,Veld 3b,Veld 3c,Veld 3d');
  const renamed = partsForField({ id: 'f3', name: 'Veld 3', split: 'half', partNames: { a: 'Bosrand' } });
  assert('helft kan een eigen naam', renamed[0].name === 'Bosrand' && renamed[1].name === 'Veld 3b');

  const four = ['A', 'B', 'C', 'D'].map((name) => ({ id: name, name }));
  const rounds = roundRobin(four);
  const pairs = rounds.flatMap((round) => round.map((match) => [match.home.id, match.away.id].sort().join('')));
  const seenInRound = rounds.every((round) => new Set(round.flatMap((match) => [match.home.id, match.away.id])).size === 4);
  assert(
    'round-robin van 4 is zes unieke duels',
    rounds.length === 3 && pairs.length === 6 && new Set(pairs).size === 6 && seenInRound,
  );
  const three = roundRobin(['A', 'B', 'C'].map((name) => ({ id: name, name })));
  assert('round-robin van 3 heeft een bye', three.length === 3 && three.every((round) => round.length === 1));

  const example = createExample();
  const view = present(example);
  const placed = view.matches.filter((match) => match.slotIndex != null);
  const clash = new Set();
  let double = false;
  let wrongSize = false;
  placed.forEach((match) => {
    [match.homeId, match.awayId].filter(Boolean).forEach((id) => {
      const key = `${match.slotIndex}:${id}`;
      if (clash.has(key)) double = true;
      clash.add(key);
    });
    if (match.part && match.part.size !== match.size) wrongSize = true;
  });
  const slotsByTeam = new Map();
  placed.forEach((match) => {
    [match.homeId, match.awayId].filter(Boolean).forEach((id) => {
      if (!slotsByTeam.has(id)) slotsByTeam.set(id, []);
      slotsByTeam.get(id).push(match.slotIndex);
    });
  });
  let noRest = false;
  slotsByTeam.forEach((slots) => {
    slots.sort((a, b) => a - b);
    for (let i = 1; i < slots.length; i += 1) if (slots[i] < slots[i - 1] + 2) noRest = true;
  });
  const refClash = placed.some((match) => {
    if (!match.refereeId) return false;
    return placed.some(
      (other) =>
        other.slotIndex === match.slotIndex &&
        (other.homeId === match.refereeId || other.awayId === match.refereeId || other.refereeId === match.refereeId && other.id !== match.id),
    );
  });
  const cross = placed.filter((match) => match.phase === 'knockout' && match.round === 1 && match.category === 'JO9');
  assert(
    'voorbeeldtoernooi past op de juiste veldgrootte',
    example.teams.length === 16 &&
      example.fields.filter((field) => field.split === 'quarter').length === 1 &&
      view.fit.ok &&
      view.unplaced.length === 0 &&
      !double &&
      !wrongSize &&
      !noRest &&
      !refClash &&
      placed.some((match) => match.category === 'JO9' && match.part?.size === 'quarter') &&
      placed.some((match) => match.category === 'JO11' && match.part?.size === 'half') &&
      !placed.some((match) => match.category === 'JO9' && match.part?.size !== 'quarter'),
  );
  assert(
    'kruisfinale kruist de poules',
    cross.length === 2 &&
      cross.some((match) => match.homeLabel === '1e JO9 A' && match.awayLabel === '2e JO9 B') &&
      cross.some((match) => match.homeLabel === '1e JO9 B' && match.awayLabel === '2e JO9 A'),
  );

  const sample = placed.find((match) => match.phase === 'poule' && match.category === 'JO9');
  const scored = present({
    ...example,
    scores: { [sample.id]: { played: true, home: 2, away: 0, penalties: null } },
  });
  const row = scored.poules.find((poule) => poule.id === sample.pouleId).table.find((item) => item.teamId === sample.homeId);
  assert('winst levert 3 punten', row.points === 3 && row.gf === 2 && row.gd === 2);

  const tight = assessFit({ ...example, fields: example.fields.map((field) => ({ ...field, split: 'full' })) });
  assert('heel veld voor JO9 past niet', tight.ok === false && /kwart/.test(tight.text));

  const shifts = buildShifts(example);
  assert(
    'bar en keuken vullen de dag',
    shifts.length === 5 && shifts[0].start === '09:00' && shifts.at(-1).end === '16:00',
  );

  const idle = unusedFullFields(example, view.matches);
  assert('heel veld zonder passende categorie blijft leeg', idle.some((field) => field.name === 'Veld 4'));

  assert(
    'wissel standaard 3 minuten, expliciet 0 blijft 0',
    normalizeTournament({}).changeoverMinutes === 3 &&
      normalizeTournament({ changeoverMinutes: 0 }).changeoverMinutes === 0 &&
      normalizeTournament({ breakEnabled: false }).breakEnabled === false,
  );

  const koBefore = view.matches.filter((match) => match.phase === 'knockout');
  const allScores = {};
  view.matches
    .filter((match) => match.phase === 'poule')
    .forEach((match) => {
      allScores[match.id] = { played: true, home: 1, away: 0, penalties: null };
    });
  const afterPoules = present({ ...example, scores: allScores });
  const koAfter = afterPoules.matches.filter(
    (match) => match.phase === 'knockout' && match.homeId && match.awayId && match.slotIndex != null,
  );
  assert(
    'knock-out scheids komt pas als de poules klaar zijn',
    koBefore.length > 0 &&
      koBefore.every((match) => !match.refereeId) &&
      koAfter.length > 0 &&
      koAfter.every((match) => match.refereeId),
  );

  const tieBase = normalizeTournament({
    name: 'Tiebreak',
    fields: [{ id: 'f', name: 'Veld 1', split: 'quarter' }],
    teams: ['A', 'B', 'C', 'D'].map((id) => ({ id, name: id, category: 'JO9' })),
    format: 'poules',
    startTime: '09:00',
    endTime: '18:00',
    matchMinutes: 12,
    changeoverMinutes: 3,
    breakEnabled: false,
  });
  const tieView = present(tieBase);
  const pair = (left, right) =>
    tieView.matches.find(
      (match) =>
        match.phase === 'poule' &&
        ((match.homeId === left && match.awayId === right) || (match.homeId === right && match.awayId === left)),
    );
  const line = (left, right, leftGoals, rightGoals) => {
    const match = pair(left, right);
    const swapped = match.homeId !== left;
    return {
      [match.id]: {
        played: true,
        home: swapped ? rightGoals : leftGoals,
        away: swapped ? leftGoals : rightGoals,
        penalties: null,
      },
    };
  };
  const h2h = present({
    ...tieBase,
    scores: { ...line('A', 'B', 1, 0), ...line('B', 'C', 5, 0) },
  });
  const h2hTable = h2h.poules[0].table.map((row) => row.teamId);
  assert('onderling resultaat gaat voor doelsaldo', h2hTable.indexOf('A') < h2hTable.indexOf('B'));
  const gd = present({
    ...tieBase,
    scores: { ...line('A', 'B', 1, 1), ...line('A', 'C', 1, 0), ...line('B', 'C', 4, 0) },
  });
  const gdTable = gd.poules[0].table;
  const rowA = gdTable.find((row) => row.teamId === 'A');
  const rowB = gdTable.find((row) => row.teamId === 'B');
  assert(
    'gelijk onderling resultaat valt terug op doelsaldo',
    rowA.points === rowB.points && gdTable.indexOf(rowB) < gdTable.indexOf(rowA),
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

{
  const printSrc = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/frontend/pages/ToernooiPrint.jsx'),
    'utf8',
  );
  assert(
    'afdruk houdt veldkop bij het veld',
    printSrc.includes('veld-blok') && printSrc.includes('break-inside: avoid'),
  );
  const seedSrc = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../scripts/seed-mock.js'),
    'utf8',
  );
  assert(
    'seed-mock toont demo-wachtwoord bij SEED_DEMO',
    seedSrc.includes("SEED_DEMO === 'true' ? 'demo-test-2026' : 'admin123'") &&
      !seedSrc.includes('admin@vvl.local / admin123'),
  );
}

{
  const now = new Date('2026-10-04T12:00:00.000Z');
  const appUrl = 'https://vvl-planning-demo.onrender.com';
  const events = personalEvents({
    now,
    appUrl,
    teamNames: ['JO11-1'],
    refereesEnabled: true,
    tournamentsEnabled: true,
    matches: [
      {
        id: 7,
        date: '2026-10-04T14:30:00.000Z',
        time: '14:30',
        home: true,
        opponent: 'SV Capelle, JO11',
        teamName: 'JO11-1',
        durationMinutes: 90,
        updatedAt: '2026-10-01T08:00:00.000Z',
        hiddenName: 'Sanne de Geheim',
      },
      {
        id: 8,
        date: '2026-08-01T10:00:00.000Z',
        time: '10:00',
        home: false,
        opponent: 'Oud',
        teamName: 'JO11-1',
        updatedAt: '2026-08-01T08:00:00.000Z',
      },
    ],
    duties: [
      {
        enrollmentId: 3,
        type: 'BAR',
        date: '2026-10-03T22:00:00.000Z',
        time: '09:00 - 13:00',
        location: 'Bar',
        updatedAt: '2026-10-02T08:00:00.000Z',
        colleagueName: 'Sanne de Geheim',
      },
      {
        enrollmentId: 4,
        type: 'KITCHEN',
        date: '2026-10-04T12:00:00.000Z',
        time: '22:00 - 01:00',
        location: 'Keuken',
        updatedAt: '2026-10-02T09:00:00.000Z',
        noShow: true,
      },
      {
        enrollmentId: 5,
        type: 'BAR',
        date: '2026-10-04T12:00:00.000Z',
        time: '18:00 - 21:00',
        location: 'Bar',
        draft: true,
        updatedAt: '2026-10-02T09:00:00.000Z',
      },
    ],
    referees: [
      {
        id: 9,
        status: 'bevestigd',
        updatedAt: '2026-10-03T08:00:00.000Z',
        match: {
          id: 7,
          date: '2026-10-04T14:30:00.000Z',
          time: '14:30',
          home: true,
          opponent: 'SV Capelle, JO11',
          teamName: 'JO11-1',
          durationMinutes: 90,
          updatedAt: '2026-10-03T10:00:00.000Z',
        },
      },
    ],
    tournaments: [
      {
        id: 2,
        name: 'Jeugdtoernooi',
        date: '2026-11-21',
        startTime: '09:00',
        endTime: '16:00',
        teamNames: ['JO11-1 Lekkerkerk'],
        updatedAt: '2026-10-01T00:00:00.000Z',
      },
      {
        id: 3,
        name: 'Niet voor ons',
        date: '2026-11-22',
        startTime: '09:00',
        endTime: '12:00',
        teamNames: ['JO11-2 Lekkerkerk'],
        updatedAt: '2026-10-01T00:00:00.000Z',
      },
    ],
  });
  const ics = renderIcs({ name: 'VVL-agenda', events, now });
  const again = personalEvents({
    now,
    appUrl,
    teamNames: ['JO11-1'],
    refereesEnabled: false,
    tournamentsEnabled: false,
    matches: events.length ? [{
      id: 7,
      date: '2026-10-04T14:30:00.000Z',
      time: '15:00',
      home: true,
      opponent: 'SV Capelle, JO11',
      teamName: 'JO11-1',
      durationMinutes: 90,
      updatedAt: '2026-10-05T08:00:00.000Z',
    }] : [],
    referees: [{ id: 9, status: 'bevestigd', match: { id: 1, date: '2026-10-04T14:30:00.000Z', time: '14:30', teamName: 'JO11-1' } }],
    tournaments: [{ id: 2, name: 'Jeugdtoernooi', date: '2026-11-21', teamNames: ['JO11-1 Lekkerkerk'] }],
  });
  const moved = renderIcs({
    name: 'VVL-agenda',
    now,
    events: personalEvents({
      now,
      appUrl,
      matches: [{
        id: 7,
        date: '2026-10-04T14:30:00.000Z',
        time: '15:00',
        home: true,
        opponent: 'SV Capelle, JO11',
        teamName: 'JO11-1',
        updatedAt: '2026-10-05T08:00:00.000Z',
      }],
    }),
  });
  const teamIcs = renderIcs({
    name: 'VVL JO11-1',
    now,
    events: teamEvents({
      now,
      appUrl,
      teamId: 4,
      teamName: 'JO11-1',
      tournamentsEnabled: true,
      matches: [{
        id: 7,
        date: '2026-10-04T14:30:00.000Z',
        time: '14:30',
        home: true,
        opponent: 'SV Capelle, JO11',
        volunteerName: 'Sanne de Geheim',
      }],
      teamDuties: [{
        serviceId: 3,
        type: 'BAR',
        date: '2026-10-04T12:00:00.000Z',
        time: '09:00 - 13:00',
        location: 'Bar',
        personName: 'Nora Ouder',
      }],
      tournaments: [{
        id: 2,
        name: 'Jeugdtoernooi',
        date: '2026-11-21',
        startTime: '09:00',
        endTime: '16:00',
        teamNames: ['JO11-1 Lekkerkerk'],
      }],
    }),
  });
  const unfolded = unfoldIcs(ics);
  const summary = unfolded.split('\r\n').find((line) => line.startsWith('SUMMARY:VVL JO11-1'));
  assert('agenda uit is geblokkeerd', calendarBlocked(false) === true && calendarBlocked(true) === false);
  assert('ics is geldig en gebruikt Amsterdam', validateIcs(ics).length === 0 && validateIcs(teamIcs).length === 0);
  assert(
    'aanvang blijft de clubtijd en wordt niet verschoven',
    unfolded.includes('DTSTART;TZID=Europe/Amsterdam:20261004T143000') &&
      unfolded.includes('DTEND;TZID=Europe/Amsterdam:20261004T160000') &&
      !unfolded.includes('T163000'),
  );
  assert(
    'dienst van middernacht-UTC valt op de Amsterdamse dag',
    unfolded.includes('DTSTART;TZID=Europe/Amsterdam:20261004T090000') &&
      unfolded.includes('DTEND;TZID=Europe/Amsterdam:20261004T130000'),
  );
  assert(
    'titel, komma en bardienst kloppen',
    dutyTitle('BAR', 'Bar') === 'Bardienst – Kantine' &&
      unfolded.includes('Bardienst – Kantine') &&
      summary &&
      icsUnescape(summary.slice('SUMMARY:'.length)).includes('VVL JO11-1 – SV Capelle, JO11 (thuis)'),
  );
  assert(
    'oude wedstrijd, no-show en concept staan er niet in',
    !unfolded.includes('Oud') && !unfolded.includes('22:00') && !unfolded.includes('18:00'),
  );
  const night = renderIcs({
    name: 'VVL-agenda',
    now,
    events: personalEvents({
      now,
      duties: [{
        enrollmentId: 11,
        type: 'KITCHEN',
        date: '2026-10-04T12:00:00.000Z',
        time: '22:00 - 01:00',
        location: 'Keuken',
      }],
    }),
  });
  assert(
    'dienst over middernacht eindigt de volgende dag',
    unfoldIcs(night).includes('DTSTART;TZID=Europe/Amsterdam:20261004T220000') &&
      unfoldIcs(night).includes('DTEND;TZID=Europe/Amsterdam:20261005T010000'),
  );
  assert(
    'persoonlijke feed noemt geen andere namen',
    !ics.includes('Sanne') && !ics.includes('Geheim') && !teamIcs.includes('Sanne') && !teamIcs.includes('Nora'),
  );
  assert(
    'scheids en passend toernooi zitten erin, een ander toernooi niet',
    unfolded.includes('Scheidsrechter – JO11-1 tegen SV Capelle\\, JO11') &&
      unfolded.includes('Toernooi – Jeugdtoernooi') &&
      !unfolded.includes('Niet voor ons'),
  );
  assert(
    'uitgezette modules vallen weg, het uid blijft gelijk als de wedstrijd verschuift',
    !renderIcs({ name: 'x', events: again, now }).includes('Scheidsrechter') &&
      !renderIcs({ name: 'x', events: again, now }).includes('Toernooi') &&
      unfoldIcs(moved).includes('UID:match-7@vvl-planning') &&
      unfoldIcs(moved).includes('T150000') &&
      unfoldIcs(ics).includes('UID:match-7@vvl-planning'),
  );
  const long = foldLine(`SUMMARY:${'é'.repeat(80)}`);
  assert(
    'lange regels worden gevouwen op octets',
    long.includes('\r\n ') &&
      Buffer.byteLength(long.split('\r\n')[0], 'utf8') <= 75 &&
      icsUnescape(icsEscapeText('a,b;c\\d\n')).includes('a,b;c\\d'),
  );
  const links = feedUrls('https://vvl-planning-demo.onrender.com/', 'abc_DEF-123456789012345678901234');
  assert(
    'webcal en google gebruiken dezelfde geheime link',
    links.webcalUrl.startsWith('webcal://vvl-planning-demo.onrender.com/api/calendar/feed/') &&
      links.googleUrl.startsWith('https://calendar.google.com/calendar/r?cid=') &&
      decodeURIComponent(links.googleUrl.split('cid=')[1]) === links.httpsUrl,
  );
  const headers = calendarResponseHeaders('BEGIN:VCALENDAR');
  assert(
    'cache-kop is privé met etag',
    headers['Cache-Control'] === 'private, max-age=300' &&
      headers['Content-Type'].includes('text/calendar') &&
      etagMatches(headers.ETag, headers.ETag) &&
      !etagMatches('zwak', headers.ETag),
  );
  assert(
    'teamfeed is openbaar en zonder bardienst van een persoon',
    teamIcs.includes('CLASS:PUBLIC') &&
      teamIcs.includes('Teamdienst – Kantine') &&
      teamIcs.includes('geen namen') &&
      !teamIcs.includes('Bardienst'),
  );
  assert(
    'relevante teams zijn eigen team, kind en coördinatie',
    collectTeamIds({
      person: { teamId: 1 },
      memberships: [{ teamId: 2, active: true }, { teamId: 9, active: false }],
      children: [{ teamId: 3, teamMemberships: [{ teamId: 4, active: true }] }],
      coordinatedIds: [5],
    }).sort().join(',') === '1,2,3,4,5',
  );
  assert(
    'toernooinaam koppelt JO11-1 wel en JO11-2 niet',
    namesOverlap('JO11-1', 'JO11-1 Lekkerkerk') &&
      !namesOverlap('JO11-1', 'JO11-2 Lekkerkerk') &&
      !namesOverlap('JO11', 'JO11-1 Lekkerkerk'),
  );
  assert('agenda-limiet is een kwartier en zestig keer', CALENDAR_RATE_MAX === 60 && CALENDAR_RATE_WINDOW_MS === 15 * 60 * 1000);
  const migration = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/backend/prisma/migrations/20261004120000_calendar/migration.sql'),
    'utf8',
  );
  const instellingenSrc = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/frontend/pages/Instellingen.jsx'),
    'utf8',
  );
  const ikSrc = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/frontend/pages/Ik.jsx'),
    'utf8',
  );
  const serverSrc = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/backend/server.js'),
    'utf8',
  );
  const schemaSrc = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/backend/prisma/schema.prisma'),
    'utf8',
  );
  const liveDeploySrc = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/backend/lib/liveDeploy.js'),
    'utf8',
  );
  assert(
    'agenda-migratie is additief en staat uit',
    migration.includes('calendarEnabled') &&
      /DEFAULT false/i.test(migration) &&
      migration.includes('CalendarFeed') &&
      !/DROP TABLE/i.test(migration) &&
      !/DROP COLUMN/i.test(migration) &&
      !/prisma db push/i.test(migration),
  );
  assert(
    'Match.updatedAt-add heeft een constante default (SQLite)',
    /ALTER TABLE "Match" ADD COLUMN "updatedAt"/.test(migration) &&
      !/ALTER TABLE "Match" ADD COLUMN "updatedAt"[^;]*CURRENT_TIMESTAMP/.test(migration),
  );
  assert(
    'instellingen en mijn gegevens hebben de agenda-koppeling',
    instellingenSrc.includes('data-testid="agenda-schakelaar"') &&
      instellingenSrc.includes('Agenda-koppeling') &&
      ikSrc.includes('<AgendaKoppeling />'),
  );
  assert(
    'clubsettings heeft agenda uit en de live-start neemt de migratie mee',
    /calendarEnabled\s+Boolean\s+@default\(false\)/.test(schemaSrc) &&
      liveDeploySrc.includes('20261004120000_calendar') &&
      serverSrc.includes("app.use('/api/calendar', calendarRouter)"),
  );
}

const unitRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const refereeApi = spawnSync(process.execPath, ['scripts/referee-api-check.js'], {
  cwd: unitRoot,
  stdio: 'inherit',
});
assert('scheids-API: 404 uit en rollen', refereeApi.status === 0);
const resetCheck = spawnSync(process.execPath, ['scripts/environment-reset-check.js'], {
  cwd: unitRoot,
  stdio: 'inherit',
});
assert('omgeving opschonen op een databasekopie', resetCheck.status === 0);

const apiCheck = spawnSync(process.execPath, ['scripts/tournament-api-check.js'], {
  cwd: unitRoot,
  stdio: 'inherit',
});
assert('toernooi-api met schakelaar en rollen', apiCheck.status === 0);
const calendarApi = spawnSync(process.execPath, ['scripts/calendar-api-check.js'], {
  cwd: unitRoot,
  stdio: 'inherit',
});
assert('agenda-API: 404 uit, ICS en limiet', calendarApi.status === 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
