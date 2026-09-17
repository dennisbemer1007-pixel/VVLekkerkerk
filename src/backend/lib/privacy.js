import prisma from './prisma.js';
import { PHOTOS_DIR } from './uploads.js';
import { getClubSettings } from './season.js';
import fs from 'fs';
import path from 'path';

export const AVG_DECISION = {
  auditRetainMonths: 24,
  inactiveContactRetainMonths: 24,
  keepPlanningHistory: true,
  hostingNote: 'Productie: Render Starter (of gelijkwaardig) met persistente schijf (DATA_DIR). Free is alleen demo.',
};

function monthsAgo(months, now = new Date()) {
  const d = new Date(now);
  d.setMonth(d.getMonth() - months);
  return d;
}

function deletePhotoFile(photoUrl) {
  if (!photoUrl?.startsWith('/uploads/photos/')) return;
  const oldPath = path.join(PHOTOS_DIR, path.basename(photoUrl));
  if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
}

export async function cleanupPrivacy({ now = new Date() } = {}) {
  const settings = await getClubSettings();
  const auditBefore = monthsAgo(settings.auditRetainMonths || 24, now);
  const inactiveBefore = monthsAgo(settings.inactiveRetainMonths || 24, now);

  const audit = await prisma.auditLog.deleteMany({
    where: { createdAt: { lt: auditBefore } },
  });

  const inactive = await prisma.person.findMany({
    where: {
      active: false,
      AND: [
        {
          OR: [{ email: { not: null } }, { phone: { not: null } }, { photoUrl: { not: null } }, { passwordHash: { not: null } }],
        },
        {
          OR: [
            { deactivatedAt: { lt: inactiveBefore } },
            { AND: [{ deactivatedAt: null }, { updatedAt: { lt: inactiveBefore } }] },
          ],
        },
      ],
    },
    select: { id: true, photoUrl: true },
  });

  for (const person of inactive) {
    deletePhotoFile(person.photoUrl);
    await prisma.person.update({
      where: { id: person.id },
      data: {
        email: null,
        phone: null,
        photoUrl: null,
        passwordHash: null,
        inviteToken: null,
        inviteExpiresAt: null,
        passwordResetToken: null,
        passwordResetExpiresAt: null,
      },
    });
    await prisma.session.deleteMany({ where: { personId: person.id } });
  }

  return {
    auditDeleted: audit.count,
    contactsCleared: inactive.length,
    auditBefore,
    inactiveBefore,
  };
}

export async function wipePersonContact(personId) {
  const person = await prisma.person.findUnique({
    where: { id: Number(personId) },
    select: { id: true, photoUrl: true, active: true },
  });
  if (!person) {
    const err = new Error('Persoon niet gevonden');
    err.status = 404;
    throw err;
  }
  if (person.active) {
    const err = new Error('Deactiveer het account eerst. Roosterhistorie blijft bewaard.');
    err.status = 400;
    throw err;
  }
  deletePhotoFile(person.photoUrl);
  await prisma.person.update({
    where: { id: person.id },
    data: {
      email: null,
      phone: null,
      photoUrl: null,
      passwordHash: null,
      inviteToken: null,
      inviteExpiresAt: null,
      passwordResetToken: null,
      passwordResetExpiresAt: null,
    },
  });
  await prisma.session.deleteMany({ where: { personId: person.id } });
  return { id: person.id, contactsCleared: 1 };
}

export async function exportPersonData(personId) {
  const person = await prisma.person.findUnique({
    where: { id: Number(personId) },
    include: {
      team: true,
      teamMemberships: { include: { team: true } },
      enrollments: { include: { service: true }, orderBy: { createdAt: 'desc' } },
    },
  });
  if (!person) return null;
  const swaps = await prisma.swapRequest.findMany({
    where: { OR: [{ requesterId: person.id }, { counterpartyId: person.id }] },
    orderBy: { createdAt: 'desc' },
  });
  return {
    exportedAt: new Date().toISOString(),
    person: {
      id: person.id,
      personNumber: person.personNumber,
      name: person.name,
      email: person.email,
      phone: person.phone,
      role: person.role,
      obligation: person.obligation,
      exempted: person.exempted,
      makeupDue: person.makeupDue,
      team: person.team?.name ?? null,
      unavailableWeekdays: person.unavailableWeekdays,
      preferredSlots: person.preferredSlots,
      createdAt: person.createdAt,
    },
    memberships: person.teamMemberships.map((m) => ({
      team: m.team?.name,
      season: m.season,
      active: m.active,
    })),
    enrollments: person.enrollments.map((e) => ({
      date: e.service?.date,
      time: e.service?.time,
      type: e.service?.type,
      kind: e.kind,
      source: e.source,
      makeup: e.makeup,
      noShow: e.noShow,
      reason: e.reason,
    })),
    swaps: swaps.map((s) => ({
      id: s.id,
      status: s.status,
      createdAt: s.createdAt,
    })),
  };
}

export function personExportSheets(data) {
  const person = data?.person || {};
  return [
    {
      name: 'Gegevens',
      headers: ['Veld', 'Waarde'],
      rows: [
        ['Naam', person.name || ''],
        ['Persoonsnummer', person.personNumber || ''],
        ['E-mail', person.email || ''],
        ['Telefoon', person.phone || ''],
        ['Rol', person.role || ''],
        ['Team', person.team || ''],
        ['Verplichting', person.obligation || ''],
        ['Geëxporteerd', data?.exportedAt || ''],
      ],
    },
    {
      name: 'Inschrijvingen',
      headers: ['Datum', 'Tijd', 'Type', 'Soort', 'Bron', 'Inhaal', 'No-show'],
      rows: (data?.enrollments || []).map((e) => [
        e.date ? new Date(e.date).toISOString().slice(0, 10) : '',
        e.time || '',
        e.type === 'KITCHEN' ? 'Keuken' : 'Bar',
        e.kind || '',
        e.source || '',
        e.makeup ? 'ja' : 'nee',
        e.noShow ? 'ja' : 'nee',
      ]),
    },
    {
      name: 'Teams',
      headers: ['Team', 'Seizoen', 'Actief'],
      rows: (data?.memberships || []).map((m) => [m.team || '', m.season || '', m.active ? 'ja' : 'nee']),
    },
  ];
}
