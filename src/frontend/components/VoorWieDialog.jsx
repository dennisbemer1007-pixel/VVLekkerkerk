export default function VoorWieDialog({ open, choices, onChoose, onClose }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="voor-wie-title">
      <div className="w-full max-w-sm space-y-3 rounded-sm bg-white p-4 shadow-lg">
        <h2 id="voor-wie-title" className="font-heading text-lg font-black uppercase">
          Voor wie schrijf je in?
        </h2>
        <ul className="space-y-2">
          {(choices || []).map((choice) => (
            <li key={choice.id}>
              <button
                type="button"
                className="vvl-btn-primary w-full"
                onClick={() => onChoose(choice)}
              >
                {choice.label}
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className="vvl-btn-outline w-full" onClick={onClose}>
          Annuleren
        </button>
      </div>
    </div>
  );
}
