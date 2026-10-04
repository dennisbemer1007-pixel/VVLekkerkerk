import { useState } from 'react';
import { api } from '../hooks/useApi.js';

export default function DownloadPlanningButtons({ period = null }) {
  const [pdfBusy, setPdfBusy] = useState(false);
  const [excelBusy, setExcelBusy] = useState(false);
  const [error, setError] = useState('');

  const downloadPdf = async () => {
    setPdfBusy(true);
    setError('');
    try {
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

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="vvl-btn-outline min-h-[44px] text-center"
          disabled={excelBusy}
          onClick={downloadExcel}
          data-testid="download-excel"
        >
          {excelBusy ? 'Excel laden…' : 'Excel-lijst'}
        </button>
        <button
          type="button"
          className="vvl-btn-primary min-h-[44px] text-center"
          disabled={pdfBusy}
          onClick={downloadPdf}
          data-testid="download-pdf"
        >
          {pdfBusy ? 'PDF laden…' : 'PDF rooster'}
        </button>
      </div>
      {error ? <p className="text-sm text-red-800">{error}</p> : null}
    </div>
  );
}
