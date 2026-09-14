/**
 * Controleert SQLite-data op inconsistenties en ruimt veilig op.
 * Run: node scripts/db-cleanup.js
 */
import prisma from '../src/backend/lib/prisma.js';

const VALID_ROLES = new Set(['Vrijwilliger', 'Teamcoördinator', 'Barcommissie', 'Admin']);

async function main() {
  const report = { fixed: [], warnings: [], counts: {} };

  const [
    persons,
    teams,
    services,
    matches,
    enrollments,
    sessions,
  ] = await Promise.all([
    prisma.person.findMany(),
    prisma.team.findMany(),
    prisma.service.findMany(),
    prisma.match.findMany(),
    prisma.enrollment.findMany(),
    prisma.session.findMany(),
  ]);

  const personIds = new Set(persons.map((p) => p.id));
  const teamIds = new Set(teams.map((t) => t.id));
  const serviceIds = new Set(services.map((s) => s.id));
  const matchIds = new Set(matches.map((m) => m.id));
  const now = new Date();

  report.counts = {
    persons: persons.length,
    teams: teams.length,
    services: services.length,
    matches: matches.length,
    enrollments: enrollments.length,
    sessions: sessions.length,
  };

  // Verlopen sessies
  const expiredSessions = sessions.filter((s) => s.expiresAt < now);
  if (expiredSessions.length) {
    await prisma.session.deleteMany({
      where: { id: { in: expiredSessions.map((s) => s.id) } },
    });
    report.fixed.push(`${expiredSessions.length} verlopen sessie(s) verwijderd`);
  }

  // Sessies zonder persoon (zou niet moeten door FK)
  const orphanSessions = sessions.filter((s) => !personIds.has(s.personId));
  if (orphanSessions.length) {
    await prisma.session.deleteMany({
      where: { id: { in: orphanSessions.map((s) => s.id) } },
    });
    report.fixed.push(`${orphanSessions.length} sessie(s) zonder persoon verwijderd`);
  }

  // Personen met onbekend teamId
  for (const p of persons) {
    if (p.teamId != null && !teamIds.has(p.teamId)) {
      await prisma.person.update({
        where: { id: p.id },
        data: { teamId: null },
      });
      report.fixed.push(`Persoon #${p.id} (${p.name}): teamId ${p.teamId} → null`);
    }
  }

  // Teams met onbekende coordinator
  for (const t of teams) {
    if (t.coordinatorId != null && !personIds.has(t.coordinatorId)) {
      await prisma.team.update({
        where: { id: t.id },
        data: { coordinatorId: null },
      });
      report.fixed.push(`Team #${t.id} (${t.name}): coordinatorId ${t.coordinatorId} → null`);
    }
  }

  // Services met onbekende match / team
  for (const s of services) {
    const data = {};
    if (s.matchId != null && !matchIds.has(s.matchId)) data.matchId = null;
    if (s.assignedTeamId != null && !teamIds.has(s.assignedTeamId)) data.assignedTeamId = null;
    if (Object.keys(data).length) {
      await prisma.service.update({ where: { id: s.id }, data });
      report.fixed.push(`Dienst #${s.id}: broken FK opgeschoond (${JSON.stringify(data)})`);
    }
  }

  // Wedstrijden met onbekend team
  for (const m of matches) {
    if (m.teamId != null && !teamIds.has(m.teamId)) {
      await prisma.match.update({
        where: { id: m.id },
        data: { teamId: null },
      });
      report.fixed.push(`Wedstrijd #${m.id}: teamId ${m.teamId} → null`);
    }
  }

  // Inschrijvingen zonder dienst of persoon
  for (const e of enrollments) {
    if (!serviceIds.has(e.serviceId) || !personIds.has(e.personId)) {
      await prisma.enrollment.delete({ where: { id: e.id } });
      report.fixed.push(`Inschrijving #${e.id} verwijderd (orphan)`);
    }
  }

  // Inschrijvingen op inactieve diensten of door inactieve personen
  const staleEnrollments = enrollments.filter((e) => {
    const svc = services.find((s) => s.id === e.serviceId);
    const per = persons.find((p) => p.id === e.personId);
    return (svc && !svc.active) || (per && !per.active);
  });
  if (staleEnrollments.length) {
    await prisma.enrollment.deleteMany({
      where: { id: { in: staleEnrollments.map((e) => e.id) } },
    });
    report.fixed.push(
      `${staleEnrollments.length} inschrijving(en) op inactieve dienst/persoon verwijderd`,
    );
  }

  // Verlopen uitnodigingen zonder account
  const expiredInvites = persons.filter(
    (p) =>
      p.inviteToken &&
      !p.passwordHash &&
      p.inviteExpiresAt &&
      p.inviteExpiresAt < now,
  );
  for (const p of expiredInvites) {
    await prisma.person.update({
      where: { id: p.id },
      data: { inviteToken: null, inviteExpiresAt: null },
    });
    report.fixed.push(`Persoon #${p.id} (${p.name}): verlopen uitnodiging gewist`);
  }

  // Ongeldige rollen
  for (const p of persons) {
    if (p.role === 'Coördinator') {
      await prisma.person.update({
        where: { id: p.id },
        data: { role: 'Barcommissie' },
      });
      report.fixed.push(`Persoon #${p.id}: rol Coördinator → Barcommissie`);
      continue;
    }
    if (p.role === 'Bestuur') {
      await prisma.person.update({
        where: { id: p.id },
        data: { role: 'Admin' },
      });
      report.fixed.push(`Persoon #${p.id}: rol Bestuur → Admin`);
      continue;
    }
    if (!VALID_ROLES.has(p.role)) {
      await prisma.person.update({
        where: { id: p.id },
        data: { role: 'Vrijwilliger' },
      });
      report.warnings.push(`Persoon #${p.id}: rol "${p.role}" → Vrijwilliger`);
    }
  }

  // Lege e-mailstrings → null
  const blankEmails = persons.filter((p) => p.email === '');
  for (const p of blankEmails) {
    await prisma.person.update({
      where: { id: p.id },
      data: { email: null },
    });
    report.fixed.push(`Persoon #${p.id}: lege e-mail → null`);
  }

  // Dubbele planning round ids (alleen id=1 mag bestaan)
  const rounds = await prisma.planningRound.findMany();
  if (rounds.length > 1) {
    await prisma.planningRound.deleteMany({ where: { id: { not: 1 } } });
    report.fixed.push(`${rounds.length - 1} extra PlanningRound-record(s) verwijderd`);
  }

  // MailSettings: alleen id 1
  const mailRows = await prisma.mailSettings.findMany();
  if (mailRows.length > 1) {
    await prisma.mailSettings.deleteMany({ where: { id: { not: 1 } } });
    report.fixed.push(`${mailRows.length - 1} extra MailSettings-record(s) verwijderd`);
  }

  console.log('=== Database check ===');
  console.log('Aantallen:', report.counts);
  if (report.fixed.length) {
    console.log('\nOpgeschoond:');
    report.fixed.forEach((line) => console.log('  -', line));
  } else {
    console.log('\nGeen broken FKs of verlopen sessies gevonden om op te ruimen.');
  }
  if (report.warnings.length) {
    console.log('\nWaarschuwingen / gecorrigeerd:');
    report.warnings.forEach((line) => console.log('  -', line));
  }

  const after = await Promise.all([
    prisma.person.count(),
    prisma.team.count(),
    prisma.service.count(),
    prisma.enrollment.count(),
  ]);
  console.log('\nNa cleanup:', {
    persons: after[0],
    teams: after[1],
    services: after[2],
    enrollments: after[3],
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
