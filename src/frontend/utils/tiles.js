import { occupancyStatus } from './formatDate.js';

/** Zelfde indeling als de tegels Vol / Nog 1 nodig / Open. */
export function serviceTileStatus(service) {
  if (service?.status === 'full' || service?.status === 'almost' || service?.status === 'open') {
    return service.status;
  }
  const enrolled = service?.enrolled ?? service?.enrollments?.length ?? 0;
  const required = service?.required ?? 2;
  return occupancyStatus(enrolled, required);
}

/** Aantal op een tegel is de lengte van de gefilterde lijst. */
export function tileGroups(services) {
  const list = (services || []).filter((service) => service.active !== false && !service.draft);
  const of = (key) => list.filter((service) => serviceTileStatus(service) === key);
  return {
    list,
    full: of('full'),
    almost: of('almost'),
    open: of('open'),
  };
}
