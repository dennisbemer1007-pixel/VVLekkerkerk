import StatusBadge from './StatusBadge.jsx';
import {
  SERVICE_TYPE_LABEL,
  formatServiceDate,
  occupancyStatus,
} from '../utils/formatDate.js';

function obligationMark(person) {
  if (!person) return '';
  if (person.obligation === 'FULL' || person.mandatoryBar) return ' *';
  if (person.obligation === 'HALF') return ' ½';
  return '';
}

export default function DienstCard({
  dienst,
  onInschrijven,
  onUitschrijven,
  myPersonId,
  showActions = false,
  headerActions = null,
  adminMode = false,
  onAdminRemoveEnrollment,
}) {
  const enrolled = dienst.enrolled ?? dienst.enrollments?.length ?? 0;
  const required = dienst.required ?? 2;
  const status = dienst.status ?? occupancyStatus(enrolled, required);
  const type = SERVICE_TYPE_LABEL[dienst.type] ?? dienst.type;
  const myEnrollment = myPersonId
    ? dienst.enrollments?.find((e) => e.personId === myPersonId)
    : null;
  const inactive = dienst.active === false;
  const isDraft = Boolean(dienst.draft);

  return (
    <article
      className={`vvl-card flex flex-col gap-3 ${inactive || isDraft ? 'opacity-80' : ''} border-l-4 ${
        isDraft
          ? 'border-l-gray-400'
          : status === 'full'
            ? 'border-l-emerald-500'
            : status === 'almost'
              ? 'border-l-amber-500'
              : 'border-l-red-500'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-vvl-accent">
            {type} · {dienst.location}
            {dienst.slot && dienst.slot !== 'EXTRA' ? ` · ${slotLabel(dienst.slot)}` : ''}
            {dienst.slot === 'EXTRA' ? ' · extra' : ''}
          </p>
          <h3 className="font-heading text-lg font-black uppercase">{formatServiceDate(dienst.date)}</h3>
          <p className="text-sm font-semibold">{dienst.time}</p>
          {dienst.assignedTeam?.name ? (
            <p className="text-xs text-gray-600">Team: {dienst.assignedTeam.name}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {isDraft ? (
            <span className="rounded-full bg-gray-200 px-2 py-1 text-xs font-bold uppercase">Concept</span>
          ) : (
            <StatusBadge status={status} />
          )}
          {headerActions}
        </div>
      </div>

      <p className="text-sm">
        Bezetting: <strong>{enrolled}</strong> van <strong>{required}</strong>
        {inactive ? ' · uitgeschakeld' : ''}
      </p>

      {dienst.note ? <p className="text-sm text-gray-600">{dienst.note}</p> : null}

      {dienst.enrollments?.length > 0 ? (
        <ul className="space-y-1 border-t border-vvl-border pt-3 text-sm">
          {dienst.enrollments.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 font-semibold">
              <span>
                {e.person?.name ?? 'Onbekend'}
                {obligationMark(e.person)}
              </span>
              {adminMode && onAdminRemoveEnrollment ? (
                <button
                  type="button"
                  className="text-xs font-bold uppercase text-red-700 hover:underline"
                  onClick={() => onAdminRemoveEnrollment(e.id)}
                >
                  Verwijder
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-500">Nog niemand ingeschreven.</p>
      )}

      {showActions && !inactive && !isDraft ? (
        <div className="pt-1">
          {!myPersonId ? (
            <p className="text-sm text-gray-600">Je moet ingelogd zijn om in te schrijven.</p>
          ) : myEnrollment ? (
            <button
              type="button"
              className="vvl-btn-outline text-xs"
              onClick={() => onUitschrijven?.(myEnrollment.id)}
            >
              Uitschrijven
            </button>
          ) : status === 'full' ? (
            <p className="text-sm font-semibold text-emerald-800">Deze dienst is vol.</p>
          ) : (
            <button
              type="button"
              className="vvl-btn-primary text-xs"
              onClick={() => onInschrijven?.(dienst.id)}
            >
              Inschrijven
            </button>
          )}
        </div>
      ) : null}

      {isDraft && showActions ? (
        <p className="text-xs text-gray-600">Concept — eerst publiceren via Beheer → Planning.</p>
      ) : null}
    </article>
  );
}

function slotLabel(slot) {
  if (slot === 'MORNING') return 'ochtend';
  if (slot === 'AFTERNOON') return 'middag';
  if (slot === 'EVENING') return 'late middag/avond';
  return slot;
}
