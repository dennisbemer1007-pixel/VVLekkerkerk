import prisma from '../src/backend/lib/prisma.js';

const persons = await prisma.person.findMany({ orderBy: { id: 'asc' } });
const teams = await prisma.team.findMany();
const byName = {};
for (const t of teams) {
  const k = t.name.trim().toLowerCase();
  (byName[k] ||= []).push(t);
}

console.log('--- Personen ---');
for (const p of persons) {
  const flags = [];
  if (!p.active) flags.push('inactief');
  if (p.inviteToken && !p.passwordHash) flags.push('uitnodiging open');
  if (p.email?.includes('test') || p.email?.includes('.demo')) flags.push('demo/test-mail');
  console.log(`#${p.id}`, p.name, p.email ?? '—', p.role, flags.join(', ') || 'ok');
}

console.log('\n--- Dubbele teamnamen ---');
for (const [name, list] of Object.entries(byName)) {
  if (list.length > 1) console.log(name, '→ ids', list.map((t) => t.id).join(', '));
}

const services = await prisma.service.findMany({
  select: { id: true, draft: true, active: true, date: true, type: true },
});
const drafts = services.filter((s) => s.draft);
const inactive = services.filter((s) => !s.active);
console.log('\n--- Diensten ---', services.length, 'totaal,', drafts.length, 'concept,', inactive.length, 'inactief');

const expiredSessions = await prisma.session.count({
  where: { expiresAt: { lt: new Date() } },
});
console.log('Verlopen sessies:', expiredSessions);

const teamsDetail = await prisma.team.findMany({
  include: {
    members: { select: { id: true, name: true } },
    coordinator: { select: { name: true } },
    _count: { select: { matches: true, assignedServices: true } },
  },
  orderBy: { id: 'asc' },
});
console.log('\n--- Teams ---');
for (const t of teamsDetail) {
  const empty = t.members.length === 0 && !t.coordinator && t._count.matches === 0;
  console.log(
    `#${t.id}`,
    t.name,
    `leden:${t.members.length}`,
    `coord:${t.coordinator?.name ?? '—'}`,
    `wedstrijden:${t._count.matches}`,
    `diensten:${t._count.assignedServices}`,
    empty ? '← leeg team' : '',
  );
}

await prisma.$disconnect();
