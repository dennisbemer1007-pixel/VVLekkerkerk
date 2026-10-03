import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import BeheerNavButtons from '../components/BeheerNavButtons.jsx';
import { levelLabel, categoryNeeded } from '../scheids/categories.js';
import { formatSlotDate } from '../scheids/example.js';
import { claimConflict } from '../scheids/planReferees.js';
import {
  assignScheids,
  categoriesForSettings,
  replanScheids,
  setCategoryNeeded,
  useScheidsBoard,
  useScheidsEnabled,
  useScheidsState,
} from '../scheids/store.js';

function peopleForSlot(slot, board) {
  return board.people.filter((person) => {
    if (slot.person?.email === person.email) return true;
    if (!person.levels?.length) return false;
    if (claimConflict(person, slot, board.blocks)) return false;
    const busy = board.slots.some(
      (other) => other.id !== slot.id && other.date === slot.date && other.person?.email === person.email,
    );
    return !busy;
  });
}

function RefereeSelect({ slot, board }) {
  const options = peopleForSlot(slot, board);
  return (
    <select
      className="vvl-input"
      aria-label={`Scheidsrechter ${slot.team}`}
      value={slot.person?.email || ''}
      onChange={(event) => assignScheids(slot.id, event.target.value)}
    >
      <option value="">Open</option>
      {options.map((person) => (
        <option key={person.email} value={person.email}>
          {person.name}
        </option>
      ))}
    </select>
  );
}

export default function Scheidsrechters() {
  const enabled = useScheidsEnabled();
  const board = useScheidsBoard();
  const scheids = useScheidsState();
  const [date, setDate] = useState('');
  const [level, setLevel] = useState('');
  const [onlyOpen, setOnlyOpen] = useState(false);
  const categories = useMemo(() => categoriesForSettings(), []);
  const dates = useMemo(() => [...new Set(board.slots.map((slot) => slot.date))], [board.slots]);
  if (!enabled) return <Navigate to="/meer" replace />;

  const filtered = board.slots.filter((slot) => {
    if (date && slot.date !== date) return false;
    if (level && slot.level !== level) return false;
    if (onlyOpen && !slot.open) return false;
    return true;
  });

  return (
    <div className="space-y-4" data-testid="scheids-overzicht">
      <BeheerNavButtons />
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="font-heading text-xl font-black uppercase">Scheidsrechters</h1>
        <span className="rounded-full bg-vvl-secondary px-2 py-1 text-[10px] font-bold uppercase tracking-wide">
          Voorbeeld
        </span>
        <button type="button" className="vvl-btn-outline ml-auto" onClick={() => replanScheids()}>
          Opnieuw plannen
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <label>
          <span className="vvl-label">Datum</span>
          <select className="vvl-input" value={date} onChange={(event) => setDate(event.target.value)} aria-label="Datum">
            <option value="">Alle</option>
            {dates.map((value) => (
              <option key={value} value={value}>
                {formatSlotDate(value)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="vvl-label">Niveau</span>
          <select className="vvl-input" value={level} onChange={(event) => setLevel(event.target.value)} aria-label="Niveau">
            <option value="">Alle</option>
            <option value="pupillen">Pupillen</option>
            <option value="junioren">Junioren</option>
            <option value="senioren">Senioren</option>
          </select>
        </label>
        <label className="flex min-h-11 items-end gap-2 pb-2 text-sm font-semibold">
          <input
            type="checkbox"
            className="h-5 w-5"
            checked={onlyOpen}
            onChange={(event) => setOnlyOpen(event.target.checked)}
          />
          Alleen open
        </label>
      </div>

      <div className="space-y-2">
        <p className="vvl-label">Nodig</p>
        <div className="flex flex-wrap gap-2">
          {categories.map((category) => {
            const on = categoryNeeded(category.key, scheids.categoryOn);
            return (
              <button
                key={category.key}
                type="button"
                aria-pressed={on}
                className={`min-h-11 rounded-full border-2 px-3 text-xs font-bold uppercase ${
                  on ? 'border-vvl-primary bg-vvl-primary text-white' : 'border-vvl-border bg-white text-gray-500'
                }`}
                onClick={() => setCategoryNeeded(category.key, !on)}
              >
                {category.key}
              </button>
            );
          })}
        </div>
      </div>

      <ul className="space-y-2 md:hidden">
        {filtered.map((slot) => (
          <li key={slot.id} className="vvl-card space-y-2 text-sm" data-testid={`scheids-kaart-${slot.id}`}>
            <p className="font-semibold">
              {formatSlotDate(slot.date)} · {slot.time}
            </p>
            <p>
              {slot.team} – {slot.opponent}
            </p>
            <p className="text-gray-700">
              {slot.field} · {levelLabel(slot.level)}
            </p>
            <RefereeSelect slot={slot} board={board} />
          </li>
        ))}
      </ul>

      <div className="vvl-card hidden p-0 md:block">
        <table className="w-full text-sm">
          <thead className="bg-vvl-secondary text-xs font-bold uppercase">
            <tr>
              <th className="p-3 text-left">Datum</th>
              <th className="p-3 text-left">Tijd</th>
              <th className="p-3 text-left">Wedstrijd</th>
              <th className="p-3 text-left">Veld</th>
              <th className="p-3 text-left">Niveau</th>
              <th className="p-3 text-left">Scheidsrechter</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td className="p-4 text-gray-600" colSpan={6}>
                  Geen wedstrijden.
                </td>
              </tr>
            ) : (
              filtered.map((slot) => (
                <tr key={slot.id} className="border-t border-vvl-border" data-testid={`scheids-rij-${slot.id}`}>
                  <td className="p-3 whitespace-nowrap">{formatSlotDate(slot.date)}</td>
                  <td className="p-3 whitespace-nowrap">{slot.time}</td>
                  <td className="p-3 font-semibold">
                    {slot.team} – {slot.opponent}
                  </td>
                  <td className="p-3">{slot.field}</td>
                  <td className="p-3">{levelLabel(slot.level)}</td>
                  <td className="p-3">
                    <RefereeSelect slot={slot} board={board} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
