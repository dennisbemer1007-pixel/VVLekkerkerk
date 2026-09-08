import nodemailer from 'nodemailer';
import prisma from './prisma.js';
import { sealSecret, unsealSecret } from './secrets.js';

const DEFAULT_ID = 1;

export async function getMailSettings() {
  let settings = await prisma.mailSettings.findUnique({ where: { id: DEFAULT_ID } });
  if (!settings) {
    settings = await prisma.mailSettings.create({
      data: { id: DEFAULT_ID },
    });
  }
  return settings;
}

/** Settings met ontsleuteld SMTP-wachtwoord (alleen server-side gebruiken). */
export async function getMailSettingsForTransport() {
  const settings = await getMailSettings();
  return {
    ...settings,
    password: unsealSecret(settings.password || ''),
  };
}

export function publicMailSettings(settings) {
  return {
    enabled: settings.enabled,
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    user: settings.user,
    fromEmail: settings.fromEmail,
    fromName: settings.fromName,
    passwordSet: Boolean(settings.password),
    isReady: isMailReady(settings),
  };
}

export function isMailReady(settings) {
  return Boolean(
    settings?.enabled &&
      settings.host?.trim() &&
      settings.port &&
      settings.fromEmail?.trim(),
  );
}

function sanitizeFromName(name) {
  return String(name || 'V.V. Lekkerkerk')
    .replace(/[\r\n"]/g, '')
    .trim()
    .slice(0, 80) || 'V.V. Lekkerkerk';
}

export async function saveMailSettings(input) {
  const data = {
    enabled: Boolean(input.enabled),
    host: (input.host ?? '').trim(),
    port: Number(input.port) || 587,
    secure: Boolean(input.secure),
    user: (input.user ?? '').trim(),
    fromEmail: (input.fromEmail ?? '').trim(),
    fromName: sanitizeFromName(input.fromName ?? 'V.V. Lekkerkerk'),
  };

  // Leeg wachtwoordveld = bestaand wachtwoord behouden
  if (input.password !== undefined && String(input.password).length > 0) {
    data.password = sealSecret(String(input.password));
  }

  return prisma.mailSettings.upsert({
    where: { id: DEFAULT_ID },
    create: { id: DEFAULT_ID, ...data, password: data.password ?? '' },
    update: data,
  });
}

function buildTransport(settings) {
  const port = Number(settings.port) || 587;
  let secure = Boolean(settings.secure);
  if (port === 587) {
    secure = false;
  } else if (port === 465) {
    secure = true;
  }

  const password = settings.password?.startsWith?.('enc:v1:')
    ? unsealSecret(settings.password)
    : settings.password;

  const options = {
    host: settings.host,
    port,
    secure,
    ...(port === 587 ? { requireTLS: true } : {}),
  };
  if (settings.user) {
    options.auth = {
      user: settings.user,
      pass: password || undefined,
    };
  }
  return nodemailer.createTransport(options);
}

export async function sendMail({ to, subject, text, html }) {
  const settings = await getMailSettingsForTransport();
  if (!isMailReady(settings)) {
    return { sent: false, reason: 'Mailserver staat uit of is niet volledig ingesteld' };
  }

  const transporter = buildTransport(settings);
  const fromName = sanitizeFromName(settings.fromName);
  const from = fromName ? `"${fromName}" <${settings.fromEmail}>` : settings.fromEmail;

  await transporter.sendMail({
    from,
    to,
    subject,
    text,
    html: html || text.replace(/\n/g, '<br>'),
  });

  return { sent: true };
}

export async function verifyMailConnection(settingsOverride) {
  const settings = settingsOverride
    ? {
        ...settingsOverride,
        password: unsealSecret(settingsOverride.password || ''),
      }
    : await getMailSettingsForTransport();
  if (!settings.host?.trim()) {
    throw new Error('Vul eerst de SMTP-host in');
  }
  const transporter = buildTransport(settings);
  await transporter.verify();
  return true;
}

export function inviteEmailContent({ name, link }) {
  const subject = 'Uitnodiging VVL Planning App';
  const text = `Hoi ${name},

Je bent uitgenodigd voor de VVL Planning App van V.V. Lekkerkerk.

Maak je account aan via deze link:
${link}

De link is 14 dagen geldig.

Groet,
V.V. Lekkerkerk`;

  const html = `
    <p>Hoi ${escapeHtml(name)},</p>
    <p>Je bent uitgenodigd voor de <strong>VVL Planning App</strong> van V.V. Lekkerkerk.</p>
    <p><a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 20px;background:#000;color:#fff;text-decoration:none;font-weight:bold;border-radius:999px;">Account aanmaken</a></p>
    <p>Of kopieer deze link:<br><a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p>
    <p>De link is 14 dagen geldig.</p>
    <p>Groet,<br>V.V. Lekkerkerk</p>
  `;

  return { subject, text, html };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function trySendInviteEmail({ email, name, link }) {
  const settings = await getMailSettings();
  if (!isMailReady(settings)) {
    return { sent: false, reason: 'not_configured' };
  }
  try {
    const { subject, text, html } = inviteEmailContent({ name, link });
    await sendMail({ to: email, subject, text, html });
    return { sent: true };
  } catch (err) {
    console.error('[Mail] Uitnodiging versturen mislukt:', err.message);
    return { sent: false, reason: err.message };
  }
}

export function passwordResetEmailContent({ name, link }) {
  const subject = 'Wachtwoord resetten — VVL Planning App';
  const text = `Hoi ${name},

Je hebt gevraagd om je wachtwoord te resetten voor de VVL Planning App.

Stel een nieuw wachtwoord in via deze link (24 uur geldig):
${link}

Heb je dit niet aangevraagd? Negeer deze e-mail.

Groet,
V.V. Lekkerkerk`;
  const html = `
    <p>Hoi ${escapeHtml(name)},</p>
    <p>Je hebt gevraagd om je wachtwoord te resetten.</p>
    <p><a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 20px;background:#000;color:#fff;text-decoration:none;font-weight:bold;border-radius:999px;">Nieuw wachtwoord</a></p>
    <p>Link 24 uur geldig. Niet aangevraagd? Negeer deze mail.</p>
  `;
  return { subject, text, html };
}

export async function trySendPasswordResetEmail({ email, name, link }) {
  const settings = await getMailSettings();
  if (!isMailReady(settings)) {
    return { sent: false, reason: 'not_configured' };
  }
  try {
    const { subject, text, html } = passwordResetEmailContent({ name, link });
    await sendMail({ to: email, subject, text, html });
    return { sent: true };
  } catch (err) {
    console.error('[Mail] Wachtwoord-reset mislukt:', err.message);
    return { sent: false, reason: err.message };
  }
}

function formatDeadline(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('nl-NL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function volunteerOpenEmail({ name, deadline, appUrl }) {
  const subject = 'Inschrijven kantinediensten V.V. Lekkerkerk';
  const deadlineText = deadline
    ? `Je kunt je inschrijven tot ${formatDeadline(deadline)}.`
    : 'Schrijf je zo snel mogelijk in via de app.';
  const text = `Hoi ${name},

De bardiensten voor de komende weken staan open.
${deadlineText}

Log in via: ${appUrl || 'de VVL Planning App'}

Groet,
V.V. Lekkerkerk`;
  const html = `
    <p>Hoi ${escapeHtml(name)},</p>
    <p>De bardiensten voor de komende weken staan open.</p>
    <p><strong>${escapeHtml(deadlineText)}</strong></p>
    <p><a href="${escapeHtml(appUrl || '#')}">Open de VVL Planning App</a></p>
    <p>Groet,<br>V.V. Lekkerkerk</p>
  `;
  return { subject, text, html };
}

export function mandatoryOpenEmail({ name, appUrl }) {
  const subject = 'Verplichte bardienst — nog inschrijven';
  const text = `Hoi ${name},

Je staat genoteerd voor een verplichte bardienst.
De vrijwilligersfase is afgelopen; schrijf je nu in op een open dienst via de app.
Als je je niet inschrijft, kan de coördinator je team toewijzen.

Log in via: ${appUrl || 'de VVL Planning App'}

Groet,
V.V. Lekkerkerk`;
  const html = `
    <p>Hoi ${escapeHtml(name)},</p>
    <p>Je staat genoteerd voor een <strong>verplichte bardienst</strong>.</p>
    <p>De vrijwilligersfase is afgelopen; schrijf je nu in op een open dienst.</p>
    <p><a href="${escapeHtml(appUrl || '#')}">Open de VVL Planning App</a></p>
    <p>Groet,<br>V.V. Lekkerkerk</p>
  `;
  return { subject, text, html };
}

async function sendBulk(people, buildContent) {
  const settings = await getMailSettings();
  if (!isMailReady(settings)) {
    return { sent: 0, failed: 0, skipped: people.length, reason: 'not_configured' };
  }

  let sent = 0;
  let failed = 0;
  for (const person of people) {
    if (!person.email) {
      failed += 1;
      continue;
    }
    try {
      const { subject, text, html } = buildContent(person);
      await sendMail({ to: person.email, subject, text, html });
      sent += 1;
    } catch (err) {
      console.error('[Mail] Bulk mislukt voor', person.email, err.message);
      failed += 1;
    }
  }
  return { sent, failed, skipped: 0 };
}

export async function notifyVolunteers({ deadline, appUrl }) {
  const people = await prisma.person.findMany({
    where: {
      active: true,
      email: { not: null },
      passwordHash: { not: null },
      obligation: 'NONE',
    },
  });
  return sendBulk(people, (p) =>
    volunteerOpenEmail({ name: p.name, deadline, appUrl }),
  );
}

export async function notifyMandatory({ appUrl }) {
  const people = await prisma.person.findMany({
    where: {
      active: true,
      email: { not: null },
      obligation: { in: ['FULL', 'HALF'] },
    },
  });
  return sendBulk(people, (p) => mandatoryOpenEmail({ name: p.name, appUrl }));
}
