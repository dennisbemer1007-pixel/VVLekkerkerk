import StatusBadge from './StatusBadge.jsx';
import {
  SERVICE_TYPE_LABEL,
  formatServiceDate,
  occupancyStatus,
} from '../utils/formatDate.js';
import { unenrollActions } from '../utils/uitschrijven.js';

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

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export default function DienstCard({
  dienst,
  onInschrijven,
  onUitschrijven,
  myPersonId,
  /** Zichzelf plus gekoppelde kinderen: elk van hen kan worden uitgeschreven. */
  householdIds = null,
  /** Gekozen persoon bij "Wie schrijf je in?". Leeg = de ingelogde gebruiker. */
  enrollTargetId = null,
  showActions = false,
  headerActions = null,
  adminMode = false,
  /** Barcommissie mag zichzelf inschrijven ook bij officieel/gesloten rooster */
  committeeOverride = false,
  compact = false,
  onAdminRemoveEnrollment,
  onNoShow,
  onClearNoShow,
  /** Toon no-show alleen bij diensten in het verleden */
  allowNoShow = false,
}) {
  const enrolled = dienst.enrolled ?? dienst.enrollments?.length ?? 0;
  const required = dienst.required ?? 2;
  const status = dienst.status ?? occupancyStatus(enrolled, required);
  const type = SERVICE_TYPE_LABEL[dienst.type] ?? dienst.type;
  const managedIds = householdIds?.length ? householdIds : myPersonId ? [myPersonId] : [];
  const unenroll = unenrollActions(dienst.enrollments, managedIds);
  const myEnrollment = myPersonId
    ? dienst.enrollments?.find((e) => Number(e.personId) === Number(myPersonId))
    : null;
  const actingId = enrollTargetId || myPersonId;
  const actingEnrollment = actingId
    ? dienst.enrollments?.find((e) => Number(e.personId) === Number(actingId))
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
  const unnamedTeamSpots = teamDuties
    .map((d) => {
      const named = (dienst.enrollments || []).filter(
        (e) => e.kind === 'TEAM' && Number(e.forTeamId || e.forTeam?.id) === Number(d.teamId) && !e.noShow,
      ).length;
      const left = Math.max(0, Number(d.reserved || 0) - named);
      return left > 0 ? { id: d.id || d.teamId, name: d.team?.name || 'Team', left } : null;
    })
    .filter(Boolean);
  const servicePast = startOfDay(new Date(dienst.date)) < startOfDay(new Date());
  const showNoShow = Boolean(allowNoShow && servicePast);
  const canOverride = adminMode || committeeOverride;
  const canSelfEnroll =
    showActions &&
    !inactive &&
    !isDraft &&
    !actingEnrollment &&
    status !== 'full' &&
    !teamOnlyLeft &&
    !(isLocked && !canOverride);

  if (compact) {
    return (
      <article className="vvl-card flex flex-wrap items-center justify-between gap-2 py-3">
        <button
          type="button"
          className="min-h-[44px] min-w-0 flex-1 text-left text-sm font-semibold"
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
              className="vvl-btn-primary min-h-[44px] text-xs"
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
          </p>
          <button
            type="button"
            className="text-left"
            onClick={() => !adminMode && onInschrijven?.(dienst.id, 'expand')}
          >
            <h3 className="font-heading text-lg font-black uppercase">{formatServiceDate(dienst.date)}</h3>
            <p className="text-sm font-semibold">{dienst.time}</p>
          </button>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {onInschrijven && !adminMode && !committeeOverride ? (
            <button
              type="button"
              className="vvl-btn-outline min-h-[44px] text-xs"
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

      {dienst.enrollments?.length > 0 || unnamedTeamSpots.length > 0 ? (
        <ul className="space-y-1 border-t border-vvl-border pt-3 text-sm">
          {unnamedTeamSpots.map((spot) => (
            <li key={`team-${spot.id}`} className="font-semibold">
              {spot.name}
              <span className="block text-xs font-normal text-gray-600">
                {spot.left} plek{spot.left === 1 ? '' : 'ken'} zonder naam
              </span>
            </li>
          ))}
          {dienst.enrollments?.map((e) => {
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
                  <span className="flex flex-wrap gap-2">
                    {showNoShow ? (
                      e.noShow ? (
                        <button
                          type="button"
                          className="min-h-[44px] text-xs font-bold uppercase text-amber-800 hover:underline"
                          onClick={() => onClearNoShow?.(e.id)}
                        >
                          No-show corrigeren
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="min-h-[44px] text-xs font-bold uppercase text-amber-800 hover:underline"
                          onClick={() => onNoShow?.(e.id)}
                        >
                          No-show
                        </button>
                      )
                    ) : null}
                    <button
                      type="button"
                      className="min-h-[44px] text-xs font-bold uppercase text-red-700 hover:underline"
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

      {showActions && !inactive && !isDraft && !(isLocked && !canOverride) ? (
        <div className="pt-1">
          {!myPersonId && unenroll.length === 0 ? (
            <p className="text-sm text-gray-600">Je moet ingelogd zijn om in te schrijven.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {unenroll.map((action) => (
                <button
                  key={action.enrollmentId}
                  type="button"
                  className="vvl-btn-outline min-h-11 w-full whitespace-normal text-center text-xs"
                  onClick={() => onUitschrijven?.(action.enrollmentId)}
                >
                  {action.label}
                </button>
              ))}
              {canSelfEnroll ? (
                <button
                  type="button"
                  className="vvl-btn-primary min-h-[44px] text-xs"
                  onClick={() => onInschrijven?.(dienst.id)}
                >
                  Inschrijven
                </button>
              ) : null}
              {!canSelfEnroll && unenroll.length === 0 && status === 'full' ? (
                <p className="text-sm font-semibold text-emerald-800">Deze dienst is vol.</p>
              ) : null}
              {!canSelfEnroll && unenroll.length === 0 && capacity && capacity.personalOpen <= 0 && capacity.teamOpen > 0 ? (
                <p className="text-sm text-gray-700">
                  De open plekken zijn voor het jeugdteam.
                </p>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      {isLocked && showActions && !canOverride ? (
        <p className="text-xs text-gray-600">Officieel rooster — alleen de barcommissie kan nog wijzigen.</p>
      ) : null}
    </article>
  );
}
