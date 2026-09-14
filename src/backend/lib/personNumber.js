import crypto from 'crypto';
import prisma from './prisma.js';

/** Uniek intern persoonsnummer: 7 cijfers, 1000000–9999999. */
export function isCanonicalPersonNumber(value) {
  return /^\d{7}$/.test(String(value || ''));
}

export function randomPersonNumber(used = new Set()) {
  for (let i = 0; i < 80; i += 1) {
    const n = String(1000000 + crypto.randomInt(0, 9000000));
    if (!used.has(n)) return n;
  }
  throw new Error('Kon geen vrij persoonsnummer vinden');
}

export async function nextPersonNumber(tx = prisma) {
  const rows = await tx.person.findMany({
    where: { personNumber: { not: null } },
    select: { personNumber: true },
  });
  const used = new Set(rows.map((r) => r.personNumber).filter(Boolean));
  return randomPersonNumber(used);
}

export async function ensurePersonNumbers() {
  const people = await prisma.person.findMany({
    orderBy: { id: 'asc' },
    select: { id: true, personNumber: true },
  });
  const used = new Set(
    people.map((p) => p.personNumber).filter((n) => isCanonicalPersonNumber(n)),
  );
  for (const person of people) {
    if (isCanonicalPersonNumber(person.personNumber)) continue;
    const personNumber = randomPersonNumber(used);
    await prisma.person.update({
      where: { id: person.id },
      data: { personNumber },
    });
    used.add(personNumber);
  }
}

export async function syncPrimaryTeamMembership(personId, teamId, tx = prisma) {
  if (!personId) return;
  if (!teamId) return;
  let season = '';
  try {
    const { getClubSettings } = await import('./season.js');
    const settings = await getClubSettings();
    season = settings.seasonLabel || '';
  } catch {
    season = '';
  }
  await tx.personTeam.upsert({
    where: {
      personId_teamId_season: {
        personId: Number(personId),
        teamId: Number(teamId),
        season,
      },
    },
    create: {
      personId: Number(personId),
      teamId: Number(teamId),
      season,
      active: true,
    },
    update: { active: true },
  });
}
