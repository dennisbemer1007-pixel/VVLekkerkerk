import prisma from './prisma.js';
import { createInviteToken, inviteExpiry, inviteLink } from './auth.js';
import { nextPersonNumber, syncPrimaryTeamMembership } from './personNumber.js';
import { trySendInviteEmail } from './mail.js';
import { getClubSettings } from './season.js';

function keyEmail(email) {
  return String(email || '').trim().toLowerCase();
}

/**
 * Maakt of werkt personen bij vanuit gevalideerde importrijen.
 * "hoort bij" (e-mail of naam) wordt in een tweede gang gekoppeld,
 * zodat een ouder in hetzelfde bestand ook net is aangemaakt.
 */
export async function importPersonRows({ rows, sendInvites, actorId, appUrl = '' }) {
  const settings = await getClubSettings();
  let created = 0;
  let updated = 0;
  let linked = 0;
  const invites = [];
  const unlinked = [];
  const saved = [];

  for (const row of rows) {
    const existing = row.email
      ? await prisma.person.findUnique({ where: { email: row.email } })
      : null;
    const data = {
      name: row.name,
      phone: row.phone,
      role: row.role,
      obligation: row.obligation,
      teamId: row.teamId,
    };
    if (row.exempted !== undefined) data.exempted = Boolean(row.exempted);

    if (existing) {
      const person = await prisma.person.update({
        where: { id: existing.id },
        data,
      });
      if (row.teamId) await syncPrimaryTeamMembership(existing.id, row.teamId, prisma);
      updated += 1;
      saved.push({ row, person });
      continue;
    }

    const personNumber = await nextPersonNumber();
    const inviteToken = sendInvites && row.email ? createInviteToken() : null;
    const person = await prisma.person.create({
      data: {
        ...data,
        email: row.email,
        personNumber,
        inviteToken,
        inviteExpiresAt: inviteToken ? inviteExpiry() : null,
        exempted: Boolean(row.exempted),
      },
    });
    if (row.teamId) await syncPrimaryTeamMembership(person.id, row.teamId, prisma);
    created += 1;
    if (inviteToken && row.email) {
      const link = inviteLink(inviteToken, appUrl);
      const mail = await trySendInviteEmail({ email: row.email, name: row.name, link });
      invites.push({ email: row.email, sent: mail.sent });
    }
    saved.push({ row, person });
  }

  for (const { row, person } of saved) {
    const ref = String(row.guardianRef || '').trim();
    if (!ref) continue;
    const email = keyEmail(ref);
    const guardian = await prisma.person.findFirst({
      where: {
        OR: [{ email }, { name: ref }],
        NOT: { id: person.id },
      },
      orderBy: { id: 'asc' },
    });
    if (!guardian) {
      unlinked.push(person.name);
      continue;
    }
    await prisma.person.update({
      where: { id: person.id },
      data: { guardianId: guardian.id },
    });
    linked += 1;
  }

  return {
    created,
    updated,
    linked,
    unlinked,
    invites,
    seasonLabel: settings.seasonLabel,
    actorId,
  };
}
