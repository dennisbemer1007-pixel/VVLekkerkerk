import prisma from './prisma.js';

export const SEASON_DECISION =
  'Seizoen loopt 1 augustus t/m 31 juli. Rollover zet een nieuw label, archiveert teamkoppelingen van het oude seizoen en maakt actieve koppelingen opnieuw. Historie (diensten, inschrijvingen, no-shows) blijft staan. Inhaaldiensten blijven open.';

export function seasonLabelForDate(date = new Date(), startMonth = 8) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const startYear = month >= startMonth ? year : year - 1;
  return `${startYear}-${startYear + 1}`;
}

export function nextSeasonLabel(label) {
  const m = String(label || '').match(/^(\d{4})-(\d{4})$/);
  if (!m) return seasonLabelForDate(new Date());
  const start = Number(m[1]) + 1;
  return `${start}-${start + 1}`;
}

/** Seizoensgrenzen bij een label (standaard 1 augustus t/m 31 juli). */
export function seasonRangeFromLabel(label, startMonth = 8) {
  const m = String(label || '').match(/^(\d{4})-(\d{4})$/);
  const startYear = m ? Number(m[1]) : new Date().getFullYear();
  const month = Number(startMonth) > 0 && Number(startMonth) <= 12 ? Number(startMonth) : 8;
  const from = new Date(startYear, month - 1, 1);
  from.setHours(0, 0, 0, 0);
  const to = new Date(startYear + 1, month - 1, 0, 23, 59, 59, 999);
  return { from, to };
}

export async function getClubSettings() {
  let settings = await prisma.clubSettings.findUnique({ where: { id: 1 } });
  if (!settings) {
    settings = await prisma.clubSettings.create({
      data: {
        id: 1,
        seasonLabel: seasonLabelForDate(new Date()),
      },
    });
  }
  return settings;
}

export async function publicClubSettings() {
  const s = await getClubSettings();
  const round = await prisma.planningRound.findUnique({ where: { id: 1 } });
  return {
    seasonLabel: s.seasonLabel,
    seasonStartMonth: s.seasonStartMonth,
    auditRetainMonths: s.auditRetainMonths,
    inactiveRetainMonths: s.inactiveRetainMonths,
    nextSeasonLabel: nextSeasonLabel(s.seasonLabel),
    official: Boolean(round?.official),
    planningStatus: round?.status ?? 'DRAFT',
  };
}

export async function rolloverSeason({ actorId = null, newLabel } = {}) {
  const settings = await getClubSettings();
  const oldLabel = settings.seasonLabel;
  const label = String(newLabel || nextSeasonLabel(oldLabel)).trim();
  if (!/^\d{4}-\d{4}$/.test(label)) {
    const err = new Error('Seizoen moet het formaat 2026-2027 hebben');
    err.status = 400;
    throw err;
  }
  if (label === oldLabel) {
    const err = new Error('Dit seizoen is al actief');
    err.status = 400;
    throw err;
  }

  const memberships = await prisma.personTeam.findMany({
    where: { active: true, OR: [{ season: '' }, { season: oldLabel }] },
  });

  let archived = 0;
  let copied = 0;
  await prisma.$transaction(async (tx) => {
    for (const row of memberships) {
      await tx.personTeam.update({
        where: { id: row.id },
        data: { season: oldLabel, active: false },
      });
      archived += 1;
      await tx.personTeam.upsert({
        where: {
          personId_teamId_season: {
            personId: row.personId,
            teamId: row.teamId,
            season: label,
          },
        },
        create: {
          personId: row.personId,
          teamId: row.teamId,
          season: label,
          active: true,
        },
        update: { active: true },
      });
      copied += 1;
    }
    await tx.clubSettings.update({
      where: { id: 1 },
      data: { seasonLabel: label },
    });
  });

  return { oldLabel, seasonLabel: label, archived, copied, actorId };
}
