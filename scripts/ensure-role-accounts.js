/**
 * Zorgt dat er per rol één inlogbaar demo-account bestaat.
 * Run: node scripts/ensure-role-accounts.js
 *
 * Wist niets; maakt alleen ontbrekende accounts aan of zet het wachtwoord opnieuw.
 */
import prisma from '../src/backend/lib/prisma.js';
import { hashPassword } from '../src/backend/lib/auth.js';
import { ensureAdmin } from '../src/backend/lib/seed.js';

const DEMO_PASSWORD = 'demo123';

const ACCOUNTS = [
  {
    email: 'mark@vvl.demo',
    name: 'Mark Jansen',
    role: 'Coördinator',
    phone: '06-55667788',
  },
  {
    email: 'sandra@vvl.demo',
    name: 'Sandra de Vries',
    role: 'Teamcoördinator',
    phone: '06-11223344',
  },
  {
    email: 'lisa@vvl.demo',
    name: 'Lisa Bakker',
    role: 'Vrijwilliger',
    phone: '06-10101010',
  },
];

async function upsertAccount(account, passwordHash) {
  const email = account.email.toLowerCase();
  const existing = await prisma.person.findFirst({
    where: { email },
  });

  if (existing) {
    return prisma.person.update({
      where: { id: existing.id },
      data: {
        name: account.name,
        role: account.role,
        phone: account.phone,
        passwordHash,
        accountCreatedAt: existing.accountCreatedAt ?? new Date(),
        inviteToken: null,
        inviteExpiresAt: null,
        active: true,
      },
    });
  }

  return prisma.person.create({
    data: {
      name: account.name,
      email,
      phone: account.phone,
      role: account.role,
      passwordHash,
      accountCreatedAt: new Date(),
      active: true,
    },
  });
}

async function main() {
  const admin = await ensureAdmin();
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  console.log('Accounts per rol:\n');
  console.log(`  Bestuur:          ${admin.email} / ${process.env.ADMIN_PASSWORD || 'admin123'}`);

  for (const account of ACCOUNTS) {
    const person = await upsertAccount(account, passwordHash);
    console.log(`  ${person.role.padEnd(18)} ${person.email} / ${DEMO_PASSWORD}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
