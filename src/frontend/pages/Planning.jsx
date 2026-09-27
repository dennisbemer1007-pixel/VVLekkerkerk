import { useCallback, useEffect, useState } from 'react';
import DienstCard from '../components/DienstCard.jsx';
import FilterChips from '../components/FilterChips.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../hooks/useApi.js';

export default function Planning() {
  const { personId, can, user } = useAuth();
  const [filter, setFilter] = useState('');
  const [services, setServices] = useState([]);
  const [period, setPeriod] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [round, setRound] = useState(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [excelBusy, setExcelBusy] = useState(false);
  const [updateBusy, setUpdateBusy] = useState(false);
  const isCommittee = can('beheer');

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
    api.getPlanningRound().then(setRound).catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const downloadPdf = async () => {
    setPdfBusy(true);
    setError('');
    try {
      // Komende 6 weken, actieve diensten — gelijk aan het planningsbeeld
      const from = new Date();
      from.setHours(0, 0, 0, 0);
      const to = new Date(from);
      to.setDate(to.getDate() + 6 * 7 - 1);
      to.setHours(23, 59, 59, 999);
      const blob = await api.downloadPlanningPdf({
        from: from.toISOString().slice(0, 10),
        to: to.toISOString().slice(0, 10),
        weeks: 6,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'vvl-rooster.pdf';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e.message);
    } finally {
      setPdfBusy(false);
    }
  };

  const downloadExcel = async () => {
    setExcelBusy(true);
    setError('');
    try {
      const params = period ? { from: period.from, to: period.to } : {};
      const blob = await api.downloadPlanningExcel(params);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'vvl-planning.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e.message);
    } finally {
      setExcelBusy(false);
    }
  };

  const updateFromMatches = async () => {
    setUpdateBusy(true);
    setError('');
    setMsg('');
    try {
      const res = await api.syncPlanningFromMatches();
      const parts = [];
      if (res.created) parts.push(`${res.created} dienst(en) toegevoegd`);
      if (res.updated) parts.push(`${res.updated} bijgewerkt`);
      if (res.removed) parts.push(`${res.removed} lege auto-dienst(en) verwijderd`);
      setMsg(
        parts.length
          ? `Planning bijgewerkt: ${parts.join(', ')}.`
          : 'Planning is al actueel volgens de dienstregels.',
      );
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setUpdateBusy(false);
    }
  };

  const handleInschrijven = async (serviceId, mode) => {
    if (mode === 'expand') return;
    setError('');
    setMsg('');
    try {
      await api.createEnrollment({
        serviceId,
        personId,
        ignoreMatchBlock: isCommittee,
      });
      setMsg(`${user?.name || 'Je'} staat ingeschreven.`);
      await load();
    } catch (e) {
      if (e.code === 'MATCH_BLOCK' && isCommittee) {
        if (window.confirm(`${e.message} Toch inschrijven?`)) {
          try {
            await api.createEnrollment({
              serviceId,
              personId,
              ignoreMatchBlock: true,
            });
            setMsg(`${user?.name || 'Je'} staat ingeschreven.`);
            await load();
            return;
          } catch (err) {
            setError(err.message);
            return;
          }
        }
      }
      setError(e.message);
    }
  };

  const handleUitschrijven = async (enrollmentId) => {
    setError('');
    setMsg('');
    try {
      await api.deleteEnrollment(enrollmentId);
      setMsg('Uitschrijving opgeslagen.');
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          {period ? (
            <p className="text-sm font-semibold text-gray-800">
              {period.from} t/m {period.to}
              {round?.official ? ' · officieel' : ''}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {isCommittee ? (
            <button
              type="button"
              className="vvl-btn-outline min-h-[44px] text-center"
              disabled={updateBusy}
              onClick={updateFromMatches}
            >
              {updateBusy ? 'Bijwerken…' : 'Diensten bijwerken'}
            </button>
          ) : null}
          <button
            type="button"
            className="vvl-btn-outline min-h-[44px] text-center"
            disabled={excelBusy}
            onClick={downloadExcel}
          >
            {excelBusy ? 'Excel laden…' : 'Excel'}
          </button>
          <button
            type="button"
            className="vvl-btn-primary min-h-[44px] text-center"
            disabled={pdfBusy}
            onClick={downloadPdf}
          >
            {pdfBusy ? 'PDF laden…' : 'PDF rooster'}
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
        <div className="grid grid-cols-1 gap-4">
          {services.map((s) => (
            <DienstCard
              key={s.id}
              dienst={s}
              myPersonId={personId}
              showActions={isCommittee}
              committeeOverride={isCommittee}
              onInschrijven={isCommittee ? handleInschrijven : undefined}
              onUitschrijven={isCommittee ? handleUitschrijven : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
