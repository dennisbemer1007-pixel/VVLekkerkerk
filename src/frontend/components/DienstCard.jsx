import StatusBadge from './StatusBadge.jsx';
import {
  SERVICE_TYPE_LABEL,
  formatServiceDate,
  occupancyStatus,
} from '../utils/formatDate.js';

function obligationMark(person) {
  if (!person) return '';
  if (person.obligation === 'FULL' || person.mandatoryBar) return ' *';
  if (person.obligation === 'VR18') return ' VR18+';
  return '';
}

function displayReason(reason, adminMode) {
  if (!reason) return null;
  if (adminMode) return reason;
  if (/barcommissie/i.test(reason) && /handmatig/i.test(reason)) return null;
  return reason;
}

function slotLabel(slot) {
  if (slot === 'MORNING') return 'ochtend';
  if (slot === 'AFTERNOON') return 'middag';
  if (slot === 'EVENING') return 'avond';
  return null;
}

export default function DienstCard({
  dienst,
  onInschrijven,
  onUitschrijven,
  myPersonId,
  showActions = false,
  headerActions = null,
  adminMode = false,
  compact = false,
  onAdminRemoveEnrollment,
  onNoShow,
  onClearNoShow,
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
  const isLocked = Boolean(dienst.locked);
  const capacity = dienst.capacity;
  const teamDuties = dienst.teamDuties || [];
  const slot = slotLabel(dienst.slot);
  const teamNames = teamDuties
    .map((d) => d.team?.name)
    .filter(Boolean)
    .join(', ');
  const teamOnlyLeft = Boolean(capacity) && capacity.personalOpen <= 0 && capacity.teamOpen > 0;
  const canSelfEnroll =
    showActions &&
    !inactive &&
    !isDraft &&
    !myEnrollment &&
    status !== 'full' &&
    !teamOnlyLeft &&
    !(isLocked && !adminMode);

  if (compact) {
    return (
      <article className="vvl-card flex flex-wrap items-center justify-between gap-2 py-3">
        <button
          type="button"
          className="min-w-0 flex-1 text-left text-sm font-semibold"
          onClick={() => onInschrijven?.(dienst.id, 'expand')}
        >
          {new Date(dienst.date).toLocaleDateString('nl-NL', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
          })}{' '}
          · {dienst.time} · {dienst.location || type}
          {teamNames ? ` · ${teamNames}` : ''}
          {` · ${enrolled}/${required}`}
          {myEnrollment ? ' · jij staat hier' : ''}
        </button>
        <div className="flex items-center gap-2">
          {myEnrollment ? (
            <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-bold uppercase text-emerald-900">
              Jij
            </span>
          ) : null}
          {teamOnlyLeft ? (
            <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-bold uppercase text-amber-900">
              Jeugdteam
            </span>
          ) : null}
          <StatusBadge status={status} />
          {canSelfEnroll ? (
            <button
              type="button"
              className="vvl-btn-primary text-xs"
              onClick={() => onInschrijven?.(dienst.id)}
            >
              Inschrijven
            </button>
          ) : null}
        </div>
      </article>
    );
  }

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
            {type}
            {slot ? ` · ${slot}` : ''}
            {dienst.kind === 'TEAM' ? ' · teamdienst' : ''}
            {dienst.kind === 'MIXED' ? ' · team + vrijwillig' : ''}
          </p>
          <button
            type="button"
            className="text-left"
            onClick={() => !adminMode && onInschrijven?.(dienst.id, 'expand')}
          >
            <h3 className="font-heading text-lg font-black uppercase">{formatServiceDate(dienst.date)}</h3>
            <p className="text-sm font-semibold">{dienst.time}</p>
          </button>
          {teamDuties.length ? (
            <p className="text-xs text-gray-700">
              Teamdienst:{' '}
              {teamDuties
                .map((d) => `${d.team?.name || 'team'} (${d.reserved} plek${d.reserved === 1 ? '' : 'ken'})`)
                .join(', ')}
              {capacity?.personalCapacity
                ? ` · ${capacity.personalCapacity} plek${capacity.personalCapacity === 1 ? '' : 'ken'} voor vrijwilligers`
                : ''}
            </p>
          ) : dienst.assignedTeam?.name ? (
            <p className="text-xs text-gray-600">Team: {dienst.assignedTeam.name}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {onInschrijven && !adminMode ? (
            <button
              type="button"
              className="vvl-btn-outline text-xs"
              onClick={() => onInschrijven(dienst.id, 'expand')}
            >
              Inklappen
            </button>
          ) : null}
          {isDraft ? (
            <span className="rounded-full bg-gray-200 px-2 py-1 text-xs font-bold uppercase">Concept</span>
          ) : (
            <StatusBadge status={status} />
          )}
          {isLocked ? (
            <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-bold uppercase text-emerald-900">
              Officieel
            </span>
          ) : null}
          {headerActions}
        </div>
      </div>

      <p className="text-sm">
        Bezetting: <strong>{enrolled}</strong> van <strong>{required}</strong>
        {inactive ? ' · uitgeschakeld' : ''}
        {isLocked ? ' · officieel' : ''}
      </p>

      {dienst.note ? <p className="text-sm text-gray-600">{dienst.note}</p> : null}

      {dienst.enrollments?.length > 0 ? (
        <ul className="space-y-1 border-t border-vvl-border pt-3 text-sm">
          {dienst.enrollments.map((e) => {
            const reason = displayReason(e.reason, adminMode);
            return (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 font-semibold">
                <span>
                  {e.person?.name ?? 'Onbekend'}
                  {obligationMark(e.person)}
                  {e.kind === 'TEAM' ? ' · team' : ''}
                  {e.noShow ? ' · no-show' : ''}
                  {reason ? (
                    <span className="block text-xs font-normal text-gray-600">{reason}</span>
                  ) : null}
                </span>
                {adminMode && onAdminRemoveEnrollment ? (
                  <span className="flex gap-2">
                    {e.noShow ? (
                      <button
                        type="button"
                        className="text-xs font-bold uppercase text-amber-800 hover:underline"
                        onClick={() => onClearNoShow?.(e.id)}
                      >
                        No-show corrigeren
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="text-xs font-bold uppercase text-amber-800 hover:underline"
                        onClick={() => onNoShow?.(e.id)}
                      >
                        No-show
                      </button>
                    )}
                    <button
                      type="button"
                      className="text-xs font-bold uppercase text-red-700 hover:underline"
                      onClick={() => onAdminRemoveEnrollment(e.id)}
                    >
                      Verwijder
                    </button>
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-gray-500">Nog niemand ingeschreven.</p>
      )}

      {showActions && !inactive && !isDraft && !(isLocked && !adminMode) ? (
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
          ) : capacity && capacity.personalOpen <= 0 && capacity.teamOpen > 0 ? (
            <p className="text-sm text-gray-700">
              De open plekken zijn voor het jeugdteam. De bardienstcoördinator vult de ouders in.
            </p>
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

      {isLocked && showActions && !adminMode ? (
        <p className="text-xs text-gray-600">
          Officieel rooster — alleen de barcommissie kan nog wijzigen.
        </p>
      ) : null}

      {isDraft && showActions ? (
        <p className="text-xs text-gray-600">Concept — eerst publiceren via Beheer → Planning.</p>
      ) : null}
    </article>
  );
}
