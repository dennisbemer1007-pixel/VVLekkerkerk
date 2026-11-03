/**
 * Echte screenshots uit de lokale seeded demo (geen live clubdata).
 * Vrijwilliger: 390×844. Teamcoördinator: 390 + 1440. Barcommissie: 1440.
 *
 * Run vanuit de repo-root:
 *   node docs/werkbeschrijving/capture-shots.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const shotDir = path.join(__dirname, 'shots');
const base = (process.env.ACCEPT_BASE || 'http://127.0.0.1:5173').replace(/\/$/, '');
const api = process.env.API_BASE || 'http://127.0.0.1:3001';

fs.mkdirSync(shotDir, { recursive: true });

async function req(pathname, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${api}${pathname}`, {
    method,
    headers,
    body: body == null ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function loginApi(email, password) {
  const r = await req('/api/auth/login', { method: 'POST', body: { email, password } });
  if (!r.json?.token) throw new Error(`login ${email} ${r.status} ${r.json?.error || ''}`);
  return r.json;
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function loginPage(page, email, password) {
  await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto(`${base}/login`, { waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {});
  await page.waitForSelector('input[type="password"]', { timeout: 25000 });
  const emailSel = (await page.$('input[type="email"]'))
    ? 'input[type="email"]'
    : 'form input:not([type="password"]):not([type="hidden"])';
  await page.click(emailSel, { clickCount: 3 });
  await page.type(emailSel, email, { delay: 4 });
  await page.click('input[type="password"]', { clickCount: 3 });
  await page.type('input[type="password"]', password, { delay: 4 });
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 20000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);
  await sleep(600);
}

async function goto(page, pathname) {
  await page.goto(`${base}${pathname}`, { waitUntil: 'networkidle0', timeout: 30000 }).catch(async () => {
    await page.goto(`${base}${pathname}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  });
  await sleep(700);
}

async function shot(page, name, { fullPage = false } = {}) {
  const file = path.join(shotDir, `${name}.png`);
  await sleep(350);
  await page.screenshot({ path: file, fullPage, type: 'png' });
  console.log('shot', name);
}

async function clickText(page, text) {
  const handle = await page.evaluateHandle((needle) => {
    const nodes = [...document.querySelectorAll('button, a, label, h1, h2, h3')];
    return nodes.find((n) => (n.textContent || '').trim().includes(needle)) || null;
  }, text);
  const el = handle.asElement();
  if (el) {
    await el.click();
    await sleep(500);
    return true;
  }
  return false;
}

async function openFirstService(page) {
  const btn = await page.$('[data-testid="diensten-lijst"] button');
  if (btn) {
    await btn.click();
    await sleep(700);
    return true;
  }
  return false;
}

async function openBell(page) {
  const btn = await page.$('button[aria-label*="ruilverzoek" i], button[title*="Ruilverzoek" i]');
  if (btn) {
    await btn.click();
    await sleep(500);
    return true;
  }
  return false;
}

async function prepareVolunteer() {
  const auth = await loginApi('lisa@vvl.demo', 'demo123');
  const token = auth.token;
  const kids = await req('/api/persons/me/children', { token });
  const existing = (Array.isArray(kids.json) ? kids.json : []).find((p) => p.name === 'Bo Bakker');
  let child = existing;
  if (!child) {
    const created = await req('/api/persons/me/children', {
      method: 'POST',
      token,
      body: { name: 'Bo Bakker' },
    });
    child = created.json;
  }
  if (child?.id) {
    const mine = await req('/api/services?filter=mine', { token });
    const already = (mine.json || []).some((s) =>
      (s.enrollments || []).some((e) => Number(e.personId) === Number(child.id)),
    );
    if (!already) {
      const open = await req('/api/services?filter=open', { token });
      const candidates = (open.json || []).filter((s) => !s.locked && (s.capacity?.personalOpen ?? 1) > 0);
      for (const svc of candidates.slice(0, 8)) {
        const en = await req('/api/enrollments', {
          method: 'POST',
          token,
          body: { serviceId: svc.id, personId: child.id },
        });
        if (en.status === 201) break;
      }
    }
  }
}

async function main() {
  await prepareVolunteer();

  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || '/usr/local/bin/google-chrome',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900', '--hide-scrollbars'],
  });

  try {
    const phone = await browser.newPage();
    await phone.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await phone.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);

    await phone.goto(`${base}/login`, { waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {});
    await sleep(500);
    await shot(phone, 'login_390');

    await loginPage(phone, 'lisa@vvl.demo', 'demo123');
    await goto(phone, '/diensten');
    await shot(phone, 'vv_diensten_390');
    await openFirstService(phone);
    await shot(phone, 'vv_dienst_detail_390');

    await goto(phone, '/mijn-diensten');
    await shot(phone, 'vv_mijn_diensten_390');

    await goto(phone, '/ruilen');
    await shot(phone, 'vv_ruilen_390');
    await goto(phone, '/ruilen/nieuw');
    await shot(phone, 'vv_ruilen_nieuw_390');

    await goto(phone, '/mijn-gegevens');
    await shot(phone, 'vv_gegevens_390');
    await goto(phone, '/kinderen');
    await shot(phone, 'vv_kinderen_390');

    await goto(phone, '/diensten');
    await openBell(phone);
    await shot(phone, 'vv_bel_390');
    await phone.keyboard.press('Escape');

    await phone.close();

    const tcPhone = await browser.newPage();
    await tcPhone.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await loginPage(tcPhone, 'sandra@vvl.demo', 'demo123');
    await goto(tcPhone, '/diensten');
    await shot(tcPhone, 'tc_diensten_390');
    await goto(tcPhone, '/mijn-diensten');
    await shot(tcPhone, 'tc_mijn_diensten_390');
    await goto(tcPhone, '/team');
    await shot(tcPhone, 'tc_team_diensten_390');
    await clickText(tcPhone, 'Ouders');
    await sleep(400);
    await shot(tcPhone, 'tc_team_ouders_390');
    await clickText(tcPhone, 'Wedstrijden');
    await sleep(400);
    await shot(tcPhone, 'tc_team_wedstrijden_390');
    await goto(tcPhone, '/ruilen');
    await shot(tcPhone, 'tc_ruilen_390');
    await goto(tcPhone, '/mijn-gegevens');
    await shot(tcPhone, 'tc_gegevens_390');
    await tcPhone.close();

    const tcDesk = await browser.newPage();
    await tcDesk.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await loginPage(tcDesk, 'sandra@vvl.demo', 'demo123');
    await goto(tcDesk, '/team');
    await shot(tcDesk, 'tc_menu_1440');
    await shot(tcDesk, 'tc_team_diensten_1440', { fullPage: true });
    await clickText(tcDesk, 'Ouders');
    await sleep(400);
    await shot(tcDesk, 'tc_team_ouders_1440', { fullPage: true });
    await clickText(tcDesk, 'Wedstrijden');
    await sleep(400);
    await shot(tcDesk, 'tc_team_wedstrijden_1440', { fullPage: true });
    await goto(tcDesk, '/diensten');
    await shot(tcDesk, 'tc_diensten_1440');
    await tcDesk.close();

    const desk = await browser.newPage();
    await desk.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await desk.goto(`${base}/login`, { waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {});
    await shot(desk, 'login_1440');
    await loginPage(desk, 'mark@vvl.demo', 'demo123');

    await goto(desk, '/open');
    await shot(desk, 'bc_menu_1440');
    await shot(desk, 'bc_dashboard_1440');

    await goto(desk, '/mijn-diensten');
    await shot(desk, 'bc_mijn_diensten_1440');
    await goto(desk, '/mijn-ruilen');
    await shot(desk, 'bc_mijn_ruilen_1440');
    await goto(desk, '/mijn-gegevens');
    await shot(desk, 'bc_gegevens_1440');

    await goto(desk, '/mensen');
    await desk.waitForSelector('table, [data-testid="beheer-kinderen"]', { timeout: 15000 }).catch(() => {});
    await shot(desk, 'bc_personen_1440');

    await goto(desk, '/meer');
    await shot(desk, 'bc_beheer_1440');

    await goto(desk, '/meer?tab=diensten');
    await sleep(800);
    await shot(desk, 'bc_diensten_1440');

    await goto(desk, '/aandacht');
    await shot(desk, 'bc_aandacht_1440', { fullPage: true });

    await goto(desk, '/meer?tab=planning');
    await sleep(800);
    await shot(desk, 'bc_planning_1440', { fullPage: true });

    await goto(desk, '/meer?tab=regels');
    await sleep(800);
    await shot(desk, 'bc_regels_1440', { fullPage: true });
    const ruleRows = await desk.$$('table tbody tr');
    for (const row of ruleRows) {
      const text = await row.evaluate((el) => el.textContent || '');
      if (/Zaterdag bar ochtend/i.test(text)) {
        const buttons = await row.$$('button');
        for (const b of buttons) {
          const t = await b.evaluate((el) => el.textContent || '');
          if (/bewerk/i.test(t)) {
            await b.click();
            break;
          }
        }
        break;
      }
    }
    await sleep(700);
    await desk.evaluate(() => {
      const legend = [...document.querySelectorAll('legend')].find((n) => /Ook deze teams/i.test(n.textContent || ''));
      legend?.scrollIntoView({ block: 'center' });
    });
    await shot(desk, 'bc_regels_7x7_1440');

    await goto(desk, '/meer?tab=diensten&status=open');
    await sleep(800);
    await shot(desk, 'bc_diensten_open_1440');

    await goto(desk, '/wedstrijden');
    await sleep(800);
    await shot(desk, 'bc_wedstrijden_1440', { fullPage: true });

    await goto(desk, '/meer?tab=teams');
    await sleep(600);
    await shot(desk, 'bc_teams_1440', { fullPage: true });

    await goto(desk, '/open');
    await openBell(desk);
    await shot(desk, 'bc_bel_1440');
    await desk.keyboard.press('Escape');

    await desk.close();
  } finally {
    await browser.close();
  }

  const files = fs.readdirSync(shotDir).filter((f) => f.endsWith('.png'));
  console.log(`Klaar: ${files.length} screenshots in ${shotDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
