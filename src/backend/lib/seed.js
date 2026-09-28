import prisma from './prisma.js';
import { hashPassword, verifyPassword } from './auth.js';

/** Eerste keer: admin-account aanmaken zodat je kunt inloggen.
 *  Een bestaand account krijgt het wachtwoord uit ADMIN_PASSWORD bij elke start,
 *  zodat een wijziging in Render na een herstart ook echt geldt. */
export async function ensureAdmin() {
  const isProd = process.env.NODE_ENV === 'production';
  const email = (process.env.ADMIN_EMAIL || 'admin@vvl.local').toLowerCase();
  const isDemo = process.env.SEED_DEMO === 'true';
  const configured = process.env.ADMIN_PASSWORD?.trim() || '';

  if (isProd && !isDemo && (!configured || configured === 'admin123')) {
    throw new Error(
      'Productie vereist een sterke ADMIN_PASSWORD (niet de standaard admin123). Voor een demoserver: SEED_DEMO=true.',
    );
  }

  const password = configured || (isDemo ? 'demo-test-2026' : isProd ? '' : 'admin123');
  if (!password || password.length < 8) {
    throw new Error('ADMIN_PASSWORD moet minstens 8 tekens zijn');
  }

  const existing = await prisma.person.findUnique({ where: { email } });
  if (existing?.passwordHash) {
    const samePassword = await verifyPassword(password, existing.passwordHash);
    // Alleen een nog-standaardwachtwoord vervangen. Een zelf gekozen wachtwoord blijft staan.
    const stillDefault =
      !samePassword &&
      ((await verifyPassword('demo-test-2026', existing.passwordHash)) ||
        (await verifyPassword('admin123', existing.passwordHash)));
    const data = {};
    if (existing.role === 'Bestuur') data.role = 'Admin';
    if (stillDefault) data.passwordHash = await hashPassword(password);
    if (!Object.keys(data).length) return existing;
    if (data.passwordHash) {
      console.log(`Admin-wachtwoord bijgewerkt vanuit ADMIN_PASSWORD: ${email}`);
    }
    return prisma.person.update({
      where: { id: existing.id },
      data,
    });
  }

  if (existing) {
    return prisma.person.update({
      where: { id: existing.id },
      data: {
        role: 'Admin',
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
      role: 'Admin',
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
