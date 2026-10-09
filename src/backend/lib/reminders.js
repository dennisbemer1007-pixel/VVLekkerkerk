import prisma from './prisma.js';
import { endOfDay, startOfDay } from './dates.js';
import { isMailReady, sendMail, getMailSettings } from './mail.js';
import { resolvePublicAppUrl } from './appUrl.js';
import { dienstLabel, formatDutyDate, renderMail, resolveMailTemplates } from './mailTemplates.js';

export const REMINDER_DAYS_AHEAD = 2;

export const REMINDER_DECISION =
  'E-mailherinnering 2 dagen voor een ingeplande dienst, alleen als SMTP aanstaat. Persoonlijk aan wie staat ingeschreven, en apart aan de bardienstcoördinator als diens team een teamdienst heeft. Geen push/WhatsApp. De tekst is aanpasbaar in Beheer → E-mail (persoonlijk). Productie-server moet wakker blijven (geen Free-sleep) wil dit betrouwbaar lopen. De knop “Herinneringen over 2 dagen” forceert dezelfde run buiten de automatische 50-minuten-throttle.';

export function reminderWindow(now = new Date()) {
  const day = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + REMINDER_DAYS_AHEAD));
  return { from: day, to: endOfDay(day) };
}

export function dutyReminderEmail({ name, dateText, time, typeLabel, appUrl, template }) {
  const templates = resolveMailTemplates(template ? { reminder: template } : null);
  return renderMail(
    templates.reminder,
    {
      naam: name,
      datum: dateText,
      tijd: time,
      dienst: typeLabel,
      link: appUrl || '',
    },
    { templateKey: 'reminder' },
  );
}

/** Mail aan bardienstcoördinator: team heeft over 2 dagen een teamdienst. */
export function teamCoordinatorReminderEmail({
  name,
  teamName,
  dateText,
  time,
  typeLabel,
  appUrl,
}) {
  const subject = `Herinnering teamdienst ${teamName} ${dateText}`;
  const body = `Hoi ${name},

Over twee dagen heeft ${teamName} een teamdienst (${typeLabel}): ${dateText}, ${time}.

Zet zo nodig nog ouders op naam via de app.
${appUrl ? `\nBekijk de planning: ${appUrl}\n` : ''}
Groet,
V.V. Lekkerkerk`;
  return renderMail(
    { subject, body },
    {
      naam: name,
      datum: dateText,
      tijd: time,
      dienst: typeLabel,
      link: appUrl || '',
    },
    { templateKey: 'reminder' },
  );
}

let lastRunAt = 0;

export async function maybeRunDutyReminders({ force = false } = {}) {
  const now = Date.now();
  if (!force && now - lastRunAt < 50 * 60 * 1000) return { skipped: true };
  lastRunAt = now;
  return runDutyReminders();
}

async function sendPersonalReminders({ from, to, templates, appUrl }) {
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
      const result = await sendMail({ to: enrollment.person.email, ...content });
      if (!result?.sent) {
        console.error(
          '[Mail] Herinnering niet verstuurd',
          enrollment.person.id,
          result?.reason || 'onbekend',
        );
        failed += 1;
        continue;
      }
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

  return { sent, failed, considered: enrollments.length };
}

async function sendTeamCoordinatorReminders({ from, to, appUrl }) {
  const duties = await prisma.serviceTeamDuty.findMany({
    where: {
      coordinatorRemindedAt: null,
      service: {
        active: true,
        draft: false,
        date: { gte: from, lte: to },
      },
      team: {
        active: true,
        coordinator: { active: true, email: { not: null } },
      },
    },
    include: {
      service: true,
      team: { include: { coordinator: true } },
    },
  });

  let sent = 0;
  let failed = 0;

  for (const duty of duties) {
    const coordinator = duty.team?.coordinator;
    if (!coordinator?.email) {
      failed += 1;
      continue;
    }
    try {
      const content = teamCoordinatorReminderEmail({
        name: coordinator.name,
        teamName: duty.team.name,
        dateText: formatDutyDate(duty.service.date),
        time: duty.service.time,
        typeLabel: dienstLabel(duty.service.type),
        appUrl,
      });
      const result = await sendMail({ to: coordinator.email, ...content });
      if (!result?.sent) {
        console.error(
          '[Mail] Teamco-herinnering niet verstuurd',
          duty.teamId,
          result?.reason || 'onbekend',
        );
        failed += 1;
        continue;
      }
      await prisma.serviceTeamDuty.update({
        where: { id: duty.id },
        data: { coordinatorRemindedAt: new Date() },
      });
      sent += 1;
    } catch (err) {
      console.error('[Mail] Teamco-herinnering mislukt', duty.teamId, err.message);
      failed += 1;
    }
  }

  return { sent, failed, considered: duties.length };
}

export async function runDutyReminders({ now = new Date() } = {}) {
  const settings = await getMailSettings();
  if (!isMailReady(settings)) {
    return {
      sent: 0,
      failed: 0,
      skipped: 0,
      reason: 'not_configured',
      personal: { sent: 0, failed: 0, considered: 0 },
      coordinators: { sent: 0, failed: 0, considered: 0 },
    };
  }

  const { from, to } = reminderWindow(now);
  const templates = resolveMailTemplates(settings.templates);
  const appUrl = (() => {
    try {
      return resolvePublicAppUrl();
    } catch {
      return '';
    }
  })();

  const personal = await sendPersonalReminders({ from, to, templates, appUrl });
  const coordinators = await sendTeamCoordinatorReminders({ from, to, appUrl });

  return {
    sent: personal.sent + coordinators.sent,
    failed: personal.failed + coordinators.failed,
    skipped: 0,
    considered: personal.considered + coordinators.considered,
    personal,
    coordinators,
  };
}
