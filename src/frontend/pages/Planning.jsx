import { useCallback, useEffect, useState } from 'react';
import DienstCard from '../components/DienstCard.jsx';
import FilterChips from '../components/FilterChips.jsx';
import { PageTitle } from '../components/PageHelp.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../hooks/useApi.js';
import { PAGE_HELP } from '../utils/pageHelp.js';

export default function Planning() {
  const { personId, can } = useAuth();
  const [filter, setFilter] = useState('');
  const [services, setServices] = useState([]);
  const [period, setPeriod] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [pdfBusy, setPdfBusy] = useState(false);
  const [updateBusy, setUpdateBusy] = useState(false);

  const load = useCallback(() => {
    const params = {};
    if (filter) params.filter = filter;
    if (filter === 'mine' && personId) params.personId = personId;
    return api
      .getPlanning(params)
      .then((data) => {
        setServices(data.services ?? []);
        setPeriod(data.period ?? null);
      })
      .catch((e) => setError(e.message));
  }, [filter, personId]);

  useEffect(() => {
    load();
  }, [load]);

  const downloadPdf = async () => {
    setPdfBusy(true);
    setError('');
    try {
      const params = period ? { from: period.from, to: period.to } : {};
      const blob = await api.downloadPlanningPdf(params);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'vvl-rooster-6-weken.pdf';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e.message);
    } finally {
      setPdfBusy(false);
    }
  };

  const updateFromMatches = async () => {
    setUpdateBusy(true);
    setError('');
    setMsg('');
    try {
      const res = await api.syncPlanningFromMatches({ required: 2 });
      const parts = [];
      if (res.created) parts.push(`${res.created} bardienst(en) toegevoegd`);
      if (res.removed) {
        parts.push(
          `${res.removed} dienst(en) verwijderd die niet bij een thuiswedstrijd hoorden`,
        );
      }
      setMsg(
        parts.length
          ? `Planning bijgewerkt: ${parts.join(', ')}.`
          : 'Planning is al actueel — alleen bardiensten bij thuiswedstrijden blijven staan.',
      );
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setUpdateBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <PageTitle {...PAGE_HELP.planning}>Planning</PageTitle>
          <p className="mt-1 text-sm text-gray-700">
            Overzicht voor de komende 6 weken. Alleen bardiensten bij thuiswedstrijden
            (3 uur vanaf de aftrap, 2 personen).
          </p>
          {period ? (
            <p className="mt-1 text-xs text-gray-600">
              Periode: {period.from} t/m {period.to}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {can('beheer') ? (
            <button
              type="button"
              className="vvl-btn-outline text-center"
              disabled={updateBusy}
              onClick={updateFromMatches}
            >
              {updateBusy ? 'Bijwerken…' : 'Update'}
            </button>
          ) : null}
          <button
            type="button"
            className="vvl-btn-primary text-center"
            disabled={pdfBusy}
            onClick={downloadPdf}
          >
            {pdfBusy ? 'PDF laden…' : 'PDF-rooster (A4)'}
          </button>
        </div>
      </header>

      <FilterChips value={filter} onChange={setFilter} showMine />

      {msg ? (
        <p className="rounded-sm border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
          {msg}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-sm border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>
      ) : null}

      {services.length === 0 ? (
        <p className="vvl-card text-sm text-gray-600">Geen diensten in deze periode.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {services.map((s) => (
            <DienstCard key={s.id} dienst={s} myPersonId={personId} />
          ))}
        </div>
      )}
    </div>
  );
}
