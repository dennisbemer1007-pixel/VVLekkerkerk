import { occupancyStatus } from './dates.js';
import { publicPersonBrief } from './roles.js';

export function serviceLocation(type) {
  return type === 'KITCHEN' ? 'Keuken' : 'Bar';
}

export { occupancyStatus };

export function mapService(service) {
  const enrolled = service.enrollments?.length ?? 0;
  const required = service.required ?? 2;
  const enrollments = (service.enrollments || []).map((e) => ({
    ...e,
    person: publicPersonBrief(e.person),
  }));

  return {
    ...service,
    enrollments,
    enrolled,
    status: occupancyStatus(enrolled, required),
    assignedTeam: service.assignedTeam
      ? { id: service.assignedTeam.id, name: service.assignedTeam.name }
      : service.assignedTeam === null
        ? null
        : undefined,
  };
}

export const serviceInclude = {
  enrollments: {
    include: { person: true },
    orderBy: { createdAt: 'asc' },
  },
  assignedTeam: true,
};
