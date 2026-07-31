/**
 * Wachtwoord opnieuw instellen (lokaal beheer).
 * Usage: node scripts/reset-password.js <email> <nieuw-wachtwoord>
 */
import prisma from '../src/backend/lib/prisma.js';
import { hashPassword } from '../src/backend/lib/auth.js';

const email = process.argv[2]?.trim().toLowerCase();
const password = process.argv[3];

if (!email || !password) {
  console.error('Gebruik: node scripts/reset-password.js <email> <wachtwoord>');
  process.exit(1);
}

const person = await prisma.person.findUnique({ where: { email } });
if (!person) {
  console.error('Geen persoon met e-mail:', email);
  process.exit(1);
}

await prisma.person.update({
  where: { id: person.id },
  data: {
    passwordHash: await hashPassword(password),
    accountCreatedAt: person.accountCreatedAt ?? new Date(),
    inviteToken: null,
    inviteExpiresAt: null,
    active: true,
  },
});

console.log(`Wachtwoord bijgewerkt voor ${email} (${person.name}). Je kunt nu inloggen.`);

await prisma.$disconnect();
