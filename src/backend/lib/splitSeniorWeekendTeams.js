import { backupSqliteDatabase } from './environmentReset.js';
import { isBareSeniorClubTeam, seniorWeekendSuffix } from './knvbTeams.js';

/**
 * Splitst bestaande “Lekkerkerk N” teams die zaterdag én zondag spelen
 * in “Lekkerkerk N (za)” en “Lekkerkerk N (zo)”.
 * Maakt eerst een SQLite-backup.
 */
export async function previewSeniorWeekendSplit(prisma) {
  const teams = await prisma.team.findMany({
    where: { active: true },
    include: {
      matches: { select: { id: true, date: true } },
      _count: { select: { members: true, teamDuties: true, memberships: true } },
    },
  });
  const candidates = [];
  for (const team of teams) {
    if (!isBareSeniorClubTeam(team.name)) continue;
    if (/\((za|zo)\)$/i.test(team.name)) continue;
    const days = new Set(
      (team.matches || []).map((m) => seniorWeekendSuffix(m.date)).filter(Boolean),
    );
    if (days.has(' (za)') && days.has(' (zo)')) {
      candidates.push({
        id: team.id,
        name: team.name,
        matches: team.matches.length,
        members: team._count.members,
        memberships: team._count.memberships,
        teamDuties: team._count.teamDuties,
        into: [`${team.name} (za)`, `${team.name} (zo)`],
      });
    }
  }
  return { count: candidates.length, teams: candidates };
}

export async function splitSeniorWeekendTeams(prisma) {
  const preview = await previewSeniorWeekendSplit(prisma);
  if (!preview.count) {
    return { split: 0, backup: null, teams: [], message: 'Geen gecombineerde seniorenteams gevonden.' };
  }

  const backup = await backupSqliteDatabase(prisma);

  const results = [];
  await prisma.$transaction(async (tx) => {
    for (const row of preview.teams) {
      const source = await tx.team.findUnique({
        where: { id: row.id },
        include: {
          matches: true,
          members: true,
          memberships: true,
          teamDuties: true,
        },
      });
      if (!source) continue;

      async function ensureSplit(suffix) {
        const name = `${source.name}${suffix}`;
        let team = await tx.team.findFirst({ where: { name } });
        if (!team) {
          team = await tx.team.create({
            data: {
              name,
              active: true,
              teamDutyUse: source.teamDutyUse,
              teamDutySlots: source.teamDutySlots,
              coordinatorId: source.coordinatorId,
            },
          });
        }
        return team;
      }

      const za = await ensureSplit(' (za)');
      const zo = await ensureSplit(' (zo)');

      for (const match of source.matches) {
        const suffix = seniorWeekendSuffix(match.date);
        const targetId = suffix === ' (zo)' ? zo.id : za.id;
        await tx.match.update({ where: { id: match.id }, data: { teamId: targetId } });
      }

      for (const duty of source.teamDuties) {
        const svc = await tx.service.findUnique({ where: { id: duty.serviceId } });
        const suffix = seniorWeekendSuffix(svc?.date);
        const targetId = suffix === ' (zo)' ? zo.id : za.id;
        await tx.serviceTeamDuty.update({ where: { id: duty.id }, data: { teamId: targetId } });
      }

      for (const enrollment of await tx.enrollment.findMany({ where: { forTeamId: source.id } })) {
        const svc = await tx.service.findUnique({ where: { id: enrollment.serviceId } });
        const suffix = seniorWeekendSuffix(svc?.date);
        const targetId = suffix === ' (zo)' ? zo.id : za.id;
        await tx.enrollment.update({
          where: { id: enrollment.id },
          data: { forTeamId: targetId },
        });
      }

      for (const pt of source.memberships) {
        const season = pt.season || '';
        await tx.personTeam.upsert({
          where: {
            personId_teamId_season: { personId: pt.personId, teamId: za.id, season },
          },
          create: { personId: pt.personId, teamId: za.id, season, active: pt.active },
          update: { active: true },
        });
        await tx.personTeam.upsert({
          where: {
            personId_teamId_season: { personId: pt.personId, teamId: zo.id, season },
          },
          create: { personId: pt.personId, teamId: zo.id, season, active: pt.active },
          update: { active: true },
        });
        await tx.personTeam
          .delete({
            where: {
              personId_teamId_season: {
                personId: pt.personId,
                teamId: source.id,
                season,
              },
            },
          })
          .catch(() => {});
      }

      for (const member of source.members) {
        if (Number(member.teamId) === source.id) {
          await tx.person.update({ where: { id: member.id }, data: { teamId: za.id } });
        }
      }

      await tx.serviceRule.updateMany({
        where: { conditionTeamId: source.id },
        data: { conditionTeamId: null, conditionTeamName: `${source.name} (za/zo — controleer)` },
      });

      await tx.team.update({
        where: { id: source.id },
        data: { active: false, name: `${source.name} (oud-gecombineerd)` },
      });

      results.push({
        from: source.name,
        to: [za.name, zo.name],
        matches: source.matches.length,
      });
    }
  });

  return {
    split: results.length,
    backup,
    teams: results,
    message: `${results.length} team(s) gesplitst in zaterdag/zondag. Backup gemaakt.`,
  };
}
