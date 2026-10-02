import crypto from 'crypto';

const DEV_MAIL_SECRET = 'dev-only-mail-secret';

function keyFrom(secret) {
  return crypto.createHash('sha256').update(String(secret)).digest();
}

/**
 * Sleutel voor SMTP-wachtwoorden.
 * In productie telt alleen MAIL_SECRET. APP_URL is publiek en mag geen sleutel zijn.
 */
function sealKeySecret() {
  if (process.env.MAIL_SECRET) return process.env.MAIL_SECRET;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'MAIL_SECRET ontbreekt. Zonder die sleutel wordt het SMTP-wachtwoord niet opgeslagen.',
    );
  }
  return DEV_MAIL_SECRET;
}

function unsealKeySecrets() {
  const keys = [];
  if (process.env.MAIL_SECRET) keys.push(process.env.MAIL_SECRET);
  if (process.env.NODE_ENV !== 'production') {
    keys.push(DEV_MAIL_SECRET);
    // Oude lokale installaties versleutelden soms met APP_URL. Alleen buiten productie.
    if (process.env.APP_URL) keys.push(process.env.APP_URL);
  }
  return keys;
}

function decrypt(stored, secret) {
  const parts = stored.split(':');
  if (parts.length !== 5) return '';
  const iv = Buffer.from(parts[2], 'hex');
  const tag = Buffer.from(parts[3], 'hex');
  const data = Buffer.from(parts[4], 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyFrom(secret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

let warnedPlaintext = false;

/** Versleutel SMTP-wachtwoord at-rest (AES-256-GCM). */
export function sealSecret(plain) {
  if (!plain) return '';
  if (String(plain).startsWith('enc:v1:')) return String(plain);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyFrom(sealKeySecret()), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

export function unsealSecret(stored) {
  if (!stored) return '';
  const s = String(stored);
  if (!s.startsWith('enc:v1:')) {
    if (s && process.env.NODE_ENV === 'production' && !warnedPlaintext) {
      warnedPlaintext = true;
      console.warn(
        '[Security] SMTP-wachtwoord staat nog onversleuteld in de database. Sla het opnieuw op in Beheer.',
      );
    }
    return s;
  }
  const keys = unsealKeySecrets();
  if (!keys.length) {
    throw new Error(
      'MAIL_SECRET ontbreekt. Zonder die sleutel kan het SMTP-wachtwoord niet worden gelezen.',
    );
  }
  for (const secret of keys) {
    try {
      return decrypt(s, secret);
    } catch {
      /* volgende sleutel proberen */
    }
  }
  return '';
}
