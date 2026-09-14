import prisma from './prisma.js';
import { PENDING_SWAP_STATUSES } from './swapRules.js';

export async function pendingForEnrollment(enrollmentId) {
  return prisma.swapRequest.findFirst({
    where: {
      status: { in: PENDING_SWAP_STATUSES },
      OR: [{ fromEnrollmentId: Number(enrollmentId) }, { toEnrollmentId: Number(enrollmentId) }],
    },
  });
}

export async function pendingForPerson(personId, excludeId = null) {
  return prisma.swapRequest.findFirst({
    where: {
      status: { in: PENDING_SWAP_STATUSES },
      ...(excludeId ? { id: { not: Number(excludeId) } } : {}),
      OR: [{ requesterId: Number(personId) }, { counterpartyId: Number(personId) }],
    },
  });
}
