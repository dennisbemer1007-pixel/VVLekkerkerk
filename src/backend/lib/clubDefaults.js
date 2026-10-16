import prisma from './prisma.js';
import { defaultServiceRuleSeed } from './defaultServiceRules.js';
import { defaultTeamFunctions, parseTeamDutySlots } from './teamFunctions.js';
import { isOldYouthTeam, isYoungYouthTeam } from './youthTeams.js';
import { ensurePersonNumbers } from './personNumber.js';
import { getClubSettings } from './season.js';
import { cleanupPrivacy } from './privacy.js';
import { demoLoginsEnabled, ensureDemoAccounts } from './demoAccounts.js';

export async function ensureDefaultServiceRules() {
  const count = await prisma.serviceRule.count();
  if (count > 0) return { seeded: false, count };
  const seed = defaultServiceRuleSeed();
  for (const rule of seed) {
    await prisma.serviceRule.create({ data: rule });
  }
  return { seeded: true, count: seed.length };
}

/**
 * Zaterdag keuken laat alleen aanmaken als die regel er nog niet is.
 * Een bestaande regel (tijden, voorwaarde, aftrap, actief, team) blijft van de club:
 * genereren volgt die regel, repairs schrijven hem niet stilletjes over.
 */
export async function ensureSaturdayKitchenLateRule() {
  const spec = defaultServiceRuleSeed().find(
    (rule) => rule.weekday === 6 && rule.type === 'KITCHEN' && rule.slot === 'EVENING',
  );
  if (!spec) return { updated: 0, created: 0, preserved: false };

  const existing = await prisma.serviceRule.findFirst({
    where: {
      weekday: 6,
      type: 'KITCHEN',
      OR: [
        { slot: 'EVENING' },
        { name: { contains: 'keuken laat' } },
        { startTime: spec.startTime, endTime: spec.endTime },
      ],
    },
    orderBy: { id: 'asc' },
  });

  if (existing) {
    return { updated: 0, created: 0, preserved: true, ruleId: existing.id };
  }

  const teams = await prisma.team.findMany({ where: { active: { not: false } } });
  const { findTeamInIndex, buildTeamIndex } = await import('./knvbTeams.js');
  const index = buildTeamIndex(teams);
  const zaTeam =
    findTeamInIndex(index, 'Lekkerkerk 1', { date: new Date('2026-10-24T12:00:00') }) ||
    findTeamInIndex(index, 'Lekkerkerk 1 (za)') ||
    findTeamInIndex(index, 'Lekkerkerk 1');

  await prisma.serviceRule.create({
    data: {
      name: spec.name,
      weekday: 6,
      startTime: spec.startTime,
      endTime: spec.endTime,
      type: 'KITCHEN',
      required: spec.required,
      slot: 'EVENING',
      conditionType: 'HOME_MATCH_TEAM',
      conditionTeamName: 'Lekkerkerk 1',
      conditionTeamId: zaTeam?.id ?? null,
      // Hele dag: 14:30-thuiswedstrijd telt ook (niet alleen aftrap ≥ 15:00).
      kickoffAfter: null,
      active: true,
      sortOrder: spec.sortOrder,
    },
  });
  return { updated: 0, created: 1, preserved: false, teamId: zaTeam?.id ?? null };
}

export function normClock(value) {
  const match = String(value || '').match(/(\d{1,2}):(\d{2})/);
  return match ? `${String(Number(match[1])).padStart(2, '0')}:${match[2]}` : '';
}

/** Zaterdagbar 19:30–00:00 staat niet in de dienstregel (avondbar is 16:30–19:30). */
export function isStrayMidnightBarRule(rule) {
  return (
    Number(rule?.weekday) === 6 &&
    rule?.type === 'BAR' &&
    normClock(rule.startTime) === '19:30' &&
    normClock(rule.endTime) === '00:00'
  );
}

/** Lege AUTO-bardienst 19:30–00:00. Handmatig, met inschrijvingen of aan een activiteit: laten staan. */
export function isStrayMidnightBarService(service) {
  if (!service || service.type !== 'BAR' || service.origin !== 'AUTO') return false;
  if (service.activityId || service.activity?.id) return false;
  if ((service.enrollments || []).length > 0) return false;
  const match = String(service.time || '').match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
  if (!match) return false;
  return normClock(match[1]) === '19:30' && normClock(match[2]) === '00:00';
}

function saturdayBarSpecs() {
  return defaultServiceRuleSeed().filter(
    (rule) => rule.weekday === 6 && rule.type === 'BAR' && rule.teamDuty,
  );
}

function findSaturdayBarRule(rules, spec, used) {
  const pool = (rules || []).filter(
    (rule) => !used.has(rule.id) && Number(rule.weekday) === 6 && rule.type === 'BAR',
  );
  const bySlotOrRole = pool.find(
    (rule) =>
      (spec.slot && rule.slot === spec.slot) ||
      (spec.teamDutySlotRole && rule.teamDutySlotRole === spec.teamDutySlotRole),
  );
  if (bySlotOrRole) return bySlotOrRole;
  const nameHit = pool.find((rule) => {
    const name = String(rule.name || '').toLowerCase();
    if (spec.teamDutySlotRole === 'LAST') return /laatste/.test(name);
    if (spec.teamDutySlotRole === 'SECOND') return /tweede/.test(name);
    if (spec.teamDutySlotRole === 'MORNING') return /ochtend/.test(name);
    return false;
  });
  if (nameHit) return nameHit;
  // 19:30–00:00 is géén avondbar: niet als “laatste shift” claimen en niet herschrijven.
  return null;
}

/**
 * Ontbrekende zaterdag-teambardiensten aanmaken vanuit de standaard dienstregel.
 * Bestaande regels (tijden, voorwaarde, actief, slot) blijven staan — ook een
 * zelf bewaarde 19:30-regel. Die wordt niet uitgezet en niet naar 16:30 gezet.
 * Keukenregels worden niet aangeraakt.
 */
export function planStandardSaturdayBarRules(rules) {
  const list = [...(rules || [])].sort((a, b) => Number(a.id) - Number(b.id));
  const used = new Set();
  const updates = [];
  const creates = [];

  for (const spec of saturdayBarSpecs()) {
    const existing = findSaturdayBarRule(list, spec, used);
    if (!existing) {
      creates.push({ ...spec, active: true });
      continue;
    }
    used.add(existing.id);
  }

  return { updates, creates, retireIds: [] };
}

/** Ontbrekende zaterdag-barregels aanvullen. Bestaande clubregels niet wijzigen. */
export async function ensureStandardSaturdayBarRules() {
  const rules = await prisma.serviceRule.findMany({ where: { weekday: 6, type: 'BAR' } });
  const plan = planStandardSaturdayBarRules(rules);
  for (const data of plan.creates) {
    await prisma.serviceRule.create({ data });
  }
  for (const update of plan.updates) {
    await prisma.serviceRule.update({ where: { id: update.id }, data: update.data });
  }
  for (const id of plan.retireIds) {
    await prisma.serviceRule.update({ where: { id }, data: { active: false } });
  }
  return {
    updated: plan.updates.length,
    created: plan.creates.length,
    retired: plan.retireIds.length,
  };
}

function isYouthTeamName(name) {
  return isYoungYouthTeam(name) || isOldYouthTeam(name);
}

export async function ensureTeamFunctions() {
  const teams = await prisma.team.findMany();
  let updated = 0;
  for (const team of teams) {
    const fn = defaultTeamFunctions(team.name);
    const slots = parseTeamDutySlots(team.teamDutySlots);
    const youth = isYouthTeamName(team.name);
    const missedYouthDuty =
      youth &&
      fn.teamDutyUse &&
      (slots.join(',') !== fn.teamDutySlots.join(',') || team.teamDutyUse !== fn.teamDutyUse);
    if (team.functionsConfigured && !missedYouthDuty) continue;
    await prisma.team.update({
      where: { id: team.id },
      data: {
        availabilityUse: fn.availabilityUse,
        teamDutyUse: fn.teamDutyUse,
        teamDutySlots: JSON.stringify(fn.teamDutySlots),
        functionsConfigured: true,
      },
    });
    updated += 1;
  }
  return { updated };
}

export async function migrateLegacyFoChoices() {
  const coordinators = await prisma.person.updateMany({
    where: { role: 'Coördinator' },
    data: { role: 'Barcommissie' },
  });
  const bestuur = await prisma.person.updateMany({
    where: { role: 'Bestuur' },
    data: { role: 'Admin' },
  });
  const obligations = await prisma.person.updateMany({
    where: { obligation: 'HALF' },
    data: { obligation: 'FULL' },
  });
  return {
    roles: coordinators.count + bestuur.count,
    obligations: obligations.count,
  };
}

export async function purgeExpiredSessions() {
  const result = await prisma.session.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return { deleted: result.count };
}

export async function ensureClubDefaults() {
  await migrateLegacyFoChoices();
  await ensurePersonNumbers();
  await getClubSettings();
  await ensureDefaultServiceRules();
  await ensureStandardSaturdayBarRules();
  await ensureSaturdayKitchenLateRule();
  await ensureTeamFunctions();
  try {
    await purgeExpiredSessions();
  } catch (err) {
    console.error('[sessions] opruimen verlopen sessies mislukt:', err.message);
  }
  try {
    await cleanupPrivacy();
  } catch (err) {
    console.error('[privacy] opschonen bij start mislukt:', err.message);
  }
  if (demoLoginsEnabled()) {
    try {
      const demo = await ensureDemoAccounts();
      if (demo.created) {
        console.log(`[demo] ${demo.created} demo-account(s) aangemaakt`);
      }
    } catch (err) {
      console.error('[demo] accounts bijwerken mislukt:', err.message);
    }
  }
}
