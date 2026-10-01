import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolvePublicAppUrl } from './appUrl.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Clubkleuren (zwart / wit / grijs — zelfde als de app). */
export const MAIL_BRAND = {
  primary: '#000000',
  accent: '#444444',
  muted: '#f3f3f3',
  border: '#d4d4d4',
  background: '#ffffff',
  text: '#111111',
  clubName: 'V.V. Lekkerkerk',
  logoCid: 'vvl-logo',
};

export const LOGO_FILENAME = 'logo.png';

export function resolveLogoFilePath() {
  const candidates = [
    path.join(__dirname, '../../frontend/public', LOGO_FILENAME),
    path.join(__dirname, '../../../dist', LOGO_FILENAME),
    path.join(process.cwd(), 'src/frontend/public', LOGO_FILENAME),
    path.join(process.cwd(), 'dist', LOGO_FILENAME),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return candidates[0];
}

export function logoAttachment() {
  const filename = resolveLogoFilePath();
  if (!fs.existsSync(filename)) return null;
  return {
    filename: LOGO_FILENAME,
    path: filename,
    cid: MAIL_BRAND.logoCid,
    contentType: 'image/png',
  };
}

export function publicLogoUrl(baseUrl) {
  const base = String(baseUrl || '').replace(/\/$/, '');
  return base ? `${base}/${LOGO_FILENAME}` : `cid:${MAIL_BRAND.logoCid}`;
}

export function exampleMailVars(overrides = {}) {
  let link = '';
  try {
    link = resolvePublicAppUrl();
  } catch {
    link = 'https://vvl-planning-demo.onrender.com';
  }
  return {
    naam: 'Jan de Vries',
    datum: 'zaterdag 4 oktober',
    tijd: '12:00 - 16:30',
    dienst: 'bardienst',
    link,
    ...overrides,
  };
}

export function ctaLabelForTemplateKey(key) {
  switch (String(key || '')) {
    case 'invite':
      return 'Account activeren';
    case 'scheduled':
    case 'reminder':
      return 'Bekijk dienst';
    case 'planningReady':
      return 'Bekijk rooster';
    case 'passwordReset':
      return 'Nieuw wachtwoord';
    case 'swap':
      return 'Open ter goedkeuring';
    default:
      return 'Open de app';
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Zet platte mailtekst om naar alinea’s + optionele knop, in VV Lekkerkerk-huisstijl.
 * @param {{ text: string, ctaLabel?: string, ctaUrl?: string, logoSrc?: string, previewWidth?: number }} opts
 */
export function wrapBrandedEmail({
  text,
  ctaLabel = '',
  ctaUrl = '',
  logoSrc = `cid:${MAIL_BRAND.logoCid}`,
  previewWidth,
} = {}) {
  const plain = String(text || '').replace(/\r\n/g, '\n').trim();
  const link = String(ctaUrl || '').trim();
  const label = String(ctaLabel || '').trim() || (link ? 'Open de app' : '');

  const paragraphs = plain
    ? plain.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean)
    : [];

  const bodyHtml = paragraphs
    .map((block) => {
      const lines = block.split('\n').map((line) => {
        const trimmed = line.trim();
        if (link && trimmed === link) {
          return '';
        }
        let html = escapeHtml(line);
        if (link) {
          const escLink = escapeHtml(link);
          html = html.split(escLink).join(
            `<a href="${escLink}" style="color:${MAIL_BRAND.primary};text-decoration:underline;word-break:break-all;">${escLink}</a>`,
          );
        }
        return html;
      });
      const inner = lines.filter((l) => l !== '').join('<br>');
      if (!inner) return '';
      return `<p style="margin:0 0 16px;font-size:16px;line-height:1.5;color:${MAIL_BRAND.text};">${inner}</p>`;
    })
    .filter(Boolean)
    .join('');

  const buttonHtml =
    link && label
      ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;">
          <tr>
            <td align="center" bgcolor="${MAIL_BRAND.primary}" style="border-radius:4px;">
              <a href="${escapeHtml(link)}"
                 style="display:inline-block;padding:14px 22px;font-size:15px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;text-decoration:none;color:#ffffff;background:${MAIL_BRAND.primary};border-radius:4px;">
                ${escapeHtml(label)}
              </a>
            </td>
          </tr>
        </table>`
      : '';

  const widthAttr = previewWidth ? `max-width:${previewWidth}px;` : 'max-width:560px;';

  const html = `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(MAIL_BRAND.clubName)}</title>
</head>
<body style="margin:0;padding:0;background:${MAIL_BRAND.muted};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${MAIL_BRAND.muted};padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="${widthAttr}width:100%;background:${MAIL_BRAND.background};border:1px solid ${MAIL_BRAND.border};">
          <tr>
            <td style="background:${MAIL_BRAND.primary};padding:20px 24px;text-align:center;">
              <img src="${escapeHtml(logoSrc)}" width="56" height="58" alt="${escapeHtml(MAIL_BRAND.clubName)}" style="display:inline-block;border:0;outline:none;width:56px;height:auto;" />
              <div style="margin-top:10px;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#ffffff;">
                ${escapeHtml(MAIL_BRAND.clubName)}
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 24px 8px;font-family:Arial,Helvetica,sans-serif;">
              ${bodyHtml || `<p style="margin:0 0 16px;font-size:16px;line-height:1.5;color:${MAIL_BRAND.text};"></p>`}
              ${buttonHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px 24px;border-top:1px solid ${MAIL_BRAND.border};font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.4;color:${MAIL_BRAND.accent};text-align:center;">
              ${escapeHtml(MAIL_BRAND.clubName)} · Planning bar- en keukendiensten
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { html, text: plain };
}
