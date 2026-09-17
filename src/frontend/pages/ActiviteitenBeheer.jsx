import { useEffect, useRef, useState } from 'react';
import { api } from '../hooks/useApi.js';
import { todayInputValue, toDateInputValue } from '../utils/formatDate.js';
import { scrollToForm } from '../utils/scrollToForm.js';
import { ACTIVITY_TYPE_OPTIONS } from './planningLabels.js';

const empty = {
  name: '',
  date: todayInputValue(),
  startTime: '20:00',
  endTime: '00:00',
  type: 'klaverjas',
  location: '',
  locked: false,
  note: '',
};

export default function ActiviteitenBeheer() {
  const formRef = useRef(null);
  const [items, setItems] = useState([]);
  const [persons, setPersons] = useState([]);
  const [form, setForm] = useState(empty);
  const [personIds, setPersonIds] = useState([]);
  const [pickPerson, setPickPerson] = useState('');
  const [editId, setEditId] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const load = () =>
    Promise.all([api.getActivities(), api.getPersons(true)])
      .then(([list, people]) => {
        setItems(list);
        setPersons((people || []).filter((p) => p.active !== false));
      })
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  const reset = () => {
    setEditId(null);
    setForm(empty);
    setPersonIds([]);
    setPickPerson('');
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setMsg('');
    try {
      const payload = { ...form, personIds };
      if (editId) await api.updateActivity(editId, payload);
      else await api.createActivity(payload);
      reset();
      setMsg(
        'Activiteit opgeslagen. Passende diensten worden aangemaakt en vooraf ingeplande namen blijven staan.',
      );
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const addPicked = () => {
    const id = Number(pickPerson);
    if (!id || personIds.includes(id)) return;
    setPersonIds([...personIds, id]);
    setPickPerson('');
  };

  const personName = (id) => persons.find((p) => p.id === id)?.name || `#${id}`;

  return (
    <section className="space-y-4">
      <form
        ref={formRef}
        onSubmit={submit}
        className="vvl-card grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        <h2 className="sm:col-span-2 lg:col-span-3 font-heading text-lg font-black uppercase">
          {editId ? 'Activiteit bewerken' : 'Jaarplanning: activiteit'}
        </h2>
        <p className="sm:col-span-2 lg:col-span-3 text-sm text-gray-700">
          Klaverjasavonden, toernooien en andere clubactiviteiten. Valt een activiteit in de
          gekozen planningsperiode, dan maken de standaard dienstregels automatisch een dienst aan.
          Namen die je hier vooraf inplant, blijven staan bij het bijwerken van de planning.
        </p>
        <div>
          <label className="vvl-label">Naam</label>
          <input
            className="vvl-input"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </div>
        <div>
          <label className="vvl-label">Datum</label>
          <input
            type="date"
            className="vvl-input"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            required
          />
        </div>
        <div>
          <label className="vvl-label">Type</label>
          <select
            className="vvl-input"
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
          >
            {ACTIVITY_TYPE_OPTIONS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="vvl-label">Begin</label>
          <input
            className="vvl-input"
            value={form.startTime}
            onChange={(e) => setForm({ ...form, startTime: e.target.value })}
            required
          />
        </div>
        <div>
          <label className="vvl-label">Einde</label>
          <input
            className="vvl-input"
            value={form.endTime}
            onChange={(e) => setForm({ ...form, endTime: e.target.value })}
            required
          />
        </div>
        <div>
          <label className="vvl-label">Locatie</label>
          <input
            className="vvl-input"
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
          />
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold sm:col-span-2">
          <input
            type="checkbox"
            checked={form.locked}
            onChange={(e) => setForm({ ...form, locked: e.target.checked })}
          />
          Vastzetten (automatische planning mag dit niet overschrijven)
        </label>
        <div className="sm:col-span-2 lg:col-span-3 space-y-2">
          <p className="vvl-label">Vooraf inplannen (namen blijven staan)</p>
          <div className="flex flex-wrap items-end gap-2">
            <select
              className="vvl-input max-w-md"
              value={pickPerson}
              onChange={(e) => setPickPerson(e.target.value)}
            >
              <option value="">— Kies een persoon —</option>
              {persons
                .filter((p) => !personIds.includes(p.id))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
            <button type="button" className="vvl-btn-outline text-xs" onClick={addPicked}>
              Naam toevoegen
            </button>
          </div>
          {personIds.length ? (
            <ul className="flex flex-wrap gap-2">
              {personIds.map((id) => (
                <li
                  key={id}
                  className="flex items-center gap-2 rounded-full border border-vvl-border px-3 py-1 text-xs font-semibold"
                >
                  {personName(id)}
                  <button
                    type="button"
                    className="text-red-700"
                    onClick={() => setPersonIds(personIds.filter((x) => x !== id))}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-gray-600">Nog niemand vooraf ingepland.</p>
          )}
        </div>
        <div className="flex gap-2 sm:col-span-2 lg:col-span-3">
          <button type="submit" className="vvl-btn-primary">
            {editId ? 'Opslaan' : 'Toevoegen'}
          </button>
          {editId ? (
            <button type="button" className="vvl-btn-outline" onClick={reset}>
              Annuleren
            </button>
          ) : null}
        </div>
      </form>

      {msg ? <p className="text-sm text-emerald-800">{msg}</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <ul className="space-y-2">
        {items.map((a) => {
          const names = [
            ...new Set(
              (a.services || []).flatMap((s) =>
                (s.enrollments || []).map((e) => e.person?.name).filter(Boolean),
              ),
            ),
          ];
          return (
            <li key={a.id} className="vvl-card flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold">
                  {a.name} · {ACTIVITY_TYPE_OPTIONS.find((x) => x.id === a.type)?.label || a.type}
                </p>
                <p className="text-sm text-gray-600">
                  {new Date(a.date).toLocaleDateString('nl-NL')} {a.startTime}–{a.endTime}
                  {a.locked ? ' · vastgezet' : ''}
                </p>
                {names.length ? (
                  <p className="text-xs text-gray-700">Ingepland: {names.join(', ')}</p>
                ) : null}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="vvl-btn-outline text-xs"
                  onClick={() => {
                    setEditId(a.id);
                    setForm({
                      name: a.name,
                      date: toDateInputValue(a.date),
                      startTime: a.startTime,
                      endTime: a.endTime,
                      type: a.type,
                      location: a.location || '',
                      locked: Boolean(a.locked),
                      note: a.note || '',
                    });
                    const enrolled = [
                      ...new Set(
                        (a.services || []).flatMap((s) =>
                          (s.enrollments || []).map((e) => e.personId).filter(Boolean),
                        ),
                      ),
                    ];
                    setPersonIds(enrolled);
                    scrollToForm(formRef);
                  }}
                >
                  Bewerk
                </button>
                <button
                  type="button"
                  className="text-xs font-bold uppercase text-red-700"
                  onClick={async () => {
                    await api.deleteActivity(a.id);
                    await load();
                  }}
                >
                  Verwijder
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
