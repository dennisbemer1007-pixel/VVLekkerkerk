import fs from 'fs';

const API = 'http://localhost:3001/api';

async function req(path, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  return { status: res.status, json, text: text.slice(0, 200) };
}

function assert(name, cond, detail = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  return cond;
}

const results = [];

async function login(email, password) {
  const r = await req('/auth/login', { method: 'POST', body: { email, password } });
  return r.json?.token;
}

async function main() {
  let ok = true;
  const mark = (c) => {
    ok = ok && c;
  };

  mark(assert('health', (await req('/health')).status === 200));

  const adminTok = await login('admin@vvl.local', 'admin123');
  const lisaTok = await login('lisa@vvl.demo', 'demo123');
  mark(assert('login admin', Boolean(adminTok)));
  mark(assert('login lisa', Boolean(lisaTok)));

  // Unauthenticated writes must fail
  const noAuthEnroll = await req('/enrollments', {
    method: 'POST',
    body: { serviceId: 1, personId: 1 },
  });
  mark(assert('no-auth enroll blocked', noAuthEnroll.status === 401, String(noAuthEnroll.status)));

  const noAuthService = await req('/services', {
    method: 'POST',
    body: { type: 'BAR', date: '2026-09-01', time: '10:00 - 12:00' },
  });
  mark(assert('no-auth create service blocked', noAuthService.status === 401, String(noAuthService.status)));

  const noAuthTeam = await req('/teams', {
    method: 'POST',
    body: { name: 'Hacker Team' },
  });
  mark(assert('no-auth create team blocked', noAuthTeam.status === 401, String(noAuthTeam.status)));

  const noAuthPdf = await req('/pdf/planning');
  mark(assert('no-auth PDF blocked', noAuthPdf.status === 401, String(noAuthPdf.status)));

  // IDOR: lisa enrolls as someone else
  const services = await req('/services', { token: lisaTok });
  const open = (services.json || []).find((s) => !s.draft && s.status !== 'full');
  if (open) {
    const idor = await req('/enrollments', {
      method: 'POST',
      token: lisaTok,
      body: { serviceId: open.id, personId: 1 },
    });
    mark(
      assert('IDOR enroll-as-other blocked', idor.status === 403, String(idor.status)),
    );
  } else {
    mark(assert('IDOR enroll-as-other blocked', false, 'no open service'));
  }

  // Self enroll ok
  if (open) {
    const self = await req('/enrollments', {
      method: 'POST',
      token: lisaTok,
      body: { serviceId: open.id, personId: (await req('/auth/me', { token: lisaTok })).json.id },
    });
    const enrolledOk = self.status === 201 || self.status === 409;
    mark(assert('self enroll allowed', enrolledOk, String(self.status)));
    if (self.json?.person?.passwordHash) {
      mark(assert('no passwordHash in response', false, 'LEAK'));
    } else {
      mark(assert('no passwordHash in response', true));
    }
    if (self.json?.person?.email) {
      mark(assert('no email in enrollment person', false, 'LEAK'));
    } else {
      mark(assert('no email in enrollment person', true));
    }
  }

  // Privacy persons: vrijwilligers zien geen clubbrede personenlijst
  const lisaPersons = await req('/persons', { token: lisaTok });
  mark(assert('volunteer persons blocked', lisaPersons.status === 403, String(lisaPersons.status)));

  const adminPersons = await req('/persons?all=true', { token: adminTok });
  const adminHas = (adminPersons.json || []).some((p) => p.email);
  mark(assert('admin persons show contact', adminHas));

  // Volunteer cannot propose
  const propose = await req('/planning/propose', { method: 'POST', token: lisaTok, body: {} });
  mark(assert('volunteer propose blocked', propose.status === 403));

  // PDF with Authorization header (geen token in querystring)
  const pdf = await fetch(`${API}/pdf/planning`, {
    headers: { Authorization: `Bearer ${adminTok}` },
  });
  mark(assert('PDF with auth header works', pdf.status === 200 && pdf.headers.get('content-type')?.includes('pdf')));

  // Query-token mag niet meer werken
  const pdfQuery = await fetch(`${API}/pdf/planning?token=${adminTok}`);
  mark(assert('PDF query token rejected', pdfQuery.status === 401));

  // Helmet header
  const h = await fetch(`${API}/health`);
  mark(assert('helmet x-content-type-options', h.headers.get('x-content-type-options') === 'nosniff'));
  mark(assert('api cache-control no-store', (h.headers.get('cache-control') || '').includes('no-store')));

  console.log(ok ? '\nALL SECURITY RETESTS PASSED' : '\nSOME SECURITY RETESTS FAILED');
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
