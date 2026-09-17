import { useEffect, useRef, useState } from 'react';
import { api } from '../hooks/useApi.js';
import { WEEKDAY_OPTIONS, CONDITION_OPTIONS, ACTIVITY_TYPE_OPTIONS } from './planningLabels.js';
import { scrollToForm } from '../utils/scrollToForm.js';

const emptyRule = {
  name: '',
  weekday: 6,
  startTime: '18:30',
  endTime: '22:00',
  type: 'BAR',
  required: 2,
  slot: '',
  conditionType: 'ALWAYS',
  conditionTeamId: '',
  conditionTeamName: '',
  conditionActivityType: '',
  kickoffAfter: '',
  teamDuty: false,
  teamDutySlotRole: '',
  active: true,
  sortOrder: 0,
};

export default function DienstregelsBeheer() {
  const formRef = useRef(null);
  const [rules, setRules] = useState([]);
  const [teams, setTeams] = useState([]);
  const [form, setForm] = useState(emptyRule);
  const [editId, setEditId] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () =>
    Promise.all([api.getServiceRules(), api.getTeams()])
      .then(([r, t]) => {
        setRules(r);
        setTeams(t);
      })
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  const reset = () => {
    setEditId(null);
    setForm(emptyRule);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setMsg('');
    try {
      const payload = {
        ...form,
        weekday: form.weekday === '' ? null : Number(form.weekday),
        required: Number(form.required),
        conditionTeamId: form.conditionTeamId || null,
        teamDuty: Boolean(form.teamDuty),
      };
      if (editId) await api.updateServiceRule(editId, payload);
      else await api.createServiceRule(payload);
      reset();
      setMsg('Dienstregel opgeslagen. Historische planning verandert hierdoor niet automatisch.');
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const apply = async () => {
    setBusy(true);
    setError('');
    setMsg('');
    try {
      const res = await api.applyServiceRules();
      setMsg(
        `Standaardregels toegepast op de planningsperiode: +${res.created} nieuw, ${res.updated} bijgewerkt, ${res.removed} verwijderd (alleen lege auto-diensten).`,
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-4">
      <div className="vvl-card space-y-2">
        <h2 className="font-heading text-lg font-black uppercase">Standaard dienstregels</h2>
        <p className="text-sm text-gray-700">
          Dit zijn de <strong>standaardregels van de club</strong>. Elke nieuwe planning (stap 1)
          gebruikt ze automatisch: doordeweekse bar, zaterdag ochtend/middag/avond met
          jeugd-teamdiensten, keuken, vrijdag-klaverjas en late keuken bij Lekkerkerk 1 thuis.
          Je hoeft ze niet opnieuw in te voeren. Alleen aanpassen als de club de tijden of
          aantallen wijzigt.
        </p>
        <button type="button" className="vvl-btn-primary w-fit" disabled={busy} onClick={apply}>
          {busy ? 'Bezig…' : 'Standaardregels opnieuw toepassen op de planningsperiode'}
        </button>
      </div>

      <form
        ref={formRef}
        onSubmit={submit}
        className="vvl-card grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        <h3 className="sm:col-span-2 lg:col-span-3 font-heading font-black uppercase">
          {editId ? 'Regel bewerken' : 'Nieuwe regel'}
        </h3>
        <div className="sm:col-span-2">
          <label className="vvl-label">Naam</label>
          <input
            className="vvl-input"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </div>
        <div>
          <label className="vvl-label">Dag</label>
          <select
            className="vvl-input"
            value={form.weekday}
            onChange={(e) => setForm({ ...form, weekday: e.target.value })}
          >
            <option value="">Elke dag</option>
            {WEEKDAY_OPTIONS.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="vvl-label">Start</label>
          <input
            className="vvl-input"
            value={form.startTime}
            onChange={(e) => setForm({ ...form, startTime: e.target.value })}
            placeholder="18:30"
            required
          />
        </div>
        <div>
          <label className="vvl-label">Einde</label>
          <input
            className="vvl-input"
            value={form.endTime}
            onChange={(e) => setForm({ ...form, endTime: e.target.value })}
            placeholder="00:00"
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
            <option value="BAR">Bar</option>
            <option value="KITCHEN">Keuken</option>
          </select>
        </div>
        <div>
          <label className="vvl-label">Personen nodig</label>
          <input
            type="number"
            min={1}
            className="vvl-input"
            value={form.required}
            onChange={(e) => setForm({ ...form, required: e.target.value })}
          />
        </div>
        <div>
          <label className="vvl-label">Voorwaarde</label>
          <select
            className="vvl-input"
            value={form.conditionType}
            onChange={(e) => setForm({ ...form, conditionType: e.target.value })}
          >
            {CONDITION_OPTIONS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        {form.conditionType === 'HOME_MATCH_TEAM' ? (
          <div>
            <label className="vvl-label">Team (thuis)</label>
            <select
              className="vvl-input"
              value={form.conditionTeamId}
              onChange={(e) => setForm({ ...form, conditionTeamId: e.target.value })}
            >
              <option value="">— kies team —</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {form.conditionType === 'ACTIVITY' ? (
          <div>
            <label className="vvl-label">Type activiteit</label>
            <select
              className="vvl-input"
              value={form.conditionActivityType}
              onChange={(e) => setForm({ ...form, conditionActivityType: e.target.value })}
            >
              <option value="">Elke activiteit</option>
              {ACTIVITY_TYPE_OPTIONS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div>
          <label className="vvl-label">Aftrap vanaf (optioneel)</label>
          <input
            className="vvl-input"
            value={form.kickoffAfter}
            onChange={(e) => setForm({ ...form, kickoffAfter: e.target.value })}
            placeholder="15:00"
          />
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            checked={form.teamDuty}
            onChange={(e) => setForm({ ...form, teamDuty: e.target.checked })}
          />
          Kan teamdienst worden
        </label>
        {form.teamDuty ? (
          <div>
            <label className="vvl-label">Teamdienst-shift</label>
            <select
              className="vvl-input"
              value={form.teamDutySlotRole}
              onChange={(e) => setForm({ ...form, teamDutySlotRole: e.target.value })}
            >
              <option value="">—</option>
              <option value="MORNING">Ochtend</option>
              <option value="SECOND">Tweede shift</option>
              <option value="LAST">Laatste shift</option>
            </select>
          </div>
        ) : null}
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => setForm({ ...form, active: e.target.checked })}
          />
          Regel actief
        </label>
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

      <div className="overflow-x-auto vvl-card p-0">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-vvl-secondary text-xs font-bold uppercase">
            <tr>
              <th className="p-3 text-left">Regel</th>
              <th className="p-3 text-left">Wanneer</th>
              <th className="p-3 text-left">Voorwaarde</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id} className="border-t border-vvl-border">
                <td className="p-3">
                  <strong>{r.name}</strong>
                  <div className="text-xs text-gray-600">
                    {r.type === 'KITCHEN' ? 'Keuken' : 'Bar'} · {r.required} pers.
                    {r.active ? '' : ' · uit'}
                  </div>
                </td>
                <td className="p-3">
                  {WEEKDAY_OPTIONS.find((d) => d.id === r.weekday)?.label || 'Elke dag'}{' '}
                  {r.startTime}–{r.endTime}
                </td>
                <td className="p-3">
                  {CONDITION_OPTIONS.find((c) => c.id === r.conditionType)?.label || r.conditionType}
                  {r.conditionTeam?.name ? ` · ${r.conditionTeam.name}` : ''}
                  {r.conditionActivityType ? ` · ${r.conditionActivityType}` : ''}
                </td>
                <td className="p-3 text-right">
                  <button
                    type="button"
                    className="vvl-btn-outline text-xs"
                    onClick={() => {
                      setEditId(r.id);
                      setForm({
                        ...emptyRule,
                        ...r,
                        weekday: r.weekday ?? '',
                        conditionTeamId: r.conditionTeamId ? String(r.conditionTeamId) : '',
                        conditionTeamName: r.conditionTeamName || '',
                        conditionActivityType: r.conditionActivityType || '',
                        kickoffAfter: r.kickoffAfter || '',
                        teamDutySlotRole: r.teamDutySlotRole || '',
                        slot: r.slot || '',
                      });
                      scrollToForm(formRef);
                    }}
                  >
                    Bewerk
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
