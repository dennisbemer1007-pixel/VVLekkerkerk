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
 * Zaterdag keuken laat moet bestaan: bij thuiswedstrijd Lekkerkerk 1 (heel de dag).
 * Ontbrak na reset/handmatige wijziging; kickoffAfter 15:00 miste de 14:30-wedstrijd.
 */
export async function ensureSaturdayKitchenLateRule() {
  const spec = defaultServiceRuleSeed().find(
    (rule) => rule.weekday === 6 && rule.type === 'KITCHEN' && rule.slot === 'EVENING',
  );
  if (!spec) return { updated: 0, created: 0 };

  const teams = await prisma.team.findMany({ where: { active: { not: false } } });
  const { findTeamInIndex, buildTeamIndex } = await import('./knvbTeams.js');
  const index = buildTeamIndex(teams);
  const zaTeam =
    findTeamInIndex(index, 'Lekkerkerk 1', { date: new Date('2026-10-24T12:00:00') }) ||
    findTeamInIndex(index, 'Lekkerkerk 1 (za)') ||
    findTeamInIndex(index, 'Lekkerkerk 1');

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

  const payload = {
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
  };

  if (!existing) {
    await prisma.serviceRule.create({ data: payload });
    return { updated: 0, created: 1, teamId: zaTeam?.id ?? null };
  }

  const needsFix =
    existing.active === false ||
    existing.conditionType !== 'HOME_MATCH_TEAM' ||
    Boolean(existing.kickoffAfter) ||
    existing.slot !== 'EVENING' ||
    existing.startTime !== spec.startTime ||
    existing.endTime !== spec.endTime ||
    existing.required !== spec.required ||
    (zaTeam && existing.conditionTeamId !== zaTeam.id) ||
    String(existing.conditionTeamName || '').trim() !== 'Lekkerkerk 1' ||
    /za\/zo/i.test(String(existing.conditionTeamName || ''));

  if (!needsFix) return { updated: 0, created: 0, teamId: zaTeam?.id ?? null };

  await prisma.serviceRule.update({ where: { id: existing.id }, data: payload });
  return { updated: 1, created: 0, teamId: zaTeam?.id ?? null, ruleId: existing.id };
}

/** Bestaande zaterdag-barregels gelijk trekken met de standaard teamdienst-tijden. */
export async function ensureStandardSaturdayBarRules() {
  const specs = defaultServiceRuleSeed().filter(
    (rule) => rule.weekday === 6 && rule.type === 'BAR' && rule.teamDuty,
  );
  let updated = 0;
  for (const spec of specs) {
    const existing = await prisma.serviceRule.findFirst({
      where: {
        weekday: 6,
        type: 'BAR',
        OR: [{ slot: spec.slot }, { teamDutySlotRole: spec.teamDutySlotRole }],
      },
    });
    if (!existing) continue;
    const missingTeamDutyConfig =
      Number(existing.teamDutyReserved || 0) === 0 ||
      existing.teamDutyAgeFrom == null ||
      existing.teamDutyAgeTo == null;
    const same =
      existing.startTime === spec.startTime &&
      existing.endTime === spec.endTime &&
      existing.required === spec.required &&
      existing.teamDuty === true &&
      existing.teamDutySlotRole === spec.teamDutySlotRole &&
      !missingTeamDutyConfig;
    if (same) continue;
    await prisma.serviceRule.update({
      where: { id: existing.id },
      data: {
        startTime: spec.startTime,
        endTime: spec.endTime,
        required: spec.required,
        teamDuty: true,
        teamDutySlotRole: spec.teamDutySlotRole,
        ...(missingTeamDutyConfig
          ? {
              teamDutyReserved: spec.teamDutyReserved,
              teamDutyAgeFrom: spec.teamDutyAgeFrom,
              teamDutyAgeTo: spec.teamDutyAgeTo,
            }
          : {}),
        conditionType: 'ALWAYS',
        active: true,
      },
    });
    updated += 1;
  }
  return { updated };
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
