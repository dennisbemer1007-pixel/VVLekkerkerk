/**
 * Lokale unit checks (geen server nodig).
 * Run: node scripts/unit-checks.js
 */
import fs from 'fs';
import { parseCsv, validateMatchRows, objectsToMatchRows } from '../src/backend/lib/csvMatches.js';
import { xlsxToObjects } from '../src/backend/lib/xlsxWorkbook.js';
import { isYoungYouthTeam, isOldYouthTeam } from '../src/backend/lib/youthTeams.js';
import {
  underQuota,
  isUnavailableOn,
  prefersSlot,
  normalizeObligation,
} from '../src/backend/lib/obligation.js';
import {
  groupHomeMatchesByKickoff,
  pickServicesMatchingHomeMatches,
  serviceWindowForKickoff,
} from '../src/backend/lib/matchPlanning.js';
import {
  SLOT_ROWS,
  inferSlot,
  rosterDaySections,
  servicesForSlotRow,
  slotCellText,
} from '../src/backend/lib/pdfRoster.js';

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

const win9 = serviceWindowForKickoff('09:00');
assert('kickoff 09:00 → 09:00 - 12:00', win9.time === '09:00 - 12:00' && win9.slot === 'MORNING');
assert('kickoff 08:30 → 08:30 - 11:30', serviceWindowForKickoff('08:30').time === '08:30 - 11:30');
assert('kickoff 15:00 → 15:00 - 18:00', serviceWindowForKickoff('15:00').time === '15:00 - 18:00');

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

const mixedTimes = groupHomeMatchesByKickoff([
  { home: true, date: day, time: '09:00', opponent: 'A' },
  { home: true, date: day, time: '15:00', opponent: 'B' },
  { home: false, date: day, time: '09:00', opponent: 'Uit' },
]);
assert('different kickoffs are separate slots', mixedTimes.length === 2);
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
  pdfDays[0].rows === SLOT_ROWS && pdfDays[5].rows === SLOT_ROWS && pdfDays[6].rows.length === 3,
);
assert('pdf has no kitchen rows', SLOT_ROWS.every((row) => row.type === 'BAR'));
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
assert('HALF under quota', underQuota({ obligation: 'HALF' }, 10, 2) === true);
assert('HALF met', underQuota({ obligation: 'HALF' }, 0, 3) === false);
assert('normalize legacy mandatory', normalizeObligation(undefined, true) === 'FULL');

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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
