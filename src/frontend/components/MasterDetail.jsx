/** Desktop: lijst links, detail rechts. Mobiel: óf de lijst, óf het detail. */
export default function MasterDetail({
  selected,
  onBack,
  list,
  detail,
  emptyDetail = 'Kies een regel.',
}) {
  return (
    <div className="md:grid md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] md:items-start md:gap-4">
      <div className={selected ? 'max-md:hidden' : ''}>{list}</div>
      <div className={selected ? '' : 'hidden md:block'}>
        {selected ? (
          detail
        ) : (
          <p className="vvl-card text-sm text-gray-600">{emptyDetail}</p>
        )}
        {selected ? (
          <button type="button" className="vvl-btn-outline mt-3 w-full md:hidden" onClick={onBack}>
            Terug
          </button>
        ) : null}
      </div>
    </div>
  );
}
