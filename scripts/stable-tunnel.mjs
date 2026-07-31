/**
 * Stabiele publieke tunnel via localtunnel met vast subdomein.
 * Herstart automatisch bij disconnect — zelfde URL blijft geldig.
 *
 * Gebruik: node scripts/stable-tunnel.mjs
 * Of: start-public.cmd
 */
import localtunnel from 'localtunnel';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const urlFile = path.join(root, 'docs', 'PUBLIC_URL.txt');

const PORT = Number(process.env.TUNNEL_PORT || 3001);
const SUBDOMAIN =
  process.env.TUNNEL_SUBDOMAIN || 'vvllekkerkerk-planning';

let stopping = false;

function saveUrl(url) {
  const text = [
    url,
    '',
    `Subdomein: ${SUBDOMAIN}`,
    `Poort: ${PORT}`,
    `Gestart: ${new Date().toLocaleString('nl-NL')}`,
    '',
    'Deze URL blijft hetzelfde zolang start-public.cmd draait.',
    'PC mag niet slapen/uit. Voor 24/7: hosten op een VPS.',
    '',
  ].join('\n');
  fs.mkdirSync(path.dirname(urlFile), { recursive: true });
  fs.writeFileSync(urlFile, text, 'utf8');
  console.log('\n========================================');
  console.log('  Publieke link (vast subdomein):');
  console.log(`  ${url}`);
  console.log('========================================\n');
  console.log(`Opgeslagen in: ${urlFile}`);
}

async function startOnce() {
  const tunnel = await localtunnel({
    port: PORT,
    subdomain: SUBDOMAIN,
  });

  saveUrl(tunnel.url);

  tunnel.on('close', () => {
    if (!stopping) {
      console.warn('[tunnel] verbinding verbroken — herstart over 3s…');
    }
  });

  tunnel.on('error', (err) => {
    console.error('[tunnel] fout:', err.message || err);
  });

  // localtunnel soms idle-timeout; periodieke ping
  const ping = setInterval(() => {
    fetch(tunnel.url, { method: 'HEAD' }).catch(() => {});
  }, 60_000);

  await new Promise((resolve) => {
    tunnel.on('close', () => {
      clearInterval(ping);
      resolve();
    });
  });
}

async function main() {
  console.log(`Tunnel naar localhost:${PORT} als "${SUBDOMAIN}.loca.lt"`);
  console.log('Stoppen: Ctrl+C\n');

  process.on('SIGINT', () => {
    stopping = true;
    process.exit(0);
  });

  while (!stopping) {
    try {
      await startOnce();
    } catch (err) {
      console.error('[tunnel] start mislukt:', err.message || err);
      // subdomein bezet? probeer opnieuw / licht andere naam
      console.log('Opnieuw proberen over 5s…');
    }
    if (stopping) break;
    await new Promise((r) => setTimeout(r, 5000));
  }
}

main();
