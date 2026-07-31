/**
 * Demo-screenshots + MP4 voor VVL Planning App.
 * Run: node scripts/make-demo-video.mjs
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const framesDir = path.join(root, 'docs', 'demo-frames');
const normDir = path.join(framesDir, 'norm');
const demoDir = path.join(root, 'docs', 'demo');
const pdfPath = path.join(demoDir, 'sample-rooster.pdf');
const outMp4 = path.join(demoDir, 'VVL-Planning-App-Demo.mp4');

const BASE = process.env.DEMO_URL || 'http://localhost:5173';
const API = process.env.DEMO_API || 'http://localhost:3001/api';

fs.mkdirSync(normDir, { recursive: true });
fs.mkdirSync(demoDir, { recursive: true });

const require = createRequire(import.meta.url);
const ffmpeg = require('ffmpeg-static');

async function loginToken() {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@vvl.local', password: 'admin123' }),
  });
  const data = await res.json();
  if (!data.token) throw new Error('Login failed: ' + JSON.stringify(data));
  return data.token;
}

async function shot(page, name) {
  const file = path.join(framesDir, `${name}.png`);
  await page.waitForTimeout(600);
  await page.screenshot({ path: file, fullPage: false });
  console.log('shot', name);
  return file;
}

async function main() {
  // Clear old frames (keep structure)
  for (const f of fs.readdirSync(framesDir)) {
    if (f.endsWith('.png')) fs.unlinkSync(path.join(framesDir, f));
  }
  for (const f of fs.readdirSync(normDir)) {
    if (f.endsWith('.png')) fs.unlinkSync(path.join(normDir, f));
  }

  const token = await loginToken();

  // Download rooster PDF for preview frame
  const pdfRes = await fetch(`${API}/pdf/planning?token=${token}`);
  if (!pdfRes.ok) throw new Error('PDF download failed ' + pdfRes.status);
  fs.writeFileSync(pdfPath, Buffer.from(await pdfRes.arrayBuffer()));
  console.log('pdf saved', pdfPath);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  // 01 Login
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"], input[name="email"]', 'admin@vvl.local');
  await page.fill('input[type="password"]', 'admin123');
  await shot(page, '01-inloggen');

  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes('login'), { timeout: 10000 });
  await page.waitForTimeout(800);
  await shot(page, '02-dashboard');

  await page.goto(`${BASE}/inschrijven`, { waitUntil: 'networkidle' });
  await shot(page, '03-inschrijven');

  await page.goto(`${BASE}/planning`, { waitUntil: 'networkidle' });
  await shot(page, '04-planning');

  // Beheer tabs via hash/query? App uses state tabs - navigate and click
  await page.goto(`${BASE}/beheer`, { waitUntil: 'networkidle' });
  await shot(page, '05-beheer-personen');

  await clickTab(page, 'Diensten');
  await shot(page, '06-beheer-diensten');

  await clickTab(page, 'Planning');
  await shot(page, '07-beheer-planning');

  await clickTab(page, 'Wedstrijden');
  await shot(page, '08-beheer-wedstrijden');

  await clickTab(page, 'Teams');
  await shot(page, '09-beheer-teams');

  await clickTab(page, 'E-mail');
  await shot(page, '10-beheer-email');

  // PDF-preview: HTML-viewer (Chromium downloadt file:// PDF)
  const b64 = fs.readFileSync(pdfPath).toString('base64');
  await page.setContent(`<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8" />
  <title>Rooster PDF</title>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
  <style>
    body { margin: 0; background: #1a1a1a; display: flex; flex-direction: column; align-items: center; font-family: Arial, sans-serif; }
    h1 { color: #fff; font-size: 18px; margin: 12px; }
    canvas { background: #fff; box-shadow: 0 4px 24px rgba(0,0,0,.5); max-width: 96vw; }
  </style>
</head>
<body>
  <h1>V.V. Lekkerkerk — PDF-rooster (A4, weken × dagen, alleen namen)</h1>
  <canvas id="c"></canvas>
  <script>
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const raw = atob('${b64}');
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    pdfjsLib.getDocument({ data: bytes }).promise.then(async (pdf) => {
      const page = await pdf.getPage(1);
      const scale = 1.35;
      const viewport = page.getViewport({ scale });
      const canvas = document.getElementById('c');
      const ctx = canvas.getContext('2d');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: ctx, viewport }).promise;
      document.title = 'PDF_READY';
    });
  </script>
</body>
</html>`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.title === 'PDF_READY', { timeout: 20000 });
  await page.waitForTimeout(400);
  await shot(page, '11-pdf-rooster');

  await browser.close();

  // Title + normalize frames with System.Drawing via PowerShell is messy;
  // use sharp if available, else copy as-is and let ffmpeg scale.
  const ordered = [
    '01-inloggen',
    '02-dashboard',
    '03-inschrijven',
    '04-planning',
    '05-beheer-personen',
    '06-beheer-diensten',
    '07-beheer-planning',
    '08-beheer-wedstrijden',
    '09-beheer-teams',
    '10-beheer-email',
    '11-pdf-rooster',
  ];

  // Create title slides as simple HTML screenshots? Skip — use ffmpeg with labels via drawtext optional.
  // Duplicate each frame into norm sequence
  let i = 1;
  for (const name of ordered) {
    const src = path.join(framesDir, `${name}.png`);
    if (!fs.existsSync(src)) {
      console.warn('missing', name);
      continue;
    }
    const dest = path.join(normDir, `frame_${String(i).padStart(3, '0')}.png`);
    fs.copyFileSync(src, dest);
    i += 1;
  }

  if (i === 1) throw new Error('No frames captured');

  execFileSync(
    ffmpeg,
    [
      '-y',
      '-framerate',
      '1/3.2',
      '-i',
      path.join(normDir, 'frame_%03d.png'),
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-r',
      '30',
      '-vf',
      'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0xF5F5F5',
      outMp4,
    ],
    { stdio: 'inherit' },
  );

  console.log('Demo video:', outMp4, fs.statSync(outMp4).size, 'bytes');
}

async function clickTab(page, label) {
  const btn = page.getByRole('button', { name: label, exact: true });
  if (await btn.count()) {
    await btn.first().click();
    await page.waitForTimeout(500);
    return;
  }
  // fallback: text match
  await page.locator('button').filter({ hasText: label }).first().click();
  await page.waitForTimeout(500);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
