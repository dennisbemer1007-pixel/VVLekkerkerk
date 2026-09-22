/**
 * Acceptatie + regressie (draaiende app nodig).
 * Run: npm run test:accept
 * Base: http://localhost:5173 (Vite-proxy) of ACCEPT_BASE=http://localhost:3001
 */
const base = (process.argv[2] || process.env.ACCEPT_BASE || 'http://localhost:5173').replace(
  /\/$/,
  '',
);

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
      'admin geen vrijwilliger-tabs',
      adminMe.json?.access?.can?.includes('beheer') === true &&
        adminMe.json?.access?.can?.includes('inschrijven') === false &&
        adminMe.json?.access?.can?.includes('ruilen') === false &&
        adminMe.json?.access?.can?.includes('voorkeuren') === false,
    ),
  );

  const markMe = await req('/api/auth/me', { token: markTok });
  mark(
    record(
      'barcommissie geen vrijwilliger-tabs',
      markMe.json?.access?.can?.includes('beheer') === true &&
        markMe.json?.access?.can?.includes('inschrijven') === false &&
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
    const parent = await req(`/api/teams/${jo15.id}/parents`, {
      method: 'POST',
      token: sandra,
      body: { name: 'Test Ouder Cheryl' },
    });
    mark(
      record(
        'coordinator ouder op naam',
        parent.status === 201 && parent.json?.name === 'Test Ouder Cheryl' && parent.json?.hasAccount === false,
        String(parent.status),
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
    if (open) {
      const lockedEnroll = await req('/api/enrollments', {
        method: 'POST',
        token: lisa,
        body: { serviceId: open.id, personId: me.json.id },
      });
      mark(
        record(
          'lisa geblokkeerd na officieel',
          lockedEnroll.status === 403,
          String(lockedEnroll.status),
        ),
      );
    }
  } finally {
    await prisma.service.updateMany({ data: { locked: false } });
    const restoreStatus =
      before.json?.status && before.json.status !== 'OFFICIAL' ? before.json.status : 'PUBLISHED';
    await prisma.planningRound.update({
      where: { id: 1 },
      data: { official: false, status: restoreStatus },
    });
    await prisma.$disconnect();
  }
  const after = await req('/api/planning/round', { token: admin });
  mark(record('officieel teruggezet na test', after.json?.official === false));

  console.log(ok ? '\nALLE ACCEPTATIETESTS GESLAAGD' : '\nSOMMIGE ACCEPTATIETESTS MISLUKT');
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
