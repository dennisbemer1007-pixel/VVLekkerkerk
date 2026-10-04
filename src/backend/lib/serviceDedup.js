import { toIsoDate } from './dates.js';

export function paddedStartTime(value) {
  const match = String(value || '').match(/(\d{1,2}):(\d{2})/);
  return match ? `${String(match[1]).padStart(2, '0')}:${match[2]}` : '';
}

/** Zelfde dienst:zelfde dag, type en begintijd (07:30 vs 7:30 telt als één). */
export function serviceDedupeKey(service) {
  const start = paddedStartTime(service?.time);
  const raw = service?.date;
  const day =
    typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}/.test(raw)
      ? raw.slice(0, 10)
      : raw
        ? toIsoDate(raw instanceof Date ? raw : new Date(raw))
        : '';
  return `${day}|${service?.type || ''}|${start}`;
}

export function ruleFingerprint(rule) {
  return `${Number(rule?.weekday)}|${rule?.type || ''}|${paddedStartTime(rule?.startTime)}`;
}

export function serviceRuleFingerprint(service) {
  const weekday = new Date(service?.date).getDay();
  return `${weekday}|${service?.type || ''}|${paddedStartTime(service?.time)}`;
}

/**
 * Lege AUTO-dienst die bij geen enkele actieve dienstregel hoort (niet jaarplanning).
 * Typisch: oude zaterdagavond 18:30 die is blijven staan na een regelwijziging + officieel-lock.
 */
export function isOrphanAutoService(service, rules) {
  if (!service || service.origin !== 'AUTO') return false;
  if (service.active === false) return false;
  if (service.activityId || service.activity?.id) return false;
  if ((service.enrollments || []).length) return false;
  const fingerprints = new Set((rules || []).filter((rule) => rule?.active !== false).map(ruleFingerprint));
  return !fingerprints.has(serviceRuleFingerprint(service));
}

export function scoreCanonicalService(service) {
  const enrollments = service?.enrollments?.length || 0;
  const duties = service?.teamDuties?.length || 0;
  const locked = service?.locked ? 1 : 0;
  const active = service?.active === false ? 0 : 1;
  return active * 1000 + enrollments * 10 + duties * 5 + locked;
}

/** Hou de dienst met de meeste namen/teamplekken; bij gelijke stand de oudste id. */
export function chooseCanonicalService(list) {
  const rows = (list || []).filter(Boolean);
  if (!rows.length) return null;
  return rows.slice().sort((a, b) => {
    const diff = scoreCanonicalService(b) - scoreCanonicalService(a);
    if (diff) return diff;
    return Number(a.id || 0) - Number(b.id || 0);
  })[0];
}

export function groupServicesByDedupeKey(services) {
  const groups = new Map();
  for (const service of services || []) {
    const key = serviceDedupeKey(service);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(service);
  }
  return groups;
}

/**
 * Zet dubbele actieve diensten (zelfde dag/tijd/type) inactief.
 * Inschrijvingen verhuizen naar de blijvende dienst als die persoon er nog niet op staat.
 */
export async function deactivateDuplicateServices(prisma) {
  const services = await prisma.service.findMany({
    where: { active: true },
    include: { enrollments: true, teamDuties: true },
  });
  const deactivated = [];
  for (const [, list] of groupServicesByDedupeKey(services)) {
    if (list.length < 2) continue;
    const keep = chooseCanonicalService(list);
    if (!keep) continue;
    const keepPersonIds = new Set((keep.enrollments || []).map((row) => Number(row.personId)));
    for (const extra of list.filter((row) => Number(row.id) !== Number(keep.id))) {
      for (const enrollment of extra.enrollments || []) {
        if (keepPersonIds.has(Number(enrollment.personId))) continue;
        try {
          await prisma.enrollment.update({
            where: { id: enrollment.id },
            data: { serviceId: keep.id },
          });
          keepPersonIds.add(Number(enrollment.personId));
        } catch {
          /* unieke (service, persoon) of andere constraint: laat staan, dienst wordt inactief */
        }
      }
      await prisma.service.update({
        where: { id: extra.id },
        data: { active: false },
      });
      deactivated.push({
        fromId: extra.id,
        intoId: keep.id,
        date: extra.date,
        time: extra.time,
        type: extra.type,
      });
    }
  }
  return { deactivated: deactivated.length, items: deactivated };
}

/**
 * Zet lege AUTO-diensten inactief als ze bij geen dienstregel meer horen.
 * Locked records worden niet verwijderd (officieel rooster); wel verborgen.
 */
export async function deactivateOrphanAutoServices(prisma) {
  const [rules, services] = await Promise.all([
    prisma.serviceRule.findMany({ where: { active: true } }),
    prisma.service.findMany({
      where: { active: true, origin: 'AUTO' },
      include: { enrollments: { select: { id: true } } },
    }),
  ]);
  const deactivated = [];
  for (const service of services) {
    if (!isOrphanAutoService(service, rules)) continue;
    await prisma.service.update({
      where: { id: service.id },
      data: { active: false },
    });
    deactivated.push({
      id: service.id,
      date: service.date,
      time: service.time,
      type: service.type,
      locked: Boolean(service.locked),
    });
  }
  return { deactivated: deactivated.length, items: deactivated };
}
