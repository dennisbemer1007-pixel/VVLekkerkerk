/**
 * Zorgt dat alle demo-accounts inlogbaar zijn.
 * Run: npm run db:accounts
 *
 * Wist niets anders; zet wachtwoord van @vvl.demo-accounts op demo123.
 */
import prisma from '../src/backend/lib/prisma.js';
import { hashPassword } from '../src/backend/lib/auth.js';
import { ensureAdmin } from '../src/backend/lib/seed.js';
import { DEMO_PASSWORD, DEMO_PEOPLE, ensureDemoAccounts } from '../src/backend/lib/demoAccounts.js';

async function main() {
  const admin = await ensureAdmin();
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  await ensureDemoAccounts();

  console.log('Accounts per rol:\n');
  console.log(`  Admin:            ${admin.email} / ${process.env.ADMIN_PASSWORD || 'admin123'}`);

  for (const account of DEMO_PEOPLE) {
    const person = await prisma.person.update({
      where: { email: account.email.toLowerCase() },
      data: {
        passwordHash,
        active: true,
        deactivatedAt: null,
        inviteToken: null,
        inviteExpiresAt: null,
        accountCreatedAt: new Date(),
      },
    });
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
