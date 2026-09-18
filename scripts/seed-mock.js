/**
 * Mockdata voor demo / beoordeling.
 * Run: npm run db:seed
 *
 * Behoudt admin@vvl.local. Verwijdert overige demo-data en vult opnieuw.
 */
import prisma from '../src/backend/lib/prisma.js';
import { ensureAdmin } from '../src/backend/lib/seed.js';
import { defaultTeamFunctions } from '../src/backend/lib/teamFunctions.js';
import { generateServicesFromRules } from '../src/backend/lib/serviceGeneration.js';
import { ensureClubDefaults } from '../src/backend/lib/clubDefaults.js';
import { addWeeks, startOfDay } from '../src/backend/lib/dates.js';

function nextSaturday(weeksAhead = 0) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  const add = (6 - d.getDay() + 7) % 7;
  const days = (add === 0 ? 7 : add) + weeksAhead * 7;
  d.setDate(d.getDate() + days);
  return d;
}

async function applyTeamFunctions(team) {
  const fn = defaultTeamFunctions(team.name);
  return prisma.team.update({
    where: { id: team.id },
    data: {
      availabilityUse: fn.availabilityUse,
      teamDutyUse: fn.teamDutyUse,
      teamDutySlots: JSON.stringify(fn.teamDutySlots),
      functionsConfigured: true,
    },
  });
}

async function clearDemoData(adminId) {
  await prisma.swapRequest.deleteMany();
  await prisma.enrollment.deleteMany();
  try {
    await prisma.serviceTeamDuty.deleteMany();
  } catch {
    /* model bestaat pas na prisma generate */
  }
  await prisma.activity.deleteMany();
  await prisma.session.deleteMany({ where: { personId: { not: adminId } } });
  await prisma.auditLog.deleteMany({ where: { actorId: { not: adminId } } });
  await prisma.personTeam.deleteMany();
  await prisma.service.updateMany({
    data: { assignedTeamId: null, sourceRuleId: null, matchId: null, activityId: null },
  });
  await prisma.serviceRule.updateMany({ data: { conditionTeamId: null } });
  await prisma.service.deleteMany();
  await prisma.match.deleteMany();
  await prisma.person.updateMany({
    where: { id: { not: adminId } },
    data: { teamId: null },
  });
  await prisma.team.updateMany({ data: { coordinatorId: null } });
  await prisma.team.deleteMany();
  await prisma.person.deleteMany({ where: { id: { not: adminId } } });
}

async function main() {
  const admin = await ensureAdmin();
  console.log('Admin behouden:', admin.email);

  await clearDemoData(admin.id);
  await ensureClubDefaults();
  console.log('Oude demo-data opgeruimd; demo-accounts en standaardregels staan klaar');

  const teamJO11 = await applyTeamFunctions(await prisma.team.findFirst({ where: { name: 'JO11-1' } }));
  const teamJO15 = await applyTeamFunctions(await prisma.team.findFirst({ where: { name: 'JO15-1' } }));
  const teamJO13 = await applyTeamFunctions(await prisma.team.findFirst({ where: { name: 'JO13-2' } }));
  await applyTeamFunctions(await prisma.team.findFirst({ where: { name: 'Senioren 1' } }));

  const coordinator = await prisma.person.findUnique({ where: { email: 'sandra@vvl.demo' } });
  const volunteerEmails = [
    'lisa@vvl.demo',
    'tom@vvl.demo',
    'fatima@vvl.demo',
    'peter@vvl.demo',
    'anneke@vvl.demo',
    'kevin@vvl.demo',
    'noa@vvl.demo',
    'erik@vvl.demo',
  ];
  const createdVolunteers = [];
  for (const email of volunteerEmails) {
    createdVolunteers.push(await prisma.person.findUnique({ where: { email } }));
  }

  const inviteExists = await prisma.person.findUnique({ where: { email: 'nieuw@vvl.demo' } });
  if (!inviteExists) {
    await prisma.person.create({
      data: {
        name: 'Nieuwe Ouder',
        email: 'nieuw@vvl.demo',
        phone: '06-90909090',
        role: 'Vrijwilliger',
        teamId: teamJO15.id,
        inviteToken: 'demo-invite-token-open',
        inviteExpiresAt: addWeeks(new Date(), 2),
        active: true,
      },
    });
  }

  const parentExists = await prisma.person.findFirst({ where: { name: 'Ouder Jansen', email: null } });
  if (!parentExists) {
    await prisma.person.create({
      data: {
        name: 'Ouder Jansen',
        email: null,
        role: 'Vrijwilliger',
        teamId: teamJO15.id,
        obligation: 'NONE',
        active: true,
      },
    });
  }

  await prisma.team.update({
    where: { id: teamJO15.id },
    data: { coordinatorId: coordinator.id },
  });
  await prisma.team.update({
    where: { id: teamJO13.id },
    data: { coordinatorId: coordinator.id },
  });

  const extraMorningTeams = [];
  for (const name of ['O10-2', 'O12-3', 'O8-2JM', 'O9-3']) {
    let team = await prisma.team.findFirst({ where: { name } });
    if (!team) {
      const fn = defaultTeamFunctions(name);
      team = await prisma.team.create({
        data: {
          name,
          availabilityUse: fn.availabilityUse,
          teamDutyUse: fn.teamDutyUse,
          teamDutySlots: JSON.stringify(fn.teamDutySlots),
          functionsConfigured: true,
        },
      });
    }
    extraMorningTeams.push(await applyTeamFunctions(team));
  }

  const sat0 = nextSaturday(0);
  const sat1 = nextSaturday(1);
  const sat2 = nextSaturday(2);

  await prisma.match.create({
    data: {
      date: sat0,
      time: '09:00',
      home: true,
      opponent: 'SV Capelle',
      note: 'Competitie',
      teamId: teamJO11.id,
    },
  });
  const extraOpponents = ['VV Berkenwoude', 'SV Slikkerveer', 'VV Streefkerk', 'FC IJsselmonde'];
  for (let i = 0; i < extraMorningTeams.length; i += 1) {
    await prisma.match.create({
      data: {
        date: sat0,
        time: '09:30',
        home: true,
        opponent: extraOpponents[i],
        note: 'Competitie',
        teamId: extraMorningTeams[i].id,
      },
    });
  }
  await prisma.match.create({
    data: {
      date: sat0,
      time: '14:00',
      home: true,
      opponent: 'VV Krimpen',
      note: 'Competitie',
      teamId: teamJO15.id,
    },
  });
  await prisma.match.create({
    data: {
      date: sat1,
      time: '11:00',
      home: false,
      opponent: 'FC Dordrecht',
      note: 'Uit',
      teamId: teamJO13.id,
    },
  });
  await prisma.match.create({
    data: {
      date: sat1,
      time: '14:00',
      home: true,
      opponent: 'VV Ridderkerk',
      note: 'Competitie',
      teamId: teamJO13.id,
    },
  });
  await prisma.match.create({
    data: {
      date: sat2,
      time: '10:15',
      home: true,
      opponent: 'SV Bolnes',
      note: 'Competitie',
      teamId: teamJO11.id,
    },
  });

  const generated = await generateServicesFromRules({
    from: startOfDay(new Date()),
    to: addWeeks(startOfDay(new Date()), 8),
  });
  await prisma.planningRound.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      status: 'VOLUNTEER_OPEN',
      fromDate: generated.period.from,
      toDate: generated.period.to,
      publishedAt: new Date(),
    },
    update: {
      status: 'VOLUNTEER_OPEN',
      fromDate: generated.period.from,
      toDate: generated.period.to,
      official: false,
      publishedAt: new Date(),
    },
  });
  await prisma.service.updateMany({
    where: { date: { gte: generated.period.from, lte: generated.period.to } },
    data: { draft: false, locked: false },
  });

  const [lisa, tom, fatima, peter, anneke, kevin, noa, erik] = createdVolunteers;
  const openPersonal = await prisma.service.findMany({
    where: {
      active: true,
      draft: false,
      type: 'BAR',
      date: { gte: startOfDay(new Date()) },
    },
    include: { enrollments: true, teamDuties: true },
    orderBy: [{ date: 'asc' }, { time: 'asc' }],
  });

  const peopleCycle = [lisa, tom, fatima, peter, anneke, kevin, noa, erik];
  let pi = 0;
  for (const service of openPersonal) {
    const reserved = (service.teamDuties || []).reduce((sum, d) => sum + d.reserved, 0);
    const personalOpen = Math.max(0, service.required - reserved - service.enrollments.length);
    const take = Math.min(personalOpen, service.slot === 'MORNING' ? 1 : personalOpen > 1 ? 1 : 0);
    for (let n = 0; n < take; n += 1) {
      const person = peopleCycle[pi % peopleCycle.length];
      pi += 1;
      const exists = await prisma.enrollment.findUnique({
        where: { serviceId_personId: { serviceId: service.id, personId: person.id } },
      });
      if (exists) continue;
      await prisma.enrollment.create({
        data: {
          serviceId: service.id,
          personId: person.id,
          source: 'SELF',
          kind: 'PERSONAL',
          reason: 'Zelf ingeschreven',
        },
      });
    }
  }

  const counts = {
    personen: await prisma.person.count(),
    teams: await prisma.team.count(),
    diensten: await prisma.service.count(),
    teamdiensten: await prisma.serviceTeamDuty.count(),
    inschrijvingen: await prisma.enrollment.count(),
    wedstrijden: await prisma.match.count(),
  };

  console.log('\nMockdata klaar:');
  console.log(counts);
  console.log('\nInloggen (wachtwoord voor demo-accounts: demo123)');
  console.log('  Admin:            admin@vvl.local / admin123');
  console.log('  Barcommissie:     mark@vvl.demo / demo123');
  console.log('  Teamcoördinator:  sandra@vvl.demo / demo123');
  console.log('  Vrijwilliger:     lisa@vvl.demo / demo123');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
