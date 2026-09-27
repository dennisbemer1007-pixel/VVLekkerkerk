import prisma from './prisma.js';
import { hashPassword } from './auth.js';
import { nextPersonNumber, syncPrimaryTeamMembership } from './personNumber.js';
import { defaultTeamFunctions } from './teamFunctions.js';

export const DEMO_PASSWORD = 'demo123';

/** Alle inlogbare demo-vrijwilligers / commissie (niet de admin). */
export const DEMO_PEOPLE = [
  {
    email: 'mark@vvl.demo',
    name: 'Mark Jansen',
    role: 'Barcommissie',
    phone: '06-55667788',
    note: 'Clubbrede planning',
  },
  {
    email: 'sandra@vvl.demo',
    name: 'Sandra de Vries',
    role: 'Teamcoördinator',
    phone: '06-11223344',
    team: 'JO15-1',
    coordinate: ['JO15-1'],
    note: 'Team JO15-1',
  },
  {
    email: 'lisa@vvl.demo',
    name: 'Lisa Bakker',
    role: 'Vrijwilliger',
    phone: '06-10101010',
    team: 'JO15-1',
    obligation: 'FULL',
    note: 'Verplicht (1× / 6 weken)',
  },
  {
    email: 'tom@vvl.demo',
    name: 'Tom van Dam',
    role: 'Vrijwilliger',
    phone: '06-20202020',
    team: 'JO15-1',
    note: 'Geen verplichting',
  },
  {
    email: 'fatima@vvl.demo',
    name: 'Fatima El Amrani',
    role: 'Vrijwilliger',
    phone: '06-30303030',
    team: 'JO13-2',
    note: 'JO13-2',
  },
  {
    email: 'peter@vvl.demo',
    name: 'Peter Smit',
    role: 'Vrijwilliger',
    phone: '06-40404040',
    team: 'JO13-2',
    obligation: 'FULL',
    note: 'Verplicht, JO13-2',
  },
  {
    email: 'anneke@vvl.demo',
    name: 'Anneke Mulder',
    role: 'Vrijwilliger',
    phone: '06-50505050',
    team: 'JO11-1',
    obligation: 'FULL',
    note: 'Verplicht, JO11-1',
  },
  {
    email: 'kevin@vvl.demo',
    name: 'Kevin de Boer',
    role: 'Vrijwilliger',
    phone: '06-60606060',
    team: 'JO11-1',
    note: 'JO11-1',
  },
  {
    email: 'noa@vvl.demo',
    name: 'Noa Visser',
    role: 'Vrijwilliger',
    phone: '06-70707070',
    team: 'Senioren 1',
    note: 'Senioren',
  },
  {
    email: 'erik@vvl.demo',
    name: 'Erik Hofman',
    role: 'Vrijwilliger',
    phone: '06-80808080',
    note: 'Geen team',
  },
];

const DEMO_TEAMS = ['JO11-1', 'JO15-1', 'JO13-2', 'Senioren 1'];

export function demoLoginsEnabled() {
  return process.env.SEED_DEMO === 'true' || process.env.NODE_ENV !== 'production';
}

export function adminDemoPassword() {
  const isDemo = process.env.SEED_DEMO === 'true';
  return process.env.ADMIN_PASSWORD || (isDemo ? 'demo-test-2026' : 'admin123');
}

/** Lijst voor het loginscherm (inclusief wachtwoorden — alleen demo/dev). */
export function publicDemoAccountList() {
  if (!demoLoginsEnabled()) return [];
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@vvl.local').toLowerCase();
  return [
    {
      role: 'Admin',
      name: 'Beheerder',
      email: adminEmail,
      password: adminDemoPassword(),
      note: 'Alles beheren',
    },
    ...DEMO_PEOPLE.map((p) => ({
      role: p.role,
      name: p.name,
      email: p.email,
      password: DEMO_PASSWORD,
      note: p.note,
    })),
  ];
}

async function ensureTeamByName(name) {
  let team = await prisma.team.findFirst({ where: { name } });
  if (team) return team;
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
  return team;
}

/**
 * Maakt ontbrekende demo-accounts aan en zet hun wachtwoord op demo123.
 * Wist geen andere clubdata.
 */
export async function ensureDemoAccounts() {
  if (!demoLoginsEnabled()) return { skipped: true, created: 0, updated: 0 };

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const teams = {};
  for (const name of DEMO_TEAMS) {
    teams[name] = await ensureTeamByName(name);
  }

  let created = 0;
  let updated = 0;
  const byEmail = {};

  for (const account of DEMO_PEOPLE) {
    const email = account.email.toLowerCase();
    const teamId = account.team ? teams[account.team]?.id ?? null : null;
    let person = await prisma.person.findUnique({ where: { email } });
    if (!person) {
      person = await prisma.person.create({
        data: {
          name: account.name,
          email,
          phone: account.phone,
          role: account.role,
          obligation: account.obligation || 'NONE',
          passwordHash,
          accountCreatedAt: new Date(),
          active: true,
          teamId,
          personNumber: await nextPersonNumber(),
        },
      });
      created += 1;
    } else {
      const data = {
        name: account.name,
        role: account.role,
        phone: account.phone,
        obligation: account.obligation || person.obligation || 'NONE',
        active: true,
        deactivatedAt: null,
        inviteToken: null,
        inviteExpiresAt: null,
      };
      if (teamId) data.teamId = teamId;
      data.passwordHash = passwordHash;
      if (!person.accountCreatedAt) data.accountCreatedAt = new Date();
      if (!person.personNumber) data.personNumber = await nextPersonNumber();
      person = await prisma.person.update({ where: { id: person.id }, data });
      updated += 1;
    }
    if (person.teamId) await syncPrimaryTeamMembership(person.id, person.teamId);
    byEmail[email] = person;
  }

  const sandra = byEmail['sandra@vvl.demo'];
  if (sandra) {
    if (teams['JO15-1']) {
      await prisma.team.update({
        where: { id: teams['JO15-1'].id },
        data: { coordinatorId: sandra.id },
      });
    }
    if (teams['JO13-2']) {
      const jo13 = await prisma.team.findUnique({ where: { id: teams['JO13-2'].id } });
      if (jo13?.coordinatorId === sandra.id) {
        await prisma.team.update({
          where: { id: jo13.id },
          data: { coordinatorId: null },
        });
      }
    }
  }

  return { skipped: false, created, updated };
}
