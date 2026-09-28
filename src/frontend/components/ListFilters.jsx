import { useState } from 'react';

export default function ListFilters({
  person = '',
  from = '',
  to = '',
  onChange,
  personLabel = 'Persoon',
  children = null,
}) {
  const [open, setOpen] = useState(false);
  const set = (patch) => onChange({ person, from, to, ...patch });
  const active = Boolean(person.trim() || from || to);

  const fields = (
    <>
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
      {children}
    </>
  );

  return (
    <div>
      <div className="md:hidden">
        <button type="button" className="vvl-btn-outline w-full" onClick={() => setOpen((v) => !v)}>
          {open ? 'Filter sluiten' : `Filter${active ? ' · aan' : ''}`}
        </button>
        {open ? <div className="mt-2 space-y-2 rounded-sm border border-vvl-border bg-white p-3">{fields}</div> : null}
      </div>
      <div className="hidden gap-2 md:grid md:grid-cols-3">{fields}</div>
    </div>
  );
}
