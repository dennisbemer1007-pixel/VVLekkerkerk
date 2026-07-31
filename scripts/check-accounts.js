import prisma from '../src/backend/lib/prisma.js';
import { hashPassword, verifyPassword } from '../src/backend/lib/auth.js';
import { ensureAdmin } from '../src/backend/lib/seed.js';

const admin = await ensureAdmin();
const ok = await verifyPassword('admin123', admin.passwordHash);
console.log('Admin:', admin.email, 'active:', admin.active, 'admin123 valid:', ok);

const dbemer = await prisma.person.findUnique({ where: { email: 'dbemer@live.com' } });
if (dbemer) {
  console.log(
    'dbemer@live.com:',
    'active:',
    dbemer.active,
    'has password:',
    Boolean(dbemer.passwordHash),
    'has account:',
    Boolean(dbemer.accountCreatedAt),
  );
} else {
  console.log('dbemer@live.com: niet gevonden');
}

await prisma.$disconnect();
