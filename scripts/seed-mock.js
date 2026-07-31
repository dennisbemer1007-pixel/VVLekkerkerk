/**
 * Mockdata voor demo / beoordeling.
 * Run: npm run db:seed
 *
 * Behoudt admin@vvl.local. Verwijdert overige demo-data en vult opnieuw.
 */
import prisma from '../src/backend/lib/prisma.js';
import { hashPassword } from '../src/backend/lib/auth.js';
import { ensureAdmin } from '../src/backend/lib/seed.js';

function atDay(offsetDays, hour = 12) {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return d;
}

async function clearDemoData(adminId) {
  await prisma.enrollment.deleteMany();
  await prisma.session.deleteMany({ where: { personId: { not: adminId } } });
  await prisma.service.deleteMany();
  await prisma.match.deleteMany();

  // Teams eerst ontkoppelen
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
  console.log('Oude demo-data opgeruimd');

  const pw = await hashPassword('demo123');

  // --- Teams (eerst zonder coordinator) ---
  const teamJO11 = await prisma.team.create({ data: { name: 'JO11-1' } });
  const teamJO15 = await prisma.team.create({ data: { name: 'JO15-1' } });
  const teamJO13 = await prisma.team.create({ data: { name: 'JO13-2' } });
  const teamSenior = await prisma.team.create({ data: { name: 'Senioren 1' } });

  // --- Personen ---
  const coordinator = await prisma.person.create({
    data: {
      name: 'Sandra de Vries',
      email: 'sandra@vvl.demo',
      phone: '06-11223344',
      role: 'Teamcoördinator',
      passwordHash: pw,
      accountCreatedAt: new Date(),
      teamId: teamJO15.id,
      active: true,
    },
  });

  const barCoord = await prisma.person.create({
    data: {
      name: 'Mark Jansen',
      email: 'mark@vvl.demo',
      phone: '06-55667788',
      role: 'Coördinator',
      passwordHash: pw,
      accountCreatedAt: new Date(),
      active: true,
    },
  });

  const volunteers = [
    { name: 'Lisa Bakker', email: 'lisa@vvl.demo', phone: '06-10101010', teamId: teamJO15.id, obligation: 'FULL' },
    { name: 'Tom van Dam', email: 'tom@vvl.demo', phone: '06-20202020', teamId: teamJO15.id },
    { name: 'Fatima El Amrani', email: 'fatima@vvl.demo', phone: '06-30303030', teamId: teamJO13.id },
    { name: 'Peter Smit', email: 'peter@vvl.demo', phone: '06-40404040', teamId: teamJO13.id, obligation: 'FULL' },
    { name: 'Anneke Mulder', email: 'anneke@vvl.demo', phone: '06-50505050', teamId: teamJO11.id, obligation: 'HALF' },
    { name: 'Kevin de Boer', email: 'kevin@vvl.demo', phone: '06-60606060', teamId: teamJO11.id },
    { name: 'Noa Visser', email: 'noa@vvl.demo', phone: '06-70707070', teamId: teamSenior.id },
    { name: 'Erik Hofman', email: 'erik@vvl.demo', phone: '06-80808080', teamId: null },
  ];

  const createdVolunteers = [];
  for (const v of volunteers) {
    const person = await prisma.person.create({
      data: {
        name: v.name,
        email: v.email,
        phone: v.phone,
        role: 'Vrijwilliger',
        passwordHash: pw,
        accountCreatedAt: new Date(),
        teamId: v.teamId,
        obligation: v.obligation || 'NONE',
        active: true,
      },
    });
    createdVolunteers.push(person);
  }

  // Uitnodiging open (nog geen account)
  await prisma.person.create({
    data: {
      name: 'Nieuwe Ouder',
      email: 'nieuw@vvl.demo',
      phone: '06-90909090',
      role: 'Vrijwilliger',
      teamId: teamJO15.id,
      inviteToken: 'demo-invite-token-open',
      inviteExpiresAt: atDay(10),
      active: true,
    },
  });

  await prisma.team.update({
    where: { id: teamJO15.id },
    data: { coordinatorId: coordinator.id },
  });
  await prisma.team.update({
    where: { id: teamJO13.id },
    data: { coordinatorId: coordinator.id },
  });

  // --- Wedstrijden (gekoppeld aan JO-teams) ---
  await prisma.match.create({
    data: { date: atDay(3), home: true, opponent: 'SV Capelle', note: 'Competitie', teamId: teamJO11.id },
  });
  await prisma.match.create({
    data: { date: atDay(7), home: true, opponent: 'VV Krimpen', note: 'Competitie', teamId: teamJO15.id },
  });
  await prisma.match.create({
    data: { date: atDay(10), home: false, opponent: 'FC Dordrecht', note: 'Uit', teamId: teamJO13.id },
  });
  await prisma.match.create({
    data: { date: atDay(14), home: true, opponent: 'VV Ridderkerk', note: 'Competitie', teamId: teamJO13.id },
  });
  await prisma.match.create({
    data: { date: atDay(21), home: true, opponent: 'SV Bolnes', note: 'Competitie', teamId: teamJO11.id },
  });

  await prisma.planningRound.upsert({
    where: { id: 1 },
    create: { id: 1, status: 'DRAFT' },
    update: { status: 'DRAFT' },
  });

  // --- Diensten ---
  const servicesSpec = [
    { type: 'BAR', day: 0, time: '18:00 - 22:00', required: 3, note: 'Dinsdagavond bar', location: 'Bar', slot: 'EXTRA' },
    { type: 'BAR', day: 3, time: '09:00 - 13:00', required: 2, note: 'Ochtend JO11', location: 'Bar', slot: 'MORNING', teamId: teamJO11.id },
    { type: 'KITCHEN', day: 3, time: '09:00 - 12:00', required: 2, note: 'Keuken ochtend', location: 'Keuken', slot: 'MORNING', teamId: teamJO11.id },
    { type: 'BAR', day: 5, time: '19:00 - 23:00', required: 2, note: 'Vrijdagavond', location: 'Bar', slot: 'EXTRA' },
    { type: 'BAR', day: 7, time: '12:00 - 16:30', required: 2, note: 'Middag JO15', location: 'Bar', slot: 'AFTERNOON', teamId: teamJO15.id },
    { type: 'KITCHEN', day: 7, time: '12:00 - 16:00', required: 2, note: null, location: 'Keuken', slot: 'AFTERNOON', teamId: teamJO15.id },
    { type: 'BAR', day: 7, time: '16:30 - 19:30', required: 2, note: 'Avond JO15', location: 'Bar', slot: 'EVENING', teamId: teamJO15.id },
    { type: 'BAR', day: 12, time: '18:00 - 22:00', required: 2, note: 'Doordeweeks', location: 'Bar', slot: 'EXTRA' },
    { type: 'BAR', day: 21, time: '19:00 - 23:30', required: 4, note: 'Klaverjasavond', location: 'Bar', slot: 'EXTRA' },
  ];

  const services = [];
  for (const s of servicesSpec) {
    const service = await prisma.service.create({
      data: {
        type: s.type,
        date: atDay(s.day),
        time: s.time,
        required: s.required,
        note: s.note,
        location: s.location,
        active: true,
        draft: false,
        slot: s.slot,
        assignedTeamId: s.teamId || null,
      },
    });
    services.push(service);
  }

  // --- Inschrijvingen (variërende bezetting) ---
  const [lisa, tom, fatima, peter, anneke, kevin, noa, erik] = createdVolunteers;

  const enrollments = [
    { service: services[0], people: [lisa, tom] },
    { service: services[1], people: [anneke, kevin] },
    { service: services[2], people: [anneke] },
    { service: services[3], people: [] },
    { service: services[4], people: [tom, lisa] },
    { service: services[5], people: [noa] },
    { service: services[6], people: [erik] },
    { service: services[7], people: [lisa] },
    { service: services[8], people: [tom, peter, anneke] },
  ];

  for (const e of enrollments) {
    for (const person of e.people) {
      await prisma.enrollment.create({
        data: { serviceId: e.service.id, personId: person.id },
      });
    }
  }

  const counts = {
    personen: await prisma.person.count(),
    teams: await prisma.team.count(),
    diensten: await prisma.service.count(),
    inschrijvingen: await prisma.enrollment.count(),
    wedstrijden: await prisma.match.count(),
  };

  console.log('\nMockdata klaar:');
  console.log(counts);
  console.log('\nInloggen (wachtwoord voor demo-accounts: demo123)');
  console.log('  Bestuur:          admin@vvl.local / admin123');
  console.log('  Coördinator:      mark@vvl.demo / demo123');
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
