/** Ingelogde persoon plus gekoppelde kinderen. */
export async function householdPersonIds(prisma, personId) {
  const id = Number(personId);
  if (!id) return [];
  const children = await prisma.person.findMany({
    where: { guardianId: id },
    select: { id: true },
  });
  return [id, ...children.map((row) => row.id)];
}

export function inHousehold(householdIds, personId) {
  return (householdIds || []).includes(Number(personId));
}

/** Bel naar de persoon zelf (als die een account heeft) én naar de ouder. */
export async function notifyPersonAndGuardian(createNotification, prisma, personId, payload) {
  const person = await prisma.person.findUnique({
    where: { id: Number(personId) },
    select: { id: true, guardianId: true, passwordHash: true },
  });
  const ids = new Set();
  if (person?.passwordHash) ids.add(person.id);
  if (person?.guardianId) ids.add(person.guardianId);
  if (!ids.size && person) ids.add(person.id);
  return Promise.all([...ids].map((id) => createNotification({ ...payload, personId: id })));
}
