/**
 * Wat er met de gekoppelde bardiensten gebeurt als Sportlink een wedstrijd verplaatst of afgelast.
 *
 * Vaste regels (Dennis):
 * - Nooit iemand inschrijven, nooit automatisch plannen. Alleen bestaande diensten volgen de wedstrijd.
 * - Inschrijvingen blijven altijd staan.
 * - Afgelast = dienst krijgt cancelled=true (zichtbaar, geen hard delete, telt niet als open plek).
 * - Handmatig beschermde diensten (origin MANUAL, teamDutiesManual, activiteit, toernooi) blijven staan en worden gemeld.
 * - Diensten van een andere thuiswedstrijd op dezelfde dag blijven staan (alleen koppeling verspringt).
 */
import { evaluateRule, startOfDay, endOfDay, startTimeFromService } from '../serviceRuleLogic.js';
import { dienstLabel, formatDutyDate, renderMail, resolveMailTemplates } from '../mailTemplates.js';
import { resolvePublicAppUrl } from '../appUrl.js';

const MATCH_DEPENDENT = new Set(['HOME_MATCH', 'HOME_MATCH_TEAM']);

function appLink() {
  try {
    return resolvePublicAppUrl();
  } catch {
    return '';
  }
}

export function protectionReason(service) {
  if (service.origin === 'MANUAL') return 'handmatig aangemaakt';
  if (service.teamDutiesManual) return 'teamplek handmatig gezet door de barcommissie';
  if (service.activityId) return 'hoort bij een activiteit';
  if (service.tournamentId) return 'hoort bij een toernooi';
  if (!service.sourceRule) return 'geen dienstregel gekoppeld';
  return null;
}

function serviceBrief(service) {
  return {
    serviceId: service.id,
    type: service.type,
    time: service.time,
    date: service.date,
    enrolled: (service.enrollments || []).length,
    draft: Boolean(service.draft),
    locked: Boolean(service.locked),
  };
}

function addRecipient(map, enrollment, entry) {
  const person = enrollment.person;
  if (!person) return;
  if (!map.has(person.id)) map.set(person.id, { person, items: [] });
  map.get(person.id).items.push(entry);
}

/**
 * Past de diensten aan die aan `match` gekoppeld zijn. Draait binnen de transactie `tx`.
 * @param {object} tx  prisma-client of transactie
 * @param {{ match: object, kind: 'MOVED'|'CANCELLED'|'RESTORED'|'RETIMED', newDate?: Date, restore?: boolean }} input
 * `restore`: de afgelasting is ingetrokken (bij een tegelijk verplaatste wedstrijd eerst terugzetten, dan meeschuiven).
 */
export async function applyMatchChangeToServices(tx, { match, kind, newDate, restore = false }) {
  const details = [];
  const recipients = new Map();
  const counts = { moved: 0, cancelled: 0, restored: 0, protectedCount: 0, linked: 0 };

  const includeOpts = {
    enrollments: { include: { person: true } },
    sourceRule: true,
    teamDuties: { select: { id: true } },
  };

  const teams = await tx.team.findMany();

  if (kind === 'RESTORED' || restore) {
    const cancelled = await tx.service.findMany({
      where: { matchId: match.id, active: true, cancelled: true },
      include: includeOpts,
    });
    for (const service of cancelled) {
      counts.linked += 1;
      await tx.service.update({ where: { id: service.id }, data: { cancelled: false } });
      counts.restored += 1;
      details.push({ ...serviceBrief(service), action: 'restored' });
    }
    if (kind === 'RESTORED') return { details, recipients, counts };
    counts.linked = 0; // hieronder opnieuw geteld bij het verschuiven
  }

  const services = await tx.service.findMany({
    where: { matchId: match.id, active: true, cancelled: false },
    include: includeOpts,
    orderBy: [{ date: 'asc' }, { id: 'asc' }],
  });

  for (const service of services) {
    counts.linked += 1;
    const brief = serviceBrief(service);
    const reason = protectionReason(service);

    if (kind === 'RETIMED') {
      details.push({ ...brief, action: 'retimed', reason: 'tijd van de dienst volgt de dienstregel en blijft staan' });
      continue;
    }

    if (reason) {
      counts.protectedCount += 1;
      details.push({ ...brief, action: 'protected', reason });
      continue;
    }

    const rule = service.sourceRule;
    const day = startOfDay(service.date);
    const remaining = await tx.match.findMany({
      where: {
        id: { not: match.id },
        home: true,
        cancelled: false,
        date: { gte: day, lte: endOfDay(day) },
      },
      include: { team: true },
    });

    // Dienst hangt niet van een thuiswedstrijd af (bijv. altijd open op zaterdag): niet meebewegen.
    if (!MATCH_DEPENDENT.has(rule.conditionType)) {
      await tx.service.update({
        where: { id: service.id },
        data: { matchId: remaining[0]?.id ?? null },
      });
      details.push({ ...brief, action: 'stays', reason: 'dienst hangt niet van deze wedstrijd af' });
      continue;
    }

    const evaluation = evaluateRule(rule, {
      date: day,
      weekday: day.getDay(),
      homeMatches: remaining,
      activities: [],
      teams,
    });
    if (evaluation.ok) {
      await tx.service.update({
        where: { id: service.id },
        data: { matchId: evaluation.matches?.[0]?.id ?? remaining[0]?.id ?? null },
      });
      details.push({ ...brief, action: 'stays', reason: 'er is nog een andere thuiswedstrijd die dag' });
      continue;
    }
    if (evaluation.reason) {
      counts.protectedCount += 1;
      details.push({
        ...brief,
        action: 'protected',
        reason: `dienstregel niet te beoordelen (${evaluation.reason}); controleer handmatig`,
      });
      continue;
    }

    if (kind === 'CANCELLED') {
      await tx.service.update({ where: { id: service.id }, data: { cancelled: true } });
      counts.cancelled += 1;
      details.push({ ...brief, action: 'cancelled' });
      for (const enrollment of service.enrollments) {
        addRecipient(recipients, enrollment, { type: service.type, time: service.time, date: service.date });
      }
      continue;
    }

    // MOVED
    const targetDay = startOfDay(newDate);
    const startTime = startTimeFromService(service);
    const clash = await tx.service.findFirst({
      where: {
        id: { not: service.id },
        type: service.type,
        active: true,
        cancelled: false,
        date: { gte: targetDay, lte: endOfDay(targetDay) },
      },
    });
    if (clash && startTimeFromService(clash) === startTime) {
      counts.protectedCount += 1;
      details.push({
        ...brief,
        action: 'conflict',
        reason: 'er staat al een dienst op de nieuwe datum en tijd; handmatig beoordelen',
        toDate: targetDay,
      });
      continue;
    }
    await tx.service.update({ where: { id: service.id }, data: { date: targetDay } });
    counts.moved += 1;
    const weekdayMismatch = rule.weekday != null && Number(rule.weekday) !== targetDay.getDay();
    details.push({
      ...brief,
      action: 'moved',
      toDate: targetDay,
      ...(weekdayMismatch
        ? { reason: 'let op: de dienstregel geldt voor een andere weekdag; controleer de planning' }
        : {}),
    });
    for (const enrollment of service.enrollments) {
      addRecipient(recipients, enrollment, {
        type: service.type,
        time: service.time,
        date: service.date,
        newDate: targetDay,
      });
    }
  }

  return { details, recipients, counts };
}

const uniq = (list) => [...new Set(list)];

/** Variabelen voor de mailtekst; één mail per persoon, ook bij meerdere diensten. */
export function changeMailVars({ person, items, kind, matchLabel }) {
  const first = items[0];
  const oldDate = formatDutyDate(first.date);
  const newDate = first.newDate ? formatDutyDate(first.newDate) : '';
  const oldTime = uniq(items.map((i) => i.time).filter(Boolean)).join(' en ');
  return {
    naam: person.name,
    wedstrijd: matchLabel,
    dienst: uniq(items.map((i) => dienstLabel(i.type))).join(' en '),
    oudedatum: oldDate,
    oudetijd: oldTime,
    nieuwedatum: newDate,
    nieuwetijd: oldTime,
    datum: kind === 'CANCELLED' ? oldDate : newDate,
    tijd: oldTime,
    link: appLink(),
  };
}

function isUniqueViolation(err) {
  return err?.code === 'P2002';
}

/**
 * Mailt de ingeschreven vrijwilligers over een verplaatsing of afgelasting.
 * Respecteert de mail aan/uit-schakelaar en stuurt per wijziging maximaal één mail per persoon
 * (unieke rij in MatchChangeMail, dus ook niet bij een herhaalde run).
 */
export async function sendChangeMails({ prisma, change, kind, matchLabel, recipients, mail }) {
  const result = { sent: 0, failed: 0, skippedNoEmail: 0, skippedMailOff: 0, skippedDuplicate: 0 };
  if (!recipients.size) return result;
  const templateKey = kind === 'CANCELLED' ? 'matchCancelled' : 'matchMoved';

  const settings = await mail.getSettings();
  const ready = mail.isReady(settings);
  const templates = resolveMailTemplates(settings.templates);

  for (const { person, items } of recipients.values()) {
    if (person.active === false || !String(person.email || '').includes('@')) {
      result.skippedNoEmail += 1;
      continue;
    }
    if (!ready) {
      result.skippedMailOff += 1;
      continue;
    }
    let row;
    try {
      row = await prisma.matchChangeMail.create({ data: { changeId: change.id, personId: person.id } });
    } catch (err) {
      if (isUniqueViolation(err)) {
        result.skippedDuplicate += 1;
        continue;
      }
      throw err;
    }
    try {
      const content = renderMail(templates[templateKey], changeMailVars({ person, items, kind, matchLabel }), {
        templateKey,
      });
      const res = await mail.send({ to: person.email, ...content });
      if (res?.sent) {
        await prisma.matchChangeMail.update({ where: { id: row.id }, data: { sent: true } });
        result.sent += 1;
      } else {
        result.failed += 1;
      }
    } catch (err) {
      console.error('[Sportlink] mail mislukt', person.id, err.message);
      result.failed += 1;
    }
  }
  return result;
}
