import prisma from '../src/backend/lib/prisma.js';

const matches = await prisma.match.findMany({
  include: { team: true, services: { select: { id: true } } },
  orderBy: { id: 'asc' },
});

console.log('--- Wedstrijden ---');
for (const m of matches) {
  console.log(
    `#${m.id}`,
    m.date.toISOString().slice(0, 10),
    m.home ? 'thuis' : 'uit',
    'team:',
    m.team?.name ?? '—',
    'tegen:',
    m.opponent ?? '—',
    'diensten:',
    m.services.length,
  );
}

await prisma.$disconnect();
