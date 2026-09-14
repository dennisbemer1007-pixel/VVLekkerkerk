import prisma from './prisma.js';
import { defaultServiceRuleSeed } from './defaultServiceRules.js';
import { defaultTeamFunctions, isO13FirstTeam, parseTeamDutySlots } from './teamFunctions.js';
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

function isStrayO13TeamDuty(team) {
  const compact = String(team.name || '').replace(/\s+/g, '');
  if (!/(?:JO|O)13/i.test(compact) || isO13FirstTeam(team.name)) return false;
  const slots = parseTeamDutySlots(team.teamDutySlots);
  return Boolean(team.teamDutyUse) && slots.join(',') === 'SECOND,LAST';
}

export async function ensureTeamFunctions() {
  const teams = await prisma.team.findMany();
  let updated = 0;
  for (const team of teams) {
    const fn = defaultTeamFunctions(team.name);
    const slots = parseTeamDutySlots(team.teamDutySlots);
    const missedYouthDuty =
      team.functionsConfigured &&
      fn.teamDutyUse &&
      !team.teamDutyUse &&
      slots.length === 0;
    const strayO13 = isStrayO13TeamDuty(team);
    if (team.functionsConfigured && !missedYouthDuty && !strayO13) continue;
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
  const roles = await prisma.person.updateMany({
    where: { role: 'Coördinator' },
    data: { role: 'Barcommissie' },
  });
  const obligations = await prisma.person.updateMany({
    where: { obligation: 'HALF' },
    data: { obligation: 'FULL' },
  });
  return { roles: roles.count, obligations: obligations.count };
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
