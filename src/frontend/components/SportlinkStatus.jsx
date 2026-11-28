export function formatSyncTime(iso) {
  if (!iso) return 'nog nooit';
  return new Date(iso).toLocaleString('nl-NL', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const STATUS_TEXT = {
  ok: 'Gelukt',
  partial: 'Gelukt met meldingen',
  error: 'Mislukt',
  '': 'Nog niet gedraaid',
};

/** Samenvatting van de laatste Sportlink-synchronisatie. */
export default function SportlinkStatus({ settings }) {
  const report = settings?.lastReport;
  const tone =
    settings?.lastStatus === 'error'
      ? 'border-red-300 bg-red-50 text-red-900'
      : settings?.lastStatus === 'partial'
        ? 'border-amber-300 bg-amber-50 text-amber-950'
        : 'border-vvl-border bg-white text-gray-800';
  return (
    <div className={`space-y-2 rounded-sm border p-3 text-sm ${tone}`} data-testid="sportlink-status">
      <p>
        <strong>Laatste synchronisatie:</strong> {formatSyncTime(settings?.lastSyncAt)} ·{' '}
        {STATUS_TEXT[settings?.lastStatus ?? ''] ?? settings?.lastStatus}
      </p>
      {report ? (
        <>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3" data-testid="sportlink-tellers">
            <li>Nieuw: <strong>{report.newMatches}</strong></li>
            <li>Gewijzigd: <strong>{report.changed}</strong></li>
            <li>Verplaatst: <strong>{report.moved}</strong></li>
            <li>Afgelast: <strong>{report.cancelled}</strong></li>
            <li>Ongewijzigd: <strong>{report.unchanged}</strong></li>
            <li>Overgeslagen, handmatig: <strong>{report.skippedManual}</strong></li>
            <li>Diensten verschoven: <strong>{report.servicesMoved}</strong></li>
            <li>Diensten afgelast: <strong>{report.servicesCancelled}</strong></li>
            <li>Diensten controleren: <strong>{report.servicesProtected}</strong></li>
            <li>Mails verstuurd: <strong>{report.mailsSent}</strong></li>
          </ul>
          {report.mailsSkippedOff ? (
            <p>
              {report.mailsSkippedOff} mail(s) niet verstuurd omdat e-mail versturen uit staat (Beheer → E-mail).
            </p>
          ) : null}
          {report.missingInSportlink ? (
            <p>{report.missingInSportlink} toekomstige wedstrijd(en) komen niet meer voor in Sportlink (niet verwijderd).</p>
          ) : null}
          {(report.warnings || []).map((w) => (
            <p key={w} className="text-amber-900">{w}</p>
          ))}
          {(report.errors || []).length ? (
            <ul className="list-disc pl-5 text-red-800" data-testid="sportlink-fouten">
              {report.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
