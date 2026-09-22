import prisma from './prisma.js';
import { canonicalAccessRole } from './roles.js';

export async function createNotification({
  personId,
  type,
  title,
  body,
  link = null,
  swapId = null,
}) {
  if (!personId) return null;
  return prisma.notification.create({
    data: {
      personId: Number(personId),
      type: String(type),
      title: String(title).slice(0, 200),
      body: String(body).slice(0, 1000),
      link: link ? String(link).slice(0, 200) : null,
      swapId: swapId != null ? Number(swapId) : null,
    },
  });
}

export async function notifyMany(personIds, payload) {
  const unique = [...new Set((personIds || []).filter(Boolean).map(Number))];
  if (!unique.length) return [];
  return Promise.all(unique.map((personId) => createNotification({ ...payload, personId })));
}

export async function barcommissiePersonIds() {
  const people = await prisma.person.findMany({
    where: { active: true },
    select: { id: true, role: true },
  });
  const committee = people.filter((p) => canonicalAccessRole(p.role) === 'Barcommissie');
  if (committee.length) return committee.map((p) => p.id);
  return people.filter((p) => canonicalAccessRole(p.role) === 'Admin').map((p) => p.id);
}

export async function notifyBarcommissie(payload, { excludeIds = [] } = {}) {
  const exclude = new Set((excludeIds || []).map(Number));
  const ids = (await barcommissiePersonIds()).filter((id) => !exclude.has(id));
  return notifyMany(ids, payload);
}

export function mapNotification(row) {
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    link: row.link,
    swapId: row.swapId,
    readAt: row.readAt,
    createdAt: row.createdAt,
    unread: !row.readAt,
  };
}
