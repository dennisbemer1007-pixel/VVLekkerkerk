const API_BASE = '/api';
const TOKEN_KEY = 'vvl-auth-token';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    throw new Error(
      'Kon sessie niet opslaan (localStorage geblokkeerd). Gebruik een normaal browservenster, geen privémodus.',
    );
  }
}

function gatewayMessage(status, body) {
  if (body?.error === 'Database niet bereikbaar') {
    return 'Database niet bereikbaar. Controleer of dev.db bestaat (npm run setup) en herstart npm run dev.';
  }
  if (status === 503) {
    return 'Server tijdelijk niet beschikbaar (503). Even wachten en verversen. Gebruik je een tunnel? Zorg dat npm run dev draait (frontend + backend).';
  }
  return 'API niet bereikbaar (502). Start de app met npm run dev (poort 3001 + 5173) en ververs de pagina.';
}

async function json(path, options = {}, attempt = 0) {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
    });
  } catch {
    if (attempt < 2) {
      await sleep(350 * (attempt + 1));
      return json(path, options, attempt + 1);
    }
    throw new Error(
      'Geen verbinding met de server. Draait npm run dev? Controleer http://localhost:5173/api/health',
    );
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if ((res.status === 502 || res.status === 503) && attempt < 2) {
      await sleep(350 * (attempt + 1));
      return json(path, options, attempt + 1);
    }
    if (res.status === 502 || res.status === 503) {
      throw new Error(gatewayMessage(res.status, body));
    }
    const err = new Error(body.error ?? `Fout (${res.status})`);
    err.status = res.status;
    err.details = body;
    throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}

/** Publieke health check (geen auth) */
export async function checkApiHealth() {
  const res = await fetch(`${API_BASE}/health`, { cache: 'no-store' });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok && body.ok !== false, status: res.status, body };
}

function qs(params) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') q.set(k, v);
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

export const api = {
  login: (email, password) =>
    json('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => json('/auth/logout', { method: 'POST' }),
  me: () => json('/auth/me'),
  getInvite: (token) => json(`/auth/invite/${token}`),
  acceptInvite: (token, data) =>
    json(`/auth/invite/${token}/accept`, { method: 'POST', body: JSON.stringify(data) }),
  invitePerson: (data) =>
    json('/auth/invite', {
      method: 'POST',
      body: JSON.stringify({ ...data, appUrl: window.location.origin }),
    }),
  resendInvite: (personId) =>
    json(`/auth/invite/${personId}/resend`, {
      method: 'POST',
      body: JSON.stringify({ appUrl: window.location.origin }),
    }),

  getStats: () => json('/planning/stats'),
  getPlanning: (params = {}) => json(`/planning${qs(params)}`),
  getServices: (params = {}) => json(`/services${qs(params)}`),
  createService: (data) => json('/services', { method: 'POST', body: JSON.stringify(data) }),
  updateService: (id, data) =>
    json(`/services/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  getPersons: (all = false) => json(`/persons${all ? '?all=true' : ''}`),
  createPerson: (data) => json('/persons', { method: 'POST', body: JSON.stringify(data) }),
  updatePerson: (id, data) =>
    json(`/persons/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  updateMyPreferences: (data) =>
    json('/persons/me/preferences', { method: 'PUT', body: JSON.stringify(data) }),
  uploadPersonPhoto: async (id, file) => {
    const form = new FormData();
    form.append('photo', file);
    const headers = {};
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}/persons/${id}/photo`, {
      method: 'POST',
      headers,
      body: form,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `Upload mislukt (${res.status})`);
    }
    return res.json();
  },
  deletePersonPhoto: (id) => json(`/persons/${id}/photo`, { method: 'DELETE' }),
  getTeams: () => json('/teams'),
  createTeam: (data) => json('/teams', { method: 'POST', body: JSON.stringify(data) }),
  updateTeam: (id, data) =>
    json(`/teams/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  getMatches: () => json('/matches'),
  createMatch: (data) => json('/matches', { method: 'POST', body: JSON.stringify(data) }),
  deleteMatch: (id) => json(`/matches/${id}`, { method: 'DELETE' }),
  createEnrollment: (data) =>
    json('/enrollments', { method: 'POST', body: JSON.stringify(data) }),
  deleteEnrollment: (id) => json(`/enrollments/${id}`, { method: 'DELETE' }),
  generateFromMatches: (data) =>
    json('/planning/from-matches', { method: 'POST', body: JSON.stringify(data ?? {}) }),
  proposePlanning: (data) =>
    json('/planning/propose', { method: 'POST', body: JSON.stringify(data ?? {}) }),
  publishPlanning: (data) =>
    json('/planning/publish', { method: 'POST', body: JSON.stringify(data ?? {}) }),
  notifyVolunteers: (data) =>
    json('/planning/notify-volunteers', {
      method: 'POST',
      body: JSON.stringify({ ...data, appUrl: window.location.origin }),
    }),
  notifyMandatory: (data) =>
    json('/planning/notify-mandatory', {
      method: 'POST',
      body: JSON.stringify({ ...data, appUrl: window.location.origin }),
    }),
  fillMandatory: () => json('/planning/fill-mandatory', { method: 'POST', body: '{}' }),
  getPlanningRound: () => json('/planning/round'),
  importMatches: (data) => json('/matches/import', { method: 'POST', body: JSON.stringify(data) }),
  validateMatchCsv: (data) =>
    json('/matches/import/validate', { method: 'POST', body: JSON.stringify(data) }),
  forgotPassword: (email) =>
    json('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email, appUrl: window.location.origin }),
    }),
  getPasswordReset: (token) => json(`/auth/reset/${token}`),
  completePasswordReset: (token, password) =>
    json(`/auth/reset/${token}`, { method: 'POST', body: JSON.stringify({ password }) }),
  setPersonPassword: (id, password) =>
    json(`/persons/${id}/password`, { method: 'PUT', body: JSON.stringify({ password }) }),
  downloadPlanningPdf: async (params = {}) => {
    const headers = {};
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}/pdf/planning${qs(params)}`, { headers });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `PDF mislukt (${res.status})`);
    }
    return res.blob();
  },
  getMailSettings: () => json('/settings/mail'),
  getMailStatus: () => json('/settings/mail/status'),
  saveMailSettings: (data) =>
    json('/settings/mail', { method: 'PUT', body: JSON.stringify(data) }),
  testMail: (to) =>
    json('/settings/mail/test', { method: 'POST', body: JSON.stringify({ to }) }),
};
