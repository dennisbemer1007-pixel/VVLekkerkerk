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
