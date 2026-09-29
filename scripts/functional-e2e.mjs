/**
 * Functionele E2E-check over alle rollen (API + basis UI-pagina's).
 * Vereist: draaiende app met SEED_DEMO=true en demo-accounts.
 * Run: node scripts/functional-e2e.mjs
 * Raakt géén Render/live clubdatabase.
 */
import puppeteer from 'puppeteer-core';

const base = (process.env.ACCEPT_BASE || 'http://127.0.0.1:5173').replace(/\/$/, '');
const api = process.env.API_BASE || 'http://127.0.0.1:3001';
let pass = 0;
let fail = 0;
const findings = [];

function ok(name, cond, detail = '') {
  if (cond) {
    pass += 1;
    console.log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    fail += 1;
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
    findings.push(`${name}${detail ? `: ${detail}` : ''}`);
  }
}

async function req(path, { method = 'GET', token, body, raw = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${api}${path}`, {
    method,
    headers,
    body: body == null ? undefined : JSON.stringify(body),
  });
  const buf = Buffer.from(await res.arrayBuffer());
  if (raw) return { status: res.status, buf, type: res.headers.get('content-type') };
  let json = null;
  try {
    json = buf.length ? JSON.parse(buf.toString('utf8')) : null;
  } catch {
    json = buf.toString('utf8').slice(0, 200);
  }
  return { status: res.status, json };
}

async function login(email, password) {
  const r = await req('/api/auth/login', { method: 'POST', body: { email, password } });
  return r;
}

async function pageCheck(browser, { email, password, path, expectText = [], forbidText = [], width = 1280 }) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width, height: width === 375 ? 812 : 900, isMobile: width <= 500, hasTouch: width <= 500 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  const failed = [];
  page.on('response', (res) => {
    if (res.url().includes('/api/') && res.status() >= 400 && res.status() !== 401 && res.status() !== 403) {
      failed.push(`${res.status()} ${res.url()}`);
    }
  });
  await page.goto(`${base}/login`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('input[type="email"], input[name="email"], input[type="password"]');
  const emailSel = (await page.$('input[type="email"]'))
    ? 'input[type="email"]'
    : (await page.$('input[name="email"]'))
      ? 'input[name="email"]'
      : 'form input:not([type="password"]):not([type="hidden"])';
  await page.click(emailSel, { clickCount: 3 });
  await page.type(emailSel, email, { delay: 5 });
  await page.click('input[type="password"]', { clickCount: 3 });
  await page.type('input[type="password"]', password, { delay: 5 });
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 400));
  const body = await page.evaluate(() => document.body?.innerText || '');
  for (const t of expectText) {
    ok(`UI ${email} ${width}px ${path} bevat "${t}"`, body.toLowerCase().includes(t.toLowerCase()));
  }
  for (const t of forbidText) {
    ok(`UI ${email} ${width}px ${path} zonder "${t}"`, !body.toLowerCase().includes(t.toLowerCase()), body.includes(t) ? 'nog aanwezig' : '');
  }
  ok(`UI ${email} ${width}px ${path} geen page errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
  ok(
    `UI ${email} ${width}px ${path} geen onverwachte 5xx`,
    failed.filter((f) => f.startsWith('5')).length === 0,
    failed.slice(0, 3).join(' | '),
  );
  await context.close();
  return { body, errors, failed };
}

async function main() {
  console.log('Functional E2E base=', base, 'api=', api);

  const health = await req('/api/health');
  ok('health', health.status === 200 && health.json?.ok && health.json?.db);

  const demo = await req('/api/auth/demo-accounts');
  ok('demo-accounts aan voor lokale test', demo.json?.enabled === true);

  const roles = {
    admin: await login('admin@vvl.local', 'admin123'),
    mark: await login('mark@vvl.demo', 'demo123'),
    sandra: await login('sandra@vvl.demo', 'demo123'),
    lisa: await login('lisa@vvl.demo', 'demo123'),
  };
  for (const [k, r] of Object.entries(roles)) {
    ok(`login ${k}`, Boolean(r.json?.token), String(r.status));
  }
  const admin = roles.admin.json.token;
  const mark = roles.mark.json.token;
  const sandra = roles.sandra.json.token;
  const lisa = roles.lisa.json.token;

  // Invite + activation
  const stamp = Date.now();
  const inviteEmail = `e2e.invite.${stamp}@vvl.demo`;
  const invite = await req('/api/auth/invite', {
    method: 'POST',
    token: mark,
    body: { name: `E2E Invite ${stamp}`, email: inviteEmail, role: 'Vrijwilliger', appUrl: base },
  });
  ok('uitnodiging aanmaken', invite.status === 201 && Boolean(invite.json?.inviteLink), String(invite.status));
  ok('uitnodigingslink altijd terug', Boolean(invite.json?.inviteLink));
  const tokenMatch = String(invite.json?.inviteLink || '').match(/uitnodiging\/([^/?#]+)/);
  const inviteTok = tokenMatch?.[1];
  ok('invite token in link', Boolean(inviteTok));
  if (inviteTok) {
    const accept = await req(`/api/auth/invite/${inviteTok}/accept`, {
      method: 'POST',
      body: { password: 'demo12345', name: `E2E Invite ${stamp}` },
    });
    ok('account activeren via link', accept.status === 201 && Boolean(accept.json?.token), String(accept.status));
  }

  // Password reset
  const forgot = await req('/api/auth/forgot-password', {
    method: 'POST',
    body: { email: 'lisa@vvl.demo', appUrl: base },
  });
  ok('wachtwoord vergeten (altijd ok-bericht)', forgot.status === 200, String(forgot.status));

  // Volunteer enroll / unenroll
  const openSvc = await req('/api/services?filter=open', { token: lisa });
  const openList = Array.isArray(openSvc.json) ? openSvc.json : [];
  const pick = openList.find((s) => !s.locked && (s.capacity?.personalOpen ?? 0) > 0);
  ok('vrijwilliger ziet open diensten', openList.length > 0, String(openList.length));
  if (pick) {
    const lisaMe = await req('/api/auth/me', { token: lisa });
    const en = await req('/api/enrollments', {
      method: 'POST',
      token: lisa,
      body: { serviceId: pick.id }, // personId mag ontbreken → zelf
    });
    ok(
      'vrijwilliger inschrijven (zonder personId = zelf)',
      en.status === 201 && en.json?.personId === lisaMe.json?.id,
      String(en.status) + ' ' + (en.json?.error || ''),
    );
    if (en.json?.id) {
      const out = await req(`/api/enrollments/${en.json.id}`, { method: 'DELETE', token: lisa });
      ok('vrijwilliger uitschrijven', out.status === 204, String(out.status));
    }
  }

  // Parent + child
  const child = await req('/api/persons/me/children', {
    method: 'POST',
    token: lisa,
    body: { name: `E2E Kind ${stamp}` },
  });
  ok('ouder voegt kind toe', child.status === 201, String(child.status));
  if (child.json?.id && pick) {
    const again = openList.find((s) => s.id !== pick.id && !s.locked && (s.capacity?.personalOpen ?? 0) > 0) || pick;
    const enChild = await req('/api/enrollments', {
      method: 'POST',
      token: lisa,
      body: { serviceId: again.id, personId: child.json.id },
    });
    ok('ouder schrijft kind in', enChild.status === 201, String(enChild.status) + ' ' + (enChild.json?.error || ''));
    if (enChild.json?.id) {
      const del = await req(`/api/enrollments/${enChild.json.id}`, { method: 'DELETE', token: lisa });
      ok('ouder schrijft kind uit', del.status === 204, String(del.status));
    }
    await req(`/api/persons/me/children/${child.json.id}`, { method: 'DELETE', token: lisa });
  }

  // Swap + bell
  const candidates = await req('/api/swaps/candidates', { token: lisa });
  ok('ruilkandidaten', candidates.status === 200);
  const notifs = await req('/api/notifications', { token: lisa });
  ok(
    'notificatiebel',
    notifs.status === 200 && Array.isArray(notifs.json?.items) && typeof notifs.json?.unreadCount === 'number',
    String(notifs.status),
  );

  // Teamco fills team spot
  const dash = await req('/api/teams/dashboard', { token: sandra });
  ok('teamco dashboard', dash.status === 200 && Array.isArray(dash.json?.teams));

  // Barcommissie assign
  const planning = await req('/api/planning?filter=week', { token: mark });
  ok('barcommissie open/week planning', planning.status === 200);
  const people = await req('/api/persons?all=true', { token: mark });
  ok('mensenlijst + inviteToken voor pending', people.status === 200);
  const pending = (people.json || []).filter((p) => p.invitePending);
  if (pending.length) {
    ok('pending heeft inviteToken', pending.every((p) => p.inviteToken));
  } else {
    ok('geen pending (ok na activatie)', true);
  }

  // Extra dienst + custom time
  const day = new Date();
  day.setDate(day.getDate() + 21);
  const extra = await req('/api/services', {
    method: 'POST',
    token: mark,
    body: {
      date: day.toISOString().slice(0, 10),
      time: '13:15 - 15:45',
      required: 2,
      type: 'BAR',
      note: 'E2E extra',
    },
  });
  ok('extra dienst met eigen tijd', extra.status === 201, String(extra.status));

  // PDF 6 weken
  const pdf = await req('/api/pdf/planning', { token: mark, raw: true });
  ok('PDF rooster', pdf.status === 200 && pdf.buf.slice(0, 4).toString() === '%PDF');

  // Wedstrijden / regels / activiteiten / mail preview
  ok('wedstrijden', (await req('/api/matches', { token: mark })).status === 200);
  ok('dienstregels', (await req('/api/service-rules', { token: mark })).status === 200);
  ok('jaarplanning', (await req('/api/activities', { token: mark })).status === 200);
  ok('teams', (await req('/api/teams', { token: mark })).status === 200);
  const mailTpl = await req('/api/settings/mail', { token: mark });
  ok('e-mailinstellingen', mailTpl.status === 200, String(mailTpl.status));

  // Admin instellingen + opschonen preview (geen echte wipe hier)
  const wipePreview = await req('/api/settings/opschonen', { token: admin });
  ok('admin opschonen-voorbeeld', wipePreview.status === 200 && Array.isArray(wipePreview.json?.wissen));
  const club = await req('/api/settings/club', { token: admin });
  ok('clubinstellingen', club.status === 200);

  // UI walkthrough desktop + mobile
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: '/usr/local/bin/google-chrome',
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const leftover = [
      'Eerst het overzicht',
      'Dit zijn vrijwilligers',
      'Wie schrijf je in',
      'meer kolommen',
      'excel downloaden',
      'json downloaden',
    ];
    await pageCheck(browser, {
      email: 'lisa@vvl.demo',
      password: 'demo123',
      path: '/diensten',
      width: 375,
      expectText: ['Inschrijven'],
      forbidText: leftover,
    });
    await pageCheck(browser, {
      email: 'lisa@vvl.demo',
      password: 'demo123',
      path: '/ik',
      width: 375,
      expectText: ['Wachtwoord'],
      forbidText: ['excel downloaden', 'privacy'],
    });
    await pageCheck(browser, {
      email: 'sandra@vvl.demo',
      password: 'demo123',
      path: '/team',
      width: 1280,
      expectText: ['Team'],
      forbidText: leftover,
    });
    await pageCheck(browser, {
      email: 'mark@vvl.demo',
      password: 'demo123',
      path: '/open',
      width: 375,
      expectText: ['Open'],
      forbidText: ['Eerst het overzicht', 'Dit zijn vrijwilligers'],
    });
    await pageCheck(browser, {
      email: 'mark@vvl.demo',
      password: 'demo123',
      path: '/mensen',
      width: 375,
      expectText: ['Persoon toevoegen'],
      forbidText: ['meer kolommen', 'Personen beheren en een planning'],
    });
    await pageCheck(browser, {
      email: 'mark@vvl.demo',
      password: 'demo123',
      path: '/meer',
      width: 375,
      expectText: ['Aandacht', 'Club'],
      forbidText: ['Mijn gegevens', 'Personen beheren'],
    });
    await pageCheck(browser, {
      email: 'admin@vvl.local',
      password: 'admin123',
      path: '/instellingen',
      width: 1280,
      expectText: ['Instellingen'],
      forbidText: leftover,
    });
  } catch (e) {
    ok('puppeteer UI suite', false, e.message);
  } finally {
    await browser?.close().catch(() => {});
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (findings.length) {
    console.log('Findings:');
    for (const f of findings) console.log('-', f);
  }
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
