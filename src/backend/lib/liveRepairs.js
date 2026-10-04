import { stripWeekendSuffix } from './knvbTeams.js';

/**
 * Import maakte “Lekkerkerk 1 (za)” naast het bestaande “Lekkerkerk 1”.
 * Zolang het ongesplitste team nog actief is, horen wedstrijden en mensen bij dat team.
 * Bewust gesplitste za/zo-teams (origineel heet dan … (oud-gecombineerd)) blijven staan.
 */
export async function repairAccidentalWeekendTeams(prisma) {
  const teams = await prisma.team.findMany();
  const activeByName = new Map(teams.filter((t) => t.active !== false).map((t) => [t.name, t]));
  const moves = [];

  for (const team of teams) {
    if (team.active === false) continue;
    if (!/\((za|zo)\)$/i.test(team.name)) continue;
    const bare = stripWeekendSuffix(team.name);
    if (!bare || bare === team.name) continue;
    const canonical = activeByName.get(bare);
    if (!canonical || canonical.id === team.id) continue;

    const matches = await prisma.match.updateMany({ where: { teamId: team.id }, data: { teamId: canonical.id } });
    const duties = await prisma.serviceTeamDuty.updateMany({
      where: { teamId: team.id },
      data: { teamId: canonical.id },
    });
    const enrollments = await prisma.enrollment.updateMany({
      where: { forTeamId: team.id },
      data: { forTeamId: canonical.id },
    });
    const assignedServices = await prisma.service.updateMany({
      where: { assignedTeamId: team.id },
      data: { assignedTeamId: canonical.id },
    });
    const rules = await prisma.serviceRule.updateMany({
      where: { conditionTeamId: team.id },
      data: { conditionTeamId: canonical.id },
    });

    const memberships = await prisma.personTeam.findMany({ where: { teamId: team.id } });
    for (const row of memberships) {
      await prisma.personTeam.upsert({
        where: {
          personId_teamId_season: {
            personId: row.personId,
            teamId: canonical.id,
            season: row.season || '',
          },
        },
        create: {
          personId: row.personId,
          teamId: canonical.id,
          season: row.season || '',
          active: row.active !== false,
        },
        update: { active: true },
      });
      await prisma.personTeam.delete({
        where: {
          personId_teamId_season: {
            personId: row.personId,
            teamId: team.id,
            season: row.season || '',
          },
        },
      }).catch(() => {});
    }

    const persons = await prisma.person.updateMany({ where: { teamId: team.id }, data: { teamId: canonical.id } });
    await prisma.team.update({
      where: { id: team.id },
      data: { active: false, name: `${team.name} (import-dubbel)` },
    });
    activeByName.delete(team.name);
    moves.push({
      from: team.name,
      to: canonical.name,
      fromId: team.id,
      toId: canonical.id,
      matches: matches.count,
      duties: duties.count,
      enrollments: enrollments.count,
      assignedServices: assignedServices.count,
      rules: rules.count,
      memberships: memberships.length,
      persons: persons.count,
    });
  }

  const totals = moves.reduce(
    (acc, row) => ({
      matches: acc.matches + row.matches,
      duties: acc.duties + row.duties,
      enrollments: acc.enrollments + row.enrollments,
      assignedServices: acc.assignedServices + row.assignedServices,
      rules: acc.rules + row.rules,
      memberships: acc.memberships + row.memberships,
      persons: acc.persons + row.persons,
    }),
    { matches: 0, duties: 0, enrollments: 0, assignedServices: 0, rules: 0, memberships: 0, persons: 0 },
  );
  return { merged: moves.length, teams: moves, totals };
}

/**
 * Kinderen kregen het team van de ouder/coördinator. Ze horen daar niet als lid.
 * Alleen loskoppelen als het kind nog nooit een teamdienst voor dat team heeft gedaan.
 */
export async function unlinkGuardianCopiedTeam(prisma) {
  const children = await prisma.person.findMany({
    where: { guardianId: { not: null }, teamId: { not: null }, active: true },
    include: {
      guardian: { select: { id: true, name: true, teamId: true, team: { select: { name: true } } } },
      team: { select: { name: true } },
      enrollments: { where: { kind: 'TEAM', noShow: false }, select: { forTeamId: true } },
    },
  });
  const changed = [];
  for (const child of children) {
    const guardianTeamId = child.guardian?.teamId;
    if (!guardianTeamId || child.teamId !== guardianTeamId) continue;
    const stood = (child.enrollments || []).some((row) => Number(row.forTeamId) === Number(guardianTeamId));
    if (stood) continue;
    await prisma.person.update({ where: { id: child.id }, data: { teamId: null } });
    const links = await prisma.personTeam.deleteMany({ where: { personId: child.id, teamId: guardianTeamId } });
    changed.push({
      id: child.id,
      name: child.name,
      teamId: guardianTeamId,
      teamName: child.team?.name || child.guardian?.team?.name || null,
      guardianId: child.guardian?.id || null,
      guardianName: child.guardian?.name || null,
      membershipsRemoved: links.count,
    });
  }
  return { unlinked: changed.length, people: changed };
}
