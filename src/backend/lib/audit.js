import prisma from './prisma.js';

export async function writeAudit({ actorId = null, action, entity, entityId = null, detail = '' }) {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: actorId || null,
        action: String(action || '').slice(0, 80),
        entity: String(entity || '').slice(0, 80),
        entityId: entityId == null ? null : Number(entityId),
        detail: String(detail || '').slice(0, 2000),
      },
    });
  } catch (err) {
    console.error('[audit] schrijven mislukt:', err.message);
  }
}
