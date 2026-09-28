import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../hooks/useApi.js';
import Voorkeuren from './Voorkeuren.jsx';

export default function Ik() {
  const { user, logout } = useAuth();
  const [children, setChildren] = useState([]);
  const [childName, setChildName] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [exportBusy, setExportBusy] = useState(false);

  const loadChildren = useCallback(() => {
    api.getMyChildren().then(setChildren).catch(() => setChildren([]));
  }, []);

  useEffect(() => {
    loadChildren();
  }, [loadChildren]);

  const downloadData = async () => {
    setExportBusy(true);
    setError('');
    try {
      const blob = await api.downloadMyDataExcel();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'vvl-mijn-gegevens.xlsx';
      a.click();
      URL.revokeObjectURL(url);
      setMsg('Je gegevens zijn gedownload.');
    } catch (e) {
      setError(e.message);
    } finally {
      setExportBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-heading text-xl font-black uppercase">Ik</h1>
        <p className="text-sm text-gray-700">{user?.name}</p>
      </header>

      {msg ? <p className="text-sm text-emerald-800">{msg}</p> : null}
      {error ? <p className="text-sm text-red-800">{error}</p> : null}

      <form
        className="vvl-card space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setError('');
          try {
            const created = await api.addMyChild({ name: childName });
            setChildName('');
            setMsg(`${created.name} is gekoppeld.`);
            await loadChildren();
          } catch (err) {
            setError(err.message);
          }
        }}
      >
        <h2 className="font-heading text-base font-black uppercase">Gekoppelde personen</h2>
        <label className="vvl-label">Naam</label>
        <input
          className="vvl-input"
          value={childName}
          onChange={(e) => setChildName(e.target.value)}
          placeholder="Voor- en achternaam"
          required
        />
        <button type="submit" className="vvl-btn-primary w-full sm:w-auto">
          Koppelen
        </button>
        {children.length ? (
          <ul className="space-y-2 text-sm">
            {children.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2">
                <span>{c.name}</span>
                <button
                  type="button"
                  className="vvl-btn-outline text-xs"
                  onClick={async () => {
                    if (!window.confirm(`${c.name} loskoppelen?`)) return;
                    try {
                      await api.deleteMyChild(c.id);
                      setMsg(`${c.name} is losgekoppeld.`);
                      await loadChildren();
                    } catch (err) {
                      setError(err.message);
                    }
                  }}
                >
                  Loskoppelen
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </form>

      <Voorkeuren embedded />

      <section className="vvl-card space-y-2">
        <button type="button" className="vvl-btn-outline w-full sm:w-auto" disabled={exportBusy} onClick={downloadData}>
          {exportBusy ? 'Laden…' : 'Gegevens downloaden'}
        </button>
        <Link to="/privacy" className="vvl-btn-outline inline-flex w-full sm:w-auto">
          Privacy
        </Link>
        <button type="button" className="vvl-btn-primary w-full sm:w-auto" onClick={() => logout()}>
          Uitloggen
        </button>
      </section>
    </div>
  );
}
