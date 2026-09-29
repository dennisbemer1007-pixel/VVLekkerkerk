import { occupancyStatus } from '../utils/formatDate.js';
import { occupancyFraction } from '../utils/teamLines.js';

export function openSpots(service) {
  const enrolled = service.enrolled ?? service.enrollments?.length ?? 0;
  const required = service.required ?? 0;
  return Math.max(0, required - enrolled);
}

export function serviceStatus(service) {
  const enrolled = service.enrolled ?? service.enrollments?.length ?? 0;
  return service.status ?? occupancyStatus(enrolled, service.required ?? 2);
}

function dotClass(status) {
  if (status === 'full') return 'bg-emerald-500';
  if (status === 'almost') return 'bg-amber-400';
  return 'bg-red-500';
}

export default function ServiceLine({ service, selected, onSelect, actionLabel, onAction }) {
  const status = serviceStatus(service);
  const type = service.type === 'KITCHEN' ? 'Keuken' : 'Bar';
  const when = new Date(service.date).toLocaleDateString('nl-NL', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  return (
    <div
      className={`flex items-center gap-2 rounded-sm border bg-white px-3 py-2 ${
        selected ? 'border-black' : 'border-vvl-border'
      }`}
    >
      <button type="button" onClick={onSelect} className="min-h-11 min-w-0 flex-1 text-left">
        <span className="flex items-center gap-2 text-sm font-bold">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dotClass(status)}`} aria-hidden="true" />
          <span className="truncate">
            {when} · {service.time}
          </span>
        </span>
        <span className="mt-0.5 block text-xs text-gray-600">
          {type} · {occupancyFraction(service)}
        </span>
      </button>
      {actionLabel ? (
        <button type="button" className="vvl-btn-primary shrink-0 px-3 text-xs md:hidden" onClick={onAction || onSelect}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
