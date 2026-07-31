import prisma from './prisma.js';
import { hashPassword } from './auth.js';

/** Eerste keer: admin-account aanmaken zodat je kunt inloggen */
export async function ensureAdmin() {
  const isProd = process.env.NODE_ENV === 'production';
  const email = (process.env.ADMIN_EMAIL || 'admin@vvl.local').toLowerCase();
  const isDemo = process.env.SEED_DEMO === 'true';

  if (
    isProd &&
    !isDemo &&
    (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD === 'admin123')
  ) {
    throw new Error(
      'Productie vereist een sterke ADMIN_PASSWORD (niet de standaard admin123). Voor een demoserver: SEED_DEMO=true.',
    );
  }

  const password =
    process.env.ADMIN_PASSWORD ||
    (isDemo ? 'demo-test-2026' : isProd ? '' : 'admin123');
  if (!password || password.length < 8) {
    throw new Error('ADMIN_PASSWORD moet minstens 8 tekens zijn');
  }

  const existing = await prisma.person.findUnique({ where: { email } });
  if (existing?.passwordHash) return existing;

  if (existing) {
    return prisma.person.update({
      where: { id: existing.id },
      data: {
        role: 'Bestuur',
        passwordHash: await hashPassword(password),
        accountCreatedAt: new Date(),
        inviteToken: null,
        inviteExpiresAt: null,
        active: true,
      },
    });
  }

  const admin = await prisma.person.create({
    data: {
      name: 'Beheerder',
      email,
      role: 'Bestuur',
      passwordHash: await hashPassword(password),
      accountCreatedAt: new Date(),
      active: true,
    },
  });

  if (!isProd || isDemo) {
    console.log(`Admin account klaar: ${email}`);
  } else {
    console.log(`Admin account aangemaakt: ${email}`);
  }
  return admin;
}
