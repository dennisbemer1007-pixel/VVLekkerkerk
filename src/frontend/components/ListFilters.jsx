export default function ListFilters({ person = '', from = '', to = '', onChange, personLabel = 'Persoon' }) {
  const set = (patch) => onChange({ person, from, to, ...patch });
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      <label className="block min-w-0">
        <span className="vvl-label">{personLabel}</span>
        <input
          className="vvl-input"
          value={person}
          onChange={(e) => set({ person: e.target.value })}
          placeholder="Naam"
          aria-label={personLabel}
        />
      </label>
      <label className="block min-w-0">
        <span className="vvl-label">Van</span>
        <input
          type="date"
          className="vvl-input"
          value={from}
          onChange={(e) => set({ from: e.target.value })}
          aria-label="Van"
        />
      </label>
      <label className="block min-w-0">
        <span className="vvl-label">Tot</span>
        <input
          type="date"
          className="vvl-input"
          value={to}
          onChange={(e) => set({ to: e.target.value })}
          aria-label="Tot"
        />
      </label>
    </div>
  );
}
