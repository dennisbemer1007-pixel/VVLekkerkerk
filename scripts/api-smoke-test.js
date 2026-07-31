/**
 * Smoke test: alle belangrijke API-endpoints.
 * Run: node scripts/api-smoke-test.js [baseUrl]
 */
const base = (process.argv[2] || 'http://localhost:5173').replace(/\/$/, '');

async function req(path, options = {}) {
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text.slice(0, 120);
  }
  return { status: res.status, body, ok: res.ok };
}

const results = [];

function record(name, r, expect = (s) => s >= 200 && s < 300) {
  const pass = expect(r.status);
  results.push({ name, status: r.status, pass, detail: pass ? 'ok' : JSON.stringify(r.body).slice(0, 150) });
  return r;
}

console.log('Base URL:', base);

let r = record('GET /api/health', await req('/api/health'));
if (!r.ok) {
  console.error('Backend niet bereikbaar. Stop.');
  process.exit(1);
}

r = record('POST /api/auth/login', await req('/api/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email: 'admin@vvl.local', password: 'admin123' }),
}));
const token = r.body?.token;
if (!token) {
  console.error('Login mislukt', r.body);
  process.exit(1);
}
const auth = { Authorization: `Bearer ${token}` };

record('GET /api/auth/me', await req('/api/auth/me', { headers: auth }));
record('GET /api/persons?all=true', await req('/api/persons?all=true', { headers: auth }));
record('GET /api/teams', await req('/api/teams', { headers: auth }));
record('GET /api/services', await req('/api/services', { headers: auth }));
record('GET /api/matches', await req('/api/matches', { headers: auth }));
record('GET /api/planning/stats', await req('/api/planning/stats', { headers: auth }));
record('GET /api/planning', await req('/api/planning', { headers: auth }));
record('GET /api/settings/mail', await req('/api/settings/mail', { headers: auth }));
record('GET /api/settings/mail/status', await req('/api/settings/mail/status', { headers: auth }));
record('GET /api/planning/round', await req('/api/planning/round', { headers: auth }));

console.log('\n=== Resultaten ===');
let failed = 0;
for (const row of results) {
  const mark = row.pass ? 'PASS' : 'FAIL';
  if (!row.pass) failed += 1;
  console.log(`${mark} ${row.status} ${row.name}${row.pass ? '' : ' — ' + row.detail}`);
}
console.log(`\n${results.length - failed}/${results.length} geslaagd`);
process.exit(failed ? 1 : 0);
