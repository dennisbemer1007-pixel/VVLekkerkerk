/**
 * Sportlink Club.Dataservice → wedstrijden in de app.
 *
 * De sync voegt nieuwe wedstrijden toe, werkt verplaatste wedstrijden bij en markeert afgelaste
 * wedstrijden. Ze verwijdert nooit een wedstrijd, deelt nooit iemand in en voert geen
 * automatische planning uit (generateServicesFromRules/autoFill worden hier bewust niet gebruikt).
 * Gekoppelde bestaande diensten volgen de wedstrijd (zie changes.js).
 */
import prisma from '../prisma.js';
import { getClubSettings, seasonRangeFromLabel } from '../season.js';
import { sealSecret, unsealSecret } from '../secrets.js';
import { parseMatchDateInput } from '../authz.js';
import { combineDateAndTime } from '../time.js';
import { addTeamToIndex, buildTeamIndex, findTeamInIndex, setClubName } from '../knvbTeams.js';
import { defaultTeamFunctions } from '../teamFunctions.js';
import { startOfDay } from '../dates.js';
import { notifyBarcommissie } from '../notifications.js';
import { getMailSettings, isMailReady, sendMail } from '../mail.js';
import { writeAudit } from '../audit.js';
import {
  SportlinkError,
  fetchSportlinkProgram,
  isPlausibleClientId,
  mapProgramRow,
  normalizeClientId,
} from './client.js';
import { applyMatchChangeToServices, sendChangeMails } from './changes.js';

const MAX_LISTED = 60;
let running = false;

const defaultMail = { getSettings: getMailSettings, isReady: isMailReady, send: sendMail };

export function emptyReport(trigger = 'manual') {
  return {
    trigger,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    status: 'ok',
    fetched: 0,
    newMatches: 0,
    changed: 0,
    moved: 0,
    cancelled: 0,
    restored: 0,
    unchanged: 0,
    skippedManual: 0,
    skippedIncomplete: 0,
    adopted: 0,
    missingInSportlink: 0,
    createdTeams: [],
    servicesMoved: 0,
    servicesCancelled: 0,
    servicesProtected: 0,
    mailsSent: 0,
    mailsFailed: 0,
    mailsSkippedOff: 0,
    mailsSkippedNoEmail: 0,
    items: [],
    errors: [],
    warnings: [],
  };
}

function list(report, key, entry) {
  if (report[key].length < MAX_LISTED) report[key].push(entry);
}

function sameDay(a, b) {
  if (!a || !b) return false;
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

function matchDate(next) {
  const parsed = parseMatchDateInput(next.date);
  return next.time ? combineDateAndTime(parsed, next.time) : parsed;
}

function matchLabel(next) {
  return `${next.team}${next.opponent ? ` - ${next.opponent}` : ''}`;
}

/** Wat verschilt er tussen wat we hebben en wat Sportlink zegt? */
export function diffMatch(existing, next, nextDate, teamId) {
  const diff = {
    date: !sameDay(existing.date, nextDate),
    time: (existing.time || '') !== (next.time || ''),
    team: Number(existing.teamId || 0) !== Number(teamId || 0),
    opponent: (existing.opponent || '') !== (next.opponent || ''),
    home: Boolean(existing.home) !== Boolean(next.home),
    field: next.field != null && (existing.field || '') !== next.field,
    matchType: next.matchType != null && (existing.matchType || '') !== next.matchType,
    playLevel: next.playLevel != null && (existing.playLevel || '') !== next.playLevel,
    cancelled: Boolean(existing.cancelled) !== Boolean(next.cancelled),
  };
  diff.any = Object.values(diff).some(Boolean);
  return diff;
}

export function nightlyDue({ now = new Date(), lastSyncAt = null, lastStatus = '' } = {}) {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Amsterdam',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type) => Number(parts.find((p) => p.type === type)?.value);
  if (get('hour') < 4) return false;
  if (!lastSyncAt) return true;
  const last = new Date(lastSyncAt);
  if (lastStatus === 'error') return now - last >= 3 * 60 * 60 * 1000;
  const dayKey = (d) =>
    new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Amsterdam' }).format(d);
  return dayKey(last) !== dayKey(now);
}

/** Publieke weergave: de Client ID zelf gaat nooit naar de browser. */
export function publicSportlinkSettings(settings) {
  let report = null;
  try {
    report = settings.sportlinkLastReport ? JSON.parse(settings.sportlinkLastReport) : null;
  } catch {
    report = null;
  }
  return {
    enabled: Boolean(settings.sportlinkEnabled),
    clientIdSet: Boolean(settings.sportlinkClientId),
    clubName: settings.clubName || '',
    lastSyncAt: settings.sportlinkLastSyncAt ? new Date(settings.sportlinkLastSyncAt).toISOString() : null,
    lastStatus: settings.sportlinkLastStatus || '',
    lastReport: report,
  };
}

export async function saveSportlinkSettings({ enabled, clientId, clubName }, { actorId = null } = {}) {
  const current = await getClubSettings();
  const data = {};
  if (clientId !== undefined && String(clientId).trim() !== '') {
    const id = normalizeClientId(clientId);
    if (!isPlausibleClientId(id)) {
      throw Object.assign(new Error('Client ID ziet er niet goed uit. Gebruik de code uit Sportlink Club (alleen letters en cijfers).'), { status: 400 });
    }
    data.sportlinkClientId = sealSecret(id);
  }
  if (clubName !== undefined) {
    const name = String(clubName || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    data.clubName = name;
  }
  if (enabled !== undefined) {
    const on = Boolean(enabled);
    const hasId = Boolean(data.sportlinkClientId || current.sportlinkClientId);
    if (on && !hasId) {
      throw Object.assign(new Error('Vul eerst een Client ID in voordat je de koppeling aanzet.'), { status: 400 });
    }
    data.sportlinkEnabled = on;
  }
  const updated = await prisma.clubSettings.update({ where: { id: 1 }, data });
  if (data.clubName !== undefined) setClubName(updated.clubName);
  await writeAudit({
    actorId,
    action: 'club.sportlink',
    entity: 'ClubSettings',
    entityId: 1,
    detail: [
      enabled !== undefined ? (enabled ? 'aan' : 'uit') : null,
      data.sportlinkClientId ? 'client-id gewijzigd' : null,
      data.clubName !== undefined ? 'clubnaam gewijzigd' : null,
    ]
      .filter(Boolean)
      .join(', '),
  });
  return updated;
}

async function loadExisting(numbers) {
  const byNumber = new Map();
  for (let i = 0; i < numbers.length; i += 400) {
    const rows = await prisma.match.findMany({
      where: { matchNumber: { in: numbers.slice(i, i + 400) } },
      include: { team: true },
    });
    for (const row of rows) byNumber.set(String(row.matchNumber), row);
  }
  return byNumber;
}

async function resolveTeam(index, teamName, report) {
  if (!teamName) return null;
  let found = findTeamInIndex(index, teamName);
  if (!found) {
    const fn = defaultTeamFunctions(teamName);
    found = await prisma.team.create({
      data: {
        name: teamName,
        availabilityUse: fn.availabilityUse,
        teamDutyUse: fn.teamDutyUse,
        teamDutySlots: JSON.stringify(fn.teamDutySlots),
        functionsConfigured: true,
      },
    });
    addTeamToIndex(index, found);
    report.createdTeams.push(found.name);
  }
  return found;
}

/** CSV-wedstrijd zonder (of met ander) nummer: zelfde dag, team en tegenstander is dezelfde wedstrijd. */
async function findAdoptionCandidate(next, nextDate, teamId) {
  const day = startOfDay(nextDate);
  const end = new Date(day);
  end.setHours(23, 59, 59, 999);
  const rows = await prisma.match.findMany({
    where: { date: { gte: day, lte: end }, teamId, home: true },
  });
  const wanted = String(next.opponent || '').trim().toLowerCase();
  const hits = rows.filter(
    (m) =>
      String(m.opponent || '').trim().toLowerCase() === wanted &&
      (!m.matchNumber || m.source === 'csv' || m.source === 'manual'),
  );
  return hits.length === 1 ? hits[0] : null;
}

async function persistChange({ existing, next, nextDate, team, diff, kind, report, now }) {
  const data = {
    date: nextDate,
    time: next.time || null,
    home: next.home,
    opponent: next.opponent || null,
    teamId: team?.id ?? null,
    matchType: next.matchType ?? existing.matchType,
    playLevel: next.playLevel ?? existing.playLevel,
    field: next.field ?? existing.field,
    cancelled: Boolean(next.cancelled),
    source: 'sportlink',
  };
  const startToday = startOfDay(now);
  const past = new Date(existing.date) < startToday && nextDate < startToday;
  const label = matchLabel(next);

  const outcome = await prisma.$transaction(async (tx) => {
    const updated = await tx.match.update({ where: { id: existing.id }, data });
    if (past || !kind) return { updated, services: null, change: null };

    const services = await applyMatchChangeToServices(tx, {
      match: existing,
      kind,
      newDate: nextDate,
      restore: Boolean(existing.cancelled) && !next.cancelled,
    });
    let change = null;
    if (services.counts.linked > 0) {
      change = await tx.matchChange.create({
        data: {
          matchId: existing.id,
          kind,
          label,
          oldDate: existing.date,
          oldTime: existing.time,
          newDate: nextDate,
          newTime: next.time || null,
          detail: JSON.stringify(services.details),
          servicesMoved: services.counts.moved,
          servicesCancelled: services.counts.cancelled,
          servicesProtected: services.counts.protectedCount,
        },
      });
    }
    return { updated, services, change };
  });

  if (outcome.services) {
    report.servicesMoved += outcome.services.counts.moved;
    report.servicesCancelled += outcome.services.counts.cancelled;
    report.servicesProtected += outcome.services.counts.protectedCount;
  }
  return { ...outcome, label };
}

function chooseKind(existing, next, diff) {
  if (next.cancelled && !existing.cancelled) return 'CANCELLED';
  if (!next.cancelled && existing.cancelled) return diff.date ? 'MOVED' : 'RESTORED';
  if (next.cancelled) return null;
  if (diff.date) return 'MOVED';
  if (diff.time) return 'RETIMED';
  return null;
}

/**
 * Voert één synchronisatie uit.
 * @param {{ trigger?: 'manual'|'nightly', actorId?: number|null, now?: Date,
 *           fetchImpl?: typeof fetch, baseUrl?: string, mail?: object }} [options]
 * @returns {Promise<{ skipped?: string, report?: object }>}
 */
export async function runSportlinkSync(options = {}) {
  const { trigger = 'manual', actorId = null, now = new Date(), fetchImpl, baseUrl, mail = defaultMail } = options;
  const settings = await getClubSettings();
  if (!settings.sportlinkEnabled) return { skipped: 'disabled' };
  if (!settings.sportlinkClientId) return { skipped: 'no_client_id' };
  if (running) return { skipped: 'running' };
  running = true;

  const report = emptyReport(trigger);
  try {
    let clientId;
    try {
      clientId = normalizeClientId(unsealSecret(settings.sportlinkClientId));
    } catch (err) {
      throw new SportlinkError(err.message, { code: 'secret' });
    }
    if (!clientId) throw new SportlinkError('Client ID kan niet worden gelezen. Vul hem opnieuw in.', { code: 'secret' });

    const clubName = setClubName(settings.clubName);
    const season = seasonRangeFromLabel(settings.seasonLabel, settings.seasonStartMonth);
    const minHorizon = new Date(now.getTime() + 56 * 86400000);
    const horizon = season.to > minHorizon ? season.to : minHorizon;

    const feed = await fetchSportlinkProgram({ clientId, from: now, horizon, fetchImpl, baseUrl });
    report.fetched = feed.rows.length;
    report.warnings.push(...feed.warnings);

    const entries = [];
    for (const row of feed.rows) {
      const mapped = mapProgramRow(row, { clubName });
      if (mapped.error) {
        report.skippedIncomplete += 1;
        list(report, 'items', { matchNumber: mapped.matchNumber || null, result: `overgeslagen, onvolledig (${mapped.error})` });
        continue;
      }
      if (feed.cancelledNumbers.has(mapped.matchNumber)) mapped.cancelled = true;
      entries.push(mapped);
    }

    const existingByNumber = await loadExisting(entries.map((e) => e.matchNumber));
    const teams = await prisma.team.findMany();
    const teamIndex = buildTeamIndex(teams);
    const changeJobs = [];
    const seen = new Set();

    for (const next of entries) {
      seen.add(next.matchNumber);
      try {
        const nextDate = matchDate(next);
        const team = await resolveTeam(teamIndex, next.team, report);
        let existing = existingByNumber.get(next.matchNumber);

        if (!existing) {
          const candidate = team ? await findAdoptionCandidate(next, nextDate, team.id) : null;
          if (candidate?.manualEdit) {
            report.skippedManual += 1;
            list(report, 'items', { matchNumber: next.matchNumber, label: matchLabel(next), result: 'overgeslagen, handmatig' });
            continue;
          }
          if (candidate) {
            existing = await prisma.match.update({
              where: { id: candidate.id },
              data: { matchNumber: next.matchNumber },
              include: { team: true },
            });
            report.adopted += 1;
          }
        }

        if (!existing) {
          await prisma.match.create({
            data: {
              date: nextDate,
              time: next.time || null,
              home: next.home,
              opponent: next.opponent || null,
              matchNumber: next.matchNumber,
              matchType: next.matchType,
              playLevel: next.playLevel,
              field: next.field,
              cancelled: Boolean(next.cancelled),
              source: 'sportlink',
              manualEdit: false,
              teamId: team?.id ?? null,
            },
          });
          report.newMatches += 1;
          list(report, 'items', { matchNumber: next.matchNumber, label: matchLabel(next), result: next.cancelled ? 'nieuw (afgelast)' : 'nieuw' });
          continue;
        }

        const diff = diffMatch(existing, next, nextDate, team?.id);
        if (!diff.any) {
          report.unchanged += 1;
          continue;
        }
        if (existing.manualEdit) {
          report.skippedManual += 1;
          list(report, 'items', { matchNumber: next.matchNumber, label: matchLabel(next), result: 'overgeslagen, handmatig' });
          continue;
        }

        const kind = chooseKind(existing, next, diff);
        const outcome = await persistChange({ existing, next, nextDate, team, diff, kind, report, now });
        report.changed += 1;
        if (kind === 'MOVED') report.moved += 1;
        if (kind === 'CANCELLED') report.cancelled += 1;
        if (kind === 'RESTORED') report.restored += 1;
        list(report, 'items', {
          matchNumber: next.matchNumber,
          label: outcome.label,
          result: ({ MOVED: 'verplaatst', CANCELLED: 'afgelast', RESTORED: 'hersteld', RETIMED: 'aanvangstijd gewijzigd' }[kind]) || 'gewijzigd',
          services: outcome.services
            ? { moved: outcome.services.counts.moved, cancelled: outcome.services.counts.cancelled, protected: outcome.services.counts.protectedCount }
            : undefined,
        });
        if (outcome.change) {
          changeJobs.push({ change: outcome.change, kind, label: outcome.label, recipients: outcome.services.recipients });
        }
      } catch (err) {
        report.errors.push(`Wedstrijd ${next.matchNumber}: ${err.message}`);
      }
    }

    // Informatief: eigen Sportlink-wedstrijden in het venster die Sportlink niet (meer) noemt. Nooit verwijderen.
    if (!feed.truncated) {
      const upcoming = await prisma.match.findMany({
        where: { source: 'sportlink', matchNumber: { not: null }, date: { gte: startOfDay(now), lte: horizon } },
        select: { matchNumber: true },
      });
      report.missingInSportlink = upcoming.filter((m) => !seen.has(String(m.matchNumber))).length;
    }

    // Mails pas na de database-wijzigingen: een mislukte mail draait niets terug en komt nooit dubbel.
    for (const job of changeJobs) {
      if (job.kind !== 'MOVED' && job.kind !== 'CANCELLED') continue;
      try {
        const res = await sendChangeMails({
          prisma,
          change: job.change,
          kind: job.kind,
          matchLabel: job.label,
          recipients: job.recipients,
          mail,
        });
        report.mailsSent += res.sent;
        report.mailsFailed += res.failed;
        report.mailsSkippedOff += res.skippedMailOff;
        report.mailsSkippedNoEmail += res.skippedNoEmail;
        await prisma.matchChange.update({
          where: { id: job.change.id },
          data: { mailsSent: res.sent, mailsFailed: res.failed },
        });
      } catch (err) {
        report.errors.push(`Mail bij ${job.label}: ${err.message}`);
      }
    }

    if (changeJobs.length) {
      const moved = changeJobs.filter((j) => j.kind === 'MOVED').length;
      const cancelled = changeJobs.filter((j) => j.kind === 'CANCELLED').length;
      const protectedCount = report.servicesProtected;
      await notifyBarcommissie({
        type: 'MATCH_CHANGE',
        title: 'Sportlink: wedstrijden gewijzigd',
        body:
          `${moved} verplaatst, ${cancelled} afgelast. ` +
          `${report.servicesMoved} diensten verschoven, ${report.servicesCancelled} vervallen` +
          (protectedCount ? `, ${protectedCount} handmatig/conflict (controleer)` : '') +
          '. Zie het dashboard.',
        link: '/open',
      });
    }

    report.status = report.errors.length ? 'partial' : 'ok';
  } catch (err) {
    report.status = 'error';
    report.errors.push(err.message);
    console.error('[Sportlink] sync mislukt:', err.code || '', err.message);
  } finally {
    running = false;
    report.finishedAt = new Date().toISOString();
    await prisma.clubSettings
      .update({
        where: { id: 1 },
        data: {
          sportlinkLastSyncAt: new Date(),
          sportlinkLastStatus: report.status,
          sportlinkLastReport: JSON.stringify(report),
        },
      })
      .catch((err) => console.error('[Sportlink] rapport opslaan mislukt:', err.message));
  }
  if (actorId) {
    await writeAudit({
      actorId,
      action: 'sportlink.sync',
      entity: 'ClubSettings',
      entityId: 1,
      detail: `${report.status}: ${report.newMatches} nieuw, ${report.moved} verplaatst, ${report.cancelled} afgelast`,
    }).catch(() => {});
  }
  return { report };
}

/** Nachtelijke run (vanaf 04:00 Amsterdam), één keer per dag; bij een fout elke 3 uur opnieuw. */
export async function maybeRunNightlySportlinkSync({ now = new Date(), ...options } = {}) {
  const settings = await getClubSettings();
  if (!settings.sportlinkEnabled || !settings.sportlinkClientId) return { skipped: 'off' };
  if (!nightlyDue({ now, lastSyncAt: settings.sportlinkLastSyncAt, lastStatus: settings.sportlinkLastStatus })) {
    return { skipped: 'not_due' };
  }
  return runSportlinkSync({ ...options, now, trigger: 'nightly' });
}

export async function applyStoredClubName() {
  const settings = await getClubSettings();
  setClubName(settings.clubName);
}
