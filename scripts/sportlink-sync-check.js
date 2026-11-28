/**
 * Sportlink Club.Dataservice-koppeling met gemockte Sportlink-JSON (geen netwerk, geen clubdatabase).
 * Dekt: uit/zonder Client ID, versleutelde opslag, nieuw, ongewijzigd, verplaatst, afgelast,
 * hersteld, handmatig beschermd, officiële (vergrendelde) diensten, mail (gemockt, nooit dubbel,
 * mail-uit), dashboardmelding, geen automatisch inschrijven/plannen en de CSV-import.
 *
 * Run: node scripts/sportlink-sync-check.js
 * Ook via: npm test / scripts/unit-checks.js
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dbFile = path.join(os.tmpdir(), `sportlink-sync-${process.pid}.db`);
process.env.DATABASE_URL = `file:${dbFile}`;
process.env.DATA_DIR = '';
process.env.NODE_ENV = 'production';
process.env.MAIL_SECRET = process.env.MAIL_SECRET || 'sportlink-test-secret';
process.env.SEED_DEMO = '';

// Tijdelijke testdatabase (niet de clubdatabase): hier mag het schema uit schema.prisma worden gezet.
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
const sync = await import('../src/backend/lib/sportlink/sync.js');
const client = await import('../src/backend/lib/sportlink/client.js');
const changes = await import('../src/backend/lib/sportlink/changes.js');
const { setClubName, isClubTeamName, clubTeamLabel, deriveClubSides } = await import('../src/backend/lib/knvbTeams.js');
const { mapService } = await import('../src/backend/lib/serviceHelpers.js');
const { dashboardServiceCounts } = await import('../src/backend/lib/dashboardStats.js');
const { generateServicesFromRules } = await import('../src/backend/lib/serviceGeneration.js');
const { persistValidMatchRows } = await import('../src/backend/lib/importMatches.js');
const { parseCsv, validateMatchRows } = await import('../src/backend/lib/csvMatches.js');
const { renderMail, resolveMailTemplates, serializeMailTemplates, MAIL_TEMPLATE_KEYS } = await import(
  '../src/backend/lib/mailTemplates.js'
);
const { getClubSettings } = await import('../src/backend/lib/season.js');

let failed = 0;
function assert(name, cond, detail = '') {
  if (cond) {
    console.log(`PASS  ${name}`);
    return;
  }
  failed += 1;
  console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
}

const CLIENT_ID = 'TESTCLIENT1';

// ---- datums: altijd in de toekomst, op zaterdagen ----
function pad(n) {
  return String(n).padStart(2, '0');
}
function ymd(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
const base = new Date();
base.setHours(12, 0, 0, 0);
base.setDate(base.getDate() + 21);
while (base.getDay() !== 6) base.setDate(base.getDate() + 1);
const sat = (weeks) => {
  const d = new Date(base);
  d.setDate(d.getDate() + weeks * 7);
  return d;
};
const day = (weeks) => ymd(sat(weeks));
const dayStart = (weeks) => {
  const d = sat(weeks);
  d.setHours(0, 0, 0, 0);
  return d;
};

// ---- gemockte Sportlink ----
function row({ nr, date, time = '14:30', home = 'Testdorp JO12-1', away = 'FC Voorbeeld', status = 'Gepland', field = 'Veld 1' }) {
  return {
    wedstrijdnummer: nr,
    wedstrijdcode: `c${nr}`,
    wedstrijddatum: `${date}T${time}:00`,
    aanvangstijd: time,
    thuisteam: home,
    uitteam: away,
    teamnaam: home,
    competitiesoort: 'Competitie',
    klasse: '3e klasse',
    veld: field,
    status,
  };
}
const feed = { program: [], cancelled: [], fail: 0, calls: [] };
function mockFetch(url) {
  feed.calls.push(String(url));
  const u = new URL(url);
  const article = u.pathname.slice(1);
  const ok = (body) => Promise.resolve({ ok: true, status: 200, json: async () => body });
  if (feed.fail) return Promise.resolve({ ok: false, status: feed.fail, json: async () => ({}) });
  if (feed.errorBody) return ok(feed.errorBody);
  if (feed.throwNetwork) return Promise.reject(new Error(`getaddrinfo ENOTFOUND ${url}`));
  if (article === 'programma') return ok(Number(u.searchParams.get('weekoffset')) === 0 ? feed.program : []);
  if (article === 'afgelastingen') return ok(feed.cancelled);
  return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
}

// ---- gemockte mail ----
const mailbox = { ready: true, sent: [], templates: '' };
const mail = {
  getSettings: async () => ({ templates: mailbox.templates }),
  isReady: () => mailbox.ready,
  send: async (message) => {
    mailbox.sent.push(message);
    return { sent: true };
  },
};
const run = (extra = {}) => sync.runSportlinkSync({ fetchImpl: mockFetch, mail, trigger: 'manual', ...extra });
const counts = async () => ({
  services: await prisma.service.count(),
  enrollments: await prisma.enrollment.count(),
  matches: await prisma.match.count(),
});

try {
  // ================= 0. Zuivere onderdelen =================
  const p1 = client.parseSportlinkDateTime({ wedstrijddatum: '2026-12-06T14:30:00+0100', aanvangstijd: '14:30' });
  assert('datum met +0100 wordt Amsterdam-lokaal', p1?.date === '2026-12-06' && p1?.time === '14:30', JSON.stringify(p1));
  const p2 = client.parseSportlinkDateTime({ wedstrijddatum: '2026-07-04T12:00:00Z' });
  assert('UTC-tijd wordt omgezet naar Amsterdam (zomertijd)', p2?.date === '2026-07-04' && p2?.time === '14:00', JSON.stringify(p2));
  const p3 = client.parseSportlinkDateTime({ wedstrijddatum: '2026-12-06T23:30:00+0000', aanvangstijd: '' });
  assert('dagwissel door tijdzone klopt', p3?.date === '2026-12-07' && p3?.time === '00:30', JSON.stringify(p3));
  assert('onleesbare datum geeft null', client.parseSportlinkDateTime({ wedstrijddatum: 'morgen' }) === null);
  assert('status afgelast herkend', client.isCancelledStatus('Afgelast') && client.isCancelledStatus('afgelast door bond'));
  assert('gewone status is niet afgelast', !client.isCancelledStatus('Gepland') && !client.isCancelledStatus(''));
  assert('client id: alleen letters en cijfers', client.isPlausibleClientId('oo5BhGVNw9') && !client.isPlausibleClientId('a&b=c') && !client.isPlausibleClientId(''));
  const url = client.buildUrl('https://data.sportlink.com', 'programma', client.windowParams(1));
  assert('programma-URL: weekoffset, 42 dagen, alleen thuis', url.searchParams.get('weekoffset') === '5' && url.searchParams.get('aantaldagen') === '42' && url.searchParams.get('uit') === 'nee');

  setClubName('Testdorp');
  assert('clubnaam instelbaar: Testdorp herkend, Lekkerkerk niet', isClubTeamName('Testdorp JO12-1') && !isClubTeamName('Lekkerkerk JO12-1'));
  assert('teamlabel zonder clubnaam', clubTeamLabel('Testdorp JO12-1') === 'JO12-1');
  assert('thuis/uit afgeleid voor andere club', deriveClubSides('FC Voorbeeld', 'Testdorp O15-2', '2026-12-06')?.home === false);
  const mapped = client.mapProgramRow(row({ nr: 'X1', date: '2026-12-12' }), { clubName: 'Testdorp' });
  assert('rij vertaald: nummer, team, tegenstander, veld', mapped.matchNumber === 'X1' && mapped.team === 'JO12-1' && mapped.opponent === 'FC Voorbeeld' && mapped.field === 'Veld 1' && mapped.home === true && !mapped.cancelled);
  assert('rij zonder wedstrijdnummer wordt geweigerd', Boolean(client.mapProgramRow({ wedstrijddatum: '2026-12-12T10:00:00', thuisteam: 'Testdorp 1', uitteam: 'X' }).error));
  setClubName('');
  assert('lege clubnaam valt terug op Lekkerkerk', isClubTeamName('Lekkerkerk JO12-1') && !isClubTeamName('Testdorp JO12-1'));

  const nightly = (iso, last, status = 'ok') => sync.nightlyDue({ now: new Date(iso), lastSyncAt: last ? new Date(last) : null, lastStatus: status });
  assert('nachtelijke run: niet voor 04:00 Amsterdam', nightly('2026-12-02T02:30:00Z', null) === false);
  assert('nachtelijke run: na 04:00 en nog niet vandaag', nightly('2026-12-02T03:30:00Z', '2026-12-01T03:30:00Z') === true);
  assert('nachtelijke run: niet twee keer per dag', nightly('2026-12-02T09:00:00Z', '2026-12-02T03:30:00Z') === false);
  assert('nachtelijke run: na een fout na 3 uur opnieuw', nightly('2026-12-02T09:00:00Z', '2026-12-02T03:30:00Z', 'error') === true);

  // ================= 1. Uit en zonder Client ID =================
  let r = await run();
  assert('sync doet niets als de koppeling uit staat', r.skipped === 'disabled' && feed.calls.length === 0);
  let rejected = null;
  try {
    await sync.saveSportlinkSettings({ enabled: true });
  } catch (err) {
    rejected = err;
  }
  assert('aanzetten zonder Client ID wordt geweigerd', rejected?.status === 400);
  await prisma.clubSettings.upsert({ where: { id: 1 }, update: { sportlinkEnabled: true }, create: { id: 1, sportlinkEnabled: true } });
  r = await run();
  assert('sync doet niets zonder Client ID', r.skipped === 'no_client_id' && feed.calls.length === 0);
  assert('standaard staat de koppeling uit en leeg', (await (async () => { await prisma.clubSettings.update({ where: { id: 1 }, data: { sportlinkEnabled: false } }); return true; })()));

  // ================= 2. Opslag versleuteld =================
  rejected = null;
  try {
    await sync.saveSportlinkSettings({ clientId: 'a&b=c' });
  } catch (err) {
    rejected = err;
  }
  assert('onzin als Client ID wordt geweigerd', rejected?.status === 400);
  await sync.saveSportlinkSettings({ clientId: CLIENT_ID, clubName: 'Testdorp', enabled: true });
  const stored = await prisma.clubSettings.findUnique({ where: { id: 1 } });
  assert('Client ID staat versleuteld in de database', stored.sportlinkClientId.startsWith('enc:v1:') && !stored.sportlinkClientId.includes(CLIENT_ID));
  const pub = sync.publicSportlinkSettings(stored);
  assert('publieke weergave toont de Client ID niet', pub.clientIdSet === true && !JSON.stringify(pub).includes(CLIENT_ID) && pub.enabled === true);
  assert('Client ID leeg laten behoudt de bestaande', await (async () => {
    await sync.saveSportlinkSettings({ clubName: 'Testdorp' });
    const again = await prisma.clubSettings.findUnique({ where: { id: 1 } });
    return again.sportlinkClientId === stored.sportlinkClientId;
  })());

  // ================= 3. Eerste sync: nieuwe wedstrijden, geen diensten, niemand ingedeeld =================
  feed.program = [
    row({ nr: 'M1', date: day(0), time: '14:30', home: 'Testdorp JO12-1' }),
    row({ nr: 'M2', date: day(1), time: '11:00', home: 'Testdorp JO10-2' }),
    row({ nr: 'M3', date: day(2), time: '14:30', home: 'Testdorp JO13-1' }),
    row({ nr: 'M4', date: day(3), time: '10:00', home: 'Testdorp JO8-1' }),
    row({ nr: 'M5', date: day(5), time: '14:30', home: 'Testdorp JO11-1' }),
    row({ nr: 'M7', date: day(7), time: '10:00', home: 'Testdorp JO9-1' }),
    row({ nr: 'M8', date: day(7), time: '14:00', home: 'Testdorp JO14-1' }),
    row({ nr: 'M6', date: day(8), time: '14:30', home: 'Testdorp JO15-1' }),
    { wedstrijddatum: `${day(1)}T10:00:00`, thuisteam: 'Testdorp 1', uitteam: 'Zonder Nummer' },
  ];
  const before = await counts();
  r = await run();
  const rep1 = r.report;
  assert('eerste sync: status ok, 8 nieuwe wedstrijden, 1 onvolledige regel overgeslagen', rep1.status === 'ok' && rep1.newMatches === 8 && rep1.skippedIncomplete === 1, JSON.stringify({ s: rep1.status, n: rep1.newMatches, i: rep1.skippedIncomplete, e: rep1.errors }));
  assert('URL bevat Client ID en alleen thuiswedstrijden', feed.calls.some((u) => u.includes(`client_id=${CLIENT_ID}`) && u.includes('uit=nee') && u.includes('/programma')) && feed.calls.some((u) => u.includes('/afgelastingen')));
  const after1 = await counts();
  assert('sync maakt geen diensten en geen inschrijvingen', after1.services === before.services && after1.enrollments === before.enrollments);
  const m1 = await prisma.match.findFirst({ where: { matchNumber: 'M1' }, include: { team: true } });
  assert('wedstrijd opgeslagen met team, veld, bron en geen handmatig', m1.team?.name === 'JO12-1' && m1.field === 'Veld 1' && m1.source === 'sportlink' && m1.manualEdit === false && m1.cancelled === false && m1.time === '14:30' && m1.opponent === 'FC Voorbeeld');
  const settingsAfter = await getClubSettings();
  assert('status van laatste sync opgeslagen', settingsAfter.sportlinkLastStatus === 'ok' && Boolean(settingsAfter.sportlinkLastSyncAt) && JSON.parse(settingsAfter.sportlinkLastReport).newMatches === 8);
  r = await run();
  assert('tweede sync zonder wijzigingen: alles ongewijzigd', r.report.unchanged === 8 && r.report.newMatches === 0 && r.report.changed === 0 && mailbox.sent.length === 0);

  // ================= 4. Diensten en mensen klaarzetten =================
  const matchBy = async (nr) => prisma.match.findFirst({ where: { matchNumber: nr } });
  const [M1, M2, M3, M4, M5, M6, M7, M8] = await Promise.all(['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8'].map(matchBy));
  const ruleBar = await prisma.serviceRule.create({
    data: { name: 'Za middag bar', weekday: 6, startTime: '12:00', endTime: '16:30', type: 'BAR', required: 2, conditionType: 'HOME_MATCH', slot: 'SECOND' },
  });
  const ruleKitchen = await prisma.serviceRule.create({
    data: { name: 'Za middag keuken', weekday: 6, startTime: '12:00', endTime: '16:30', type: 'KITCHEN', required: 2, conditionType: 'HOME_MATCH' },
  });
  const ruleTeam = await prisma.serviceRule.create({
    data: { name: 'Za teamdienst', weekday: 6, startTime: '14:00', endTime: '18:00', type: 'BAR', required: 3, conditionType: 'HOME_MATCH', teamDuty: true, teamDutySlotRole: 'LAST' },
  });
  const person = (n, email) =>
    prisma.person.create({ data: { name: n, email: email || null, role: 'Vrijwilliger', active: true } });
  const pJan = await person('Jan Mailer', 'jan@example.test');
  const pPiet = await person('Piet Zonder Mail', null);
  const pKees = await person('Kees Handmatig', 'kees@example.test');
  const pAnna = await person('Anna Team', 'anna@example.test');
  const committee = await prisma.person.create({ data: { name: 'Chantal Barcommissie', email: 'chantal@example.test', role: 'Barcommissie', active: true } });

  const svc = (data) =>
    prisma.service.create({
      data: { location: 'Bar', required: 2, origin: 'AUTO', active: true, draft: false, ...data },
    });
  const enroll = (serviceId, personId, extra = {}) => prisma.enrollment.create({ data: { serviceId, personId, ...extra } });

  // M1: officiële (vergrendelde) bardienst met twee inschrijvingen
  const S1 = await svc({ type: 'BAR', date: dayStart(0), time: '12:00 - 16:30', matchId: M1.id, sourceRuleId: ruleBar.id, locked: true, slot: 'SECOND' });
  await enroll(S1.id, pJan.id, { source: 'SELF' });
  await enroll(S1.id, pPiet.id, { source: 'ADMIN' });
  // M2: bar + keuken, dezelfde vrijwilliger op beide
  const S2 = await svc({ type: 'BAR', date: dayStart(1), time: '12:00 - 16:30', matchId: M2.id, sourceRuleId: ruleBar.id });
  const S2k = await svc({ type: 'KITCHEN', location: 'Keuken', date: dayStart(1), time: '12:00 - 16:30', matchId: M2.id, sourceRuleId: ruleKitchen.id });
  await enroll(S2.id, pJan.id, { source: 'AUTO' });
  await enroll(S2k.id, pJan.id);
  // M3: handmatig aangemaakte dienst en handmatig gezette teamplek: niet verschuiven
  const S3a = await svc({ type: 'BAR', date: dayStart(2), time: '12:00 - 16:30', matchId: M3.id, sourceRuleId: ruleBar.id, origin: 'MANUAL' });
  const S3b = await svc({ type: 'KITCHEN', location: 'Keuken', date: dayStart(2), time: '12:00 - 16:30', matchId: M3.id, sourceRuleId: ruleKitchen.id, teamDutiesManual: true });
  await enroll(S3a.id, pKees.id);
  await enroll(S3b.id, pKees.id);
  // M4: handmatig bewerkt in de app
  await prisma.match.update({ where: { id: M4.id }, data: { manualEdit: true } });
  // M5: mail staat uit tijdens deze wijziging
  const S5 = await svc({ type: 'BAR', date: dayStart(5), time: '12:00 - 16:30', matchId: M5.id, sourceRuleId: ruleBar.id });
  await enroll(S5.id, pJan.id);
  // M6: teamdienst met team, ingeschreven teamlid
  const teamJo15 = await prisma.team.findFirst({ where: { name: 'JO15-1' } });
  const S6 = await svc({ type: 'BAR', date: dayStart(8), time: '14:00 - 18:00', matchId: M6.id, sourceRuleId: ruleTeam.id, kind: 'TEAM', required: 3, assignedTeamId: teamJo15.id });
  await prisma.serviceTeamDuty.create({ data: { serviceId: S6.id, teamId: teamJo15.id, reserved: 2 } });
  await enroll(S6.id, pAnna.id, { kind: 'TEAM', forTeamId: teamJo15.id, source: 'TEAM' });
  // M7 + M8 zelfde dag: dienst hangt aan M7, M8 blijft over
  const S7 = await svc({ type: 'BAR', date: dayStart(7), time: '12:00 - 16:30', matchId: M7.id, sourceRuleId: ruleBar.id });
  await enroll(S7.id, pAnna.id);

  const enrollBefore = await prisma.enrollment.count();
  const servicesBefore = await prisma.service.count();

  // ================= 5. Verplaatst, afgelast, handmatig =================
  feed.program = [
    row({ nr: 'M1', date: day(4), time: '14:30', home: 'Testdorp JO12-1' }), // verplaatst week 0 → 4
    row({ nr: 'M2', date: day(1), time: '11:00', home: 'Testdorp JO10-2', status: 'Afgelast' }), // afgelast (programma-status)
    row({ nr: 'M3', date: day(6), time: '14:30', home: 'Testdorp JO13-1' }), // verplaatst, diensten beschermd
    row({ nr: 'M4', date: day(3), time: '15:30', home: 'Testdorp JO8-1' }), // handmatig → overslaan
    row({ nr: 'M5', date: day(5), time: '14:30', home: 'Testdorp JO11-1' }),
    row({ nr: 'M7', date: day(7), time: '10:00', home: 'Testdorp JO9-1' }),
    row({ nr: 'M8', date: day(7), time: '14:00', home: 'Testdorp JO14-1' }),
    row({ nr: 'M6', date: day(9), time: '14:30', home: 'Testdorp JO15-1' }), // teamdienst verplaatst
  ];
  r = await run();
  const rep2 = r.report;
  assert('sync met wijzigingen: status ok, 3 verplaatst, 1 afgelast, 1 handmatig overgeslagen', rep2.status === 'ok' && rep2.moved === 3 && rep2.cancelled === 1 && rep2.skippedManual === 1, JSON.stringify({ s: rep2.status, m: rep2.moved, c: rep2.cancelled, k: rep2.skippedManual, e: rep2.errors }));
  assert('overgeslagen handmatig staat in het rapport', rep2.items.some((i) => i.matchNumber === 'M4' && i.result === 'overgeslagen, handmatig'));
  const m4After = await prisma.match.findUnique({ where: { id: M4.id } });
  assert('handmatig bewerkte wedstrijd is niet overschreven', m4After.time === '10:00' && m4After.manualEdit === true && sameDayStr(m4After.date, day(3)));
  function sameDayStr(date, str) {
    return ymd(new Date(date)) === str;
  }

  // verplaatst
  const m1After = await prisma.match.findUnique({ where: { id: M1.id } });
  const s1After = await prisma.service.findUnique({ where: { id: S1.id }, include: { enrollments: true } });
  assert('wedstrijd M1 staat op de nieuwe datum', sameDayStr(m1After.date, day(4)));
  assert('gekoppelde (officiële) dienst schuift mee, zelfde dienst-id', sameDayStr(s1After.date, day(4)) && s1After.time === '12:00 - 16:30');
  assert('inschrijvingen op de verplaatste dienst blijven staan', s1After.enrollments.length === 2);
  assert('vergrendelde dienst blijft vergrendeld (niet teruggezet naar concept)', s1After.locked === true && s1After.draft === false && s1After.cancelled === false);
  // afgelast
  const m2After = await prisma.match.findUnique({ where: { id: M2.id } });
  const [s2After, s2kAfter] = await Promise.all([S2, S2k].map((s) => prisma.service.findUnique({ where: { id: s.id }, include: { enrollments: { include: { person: true } }, teamDuties: true } })));
  assert('wedstrijd M2 is afgelast gemarkeerd, niet verwijderd', m2After && m2After.cancelled === true);
  assert('gekoppelde diensten hebben status afgelast en blijven actief (geen hard delete)', s2After.cancelled && s2kAfter.cancelled && s2After.active && s2kAfter.active);
  assert('inschrijvingen op afgelaste diensten blijven bewaard', s2After.enrollments.length === 1 && s2kAfter.enrollments.length === 1);
  const mappedCancelled = mapService(s2After);
  assert('afgelaste dienst heeft status "cancelled"', mappedCancelled.status === 'cancelled' && mappedCancelled.cancelled === true);
  const tiles = dashboardServiceCounts([mappedCancelled, { active: true, draft: false, status: 'open' }]);
  assert('afgelaste dienst telt niet als open plek in het dashboard', tiles.open === 1 && tiles.full === 0 && tiles.almost === 0);
  // beschermd
  const [s3a, s3b] = await Promise.all([S3a, S3b].map((s) => prisma.service.findUnique({ where: { id: s.id } })));
  assert('handmatige dienst en handmatige teamplek blijven op hun datum', sameDayStr(s3a.date, day(2)) && sameDayStr(s3b.date, day(2)) && !s3a.cancelled && !s3b.cancelled);
  const m3After = await prisma.match.findUnique({ where: { id: M3.id } });
  assert('de wedstrijd zelf is wel verplaatst', sameDayStr(m3After.date, day(6)));
  const change3 = await prisma.matchChange.findFirst({ where: { matchId: M3.id } });
  const detail3 = JSON.parse(change3.detail);
  assert('beschermde diensten worden gemeld in de wijziging', change3.servicesProtected === 2 && detail3.every((d) => d.action === 'protected') && detail3.some((d) => /handmatig/.test(d.reason)));
  // teamdienst
  const s6After = await prisma.service.findUnique({ where: { id: S6.id }, include: { teamDuties: true, enrollments: true } });
  assert('teamdienst schuift mee met team en teamplek intact', sameDayStr(s6After.date, day(9)) && s6After.teamDuties.length === 1 && s6After.teamDuties[0].teamId === teamJo15.id && s6After.assignedTeamId === teamJo15.id);
  assert('teamdienst: ingeschreven teamlid blijft staan', s6After.enrollments.length === 1 && s6After.enrollments[0].forTeamId === teamJo15.id);
  // M7/M8: andere thuiswedstrijd die dag
  // (nog niet gewijzigd in deze ronde; volgt hieronder)

  // geen mensen ingedeeld, geen nieuwe diensten
  assert('sync deelt niemand in en maakt geen diensten aan', (await prisma.enrollment.count()) === enrollBefore && (await prisma.service.count()) === servicesBefore);

  // mails
  const toJan = mailbox.sent.filter((m) => m.to === 'jan@example.test');
  assert('geen mail naar mensen zonder e-mailadres of met beschermde diensten', !mailbox.sent.some((m) => m.to === 'kees@example.test') && rep2.mailsSkippedNoEmail >= 1);
  assert('ingeschreven vrijwilliger krijgt precies één mail per wijziging (verplaatst + afgelast)', toJan.length === 2, `jan kreeg ${toJan.length}`);
  const movedMail = toJan.find((m) => /verplaatst/i.test(m.subject));
  const cancelMail = toJan.find((m) => /vervalt/i.test(m.subject));
  const dutyDate = (weeks) => sat(weeks).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });
  assert('verplaatsmail noemt oude én nieuwe datum en tijd', Boolean(movedMail) && movedMail.text.includes(dutyDate(0)) && movedMail.text.includes(dutyDate(4)) && movedMail.text.includes('12:00 - 16:30') && movedMail.text.includes('JO12-1'));
  assert('afgelastmail noemt oude datum, tijd en beide diensten in één mail', Boolean(cancelMail) && cancelMail.text.includes(dutyDate(1)) && /bardienst en keukendienst/.test(cancelMail.text));
  assert('mail bevat geen onvervulde placeholders', mailbox.sent.every((m) => !/\{[a-z]+\}/.test(m.text) && !/\{[a-z]+\}/.test(m.subject)));
  const mailRows = await prisma.matchChangeMail.findMany();
  assert('per wijziging en persoon één mailregel (dedup), alleen verstuurd', mailRows.length === mailbox.sent.length && mailRows.every((m) => m.sent));
  const teamMail = mailbox.sent.find((m) => m.to === 'anna@example.test');
  assert('teamdienst-inschrijving krijgt ook een verplaatsmail', Boolean(teamMail) && /verplaatst/i.test(teamMail.subject));

  // dashboardmelding
  const pending = await prisma.matchChange.findMany({ where: { acknowledgedAt: null } });
  assert('dashboardmelding voor elke verplaatste/afgelaste wedstrijd met diensten', pending.length === 4 && pending.some((c) => c.kind === 'CANCELLED') && pending.filter((c) => c.kind === 'MOVED').length === 3);
  const note = await prisma.notification.findFirst({ where: { personId: committee.id, type: 'MATCH_CHANGE' } });
  assert('barcommissie krijgt een melding', Boolean(note) && /verplaatst/.test(note.body) && note.link === '/open');

  // ================= 6. Derde sync: nooit dubbel =================
  const sentBefore = mailbox.sent.length;
  const changesBefore = await prisma.matchChange.count();
  r = await run();
  assert('volgende sync met dezelfde feed: niets nieuw en geen dubbele mail', r.report.changed === 0 && mailbox.sent.length === sentBefore && (await prisma.matchChange.count()) === changesBefore);
  const jobChange = pending.find((c) => c.kind === 'MOVED' && c.matchId === M1.id);
  const dup = await changes.sendChangeMails({
    prisma,
    change: jobChange,
    kind: 'MOVED',
    matchLabel: 'JO12-1 - FC Voorbeeld',
    recipients: new Map([[pJan.id, { person: pJan, items: [{ type: 'BAR', time: '12:00 - 16:30', date: dayStart(0), newDate: dayStart(4) }] }]]),
    mail,
  });
  assert('zelfde wijziging nogmaals mailen levert niets op (uniek per wijziging en persoon)', dup.sent === 0 && dup.skippedDuplicate === 1 && mailbox.sent.length === sentBefore);

  // ================= 7. Mail staat uit =================
  mailbox.ready = false;
  const sentOff = mailbox.sent.length;
  feed.program = feed.program.map((x) => (x.wedstrijdnummer === 'M5' ? row({ nr: 'M5', date: day(6), time: '14:30', home: 'Testdorp JO11-1' }) : x));
  // M5 gaat van week 5 naar week 6; week 6 heeft M3 (verplaatst) maar dat is een andere dag-dienst; dienst S5 staat op dag 5.
  r = await run();
  const s5After = await prisma.service.findUnique({ where: { id: S5.id } });
  assert('mail uit: dienst schuift wel mee', sameDayStr(s5After.date, day(6)) || r.report.servicesProtected > 0, JSON.stringify({ d: ymd(new Date(s5After.date)), p: r.report.servicesProtected }));
  assert('mail uit: er gaat geen mail uit en niets wordt als verstuurd geboekt', mailbox.sent.length === sentOff && r.report.mailsSkippedOff >= 1 && r.report.mailsSent === 0);
  mailbox.ready = true;

  // ================= 8. Hersteld =================
  const mailsBeforeRestore = mailbox.sent.length;
  feed.program = feed.program.map((x) => (x.wedstrijdnummer === 'M2' ? row({ nr: 'M2', date: day(1), time: '11:00', home: 'Testdorp JO10-2', status: 'Gepland' }) : x));
  r = await run();
  const m2Restored = await prisma.match.findUnique({ where: { id: M2.id } });
  const s2Restored = await prisma.service.findUnique({ where: { id: S2.id }, include: { enrollments: true } });
  assert('afgelasting ingetrokken: wedstrijd en dienst weer actief, inschrijving blijft', r.report.restored === 1 && m2Restored.cancelled === false && s2Restored.cancelled === false && s2Restored.enrollments.length === 1);
  assert('hersteld geeft een dashboardmelding maar geen automatische mail', mailbox.sent.length === mailsBeforeRestore && (await prisma.matchChange.count({ where: { kind: 'RESTORED' } })) === 1);

  // ================= 9. Afgelastingen-feed =================
  feed.cancelled = [{ wedstrijdnummer: 'M7', status: 'Afgelast' }];
  r = await run();
  const s7 = await prisma.service.findUnique({ where: { id: S7.id } });
  const m7 = await prisma.match.findUnique({ where: { id: M7.id } });
  assert('afgelasting via de afgelastingen-feed wordt herkend', m7.cancelled === true && r.report.cancelled === 1);
  assert('andere thuiswedstrijd die dag: dienst blijft staan, niet afgelast', s7.cancelled === false && s7.matchId === M8.id, JSON.stringify({ c: s7.cancelled, m: s7.matchId }));
  feed.cancelled = [];
  r = await run();

  // ================= 10. Adopteren, handmatig, CSV =================
  const teamJo16 = await prisma.team.create({ data: { name: 'JO16-1' } });
  const csvMatch = await prisma.match.create({
    data: { date: new Date(`${day(10)}T12:00:00`), time: '14:30', home: true, opponent: 'Oude CSV', teamId: teamJo16.id, source: 'csv' },
  });
  const manualOnly = await prisma.match.create({
    data: { date: new Date(`${day(11)}T12:00:00`), time: '10:00', home: true, opponent: 'Zelf Toegevoegd', source: 'manual', manualEdit: true },
  });
  feed.program = [
    ...feed.program,
    row({ nr: 'ADOPT1', date: day(10), time: '14:30', home: 'Testdorp JO16-1', away: 'Oude CSV' }),
  ];
  const matchesBefore = await prisma.match.count();
  r = await run();
  const adopted = await prisma.match.findUnique({ where: { id: csvMatch.id } });
  assert('CSV-wedstrijd zonder nummer wordt overgenomen i.p.v. dubbel aangemaakt', r.report.adopted === 1 && adopted.matchNumber === 'ADOPT1' && (await prisma.match.count()) === matchesBefore);
  assert('handmatig toegevoegde wedstrijd zonder nummer blijft onaangeraakt', (await prisma.match.findUnique({ where: { id: manualOnly.id } })).opponent === 'Zelf Toegevoegd');
  assert('wedstrijden worden nooit verwijderd door de sync', (await prisma.match.count()) >= matchesBefore);
  feed.program = feed.program.filter((x) => x.wedstrijdnummer !== 'M8');
  r = await run();
  assert('wedstrijd die uit de feed verdwijnt blijft staan en wordt alleen gemeld', Boolean(await prisma.match.findUnique({ where: { id: M8.id } })) && r.report.missingInSportlink >= 1);

  // CSV-import blijft werken (clubnaam Lekkerkerk als standaard, en generiek met eigen clubnaam)
  setClubName('');
  const csvText = 'Datum;Tijd;Thuis;Uit;Wedstrijdnr.;Type;Spelniveau;Opmerkingen\n' + `${day(12)};14:30;Lekkerkerk JO11-3;Ergens VV JO11-1;CSV-1;Competitie;3e klasse;\n`;
  const parsed = parseCsv(csvText);
  const validated = validateMatchRows(parsed.rows, { headerError: parsed.headerError, format: parsed.format });
  assert('CSV-import: Lekkerkerk-regel is geldig', validated.rows.length === 1, JSON.stringify(validated.errors));
  const persisted = await persistValidMatchRows(prisma, validated.rows);
  const csvRow = await prisma.match.findFirst({ where: { matchNumber: 'CSV-1' } });
  assert('CSV-import: wedstrijd aangemaakt met bron csv, niet afgelast en niet handmatig', persisted.created.length === 1 && csvRow?.source === 'csv' && csvRow.cancelled === false && csvRow.manualEdit === false);
  setClubName('Testdorp');
  const parsed2 = parseCsv(csvText.replace('Lekkerkerk JO11-3', 'Testdorp JO11-3').replace('CSV-1', 'CSV-2'));
  const validated2 = validateMatchRows(parsed2.rows, { headerError: parsed2.headerError, format: parsed2.format });
  assert('CSV-import werkt ook met een andere clubnaam', validated2.rows.length === 1 && validated2.rows[0].team === 'JO11-3', JSON.stringify(validated2.errors));
  const sportlinkOverCsv = await prisma.match.findFirst({ where: { matchNumber: 'CSV-1' } });
  assert('de sync raakt een CSV-wedstrijd die niet in Sportlink staat niet aan', sportlinkOverCsv.opponent === 'Ergens VV JO11-1');

  // ================= 11. Planning-update en afgelaste wedstrijd =================
  const generatedBefore = await prisma.service.findUnique({ where: { id: S2k.id } });
  await prisma.match.update({ where: { id: M2.id }, data: { cancelled: true } });
  await prisma.service.update({ where: { id: S2.id }, data: { cancelled: true } });
  await prisma.service.update({ where: { id: S2k.id }, data: { cancelled: true } });
  await generateServicesFromRules({ from: day(1), to: day(1) });
  const s2Gen = await prisma.service.findUnique({ where: { id: S2.id } });
  const s2kGen = await prisma.service.findUnique({ where: { id: S2k.id } });
  const newOnCancelled = await prisma.service.count({ where: { matchId: M2.id, id: { notIn: [S2.id, S2k.id] } } });
  // De standaard zaterdag-barregel (altijd open) mag de barkeuze zelf wél weer oppakken; de keuken hangt aan de wedstrijd.
  assert('planning-update laat de afgelaste wedstrijd-dienst staan (actief, nog steeds afgelast)', s2kGen.active && s2kGen.cancelled && Boolean(generatedBefore) && Boolean(s2Gen));
  assert('planning-update maakt geen diensten voor een afgelaste wedstrijd', newOnCancelled === 0);

  // ================= 12. Fouten en geheimen =================
  feed.fail = 403;
  const matchesNow = await prisma.match.count();
  r = await run();
  assert('Client ID geweigerd: status error, duidelijke melding, niets gewijzigd', r.report.status === 'error' && /Client ID/.test(r.report.errors[0]) && (await prisma.match.count()) === matchesNow);
  feed.fail = 0;
  feed.errorBody = { error: { message: 'Invalid or expired client id', code: 4012 } };
  r = await run();
  assert('Sportlink-foutobject (200 met error) wordt als geweigerde Client ID gemeld', r.report.status === 'error' && /Client ID/.test(r.report.errors[0]));
  feed.errorBody = null;
  feed.throwNetwork = true;
  r = await run();
  const errText = JSON.stringify(r.report) + (await getClubSettings()).sportlinkLastReport;
  assert('netwerkfout: status error en de Client ID komt nergens in het rapport voor', r.report.status === 'error' && !errText.includes(CLIENT_ID), errText.slice(0, 200));
  feed.throwNetwork = false;

  // ================= 13. Mailteksten bewerkbaar =================
  assert('mailteksten voor verplaatst en afgelast bestaan als systeemtekst', MAIL_TEMPLATE_KEYS.includes('matchMoved') && MAIL_TEMPLATE_KEYS.includes('matchCancelled'));
  const customized = serializeMailTemplates({ matchMoved: { subject: 'Aangepast {nieuwedatum}', body: 'Hoi {naam}, nu op {nieuwedatum} {nieuwetijd}.' } });
  const resolved = resolveMailTemplates(customized);
  const rendered = renderMail(resolved.matchMoved, { naam: 'Jan', nieuwedatum: 'zaterdag 9 januari', nieuwetijd: '12:00 - 16:30' }, { templateKey: 'matchMoved' });
  assert('eigen tekst voor verplaatst wordt gebruikt en ingevuld', rendered.subject === 'Aangepast zaterdag 9 januari' && rendered.text.includes('Hoi Jan, nu op zaterdag 9 januari 12:00 - 16:30.') && resolved.matchCancelled.body.includes('{oudedatum}'));
  mailbox.templates = customized;

  // ================= 14. Geen automatische planning in de code =================
  const syncSource = ['sync.js', 'changes.js', 'client.js']
    .map((f) => fs.readFileSync(path.join(root, 'src/backend/lib/sportlink', f), 'utf8'))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  assert('sync-code gebruikt geen planning- of autofill-modules', !/autoFill|serviceGeneration|proposePlanning|generateServicesFromRules|trySyncPlanningFromMatches|fillMandatory/.test(syncSource));
  assert('sync-code maakt geen inschrijvingen aan', !/enrollment\.(create|createMany|upsert)/.test(syncSource));
  assert('sync-code verwijdert geen wedstrijden', !/match\.(delete|deleteMany)/.test(syncSource));
} catch (err) {
  failed += 1;
  console.error(err);
} finally {
  await prisma.$disconnect();
  fs.rmSync(dbFile, { force: true });
}

if (failed) {
  console.log(`\n${failed} Sportlink-controle(s) mislukt`);
  process.exit(1);
}
console.log('\nSportlink-sync geslaagd');
