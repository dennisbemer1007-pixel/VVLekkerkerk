/**
 * Contact afschermen voor Admin: server-side, vaste notatie.
 * Barcommissie krijgt de echte waarde; eigen /me blijft volledig.
 */

export function maskEmail(email) {
  const raw = String(email || '').trim();
  if (!raw) return '';
  const at = raw.indexOf('@');
  if (at <= 0) return `${raw[0]}***`;
  const local = raw.slice(0, at);
  const domain = raw.slice(at + 1);
  return `${local[0] || ''}***@${domain}`;
}

/** 0612345615 of 06-12345615 → "06 **** 15" */
export function maskPhone(phone) {
  const raw = String(phone || '').trim();
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 4) return '****';
  return `${digits.slice(0, 2)} **** ${digits.slice(-2)}`;
}

export function looksMaskedEmail(value) {
  const v = String(value || '').trim();
  return /^\S\*\*\*(@|$)/.test(v);
}

export function looksMaskedPhone(value) {
  return /^\d{2}\s\*{4}\s\d{2}$/.test(String(value || '').trim());
}

export function isUnchangedMaskedEmail(submitted, stored) {
  const v = String(submitted || '').trim();
  if (!v) return false;
  if (stored && v.toLowerCase() === maskEmail(stored).toLowerCase()) return true;
  return looksMaskedEmail(v);
}

export function isUnchangedMaskedPhone(submitted, stored) {
  const v = String(submitted || '').trim();
  if (!v) return false;
  if (stored && v === maskPhone(stored)) return true;
  return looksMaskedPhone(v);
}

/**
 * Bij opslaan: gemaskeerde waarde die terugkomt, niet naar de database schrijven.
 * Leeg = bewust wissen. Een nieuw echt adres wordt opgeslagen.
 */
export function contactUpdateFromBody(body, stored = {}) {
  const data = {};
  if (body.email !== undefined) {
    if (!isUnchangedMaskedEmail(body.email, stored.email)) {
      data.email = String(body.email || '').trim().toLowerCase() || null;
    }
  }
  if (body.phone !== undefined) {
    if (!isUnchangedMaskedPhone(body.phone, stored.phone)) {
      data.phone = String(body.phone || '').trim() || null;
    }
  }
  return data;
}
