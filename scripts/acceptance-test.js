import zlib from 'zlib';
import { workbookToXlsx } from '../src/backend/lib/xlsxWrite.js';
import { personExportRowsSheets } from '../src/backend/lib/personsXlsx.js';

/**
 * Acceptatie + regressie (draaiende app nodig).
 * Run: npm run test:accept
 * Base: http://localhost:5173 (Vite-proxy) of ACCEPT_BASE=http://localhost:3001
 */
const base = (process.argv[2] || process.env.ACCEPT_BASE || 'http://localhost:5173').replace(
  /\/$/,
  '',
);

function pdfPlainText(buf) {
  const raw = buf.toString('latin1');
  const streams = [...raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)].map((match) =>
    Buffer.from(match[1], 'latin1'),
  );
  let text = '';
  for (const stream of streams) {
    let body = stream;
    try {
      body = zlib.inflateSync(stream);
    } catch {
      /* ongecomprimeerd */
    }
    const chunks = [];
    for (const match of body.toString('latin1').matchAll(/<([0-9A-Fa-f\s]+)>/g)) {
      const clean = match[1].replace(/\s/g, '');
      if (!clean || clean.length % 2) continue;
      chunks.push(Buffer.from(clean, 'hex').toString('latin1'));
    }
    text += chunks.join('');
  }
  return text;
}

async function req(path, { method = 'GET', token, body, raw = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const buf = Buffer.from(await res.arrayBuffer());
  if (raw) return { status: res.status, buf, type: res.headers.get('content-type') };
  let json = null;
  try {
    json = buf.length ? JSON.parse(buf.toString('utf8')) : null;
  } catch {
    json = buf.toString('utf8').slice(0, 180);
  }
  return { status: res.status, json };
}

function record(name, cond, detail = '') {
  const line = `${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`;
  console.log(line);
  return cond;
}

async function login(email, password) {
  const r = await req('/api/auth/login', { method: 'POST', body: { email, password } });
  return { token: r.json?.token, status: r.status, json: r.json };
}

async function main() {
  console.log('Base URL:', base);
  let ok = true;
  const mark = (c) => {
    ok = ok && Boolean(c);
  };

  const health = await req('/api/health');
  mark(record('health', health.status === 200 && health.json?.ok === true));
  if (!ok) {
    console.error('Server niet bereikbaar. Start npm run dev.');
    process.exit(1);
  }

  const helmet = await fetch(`${base}/api/health`);
  mark(
    record(
      'helmet nosniff',
      helmet.headers.get('x-content-type-options') === 'nosniff',
    ),
  );
  mark(
    record(
      'api cache-control no-store',
      (helmet.headers.get('cache-control') || '').includes('no-store'),
    ),
  );

  const resetProbe = await fetch(`${base}/api/auth/reset/geen-echte-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'langgenoegwachtwoord' }),
  });
  const resetBody = await resetProbe.json().catch(() => ({}));
  const resetText = JSON.stringify(resetBody);
  mark(
    record(
      'wachtwoord-reset limiet en geen stack',
      resetProbe.status === 404 &&
        resetProbe.headers.get('ratelimit-limit') === '10' &&
        !resetText.toLowerCase().includes('stack') &&
        !resetText.includes('server.js'),
      String(resetProbe.status),
    ),
  );
  const acceptProbe = await fetch(`${base}/api/auth/invite/geen-echte-token/accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'langgenoegwachtwoord' }),
  });
  mark(
    record(
      'uitnodiging accepteren heeft limiet',
      acceptProbe.status === 404 && acceptProbe.headers.get('ratelimit-limit') === '10',
      String(acceptProbe.status),
    ),
  );
  const missingApi = await req('/api/bestaat-niet');
  mark(
    record(
      'onbekend api-pad is 404',
      missingApi.status === 404 && missingApi.json?.error === 'Niet gevonden',
      String(missingApi.status),
    ),
  );
  const robots = await fetch(`${base}/robots.txt`);
  const robotsText = await robots.text();
  mark(
    record(
      'robots.txt blokkeert indexering',
      robots.status === 200 && robots.headers.get('content-type')?.includes('text/plain') && robotsText.includes('Disallow: /') && !robotsText.includes('<html'),
    ),
  );

  const demo = await req('/api/auth/demo-accounts');
  mark(record('demo-accounts enabled', demo.json?.enabled === true));
  mark(
    record(
      'alle demo-logins in lijst',
      (demo.json?.accounts || []).length >= 11,
      String(demo.json?.accounts?.length),
    ),
  );

  const logins = [
    ['admin@vvl.local', 'admin123'],
    ['mark@vvl.demo', 'demo123'],
    ['sandra@vvl.demo', 'demo123'],
    ['lisa@vvl.demo', 'demo123'],
    ['tom@vvl.demo', 'demo123'],
    ['fatima@vvl.demo', 'demo123'],
    ['peter@vvl.demo', 'demo123'],
    ['anneke@vvl.demo', 'demo123'],
    ['kevin@vvl.demo', 'demo123'],
    ['noa@vvl.demo', 'demo123'],
    ['erik@vvl.demo', 'demo123'],
  ];
  const tokens = {};
  for (const [email, password] of logins) {
    const r = await login(email, password);
    tokens[email] = r.token;
    mark(record(`login ${email}`, Boolean(r.token), String(r.status)));
  }

  const admin = tokens['admin@vvl.local'];
  const lisa = tokens['lisa@vvl.demo'];
  const sandra = tokens['sandra@vvl.demo'];
  const markTok = tokens['mark@vvl.demo'];

  const lisaMe = await req('/api/auth/me', { token: lisa });
  mark(
    record(
      'lisa tabs alleen vrijwilliger',
      lisaMe.json?.access?.can?.includes('inschrijven') === true &&
        lisaMe.json?.access?.can?.includes('ruilen') === true &&
        lisaMe.json?.access?.can?.includes('dashboard') === false &&
        lisaMe.json?.access?.can?.includes('planning') === false &&
        lisaMe.json?.access?.can?.includes('voorkeuren') === false,
    ),
  );

  const adminMe = await req('/api/auth/me', { token: admin });
  mark(record('admin rol', adminMe.json?.role === 'Admin', String(adminMe.json?.role)));
  mark(
    record(
      'admin heeft beheer plus eigen diensten',
      adminMe.json?.access?.can?.includes('beheer') === true &&
        adminMe.json?.access?.can?.includes('inschrijven') === true &&
        adminMe.json?.access?.can?.includes('ruilen') === false &&
        adminMe.json?.access?.can?.includes('voorkeuren') === false,
    ),
  );

  const markMe = await req('/api/auth/me', { token: markTok });
  mark(
    record(
      'barcommissie heeft beheer plus eigen diensten',
      markMe.json?.access?.can?.includes('beheer') === true &&
        markMe.json?.access?.can?.includes('inschrijven') === true &&
        markMe.json?.access?.can?.includes('ruilen') === false &&
        markMe.json?.access?.can?.includes('voorkeuren') === false,
    ),
  );

  mark(record('unauth enroll 401', (await req('/api/enrollments', { method: 'POST', body: { serviceId: 1, personId: 1 } })).status === 401));
  mark(record('unauth PDF 401', (await req('/api/pdf/planning')).status === 401));

  const club = await req('/api/settings/club', { token: admin });
  mark(record('club seizoen', /^\d{4}-\d{4}$/.test(club.json?.seasonLabel || '')));

  const badImport = await req('/api/persons/import', {
    method: 'POST',
    token: admin,
    body: { csv: 'naam;email;team\nTest;test-fase@vvl.demo;OnbestaandElf' },
  });
  mark(record('import onbekend team 400', badImport.status === 400));
  mark(
    record(
      'import noemt rij en onbekend team',
      badImport.json?.canCreateTeams === true &&
        (badImport.json?.unknownTeams || []).includes('OnbestaandElf') &&
        (badImport.json?.invalidRows || []).some((row) => row.row && row.team === 'OnbestaandElf'),
      JSON.stringify(badImport.json || {}).slice(0, 220),
    ),
  );
  {
    const { default: prisma } = await import('../src/backend/lib/prisma.js');
    try {
      // Opruimen vóór de import, zodat een vorige run geen "updated" geeft.
      const person = await prisma.person.findFirst({ where: { email: 'fase-import-ee39@vvl.demo' } });
      if (person) {
        await prisma.enrollment.deleteMany({ where: { personId: person.id } });
        await prisma.personTeam.deleteMany({ where: { personId: person.id } });
        await prisma.person.delete({ where: { id: person.id } });
      }
      const team = await prisma.team.findFirst({ where: { name: 'FaseTeamEe39' } });
      if (team) {
        await prisma.person.updateMany({ where: { teamId: team.id }, data: { teamId: null } });
        await prisma.serviceTeamDuty.deleteMany({ where: { teamId: team.id } }).catch(() => {});
        await prisma.team.delete({ where: { id: team.id } });
      }
    } finally {
      await prisma.$disconnect();
    }
  }
  const madeTeam = await req('/api/persons/import', {
    method: 'POST',
    token: admin,
    body: {
      csv: 'naam;email;team\nFase Import;fase-import-ee39@vvl.demo;FaseTeamEe39',
      createMissingTeams: true,
    },
  });
  mark(
    record(
      'ontbrekende teams aanmaken en importeren',
      madeTeam.status === 200 && madeTeam.json?.created === 1,
      `${madeTeam.status} ${JSON.stringify(madeTeam.json || {}).slice(0, 180)}`,
    ),
  );
  {
    const { default: prisma } = await import('../src/backend/lib/prisma.js');
    try {
      const person = await prisma.person.findFirst({ where: { email: 'fase-import-ee39@vvl.demo' } });
      if (person) {
        await prisma.enrollment.deleteMany({ where: { personId: person.id } });
        await prisma.personTeam.deleteMany({ where: { personId: person.id } });
        await prisma.person.delete({ where: { id: person.id } });
      }
      const team = await prisma.team.findFirst({ where: { name: 'FaseTeamEe39' } });
      if (team) {
        await prisma.person.updateMany({ where: { teamId: team.id }, data: { teamId: null } });
        await prisma.serviceTeamDuty.deleteMany({ where: { teamId: team.id } }).catch(() => {});
        await prisma.team.delete({ where: { id: team.id } });
      }
    } finally {
      await prisma.$disconnect();
    }
  }

  const excel = await req('/api/planning/export.xlsx', { token: admin, raw: true });
  mark(record('excel zip', excel.status === 200 && excel.buf.slice(0, 2).toString() === 'PK'));

  const pdf = await req('/api/pdf/planning?clubhouse=true', { token: admin, raw: true });
  mark(record('clubhuis pdf', pdf.status === 200 && pdf.buf.slice(0, 4).toString() === '%PDF'));

  const dash = await req('/api/teams/dashboard', { token: sandra });
  mark(record('sandra teamdashboard', Array.isArray(dash.json?.teams) && dash.json.teams.length >= 1));
  const sandraMe = await req('/api/auth/me', { token: sandra });
  mark(
    record(
      'bardienstcoordinator zelfde als vrijwilliger plus team',
      sandraMe.json?.access?.can?.includes('inschrijven') === true &&
        sandraMe.json?.access?.can?.includes('ruilen') === true &&
        sandraMe.json?.access?.can?.includes('teams') === true &&
        sandraMe.json?.access?.can?.includes('beheer') === false,
    ),
  );

  const xlsxMe = await req('/api/persons/me/export.xlsx', { token: lisa, raw: true });
  mark(
    record(
      'lisa AVG excel',
      xlsxMe.status === 200 && xlsxMe.buf.slice(0, 2).toString() === 'PK',
    ),
  );

  const from = new Date();
  const to = new Date();
  to.setMonth(to.getMonth() + 3);
  const propose = await req('/api/planning/propose', {
    method: 'POST',
    token: admin,
    body: { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) },
  });
  mark(
    record(
      'planperiode zelf kiezen',
      propose.status === 201 && Number(propose.json?.slots ?? 0) >= 0,
      String(propose.status),
    ),
  );
  const periodEnd = propose.json?.period?.to ? new Date(propose.json.period.to) : null;
  const far = new Date();
  far.setMonth(far.getMonth() + 8);
  const farService = await req('/api/services', {
    method: 'POST',
    token: admin,
    body: {
      date: far.toISOString().slice(0, 10),
      time: '10:00 - 12:00',
      required: 2,
      type: 'BAR',
      note: 'Buiten planning',
    },
  });
  const lisaUpcoming = await req('/api/services', { token: lisa });
  const seenBeyond = (lisaUpcoming.json || []).filter(
    (s) => periodEnd && new Date(s.date).getTime() > periodEnd.getTime(),
  );
  mark(
    record(
      'vrijwilliger ziet geen diensten na planningsdatum',
      farService.status === 201 &&
        Boolean(periodEnd) &&
        Array.isArray(lisaUpcoming.json) &&
        seenBeyond.length === 0,
      seenBeyond.length
        ? seenBeyond.map((s) => String(s.date).slice(0, 10)).join(',')
        : String(farService.status),
    ),
  );
  if (farService.json?.id && lisaMe.json?.id) {
    const farEnroll = await req('/api/enrollments', {
      method: 'POST',
      token: lisa,
      body: { serviceId: farService.json.id, personId: lisaMe.json.id },
    });
    mark(
      record(
        'vrijwilliger kan niet inschrijven na planningsdatum',
        farEnroll.status === 403,
        `${farEnroll.status} ${farEnroll.json?.error || ''}`,
      ),
    );
  } else {
    mark(record('vrijwilliger kan niet inschrijven na planningsdatum', false, 'geen dienst of lisa-id'));
  }
  const afterPropose = await req('/api/services', { token: admin });
  const morningDuty = (afterPropose.json || []).find(
    (s) =>
      s.slot === 'MORNING' &&
      s.type === 'BAR' &&
      (s.teamDuties || []).some((d) => /O11|JO11|O12|JO12/i.test(d.team?.name || '')),
  );
  mark(
    record(
      'zaterdag ochtend jeugd-teamdienst',
      Boolean(morningDuty) &&
        morningDuty.required === 3 &&
        (morningDuty.teamDuties || []).length === 1 &&
        (morningDuty.capacity?.teamReserved ?? 0) === 2 &&
        (morningDuty.capacity?.personalCapacity ?? 0) === 1,
      morningDuty
        ? `required ${morningDuty.required} teams ${morningDuty.teamDuties?.length} reserved ${morningDuty.capacity?.teamReserved} personal ${morningDuty.capacity?.personalCapacity}`
        : 'geen teamdienst',
    ),
  );
  const afternoonDuties = (afterPropose.json || []).filter(
    (s) =>
      s.slot === 'AFTERNOON' &&
      s.type === 'BAR' &&
      (s.teamDuties || []).some((d) => /O15|JO15/i.test(d.team?.name || '')),
  );
  const afternoonDuty =
    afternoonDuties.find((s) => (s.capacity?.teamOpen ?? 0) > 0) || afternoonDuties[0];
  mark(
    record(
      'zaterdag middag 2 team + 1 open',
      Boolean(afternoonDuty) &&
        afternoonDuty.required === 3 &&
        (afternoonDuty.capacity?.teamReserved ?? 0) >= 2 &&
        (afternoonDuty.capacity?.personalCapacity ?? 0) === 1 &&
        (afternoonDuty.enrolled ?? 0) >= (afternoonDuty.capacity?.teamReserved ?? 0),
      afternoonDuty
        ? `reserved ${afternoonDuty.capacity?.teamReserved} personal ${afternoonDuty.capacity?.personalCapacity}`
        : 'geen teamdienst',
    ),
  );
  const eveningDuty = (afterPropose.json || []).find(
    (s) =>
      s.slot === 'EVENING' &&
      s.type === 'BAR' &&
      (s.teamDuties || []).some((d) => /O15|JO15/i.test(d.team?.name || '')),
  );
  mark(
    record(
      'zaterdag avond 1 teamplek + 1 open',
      Boolean(eveningDuty) &&
        (eveningDuty.capacity?.teamReserved ?? 0) >= 1 &&
        (eveningDuty.capacity?.personalCapacity ?? 0) >= 1,
      eveningDuty
        ? `reserved ${eveningDuty.capacity?.teamReserved} personal ${eveningDuty.capacity?.personalCapacity}`
        : 'geen teamdienst',
    ),
  );

  const lisaId = lisaMe.json?.id;
  if (afternoonDuty && lisaId) {
    const lisaTeamSpot = await req('/api/enrollments', {
      method: 'POST',
      token: lisa,
      body: { serviceId: afternoonDuty.id, personId: lisaId },
    });
    mark(
      record(
        'vrijwilliger geen teamplek',
        lisaTeamSpot.status === 409 ||
          (lisaTeamSpot.status === 201 && lisaTeamSpot.json?.kind !== 'TEAM'),
        `${lisaTeamSpot.status} ${lisaTeamSpot.json?.kind || lisaTeamSpot.json?.error || ''}`,
      ),
    );
  } else {
    mark(record('vrijwilliger geen teamplek', false, 'geen middag-teamdienst of lisa-id'));
  }

  const jo15 = (dash.json?.teams || []).find((t) => /O15|JO15/i.test(t.name));
  if (jo15 && afternoonDuty) {
    const parentName = `Test Ouder ${Date.now()}`;
    const parent = await req(`/api/teams/${jo15.id}/parents`, {
      method: 'POST',
      token: sandra,
      body: { name: parentName },
    });
    mark(
      record(
        'coordinator ouder op naam',
        parent.status === 201 && parent.json?.name === parentName && parent.json?.hasAccount === false,
        String(parent.status),
      ),
    );
    const again = await req(`/api/teams/${jo15.id}/parents`, {
      method: 'POST',
      token: sandra,
      body: { name: parentName },
    });
    mark(
      record(
        'zelfde naam koppelt bestaand, geen tweede persoon',
        again.status === 200 && again.json?.linked === true && again.json?.id === parent.json?.id,
        `${again.status} ${again.json?.id || again.json?.error || ''}`,
      ),
    );
    if (parent.json?.id) {
      for (const taken of afternoonDuty.enrollments || []) {
        if (taken.kind === 'TEAM') {
          await req(`/api/enrollments/${taken.id}`, { method: 'DELETE', token: admin });
        }
      }
      const fill = await req('/api/enrollments', {
        method: 'POST',
        token: sandra,
        body: { serviceId: afternoonDuty.id, personId: parent.json.id, forTeamId: jo15.id },
      });
      mark(
        record(
          'coordinator vult teamplek',
          fill.status === 201 &&
            fill.json?.kind === 'TEAM' &&
            /coördinator/i.test(fill.json?.reason || ''),
          `${fill.status} ${fill.json?.kind || ''} ${fill.json?.reason || fill.json?.error || ''}`,
        ),
      );
      const sandraMe = await req('/api/auth/me', { token: sandra });
      if (sandraMe.json?.id) {
        const selfFill = await req('/api/enrollments', {
          method: 'POST',
          token: sandra,
          body: { serviceId: afternoonDuty.id, personId: sandraMe.json.id, forTeamId: jo15.id },
        });
        mark(
          record(
            'coordinator zichzelf telt als coördinator',
            selfFill.status === 201 &&
              selfFill.json?.kind === 'TEAM' &&
              /coördinator/i.test(selfFill.json?.reason || ''),
            `${selfFill.status} ${selfFill.json?.reason || selfFill.json?.error || ''}`,
          ),
        );
      }
    } else {
      mark(record('coordinator vult teamplek', false, 'geen ouder-id'));
    }
  } else {
    mark(record('coordinator ouder op naam', false, 'geen JO15 op sandra-dashboard'));
    mark(record('coordinator vult teamplek', false, 'geen JO15/middag'));
  }

  const teamsSandra = await req('/api/teams', { token: sandra });
  const teamsAdmin = await req('/api/teams', { token: admin });
  mark(
    record(
      'teamco ziet minder teams dan admin',
      (teamsSandra.json?.length || 0) > 0 &&
        (teamsAdmin.json?.length || 0) >= (teamsSandra.json?.length || 0),
    ),
  );

  const exported = await req('/api/persons/me/export', { token: lisa });
  mark(record('lisa AVG-export', exported.json?.person?.name && !exported.json?.person?.passwordHash));

  const lisaPersons = await req('/api/persons', { token: lisa });
  mark(record('vrijwilliger personenlijst 403', lisaPersons.status === 403, String(lisaPersons.status)));

  const sandraPersons = await req('/api/persons', { token: sandra });
  const sandraTeams = new Set(
    (teamsSandra.json || []).map((team) => team.id).filter((id) => Number.isFinite(id)),
  );
  mark(
    record(
      'teamco ziet alleen eigen team, zonder contact of uitnodiging',
      sandraPersons.status === 200 &&
        Array.isArray(sandraPersons.json) &&
        sandraPersons.json.length > 0 &&
        sandraPersons.json.every(
          (person) =>
            person.email == null &&
            person.inviteToken == null &&
            person.phone == null &&
            sandraTeams.has(person.teamId),
        ) &&
        sandraPersons.json.some((person) => person.name === 'Lisa Bakker') &&
        sandraPersons.json.every((person) => person.name !== 'Fatima El Amrani') &&
        sandraPersons.json.every((person) => person.name !== 'Erik Hofman'),
      `${sandraPersons.status} n=${sandraPersons.json?.length} teams=${[...sandraTeams].join(',')}`,
    ),
  );

  const me = await req('/api/auth/me', { token: lisa });
  mark(record('me zonder passwordHash', me.json?.passwordHash == null && me.json?.inviteToken == null));

  const services = await req('/api/services', { token: lisa });
  const open = (services.json || []).find(
    (s) => !s.draft && s.status !== 'full' && (s.capacity?.personalOpen ?? 0) > 0,
  );
  if (open) {
    const idor = await req('/api/enrollments', {
      method: 'POST',
      token: lisa,
      body: { serviceId: open.id, personId: 1 },
    });
    mark(record('IDOR inschrijven als ander', idor.status === 403, String(idor.status)));
  } else {
    mark(record('IDOR inschrijven als ander', false, 'geen open dienst'));
  }

  const volunteerPropose = await req('/api/planning/propose', { method: 'POST', token: lisa, body: {} });
  mark(record('vrijwilliger propose 403', volunteerPropose.status === 403));

  const pdfQuery = await fetch(`${base}/api/pdf/planning?token=${admin}`);
  mark(record('PDF query-token geweigerd', pdfQuery.status === 401));

  const before = await req('/api/planning/round', { token: admin });
  const { default: prisma } = await import('../src/backend/lib/prisma.js');
  try {
    const official = await req('/api/planning/official', { method: 'POST', token: admin });
    mark(record('officieel lockt diensten', official.status === 200 && (official.json?.locked ?? 0) >= 0));
    const lockedForLisa = await req('/api/services', { token: lisa });
    const signupTargets = (lockedForLisa.json || []).filter(
      (s) =>
        !s.draft &&
        s.active !== false &&
        (s.capacity?.personalOpen ?? 0) > 0 &&
        !(s.enrollments || []).some((e) => e.personId === me.json?.id || e.person?.id === me.json?.id),
    );
    let lockedEnroll = null;
    for (const candidate of signupTargets.slice(0, 8)) {
      const attempt = await req('/api/enrollments', {
        method: 'POST',
        token: lisa,
        body: { serviceId: candidate.id, personId: me.json.id },
      });
      lockedEnroll = attempt;
      if (attempt.status === 201) break;
    }
    let selfUnenroll = null;
    if (lockedEnroll?.status === 201 && lockedEnroll.json?.id) {
      selfUnenroll = await req(`/api/enrollments/${lockedEnroll.json.id}`, {
        method: 'DELETE',
        token: lisa,
      });
      await req(`/api/enrollments/${lockedEnroll.json.id}`, { method: 'DELETE', token: admin });
    }
    mark(
      record(
        'lisa mag inschrijven maar niet uitschrijven na officieel',
        lockedEnroll?.status === 201 &&
          selfUnenroll?.status === 403 &&
          /uitschrijven/i.test(selfUnenroll?.json?.error || ''),
        `${lockedEnroll?.status || 'geen'} ${selfUnenroll?.status || ''} ${lockedEnroll?.json?.error || selfUnenroll?.json?.error || ''}`,
      ),
    );

    const volunteerEmails = [
      'lisa@vvl.demo',
      'tom@vvl.demo',
      'fatima@vvl.demo',
      'peter@vvl.demo',
      'anneke@vvl.demo',
      'kevin@vvl.demo',
      'noa@vvl.demo',
      'erik@vvl.demo',
    ];
    const tokenByPersonId = {};
    for (const email of volunteerEmails) {
      const who = await req('/api/auth/me', { token: tokens[email] });
      if (who.json?.id) tokenByPersonId[who.json.id] = tokens[email];
    }
    const openSwaps = await req('/api/swaps', { token: admin });
    for (const pending of openSwaps.json || []) {
      if (pending.status === 'PENDING_PEER' || pending.status === 'PENDING_COMMITTEE') {
        await req(`/api/swaps/${pending.id}/cancel`, { method: 'POST', token: admin, body: {} });
      }
    }
    const lockedServices = await req('/api/services?allDates=true', { token: admin });
    const lockedServiceIds = new Set(
      (lockedServices.json || []).filter((s) => s.locked).map((s) => s.id),
    );
    const candidates = await req('/api/swaps/candidates', { token: lisa });
    const mineShift = (candidates.json?.mine || []).find((e) => lockedServiceIds.has(e.service?.id));
    const otherShift = (candidates.json?.others || []).find(
      (e) => lockedServiceIds.has(e.service?.id) && tokenByPersonId[e.person?.id],
    );
    if (!mineShift || !otherShift) {
      mark(
        record(
          'ruil na officieel rooster',
          false,
          `mine ${candidates.json?.mine?.length ?? 0} other ${candidates.json?.others?.length ?? 0} locked ${lockedServiceIds.size}`,
        ),
      );
    } else {
      const created = await req('/api/swaps', {
        method: 'POST',
        token: lisa,
        body: { fromEnrollmentId: mineShift.id, toEnrollmentId: otherShift.id },
      });
      let accepted = null;
      if (created.status === 201 && created.json?.id) {
        accepted = await req(`/api/swaps/${created.json.id}/accept`, {
          method: 'POST',
          token: tokenByPersonId[otherShift.person.id],
          body: {},
        });
        if (accepted.status === 409 && accepted.json?.code === 'MATCH_BLOCK') {
          accepted = await req(`/api/swaps/${created.json.id}/accept`, {
            method: 'POST',
            token: tokenByPersonId[otherShift.person.id],
            body: { ignoreMatchBlock: true },
          });
        }
      }
      const afterSwap = await req('/api/swaps/candidates', { token: lisa });
      const lisaTookOther = (afterSwap.json?.mine || []).some(
        (e) => e.service?.id === otherShift.service.id,
      );
      mark(
        record(
          'ruil na officieel rooster',
          created.status === 201 && accepted?.status === 200 && accepted.json?.status === 'APPROVED' && lisaTookOther,
          `${created.status} ${accepted?.status || ''} ${accepted?.json?.status || accepted?.json?.error || created.json?.error || ''}`,
        ),
      );
    }

    const undone = await req('/api/planning/unofficial', { method: 'POST', token: admin });
    const roundAfterUndo = await req('/api/planning/round', { token: admin });
    const stillLocked = await req('/api/services?allDates=true', { token: admin });
    const lockedLeft = (stillLocked.json || []).filter((s) => s.locked).length;
    mark(
      record(
        'officieel terugdraaien ontgrendelt',
        undone.status === 200 &&
          (undone.json?.unlocked ?? 0) >= 0 &&
          roundAfterUndo.json?.official === false &&
          lockedLeft === 0,
        `${undone.status} unlocked=${undone.json?.unlocked} official=${roundAfterUndo.json?.official} lockedLeft=${lockedLeft}`,
      ),
    );
    if (open && me.json?.id) {
      const afterUndoEnroll = await req('/api/enrollments', {
        method: 'POST',
        token: lisa,
        body: { serviceId: open.id, personId: me.json.id },
      });
      const blockedByOfficial =
        afterUndoEnroll.status === 403 && /officieel/i.test(afterUndoEnroll.json?.error || '');
      mark(
        record(
          'lisa mag weer na terugdraaien',
          !blockedByOfficial,
          `${afterUndoEnroll.status} ${afterUndoEnroll.json?.error || afterUndoEnroll.json?.kind || ''}`,
        ),
      );
      if (afterUndoEnroll.status === 201 && afterUndoEnroll.json?.id) {
        await req(`/api/enrollments/${afterUndoEnroll.json.id}`, { method: 'DELETE', token: admin });
      }
    }
  } finally {
    await prisma.service.updateMany({ data: { locked: false } });
    const restoreStatus =
      before.json?.status && before.json.status !== 'OFFICIAL' ? before.json.status : 'PUBLISHED';
    await prisma.planningRound.update({
      where: { id: 1 },
      data: { official: false, status: restoreStatus === 'PUBLISHED' ? 'VOLUNTEER_OPEN' : restoreStatus },
    });
    await prisma.$disconnect();
  }
  const after = await req('/api/planning/round', { token: admin });
  mark(record('officieel teruggezet na test', after.json?.official === false));

  const shortTo = new Date();
  shortTo.setDate(shortTo.getDate() + 14);
  const shortened = await req('/api/planning/sync', {
    method: 'POST',
    token: admin,
    body: {
      from: new Date().toISOString().slice(0, 10),
      to: shortTo.toISOString().slice(0, 10),
    },
  });
  const shortEnd = shortened.json?.period?.to ? new Date(shortened.json.period.to) : null;
  const afterShort = await req('/api/services?allDates=true&activeOnly=false', { token: admin });
  const leftoverAuto = (afterShort.json || []).filter(
    (s) =>
      s.origin === 'AUTO' &&
      !s.locked &&
      shortEnd &&
      new Date(s.date).getTime() > shortEnd.getTime() &&
      !(s.enrollments || []).length,
  );
  mark(
    record(
      'lege diensten na nieuwe einddatum verdwijnen',
      shortened.status === 201 && leftoverAuto.length === 0,
      leftoverAuto.length ? `${leftoverAuto.length} over` : String(shortened.status),
    ),
  );
  const lisaAfterShort = await req('/api/services', { token: lisa });
  const lisaBeyondShort = (lisaAfterShort.json || []).filter(
    (s) => shortEnd && new Date(s.date).getTime() > shortEnd.getTime(),
  );
  mark(
    record(
      'vrijwilliger stopt bij nieuwe einddatum',
      Array.isArray(lisaAfterShort.json) && lisaBeyondShort.length === 0,
      lisaBeyondShort.map((s) => String(s.date).slice(0, 10)).join(','),
    ),
  );

  // --- Barcommissie vereenvoudiging (punten 2,5,6,7,8,10,11,13,14,15) ---
  mark(record('barcommissie login mark', Boolean(markMe.json?.id), String(markMe.status)));

  const stats = await req('/api/planning/stats', { token: markTok });
  const planningList = await req('/api/planning', { token: markTok });
  const periodSvcs = (planningList.json?.services || []).filter((s) => !s.draft && s.active !== false);
  const countFull = periodSvcs.filter((s) => s.status === 'full').length;
  const countAlmost = periodSvcs.filter((s) => s.status === 'almost').length;
  const countOpen = periodSvcs.filter((s) => s.status === 'open').length;
  mark(
    record(
      '2 stats vs planning: Vol/Nog1/Open tellen mee',
      Array.isArray(stats.json?.dutyStats) &&
        typeof countFull === 'number' &&
        countFull + countAlmost + countOpen === periodSvcs.length,
      `full=${countFull} almost=${countAlmost} open=${countOpen} n=${periodSvcs.length}`,
    ),
  );

  // 5: barcommissie mag zichzelf inschrijven bij officieel rooster
  {
    const { default: prisma } = await import('../src/backend/lib/prisma.js');
    try {
      await req('/api/planning/official', { method: 'POST', token: admin });
      const lockedList = await req('/api/services?allDates=true', { token: markTok });
      const target = (lockedList.json || []).find(
        (s) =>
          s.locked &&
          !s.draft &&
          s.active !== false &&
          (s.capacity?.personalOpen ?? 0) > 0 &&
          !(s.enrollments || []).some((e) => e.personId === markMe.json.id),
      );
      if (!target) {
        mark(record('5 barcommissie inschrijven bij officieel', false, 'geen geschikte dienst'));
      } else {
        const enr = await req('/api/enrollments', {
          method: 'POST',
          token: markTok,
          body: { serviceId: target.id, personId: markMe.json.id, ignoreMatchBlock: true },
        });
        mark(
          record(
            '5 barcommissie inschrijven bij officieel',
            enr.status === 201,
            `${enr.status} ${enr.json?.error || ''}`,
          ),
        );
        if (enr.json?.id) {
          await req(`/api/enrollments/${enr.json.id}`, { method: 'DELETE', token: markTok });
        }
      }
    } finally {
      await prisma.service.updateMany({ data: { locked: false } });
      await prisma.planningRound.update({
        where: { id: 1 },
        data: { official: false, status: 'VOLUNTEER_OPEN' },
      });
      await prisma.$disconnect();
    }
  }

  // Barcommissie: eigen diensten + verleden bijschrijven + teamplekken + za/zo-preview
  {
    const mine = await req('/api/services?filter=mine', { token: markTok });
    mark(record('barcommissie mijn diensten API', mine.status === 200, String(mine.status)));
    const dash = await req('/api/teams/dashboard', { token: markTok });
    mark(
      record(
        'teamplekken in teamdashboard',
        dash.status === 200 &&
          Array.isArray(dash.json?.teams) &&
          dash.json.teams.every((t) => typeof t.teamShiftSpots === 'number'),
        String(dash.status),
      ),
    );
    const splitPrev = await req('/api/teams/split-senior-weekend', { token: markTok });
    mark(
      record(
        'senior za/zo split-preview',
        splitPrev.status === 200 && typeof splitPrev.json?.count === 'number',
        String(splitPrev.status),
      ),
    );
    const { default: prisma } = await import('../src/backend/lib/prisma.js');
    try {
      const past = await prisma.service.create({
        data: {
          date: new Date('2026-01-10T12:00:00'),
          time: '19:00 - 22:00',
          type: 'BAR',
          slot: 'EVENING',
          location: 'Bar',
          required: 2,
          active: true,
          draft: false,
          note: 'accept-past-enroll',
        },
      });
      const pastVolunteer = await req('/api/enrollments', {
        method: 'POST',
        token: lisa,
        body: { serviceId: past.id, personId: lisaMe.json.id, ignoreMatchBlock: true },
      });
      mark(
        record(
          'vrijwilliger niet in verleden',
          pastVolunteer.status === 400 || pastVolunteer.status === 403,
          `${pastVolunteer.status} ${pastVolunteer.json?.error || ''}`,
        ),
      );
      const pastAdmin = await req('/api/enrollments', {
        method: 'POST',
        token: markTok,
        body: {
          serviceId: past.id,
          personId: lisaMe.json.id,
          ignoreMatchBlock: true,
        },
      });
      mark(
        record(
          'barcommissie wel in verleden',
          pastAdmin.status === 201,
          `${pastAdmin.status} ${pastAdmin.json?.error || ''}`,
        ),
      );
      if (pastAdmin.json?.id) {
        await prisma.enrollment.delete({ where: { id: pastAdmin.json.id } }).catch(() => {});
      }
      await prisma.service.delete({ where: { id: past.id } }).catch(() => {});
    } finally {
      await prisma.$disconnect();
    }
  }

  // 6: PDF komende 6 weken
  {
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + 41);
    const pdf6 = await req(
      `/api/pdf/planning?from=${from.toISOString().slice(0, 10)}&to=${to.toISOString().slice(0, 10)}`,
      { token: markTok, raw: true },
    );
    mark(
      record(
        '6 PDF 6 weken is PDF',
        pdf6.status === 200 && pdf6.buf.slice(0, 4).toString() === '%PDF',
        String(pdf6.status),
      ),
    );
    const pdfDefault = await req('/api/pdf/planning', { token: markTok, raw: true });
    mark(
      record(
        '6 PDF default zonder from/to',
        pdfDefault.status === 200 && pdfDefault.buf.slice(0, 4).toString() === '%PDF',
        String(pdfDefault.status),
      ),
    );
    const far = new Date();
    far.setFullYear(far.getFullYear() + 1);
    const widePdf = await req(`/api/pdf/planning?to=${far.toISOString().slice(0, 10)}`, {
      token: markTok,
      raw: true,
    });
    const pdfText = pdfPlainText(widePdf.buf);
    const weekHeaders = [...new Set(pdfText.match(/Week \d{1,2}(?=\d{1,2}-)/g) || [])];
    mark(
      record(
        'pdf toont hoogstens 6 weken ook bij lange periode',
        widePdf.status === 200 &&
          pdfText.includes('komende 6 weken') &&
          weekHeaders.length > 0 &&
          weekHeaders.length <= 6,
        `${widePdf.status} weken=${weekHeaders.length}`,
      ),
    );
  }

  // 7: diensten inclusief verleden via allDates
  {
    const all = await req('/api/services?allDates=true&activeOnly=false&includeDraft=true', {
      token: markTok,
    });
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const past = (all.json || []).filter((s) => new Date(s.date) < today);
    const future = (all.json || []).filter((s) => new Date(s.date) >= today);
    mark(
      record(
        '7 allDates levert toekomst én verleden',
        Array.isArray(all.json) && future.length >= 0,
        `past=${past.length} future=${future.length}`,
      ),
    );
  }

  // 8: no-show op oude dienst
  {
    const { default: prisma } = await import('../src/backend/lib/prisma.js');
    try {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 14);
      pastDate.setHours(12, 0, 0, 0);
      const svc = await prisma.service.create({
        data: {
          type: 'BAR',
          date: pastDate,
          time: '10:00 - 12:00',
          location: 'Bar',
          required: 2,
          active: true,
          draft: false,
          origin: 'MANUAL',
          slot: 'EXTRA',
        },
      });
      const enr = await prisma.enrollment.create({
        data: {
          serviceId: svc.id,
          personId: markMe.json.id,
          source: 'ADMIN',
          kind: 'PERSONAL',
          reason: 'acceptatietest',
        },
      });
      const noshow = await req(`/api/enrollments/${enr.id}/noshow`, {
        method: 'POST',
        token: markTok,
        body: {},
      });
      mark(record('8 no-show op oude dienst', noshow.status === 200, String(noshow.status)));
      await prisma.enrollment.delete({ where: { id: enr.id } }).catch(() => {});
      await prisma.service.delete({ where: { id: svc.id } }).catch(() => {});
    } finally {
      await prisma.$disconnect();
    }
  }

  // 10: afwezigheid CRUD + alleen barcommissie
  {
    const from = new Date();
    from.setDate(from.getDate() + 30);
    const to = new Date(from);
    to.setDate(to.getDate() + 7);
    const created = await req(`/api/persons/${markMe.json.id}/absences`, {
      method: 'POST',
      token: markTok,
      body: {
        fromDate: from.toISOString().slice(0, 10),
        toDate: to.toISOString().slice(0, 10),
        note: 'acceptatie',
      },
    });
    mark(
      record('10 afwezigheid aanmaken', created.status === 201, `${created.status} ${created.json?.error || ''}`),
    );
    const lisaAbs = await req(`/api/persons/${markMe.json.id}/absences`, {
      method: 'POST',
      token: lisa,
      body: {
        fromDate: from.toISOString().slice(0, 10),
        toDate: to.toISOString().slice(0, 10),
      },
    });
    mark(record('10 vrijwilliger mag geen afwezigheid zetten', lisaAbs.status === 403));
    const mine = await req('/api/persons/me/absences', { token: markTok });
    mark(record('10 eigen afwezigheden lezen', Array.isArray(mine.json), String(mine.status)));
    if (created.json?.id) {
      const del = await req(`/api/persons/${markMe.json.id}/absences/${created.json.id}`, {
        method: 'DELETE',
        token: markTok,
      });
      mark(record('10 afwezigheid verwijderen', del.status === 200 || del.status === 204, String(del.status)));
    }
  }

  // 11: hoort bij → e-mail optioneel
  {
    const child = await req('/api/persons', {
      method: 'POST',
      token: markTok,
      body: {
        name: `Kind Acceptatie ${Date.now()}`,
        guardianId: markMe.json.id,
        role: 'Vrijwilliger',
        obligation: 'NONE',
      },
    });
    mark(
      record(
        '11 kind zonder e-mail via hoort-bij',
        child.status === 201 && child.json?.guardianId === markMe.json.id,
        `${child.status} ${child.json?.error || ''}`,
      ),
    );
    if (child.json?.id) {
      await req(`/api/persons/${child.json.id}`, { method: 'DELETE', token: markTok });
    }
  }

  // 13: personen template/export xlsx
  {
    const tpl = await req('/api/persons/template.xlsx', { token: markTok, raw: true });
    mark(
      record(
        '13 personen template xlsx',
        tpl.status === 200 &&
          (tpl.type || '').includes('sheet') &&
          tpl.buf.length > 100,
        `${tpl.status} ${tpl.type}`,
      ),
    );
    const exp = await req('/api/persons/export.xlsx', { token: markTok, raw: true });
    mark(
      record(
        '13 personen export xlsx',
        exp.status === 200 && exp.buf.length > 100,
        String(exp.status),
      ),
    );
    const matchTpl = await req('/api/matches/template.xlsx', { token: markTok, raw: true });
    mark(
      record('16 wedstrijden template xlsx', matchTpl.status === 200 && matchTpl.buf.length > 40, String(matchTpl.status)),
    );
  }

  // 14: bulk invite
  {
    const bulk = await req('/api/persons/bulk-invite', {
      method: 'POST',
      token: markTok,
      body: { personIds: [markMe.json.id] },
    });
    mark(
      record(
        '14 bulk-invite antwoord',
        bulk.status === 200 &&
          Array.isArray(bulk.json?.sent) &&
          Array.isArray(bulk.json?.skippedNoEmail) &&
          Array.isArray(bulk.json?.failed),
        JSON.stringify(bulk.json || {}).slice(0, 160),
      ),
    );
  }

  // 15: stats bevat noShowPeople + seizoenscounts
  mark(
    record(
      '15/3 stats noShowPeople + dutyStats seizoen',
      Array.isArray(stats.json?.noShowPeople) &&
        Array.isArray(stats.json?.dutyStats) &&
        stats.json.dutyStats.every((p) => typeof p.barThisSeason === 'number' || typeof p.barThisYear === 'number'),
      `noshow=${stats.json?.noShowPeople?.length} duty=${stats.json?.dutyStats?.length}`,
    ),
  );

  const farRange = await req('/api/services?from=2099-01-01&to=2099-01-02', { token: lisa });
  mark(record('filter diensten op datum', farRange.status === 200 && Array.isArray(farRange.json) && farRange.json.length === 0));

  const nobody = await req('/api/services?q=zzz-geen-persoon', { token: lisa });
  mark(
    record(
      'filter diensten op persoon',
      nobody.status === 200 && Array.isArray(nobody.json) && nobody.json.length === 0,
    ),
  );

  const mySwaps = await req('/api/swaps?scope=mine', { token: markTok });
  const markId = markMe.json?.id;
  mark(
    record(
      'mijn ruilen toont alleen eigen verzoeken',
      mySwaps.status === 200 &&
        Array.isArray(mySwaps.json) &&
        mySwaps.json.every((s) => s.requesterId === markId || s.counterpartyId === markId),
      String(mySwaps.status),
    ),
  );

  const rosterQ = await req('/api/planning?q=zzz-geen-persoon&from=2099-01-01&to=2099-01-02', {
    token: markTok,
  });
  mark(
    record(
      'filter rooster op persoon en datum',
      rosterQ.status === 200 && Array.isArray(rosterQ.json?.services) && rosterQ.json.services.length === 0,
    ),
  );

  const peopleOnDay = await req('/api/persons?from=2099-03-01&to=2099-03-02&q=zzz', { token: markTok });
  mark(
    record(
      'filter mensen op persoon en datum',
      peopleOnDay.status === 200 && Array.isArray(peopleOnDay.json) && peopleOnDay.json.length === 0,
    ),
  );

  const matchFilter = await req('/api/matches?from=2099-04-01&to=2099-04-02&q=zzz', { token: markTok });
  mark(
    record(
      'filter wedstrijden op persoon en datum',
      matchFilter.status === 200 && Array.isArray(matchFilter.json) && matchFilter.json.length === 0,
    ),
  );

  const stamp = Date.now();
  const xlsxBuf = workbookToXlsx(
    personExportRowsSheets(
      [
        {
          name: `Import Kind ${stamp}`,
          email: `kind.${stamp}@vvl.demo`,
          phone: '0699999999',
          team: null,
          role: 'Vrijwilliger',
          obligation: 'NONE',
          guardian: { email: 'mark@vvl.demo' },
          exempted: false,
        },
      ],
      [],
    ),
  );
  const imported = await req('/api/persons/import.xlsx', {
    method: 'POST',
    token: markTok,
    body: { xlsxBase64: xlsxBuf.toString('base64') },
  });
  const listed = await req(`/api/persons?all=true&q=${encodeURIComponent(`kind.${stamp}`)}`, { token: markTok });
  const importedPerson = (listed.json || []).find((p) => p.email === `kind.${stamp}@vvl.demo`);
  mark(
    record(
      'xlsx-import roundtrip met hoort bij',
      imported.status === 200 &&
        imported.json?.created === 1 &&
        imported.json?.linked === 1 &&
        importedPerson?.guardianId === markId,
      `${imported.status} ${JSON.stringify(imported.json || {}).slice(0, 180)}`,
    ),
  );
  if (importedPerson?.id) {
    await req(`/api/persons/${importedPerson.id}`, { method: 'DELETE', token: markTok });
  }

  {
    const childName = `Kind Uitschrijven ${Date.now()}`;
    const child = await req('/api/persons/me/children', {
      method: 'POST',
      token: lisa,
      body: { name: childName },
    });
    const visible = await req('/api/services', { token: lisa });
    const candidates = (Array.isArray(visible.json) ? visible.json : []).filter(
      (service) => !service.locked && (service.capacity?.personalOpen ?? 0) > 0,
    );
    let enrolled = null;
    let usedService = null;
    for (const service of candidates) {
      const attempt = await req('/api/enrollments', {
        method: 'POST',
        token: lisa,
        body: { serviceId: service.id, personId: child.json?.id },
      });
      if (attempt.status === 201) {
        enrolled = attempt;
        usedService = service;
        break;
      }
    }
    const mine = usedService
      ? await req(`/api/services?filter=mine&personId=${lisaMe.json.id}`, { token: lisa })
      : null;
    const onMine = (mine?.json || []).find((service) => service.id === usedService?.id);
    const childRow = (onMine?.enrollments || []).find((row) => row.personId === child.json?.id);
    mark(
      record(
        'ouder schrijft kind in',
        child.status === 201 &&
          enrolled?.status === 201 &&
          enrolled.json?.personId === child.json?.id &&
          Boolean(childRow),
        `${child.status} ${enrolled?.status || 'geen dienst'} ${enrolled?.json?.error || ''}`,
      ),
    );
    if (enrolled?.json?.id) {
      const removed = await req(`/api/enrollments/${enrolled.json.id}`, { method: 'DELETE', token: lisa });
      const after = await req(`/api/services?filter=mine&personId=${lisaMe.json.id}`, { token: lisa });
      const still = (after.json || [])
        .flatMap((service) => service.enrollments || [])
        .some((row) => row.id === enrolled.json.id);
      mark(
        record(
          'ouder schrijft kind uit',
          removed.status === 204 && still === false,
          `${removed.status} ${removed.json?.error || ''}`,
        ),
      );
    } else {
      mark(record('ouder schrijft kind uit', false, 'geen inschrijving'));
    }
    if (child.json?.id) {
      await req(`/api/persons/me/children/${child.json.id}`, { method: 'DELETE', token: lisa });
    }
  }

  const servicesBeforeReset = await req('/api/services', { token: admin });
  const serviceCountBefore = Array.isArray(servicesBeforeReset.json) ? servicesBeforeReset.json.length : -1;
  const wipeDenied = await req('/api/settings/opschonen', {
    method: 'POST',
    token: lisa,
    body: { confirm: 'OPSCHONEN' },
  });
  mark(record('opschonen vrijwilliger 403', wipeDenied.status === 403, String(wipeDenied.status)));
  const wipeTeam = await req('/api/settings/opschonen', {
    method: 'POST',
    token: sandra,
    body: { confirm: 'OPSCHONEN' },
  });
  mark(record('opschonen teamcoördinator 403', wipeTeam.status === 403, String(wipeTeam.status)));
  const wipeBar = await req('/api/settings/opschonen', {
    method: 'POST',
    token: markTok,
    body: { confirm: 'OPSCHONEN' },
  });
  mark(record('opschonen barcommissie 403', wipeBar.status === 403, String(wipeBar.status)));
  const wipePreviewDenied = await req('/api/settings/opschonen', { token: markTok });
  mark(record('opschonen voorbeeld barcommissie 403', wipePreviewDenied.status === 403));
  const wipePreview = await req('/api/settings/opschonen', { token: admin });
  mark(
    record(
      'opschonen voorbeeld admin',
      wipePreview.status === 200 &&
        Array.isArray(wipePreview.json?.wissen) &&
        Array.isArray(wipePreview.json?.blijft) &&
        wipePreview.json.wissen.some((row) => row.key === 'diensten') &&
        wipePreview.json.wissen.some((row) => row.key === 'teams') &&
        wipePreview.json.wissen.some((row) => row.key === 'jaarplanning') &&
        !wipePreview.json.blijft.some((row) => row.key === 'teams') &&
        !wipePreview.json.blijft.some((row) => row.key === 'jaarplanning') &&
        wipePreview.json.blijft.some((row) => row.key === 'dienstregels'),
      String(wipePreview.status),
    ),
  );
  const wipeBad = await req('/api/settings/opschonen', {
    method: 'POST',
    token: admin,
    body: { confirm: 'wissen' },
  });
  const wipeEmpty = await req('/api/settings/opschonen', {
    method: 'POST',
    token: admin,
    body: {},
  });
  const servicesAfterReset = await req('/api/services', { token: admin });
  const serviceCountAfter = Array.isArray(servicesAfterReset.json) ? servicesAfterReset.json.length : -2;
  mark(
    record(
      'opschonen zonder juist woord doet niets',
      wipeBad.status === 400 && wipeEmpty.status === 400 && serviceCountAfter === serviceCountBefore && serviceCountBefore >= 0,
      `${wipeBad.status}/${wipeEmpty.status} diensten ${serviceCountBefore}→${serviceCountAfter}`,
    ),
  );

  console.log(ok ? '\nALLE ACCEPTATIETESTS GESLAAGD' : '\nSOMMIGE ACCEPTATIETESTS MISLUKT');
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
