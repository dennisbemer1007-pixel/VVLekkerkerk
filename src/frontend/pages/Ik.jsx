import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../hooks/useApi.js';

export default function Ik({ title = 'Ik' }) {
  const { user } = useAuth();
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [exportBusy, setExportBusy] = useState(false);

  const downloadExcel = async () => {
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
      setMsg('Excel gedownload.');
    } catch (e) {
      setError(e.message);
    } finally {
      setExportBusy(false);
    }
  };

  const downloadJson = async () => {
    setExportBusy(true);
    setError('');
    try {
      const data = await api.exportMyData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'vvl-mijn-gegevens.json';
      a.click();
      URL.revokeObjectURL(url);
      setMsg('JSON gedownload.');
    } catch (e) {
      setError(e.message);
    } finally {
      setExportBusy(false);
    }
  };

  const resetPassword = async () => {
    setError('');
    setMsg('');
    if (!user?.email) {
      setError('Er staat geen e-mailadres op je account.');
      return;
    }
    try {
      await api.forgotPassword(user.email);
      setMsg('Er is een mail onderweg om je wachtwoord opnieuw in te stellen.');
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-heading text-xl font-black uppercase">{title}</h1>
        <p className="text-sm text-gray-700">{user?.name}</p>
      </header>
      {msg ? <p className="text-sm text-emerald-800">{msg}</p> : null}
      {error ? <p className="text-sm text-red-800">{error}</p> : null}

      {title === 'Ik' ? (
        <Link to="/kinderen" className="vvl-btn-outline inline-flex w-full sm:w-auto">
          Mijn kinderen
        </Link>
      ) : (
        <Link to="/rooster" className="vvl-btn-outline inline-flex w-full sm:w-auto">
          Eigen diensten in het rooster
        </Link>
      )}

      <section className="vvl-card space-y-2">
        <button type="button" className="vvl-btn-outline w-full sm:w-auto" disabled={exportBusy} onClick={downloadExcel}>
          Excel downloaden
        </button>
        <button type="button" className="vvl-btn-outline w-full sm:w-auto" disabled={exportBusy} onClick={downloadJson}>
          JSON downloaden
        </button>
        <Link to="/privacy" className="vvl-btn-outline inline-flex w-full sm:w-auto">
          Privacy
        </Link>
        <button type="button" className="vvl-btn-outline w-full sm:w-auto" onClick={resetPassword}>
          Wachtwoord via e-mail
        </button>
      </section>
    </div>
  );
}
