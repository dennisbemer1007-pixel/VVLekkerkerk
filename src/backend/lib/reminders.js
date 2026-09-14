import prisma from './prisma.js';
import { endOfDay, startOfDay } from './dates.js';
import { isMailReady, sendMail, getMailSettings } from './mail.js';
import { resolvePublicAppUrl } from './appUrl.js';
import { serviceLocation } from './serviceHelpers.js';

export const REMINDER_DECISION =
  'E-mailherinnering 1 dag voor een ingeplande dienst, alleen als SMTP aanstaat. Geen push/WhatsApp. Productie-server moet wakker blijven (geen Free-sleep) wil dit betrouwbaar lopen.';

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function dutyReminderEmail({ name, dateText, time, typeLabel, appUrl }) {
  const subject = `Herinnering dienst ${dateText}`;
  const text = `Hoi ${name},

Je staat morgen op de ${typeLabel} (${time}).

Bekijk de planning: ${appUrl || 'de VVL Planning App'}

Groet,
V.V. Lekkerkerk`;
  const html = `
    <p>Hoi ${escapeHtml(name)},</p>
    <p>Je staat <strong>morgen</strong> op de ${escapeHtml(typeLabel)} (${escapeHtml(time)}).</p>
    <p><a href="${escapeHtml(appUrl || '#')}">Open de VVL Planning App</a></p>
    <p>Groet,<br>V.V. Lekkerkerk</p>
  `;
  return { subject, text, html };
}

let lastRunAt = 0;

export async function maybeRunDutyReminders({ force = false } = {}) {
  const now = Date.now();
  if (!force && now - lastRunAt < 50 * 60 * 1000) return { skipped: true };
  lastRunAt = now;
  return runDutyReminders();
}

export async function runDutyReminders({ now = new Date() } = {}) {
  const settings = await getMailSettings();
  if (!isMailReady(settings)) {
    return { sent: 0, failed: 0, skipped: 0, reason: 'not_configured' };
  }

  const tomorrow = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  const to = endOfDay(tomorrow);

  const enrollments = await prisma.enrollment.findMany({
    where: {
      remindedAt: null,
      noShow: false,
      service: {
        active: true,
        draft: false,
        date: { gte: tomorrow, lte: to },
      },
      person: { active: true, email: { not: null } },
    },
    include: { person: true, service: true },
  });

  let sent = 0;
  let failed = 0;
  const appUrl = (() => {
    try {
      return resolvePublicAppUrl();
    } catch {
      return '';
    }
  })();

  for (const enrollment of enrollments) {
    if (!enrollment.person?.email) {
      failed += 1;
      continue;
    }
    try {
      const dateText = new Date(enrollment.service.date).toLocaleDateString('nl-NL', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      });
      const typeLabel = serviceLocation(enrollment.service.type) === 'Keuken' ? 'keukendienst' : 'bardienst';
      const content = dutyReminderEmail({
        name: enrollment.person.name,
        dateText,
        time: enrollment.service.time,
        typeLabel,
        appUrl,
      });
      await sendMail({ to: enrollment.person.email, ...content });
      await prisma.enrollment.update({
        where: { id: enrollment.id },
        data: { remindedAt: new Date() },
      });
      sent += 1;
    } catch (err) {
      console.error('[Mail] Herinnering mislukt', enrollment.person.id, err.message);
      failed += 1;
    }
  }

  return { sent, failed, skipped: 0, considered: enrollments.length };
}
