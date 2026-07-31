import { useCallback, useEffect, useState } from 'react';
import DienstCard from '../components/DienstCard.jsx';
import FilterChips from '../components/FilterChips.jsx';
import { PageTitle } from '../components/PageHelp.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../hooks/useApi.js';
import { PAGE_HELP } from '../utils/pageHelp.js';

export default function Planning() {
  const { personId } = useAuth();
  const [filter, setFilter] = useState('');
  const [services, setServices] = useState([]);
  const [period, setPeriod] = useState(null);
  const [error, setError] = useState('');
  const [pdfBusy, setPdfBusy] = useState(false);

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

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <PageTitle {...PAGE_HELP.planning}>Planning</PageTitle>
          <p className="mt-1 text-sm text-gray-700">
            Overzicht voor de komende 6 weken. Print de PDF voor in de kantine.
          </p>
          {period ? (
            <p className="mt-1 text-xs text-gray-600">
              Periode: {period.from} t/m {period.to}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          className="vvl-btn-primary text-center"
          disabled={pdfBusy}
          onClick={downloadPdf}
        >
          {pdfBusy ? 'PDF laden…' : 'PDF-rooster (A4)'}
        </button>
      </header>

      <FilterChips value={filter} onChange={setFilter} showMine />

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
