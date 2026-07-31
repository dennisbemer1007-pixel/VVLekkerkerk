/**
 * Verwijdert duidelijke test-/import-artefacten uit de database.
 * Run: node scripts/db-remove-test-data.js
 */
import prisma from '../src/backend/lib/prisma.js';

const TEST_OPPONENT = /test opponent|csv opponent|drop table/i;

async function main() {
  const removed = [];

  const allMatches = await prisma.match.findMany({
    include: { services: true, team: true },
  });

  const toRemove = allMatches.filter((m) => {
    if (m.opponent && TEST_OPPONENT.test(m.opponent)) return true;
    // Tegenstander per ongeluk als team (geen opponent, teamnaam klinkt als club)
    if (!m.opponent && m.team?.name === 'SV Capelle') return true;
    return false;
  });

  for (const m of toRemove) {
    if (m.services.length) {
      await prisma.enrollment.deleteMany({
        where: { serviceId: { in: m.services.map((s) => s.id) } },
      });
      await prisma.service.deleteMany({ where: { id: { in: m.services.map((s) => s.id) } } });
      removed.push(`${m.services.length} dienst(en) bij wedstrijd #${m.id}`);
    }
    await prisma.match.delete({ where: { id: m.id } });
    removed.push(`Wedstrijd #${m.id} (${m.team?.name} vs ${m.opponent ?? '—'})`);
  }

  // Lege teams zonder leden, zonder diensten, zonder wedstrijden
  const teams = await prisma.team.findMany({
    include: {
      members: true,
      matches: true,
      assignedServices: true,
    },
  });

  for (const t of teams) {
    if (
      t.members.length === 0 &&
      t.assignedServices.length === 0 &&
      t.matches.length === 0 &&
      !t.coordinatorId
    ) {
      await prisma.team.delete({ where: { id: t.id } });
      removed.push(`Leeg team #${t.id} (${t.name})`);
    }
  }

  // Wedstrijden met team zonder leden (alleen losse import-teams)
  const orphanTeamMatches = await prisma.match.findMany({
    where: {
      team: {
        members: { none: {} },
        assignedServices: { none: {} },
        coordinatorId: null,
      },
    },
    include: { services: true, team: true },
  });

  for (const m of orphanTeamMatches) {
    if (m.services.length) continue; // behoud als er diensten aan hangen
    await prisma.match.delete({ where: { id: m.id } });
    removed.push(`Wedstrijd #${m.id} op leeg team ${m.team?.name}`);
  }

  // Opnieuw lege teams
  const teamsAfter = await prisma.team.findMany({
    include: { members: true, matches: true, assignedServices: true },
  });
  for (const t of teamsAfter) {
    if (
      t.members.length === 0 &&
      t.assignedServices.length === 0 &&
      t.matches.length === 0 &&
      !t.coordinatorId
    ) {
      await prisma.team.delete({ where: { id: t.id } });
      removed.push(`Leeg team #${t.id} (${t.name})`);
    }
  }

  // Demo-persoon met open uitnodiging (seed restant)
  const staleInvite = await prisma.person.findFirst({
    where: {
      email: 'nieuw@vvl.demo',
      inviteToken: { not: null },
      passwordHash: null,
    },
  });
  if (staleInvite) {
    await prisma.person.delete({ where: { id: staleInvite.id } });
    removed.push(`Demo-uitnodiging ${staleInvite.email}`);
  }

  console.log('=== Testdata / vreemde records verwijderd ===');
  if (removed.length === 0) {
    console.log('Niets gevonden om te verwijderen.');
  } else {
    removed.forEach((line) => console.log(' -', line));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
