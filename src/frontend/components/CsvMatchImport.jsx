import { useCallback, useRef, useState } from 'react';
import { api } from '../hooks/useApi.js';

const EMPTY_SAMPLE =
  'date;home;opponent;team\n2026-08-29;true;SV Capelle;JO11-1\n2026-08-29;true;VV Krimpen;JO15-1';

function blankInvalidRow(rowNum = 1) {
  return {
    __row: rowNum,
    date: '',
    home: 'true',
    opponent: '',
    team: '',
    note: '',
    errors: [],
    rowMsg: '',
    rowError: '',
    busy: false,
  };
}

export default function CsvMatchImport({ onImported }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState('');
  const [csvText, setCsvText] = useState('');
  const [showPaste, setShowPaste] = useState(false);
  const [validPreview, setValidPreview] = useState([]);
  const [validCount, setValidCount] = useState(0);
  const [invalidRows, setInvalidRows] = useState([]);
  const [headerError, setHeaderError] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const resetValidation = () => {
    setValidPreview([]);
    setValidCount(0);
    setInvalidRows([]);
    setHeaderError('');
    setMsg('');
    setError('');
  };

  const applyValidationResult = (res) => {
    setHeaderError(res.headerError || '');
    setValidCount(res.validCount ?? res.rowCount ?? 0);
    setValidPreview(res.preview || []);
    setInvalidRows(
      (res.invalidRows || []).map((r) => ({
        ...blankInvalidRow(r.__row),
        ...r,
        home: r.home === false || r.home === 'false' ? 'false' : String(r.home ?? 'true'),
        errors: r.errors || [],
      })),
    );
  };

  const validateText = async (text) => {
    setBusy(true);
    setError('');
    setMsg('');
    try {
      const res = await api.validateMatchCsv({ csv: text });
      applyValidationResult(res);
      if (res.headerError) {
        setError(res.headerError);
        return res;
      }
      const invalid = res.invalidCount ?? res.invalidRows?.length ?? 0;
      const valid = res.validCount ?? res.rowCount ?? 0;
      setMsg(
        invalid === 0 && valid > 0
          ? `${valid} rij(en) geldig — klaar om te importeren.`
          : `${valid} geldig · ${invalid} ongeldig. Alleen geldige rijen kunnen worden geïmporteerd; corrigeer de rest in het grid.`,
      );
      return res;
    } catch (err) {
      setError(err.message);
      resetValidation();
      return null;
    } finally {
      setBusy(false);
    }
  };

  const readFile = useCallback((file) => {
    if (!file) return;
    const name = file.name || 'bestand';
    const lower = name.toLowerCase();
    if (!lower.endsWith('.csv') && !lower.endsWith('.txt') && file.type && !/csv|text|plain/i.test(file.type)) {
      setError('Alleen .csv of .txt bestanden zijn toegestaan.');
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const text = String(reader.result || '');
      setFileName(name);
      setCsvText(text);
      resetValidation();
      await validateText(text);
    };
    reader.onerror = () => setError('Kon het bestand niet lezen.');
    reader.readAsText(file, 'UTF-8');
  }, []);

  const onDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) readFile(file);
  };

  const importValid = async () => {
    if (!csvText.trim()) {
      setError('Geen CSV geladen.');
      return;
    }
    setBusy(true);
    setError('');
    setMsg('');
    try {
      const res = await api.importMatches({ csv: csvText });
      const skipped = res.skipped ?? res.invalidRows?.length ?? 0;
      setMsg(
        `${res.created} wedstrijd(en) geïmporteerd` +
          (skipped ? ` · ${skipped} ongeldige rij(en) overgeslagen` : ''),
      );
      setValidPreview([]);
      setValidCount(0);
      setInvalidRows(
        (res.invalidRows || []).map((r) => ({
          ...blankInvalidRow(r.__row),
          ...r,
          home: r.home === false || r.home === 'false' ? 'false' : String(r.home ?? 'true'),
          errors: r.errors || [],
        })),
      );
      // Voorkom dubbele import van dezelfde geldige rijen
      setCsvText('');
      setFileName('');
      await onImported?.();
    } catch (err) {
      setError(err.message);
      if (err.details?.invalidRows) {
        applyValidationResult({
          headerError: err.details.error,
          validCount: 0,
          invalidRows: err.details.invalidRows,
          preview: [],
        });
      }
    } finally {
      setBusy(false);
    }
  };

  const updateInvalidField = (index, field, value) => {
    setInvalidRows((prev) =>
      prev.map((r, i) =>
        i === index
          ? { ...r, [field]: value, rowMsg: '', rowError: '', errors: [] }
          : r,
      ),
    );
  };

  const importOneRow = async (index) => {
    const row = invalidRows[index];
    if (!row) return;
    setInvalidRows((prev) =>
      prev.map((r, i) => (i === index ? { ...r, busy: true, rowMsg: '', rowError: '' } : r)),
    );
    try {
      const payload = {
        matches: [
          {
            __row: row.__row,
            date: row.date,
            home: row.home,
            opponent: row.opponent,
            team: row.team,
            note: row.note,
          },
        ],
      };
      // Eerst valideren
      const check = await api.validateMatchCsv(payload);
      if (!check.ok || (check.validCount ?? 0) < 1) {
        const errs = check.invalidRows?.[0]?.errors || check.errors || [];
        setInvalidRows((prev) =>
          prev.map((r, i) =>
            i === index
              ? {
                  ...r,
                  busy: false,
                  errors: errs,
                  rowError: errs.map((e) => e.message).join(' · ') || 'Rij is nog ongeldig',
                }
              : r,
          ),
        );
        return;
      }
      const res = await api.importMatches(payload);
      if (!res.created) {
        setInvalidRows((prev) =>
          prev.map((r, i) =>
            i === index
              ? { ...r, busy: false, rowError: 'Importeren mislukt' }
              : r,
          ),
        );
        return;
      }
      setInvalidRows((prev) => prev.filter((_, i) => i !== index));
      setMsg(`Rij ${row.__row} geïmporteerd.`);
      await onImported?.();
    } catch (err) {
      setInvalidRows((prev) =>
        prev.map((r, i) => (i === index ? { ...r, busy: false, rowError: err.message } : r)),
      );
    }
  };

  const removeInvalidRow = (index) => {
    setInvalidRows((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="vvl-card space-y-4">
      <h3 className="font-heading font-black uppercase">KNVB / CSV importeren</h3>
      <p className="text-sm text-gray-700">
        Kolommen: <code>date;home;opponent;team</code> (puntkomma of komma). Datum strikt als{' '}
        <code>YYYY-MM-DD</code>. Alleen geldige rijen worden opgeslagen — foute rijen verschijnen in
        het grid om te corrigeren.
      </p>

      <div
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragging(false);
        }}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-sm border-2 border-dashed px-4 py-8 text-center transition ${
          dragging
            ? 'border-vvl-primary bg-vvl-muted'
            : 'border-vvl-border bg-white hover:border-vvl-primary'
        }`}
      >
        <p className="font-heading text-sm font-black uppercase">Sleep CSV hierheen</p>
        <p className="mt-1 text-xs text-gray-600">of klik om een bestand te kiezen (.csv / .txt)</p>
        {fileName ? (
          <p className="mt-3 text-xs font-semibold text-vvl-primary">Geladen: {fileName}</p>
        ) : null}
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.txt,text/csv,text/plain"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) readFile(file);
            e.target.value = '';
          }}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="vvl-btn-outline text-xs"
          onClick={() => setShowPaste((v) => !v)}
        >
          {showPaste ? 'Plakveld verbergen' : 'Of plak CSV-tekst'}
        </button>
        <button
          type="button"
          className="vvl-btn-outline text-xs"
          onClick={() => {
            setCsvText(EMPTY_SAMPLE);
            setFileName('');
            resetValidation();
            setShowPaste(true);
          }}
        >
          Voorbeeld laden
        </button>
      </div>

      {showPaste ? (
        <div className="space-y-2">
          <textarea
            className="vvl-input min-h-[100px] font-mono text-xs"
            value={csvText}
            onChange={(e) => {
              setCsvText(e.target.value);
              resetValidation();
            }}
            placeholder={EMPTY_SAMPLE}
          />
          <button
            type="button"
            className="vvl-btn-outline text-xs"
            disabled={busy || !csvText.trim()}
            onClick={() => validateText(csvText)}
          >
            Controleren
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="vvl-btn-primary"
          disabled={busy || validCount < 1}
          onClick={importValid}
        >
          {busy ? 'Bezig…' : `Importeer ${validCount} geldige rij(en)`}
        </button>
      </div>

      {headerError ? (
        <p className="rounded-sm border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {headerError}
        </p>
      ) : null}
      {msg ? <p className="text-sm text-emerald-800">{msg}</p> : null}
      {error && !headerError ? <p className="text-sm text-red-700">{error}</p> : null}

      {validPreview.length > 0 ? (
        <div className="space-y-2">
          <h4 className="text-xs font-bold uppercase text-emerald-900">
            Voorbeeld geldige rijen ({validCount})
          </h4>
          <div className="overflow-x-auto rounded-sm border border-emerald-200">
            <table className="w-full min-w-[520px] text-xs">
              <thead className="bg-emerald-50 font-bold uppercase">
                <tr>
                  <th className="p-2 text-left">Datum</th>
                  <th className="p-2 text-left">Thuis</th>
                  <th className="p-2 text-left">Tegenstander</th>
                  <th className="p-2 text-left">Team</th>
                </tr>
              </thead>
              <tbody>
                {validPreview.map((r, i) => (
                  <tr key={`ok-${i}`} className="border-t border-emerald-100">
                    <td className="p-2">{r.date}</td>
                    <td className="p-2">{r.home ? 'ja' : 'nee'}</td>
                    <td className="p-2">{r.opponent || '—'}</td>
                    <td className="p-2">{r.team || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {invalidRows.length > 0 ? (
        <div className="space-y-2">
          <h4 className="text-xs font-bold uppercase text-red-900">
            Ongeldige rijen ({invalidRows.length}) — corrigeer en laad per stuk
          </h4>
          <div className="overflow-x-auto rounded-sm border border-red-200">
            <table className="w-full min-w-[720px] text-xs">
              <thead className="bg-red-50 font-bold uppercase">
                <tr>
                  <th className="p-2 text-left">Rij</th>
                  <th className="p-2 text-left">Datum</th>
                  <th className="p-2 text-left">Thuis</th>
                  <th className="p-2 text-left">Tegenstander</th>
                  <th className="p-2 text-left">Team</th>
                  <th className="p-2 text-left">Fout</th>
                  <th className="p-2 text-left">Actie</th>
                </tr>
              </thead>
              <tbody>
                {invalidRows.map((r, index) => (
                  <tr key={`bad-${r.__row}-${index}`} className="border-t border-red-100 align-top">
                    <td className="p-2 font-semibold">{r.__row}</td>
                    <td className="p-2">
                      <input
                        className="vvl-input py-1 text-xs"
                        value={r.date}
                        onChange={(e) => updateInvalidField(index, 'date', e.target.value)}
                        placeholder="YYYY-MM-DD"
                      />
                    </td>
                    <td className="p-2">
                      <select
                        className="vvl-input py-1 text-xs"
                        value={
                          ['false', '0', 'nee', 'uit'].includes(String(r.home).toLowerCase())
                            ? 'false'
                            : 'true'
                        }
                        onChange={(e) => updateInvalidField(index, 'home', e.target.value)}
                      >
                        <option value="true">Thuis</option>
                        <option value="false">Uit</option>
                      </select>
                    </td>
                    <td className="p-2">
                      <input
                        className="vvl-input py-1 text-xs"
                        value={r.opponent}
                        onChange={(e) => updateInvalidField(index, 'opponent', e.target.value)}
                      />
                    </td>
                    <td className="p-2">
                      <input
                        className="vvl-input py-1 text-xs"
                        value={r.team}
                        onChange={(e) => updateInvalidField(index, 'team', e.target.value)}
                      />
                    </td>
                    <td className="p-2 text-red-800">
                      {r.rowError ||
                        (r.errors || []).map((e) => e.message).join(' · ') ||
                        '—'}
                      {r.rowMsg ? (
                        <span className="block text-emerald-800">{r.rowMsg}</span>
                      ) : null}
                    </td>
                    <td className="p-2 whitespace-nowrap">
                      <button
                        type="button"
                        className="vvl-btn-primary text-[10px] px-2 py-1"
                        disabled={r.busy || busy}
                        onClick={() => importOneRow(index)}
                      >
                        {r.busy ? '…' : 'Laden'}
                      </button>{' '}
                      <button
                        type="button"
                        className="text-[10px] font-bold uppercase text-gray-600"
                        onClick={() => removeInvalidRow(index)}
                      >
                        Weg
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
