import prisma from './prisma.js';
import { endOfDay, startOfDay } from './dates.js';
import { isMailReady, sendMail, getMailSettings } from './mail.js';
import { resolvePublicAppUrl } from './appUrl.js';
import { dienstLabel, formatDutyDate, renderMail, resolveMailTemplates } from './mailTemplates.js';

export const REMINDER_DAYS_AHEAD = 2;

export const REMINDER_DECISION =
  'E-mailherinnering 2 dagen voor een ingeplande dienst, alleen als SMTP aanstaat. Geen push/WhatsApp. De tekst is aanpasbaar in Beheer → E-mail. Productie-server moet wakker blijven (geen Free-sleep) wil dit betrouwbaar lopen.';

export function reminderWindow(now = new Date()) {
  const day = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + REMINDER_DAYS_AHEAD));
  return { from: day, to: endOfDay(day) };
}

export function dutyReminderEmail({ name, dateText, time, typeLabel, appUrl, template }) {
  const templates = resolveMailTemplates(template ? { reminder: template } : null);
  return renderMail(templates.reminder, {
    naam: name,
    datum: dateText,
    tijd: time,
    dienst: typeLabel,
    link: appUrl || '',
  });
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

  const { from, to } = reminderWindow(now);
  const templates = resolveMailTemplates(settings.templates);

  const enrollments = await prisma.enrollment.findMany({
    where: {
      remindedAt: null,
      noShow: false,
      service: {
        active: true,
        draft: false,
        date: { gte: from, lte: to },
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
      const content = dutyReminderEmail({
        name: enrollment.person.name,
        dateText: formatDutyDate(enrollment.service.date),
        time: enrollment.service.time,
        typeLabel: dienstLabel(enrollment.service.type),
        appUrl,
        template: templates.reminder,
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
