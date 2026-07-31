import crypto from 'crypto';

function keyMaterial() {
  const secret =
    process.env.MAIL_SECRET ||
    process.env.APP_URL ||
    (process.env.NODE_ENV === 'production' ? '' : 'dev-only-mail-secret');
  if (!secret) {
    throw new Error('MAIL_SECRET of APP_URL vereist om mailwachtwoorden te beveiligen');
  }
  return crypto.createHash('sha256').update(String(secret)).digest();
}

/** Versleutel SMTP-wachtwoord at-rest (AES-256-GCM). */
export function sealSecret(plain) {
  if (!plain) return '';
  if (String(plain).startsWith('enc:v1:')) return String(plain);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyMaterial(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

export function unsealSecret(stored) {
  if (!stored) return '';
  const s = String(stored);
  if (!s.startsWith('enc:v1:')) return s; // legacy plaintext
  const parts = s.split(':');
  if (parts.length !== 5) return '';
  const iv = Buffer.from(parts[2], 'hex');
  const tag = Buffer.from(parts[3], 'hex');
  const data = Buffer.from(parts[4], 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyMaterial(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
