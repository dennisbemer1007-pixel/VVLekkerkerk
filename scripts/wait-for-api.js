/**
 * Wacht tot de API health OK is (max ~60s). Voorkomt 502/503 bij start via Vite-proxy.
 */
const url = process.env.API_HEALTH_URL || 'http://127.0.0.1:3001/api/health';
const maxAttempts = 60;
const delayMs = 1000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (let i = 1; i <= maxAttempts; i += 1) {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (res.ok) {
      const body = await res.json().catch(() => ({}));
      if (body.ok !== false) {
        console.log(`[wait-for-api] API bereikbaar na ${i} poging(en)`);
        process.exit(0);
      }
    }
  } catch {
    /* retry */
  }
  if (i === 1) console.log('[wait-for-api] Wachten op backend…');
  await sleep(delayMs);
}

console.error('[wait-for-api] Timeout: backend start niet op', url);
process.exit(1);
