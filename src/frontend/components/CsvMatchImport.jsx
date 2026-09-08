import { useCallback, useRef, useState } from 'react';
import { api } from '../hooks/useApi.js';

const EMPTY_SAMPLE =
  'Datum;Tijd;Thuis;Uit;Wedstrijdnr.;Type;Spelniveau;Opmerkingen\n2026-09-12;08:30;Lekkerkerk O11-1;SV Capelle O11-1;40584;Reguliere competitie;B-categorie;\n2026-09-12;11:15;Olympia O15-1;Lekkerkerk O15-1;40477;Reguliere competitie;A-categorie;';

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const bytes = new Uint8Array(reader.result);
      let binary = '';
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      resolve(btoa(binary));
    };
    reader.onerror = () => reject(new Error('Kon het bestand niet lezen.'));
    reader.readAsArrayBuffer(file);
  });
}

function blankInvalidRow(rowNum = 1) {
  return {
    __row: rowNum,
    format: 'knvb',
    date: '',
    time: '',
    home: 'true',
    opponent: '',
    team: '',
    note: '',
    matchNumber: '',
    matchType: '',
    playLevel: '',
    homeTeam: '',
    awayTeam: '',
    errors: [],
    rowMsg: '',
    rowError: '',
    busy: false,
  };
}

function mapInvalidRows(rows) {
  return (rows || []).map((r) => ({
    ...blankInvalidRow(r.__row),
    ...r,
    home: r.home === false || r.home === 'false' ? 'false' : String(r.home ?? 'true'),
    errors: r.errors || [],
  }));
}

export default function CsvMatchImport({ onImported }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState('');
  const [payload, setPayload] = useState(null);
  const [csvText, setCsvText] = useState('');
  const [showPaste, setShowPaste] = useState(false);
  const [format, setFormat] = useState('knvb');
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
    setFormat(res.format || 'knvb');
    setInvalidRows(mapInvalidRows(res.invalidRows));
  };

  const validatePayload = async (nextPayload) => {
    setBusy(true);
    setError('');
    setMsg('');
    try {
      const res = await api.validateMatchCsv(nextPayload);
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

  const readFile = useCallback(async (file) => {
    if (!file) return;
    const name = file.name || 'bestand';
    const lower = name.toLowerCase();
    const isXlsx = lower.endsWith('.xlsx');
    const isCsv = lower.endsWith('.csv') || lower.endsWith('.txt');
    if (!isXlsx && !isCsv && file.type && !/csv|text|plain|sheet|excel/i.test(file.type)) {
      setError('Alleen .xlsx, .csv of .txt bestanden zijn toegestaan.');
      return;
    }
    try {
      resetValidation();
      setFileName(name);
      if (isXlsx || /sheet|excel/i.test(file.type || '')) {
        const xlsxBase64 = await fileToBase64(file);
        const next = { xlsxBase64 };
        setPayload(next);
        setCsvText('');
        await validatePayload(next);
        return;
      }
      const text = await file.text();
      const next = { csv: text };
      setPayload(next);
      setCsvText(text);
      await validatePayload(next);
    } catch (err) {
      setError(err.message || 'Kon het bestand niet lezen.');
    }
  }, []);

  const onDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) readFile(file);
  };

  const importValid = async () => {
    if (!payload) {
      setError('Geen bestand of CSV geladen.');
      return;
    }
    setBusy(true);
    setError('');
    setMsg('');
    try {
      const res = await api.importMatches(payload);
      const skipped = res.skipped ?? res.invalidRows?.length ?? 0;
      const dupes = res.skippedDuplicates ?? 0;
      setMsg(
        `${res.created} wedstrijd(en) geïmporteerd` +
          (dupes ? ` · ${dupes} bestonden al (overgeslagen)` : '') +
          (skipped ? ` · ${skipped} ongeldige rij(en) overgeslagen` : '') +
          (res.planningCreated
            ? ` · ${res.planningCreated} bardienst(en) ingepland`
            : ''),
      );
      setValidPreview([]);
      setValidCount(0);
      setInvalidRows(mapInvalidRows(res.invalidRows));
      setPayload(null);
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
          format: err.details.format,
        });
      }
    } finally {
      setBusy(false);
    }
  };

  const updateInvalidField = (index, field, value) => {
    setInvalidRows((prev) =>
      prev.map((r, i) =>
        i === index ? { ...r, [field]: value, rowMsg: '', rowError: '', errors: [] } : r,
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
      const knvb = (row.format || format) === 'knvb' || row.homeTeam || row.awayTeam;
      const payloadRow = knvb
        ? {
            __row: row.__row,
            date: row.date,
            time: row.time,
            thuis: row.homeTeam,
            uit: row.awayTeam,
            matchNumber: row.matchNumber,
            matchType: row.matchType,
            playLevel: row.playLevel,
            note: row.note,
          }
        : {
            __row: row.__row,
            date: row.date,
            time: row.time,
            home: row.home,
            opponent: row.opponent,
            team: row.team,
            note: row.note,
            matchNumber: row.matchNumber,
            matchType: row.matchType,
            playLevel: row.playLevel,
          };
      const check = await api.validateMatchCsv({ matches: [payloadRow] });
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
      const res = await api.importMatches({ matches: [payloadRow] });
      if (!res.created && !res.skippedDuplicates) {
        setInvalidRows((prev) =>
          prev.map((r, i) =>
            i === index ? { ...r, busy: false, rowError: 'Importeren mislukt' } : r,
          ),
        );
        return;
      }
      setInvalidRows((prev) => prev.filter((_, i) => i !== index));
      setMsg(
        res.skippedDuplicates
          ? `Rij ${row.__row} bestond al (wedstrijdnummer).`
          : `Rij ${row.__row} geïmporteerd.`,
      );
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

  const knvbUi = format === 'knvb' || invalidRows.some((r) => r.format === 'knvb');

  return (
    <div className="vvl-card space-y-4">
      <h3 className="font-heading font-black uppercase">KNVB importeren</h3>
      <p className="text-sm text-gray-700">
        Sleep het KNVB-bestand hierheen (<code>.xlsx</code> of <code>.csv</code>). Kolommen:{' '}
        <code>Datum; Tijd; Thuis; Uit; Wedstrijdnr.; Type; Spelniveau; Opmerkingen</code>.
        Spelniveau en opmerkingen zijn optioneel. Thuis/uit volgt uit welke ploeg Lekkerkerk is.
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
        <p className="font-heading text-sm font-black uppercase">Sleep KNVB-bestand hierheen</p>
        <p className="mt-1 text-xs text-gray-600">of klik om te kiezen (.xlsx / .csv / .txt)</p>
        {fileName ? (
          <p className="mt-3 text-xs font-semibold text-vvl-primary">Geladen: {fileName}</p>
        ) : null}
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/plain"
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
            setPayload({ csv: EMPTY_SAMPLE });
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
              const text = e.target.value;
              setCsvText(text);
              setPayload({ csv: text });
              resetValidation();
            }}
            placeholder={EMPTY_SAMPLE}
          />
          <button
            type="button"
            className="vvl-btn-outline text-xs"
            disabled={busy || !csvText.trim()}
            onClick={() => validatePayload({ csv: csvText })}
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
            <table className="w-full min-w-[640px] text-xs">
              <thead className="bg-emerald-50 font-bold uppercase">
                <tr>
                  <th className="p-2 text-left">Datum</th>
                  <th className="p-2 text-left">Tijd</th>
                  <th className="p-2 text-left">Team</th>
                  <th className="p-2 text-left">Thuis/uit</th>
                  <th className="p-2 text-left">Tegenstander</th>
                  <th className="p-2 text-left">Nr.</th>
                  <th className="p-2 text-left">Spelniveau</th>
                </tr>
              </thead>
              <tbody>
                {validPreview.map((r, i) => (
                  <tr key={`ok-${i}`} className="border-t border-emerald-100">
                    <td className="p-2">{r.date}</td>
                    <td className="p-2">{r.time || '—'}</td>
                    <td className="p-2">{r.team || '—'}</td>
                    <td className="p-2">{r.home ? 'Thuis' : 'Uit'}</td>
                    <td className="p-2">{r.opponent || '—'}</td>
                    <td className="p-2">{r.matchNumber || '—'}</td>
                    <td className="p-2">{r.playLevel || '—'}</td>
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
            <table className="w-full min-w-[900px] text-xs">
              <thead className="bg-red-50 font-bold uppercase">
                <tr>
                  <th className="p-2 text-left">Rij</th>
                  <th className="p-2 text-left">Datum</th>
                  <th className="p-2 text-left">Tijd</th>
                  {knvbUi ? (
                    <>
                      <th className="p-2 text-left">Thuis</th>
                      <th className="p-2 text-left">Uit</th>
                    </>
                  ) : (
                    <>
                      <th className="p-2 text-left">Thuis/uit</th>
                      <th className="p-2 text-left">Tegenstander</th>
                      <th className="p-2 text-left">Team</th>
                    </>
                  )}
                  <th className="p-2 text-left">Nr.</th>
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
                      <input
                        className="vvl-input py-1 text-xs"
                        value={r.time || ''}
                        onChange={(e) => updateInvalidField(index, 'time', e.target.value)}
                        placeholder="08:30"
                      />
                    </td>
                    {knvbUi ? (
                      <>
                        <td className="p-2">
                          <input
                            className="vvl-input py-1 text-xs"
                            value={r.homeTeam}
                            onChange={(e) => updateInvalidField(index, 'homeTeam', e.target.value)}
                          />
                        </td>
                        <td className="p-2">
                          <input
                            className="vvl-input py-1 text-xs"
                            value={r.awayTeam}
                            onChange={(e) => updateInvalidField(index, 'awayTeam', e.target.value)}
                          />
                        </td>
                      </>
                    ) : (
                      <>
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
                      </>
                    )}
                    <td className="p-2">
                      <input
                        className="vvl-input py-1 text-xs"
                        value={r.matchNumber || ''}
                        onChange={(e) => updateInvalidField(index, 'matchNumber', e.target.value)}
                      />
                    </td>
                    <td className="p-2 text-red-800">
                      {r.rowError || (r.errors || []).map((e) => e.message).join(' · ') || '—'}
                      {r.rowMsg ? <span className="block text-emerald-800">{r.rowMsg}</span> : null}
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
