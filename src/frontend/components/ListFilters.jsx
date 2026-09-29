import { useState } from 'react';
import NlDateInput from './NlDateInput.jsx';

export default function ListFilters({
  person = '',
  from = '',
  to = '',
  onChange,
  personLabel = 'Persoon',
  hidePerson = false,
  children = null,
}) {
  const [open, setOpen] = useState(false);
  const set = (patch) => onChange({ person, from, to, ...patch });
  const active = Boolean((!hidePerson && person.trim()) || from || to);
  const personPlaceholder = personLabel === 'Persoon' ? 'Zoek persoon' : personLabel;

  const personField = hidePerson ? null : (
    <label className="block min-w-0 md:w-56 md:shrink-0">
      <span className="vvl-label md:sr-only">{personLabel}</span>
      <input
        className="vvl-input"
        value={person}
        onChange={(e) => set({ person: e.target.value })}
        placeholder={personPlaceholder}
        aria-label={personLabel}
      />
    </label>
  );
  const fromField = (
    <label className="block min-w-0 md:w-40 md:shrink-0">
      <span className="vvl-label md:sr-only">Van</span>
      <NlDateInput value={from} onChange={(next) => set({ from: next })} ariaLabel="Van" placeholder="Van dd-mm-jjjj" />
    </label>
  );
  const toField = (
    <label className="block min-w-0 md:w-40 md:shrink-0">
      <span className="vvl-label md:sr-only">Tot</span>
      <NlDateInput value={to} onChange={(next) => set({ to: next })} ariaLabel="Tot" placeholder="Tot dd-mm-jjjj" />
    </label>
  );

  return (
    <div>
      <div className="md:hidden">
        <button type="button" className="vvl-btn-outline w-full" onClick={() => setOpen((v) => !v)}>
          {open ? 'Filter sluiten' : `Filter${active ? ' · aan' : ''}`}
        </button>
        {open ? (
          <div className="mt-2 space-y-2 rounded-sm border border-vvl-border bg-white p-3">
            {personField}
            {fromField}
            {toField}
            {children}
          </div>
        ) : null}
      </div>
      <div className="hidden items-center gap-2 md:flex [&_.vvl-label]:sr-only">
        {personField}
        {fromField}
        {toField}
        {children}
      </div>
    </div>
  );
}
