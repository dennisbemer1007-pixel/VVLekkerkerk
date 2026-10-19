/**
 * Weekdagen (ma–vr, zo) hebben geen jeugd-teamdienst. Een 7x7- of O-teamplek
 * op bijv. donderdag bar hoort daar niet. Haal die lege teamplekken weg en zet
 * teamDutiesManual, zodat sync ze niet terugzet. Inschrijvingen blijven staan.
 */
import fs from 'fs';
import path from 'path';
import { serviceDateIsSaturday } from './teamDutyPlanning.js';

export const WEEKDAY_TEAM_DUTY_REPAIR_ID = 'weekday-team-duty-strip-2026-10-19';

export function weekdayTeamDutyRepairMarkerPath(stateDir) {
  return path.join(stateDir, `repaired-${WEEKDAY_TEAM_DUTY_REPAIR_ID}.json`);
}

export async function repairWeekdayTeamDuties(prisma, { stateDir, force = false } = {}) {
  if (!stateDir) throw new Error('stateDir is verplicht voor weekday-team-duty repair');
  const marker = weekdayTeamDutyRepairMarkerPath(stateDir);
  if (!force && fs.existsSync(marker)) {
    return { already: true, marker };
  }

  const duties = await prisma.serviceTeamDuty.findMany({
    include: {
      service: {
        select: {
          id: true,
          date: true,
          origin: true,
          teamDutiesManual: true,
          enrollments: { select: { id: true, kind: true, forTeamId: true, noShow: true } },
        },
      },
      team: { select: { id: true, name: true } },
    },
  });

  let removed = 0;
  const touchedServiceIds = new Set();
  const items = [];

  for (const duty of duties) {
    const service = duty.service;
    if (!service || service.origin === 'MANUAL') continue;
    if (serviceDateIsSaturday(service.date)) continue;
    const teamEnrollment = (service.enrollments || []).some(
      (row) =>
        !row.noShow &&
        row.kind === 'TEAM' &&
        Number(row.forTeamId) === Number(duty.teamId),
    );
    if (teamEnrollment) continue;

    await prisma.serviceTeamDuty.delete({ where: { id: duty.id } });
    removed += 1;
    touchedServiceIds.add(service.id);
    items.push({
      serviceId: service.id,
      teamId: duty.teamId,
      teamName: duty.team?.name || null,
      date: service.date,
    });
  }

  if (touchedServiceIds.size) {
    await prisma.service.updateMany({
      where: { id: { in: [...touchedServiceIds] } },
      data: { teamDutiesManual: true },
    });
  }

  const result = {
    repairId: WEEKDAY_TEAM_DUTY_REPAIR_ID,
    removed,
    services: touchedServiceIds.size,
    items: items.slice(0, 40),
    at: new Date().toISOString(),
  };
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(marker, JSON.stringify(result, null, 2));
  return result;
}
