/**
 * Publieke app-URL voor e-mail links.
 * Nooit client-controlled appUrl/Origin vertrouwen (link poisoning).
 */
export function resolvePublicAppUrl() {
  const fromEnv = (process.env.APP_URL || '').trim().replace(/\/$/, '');
  if (fromEnv) return fromEnv;

  const fromRender = (process.env.RENDER_EXTERNAL_URL || '').trim().replace(/\/$/, '');
  if (fromRender) return fromRender;

  if (process.env.NODE_ENV === 'production') {
    throw Object.assign(new Error('APP_URL is verplicht in productie voor e-maillinks'), {
      status: 503,
    });
  }

  return 'http://localhost:5173';
}

export const KNOWN_ROLES = ['Vrijwilliger', 'Teamcoördinator', 'Barcommissie', 'Bestuur'];

export function normalizeRole(role, fallback = 'Vrijwilliger') {
  const r = String(role || '').trim();
  if (r === 'Coördinator') return 'Barcommissie';
  return KNOWN_ROLES.includes(r) ? r : fallback;
}
