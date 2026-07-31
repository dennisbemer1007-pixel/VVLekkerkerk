/**
 * Lokale unit checks (geen server nodig).
 * Run: node scripts/unit-checks.js
 */
import { parseCsv, validateMatchRows } from '../src/backend/lib/csvMatches.js';
import {
  underQuota,
  isUnavailableOn,
  prefersSlot,
  normalizeObligation,
} from '../src/backend/lib/obligation.js';

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
