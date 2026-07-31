const FILTERS = [
  { id: '', label: 'Komende diensten' },
  { id: 'today', label: 'Vandaag' },
  { id: 'week', label: 'Deze week' },
  { id: 'open', label: 'Open diensten' },
  { id: 'mine', label: 'Mijn diensten' },
];

export default function FilterChips({ value, onChange, showMine = true }) {
  const items = showMine ? FILTERS : FILTERS.filter((f) => f.id !== 'mine');

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((f) => (
        <button
          key={f.id || 'all'}
          type="button"
          onClick={() => onChange(f.id)}
          className={`rounded-full border-2 px-4 py-2 text-xs font-bold uppercase tracking-wide transition ${
            value === f.id
              ? 'border-vvl-primary bg-vvl-primary text-white'
              : 'border-vvl-primary bg-white text-vvl-primary hover:bg-vvl-primary hover:text-white'
          }`}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}
