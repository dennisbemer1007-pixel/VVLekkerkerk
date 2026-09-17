import { occupancyStatus } from './dates.js';
import { publicPersonBrief } from './roles.js';
import { serviceCapacity } from './teamDutyPlanning.js';

export function serviceLocation(type) {
  return type === 'KITCHEN' ? 'Keuken' : 'Bar';
}

export { occupancyStatus };

export function mapService(service) {
  const required = service.required ?? 2;
  const enrollments = (service.enrollments || []).map((e) => ({
    ...e,
    person: publicPersonBrief(e.person),
    forTeam: e.forTeam ? { id: e.forTeam.id, name: e.forTeam.name } : e.forTeam === null ? null : undefined,
  }));
  const teamDuties = (service.teamDuties || []).map((d) => ({
    id: d.id,
    teamId: d.teamId,
    reserved: d.reserved,
    team: d.team ? { id: d.team.id, name: d.team.name } : undefined,
  }));
  const capacity = serviceCapacity({
    ...service,
    enrollments,
    teamDuties,
    required,
  });

  return {
    ...service,
    enrollments,
    teamDuties,
    enrolled: capacity.enrolled,
    capacity,
    status: occupancyStatus(capacity.enrolled, required),
    assignedTeam: service.assignedTeam
      ? { id: service.assignedTeam.id, name: service.assignedTeam.name }
      : service.assignedTeam === null
        ? null
        : undefined,
  };
}

export const serviceInclude = {
  enrollments: {
    include: { person: true, forTeam: true },
    orderBy: { createdAt: 'asc' },
  },
  assignedTeam: true,
  teamDuties: { include: { team: true }, orderBy: { id: 'asc' } },
};
