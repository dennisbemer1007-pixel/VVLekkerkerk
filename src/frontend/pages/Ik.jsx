import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../hooks/useApi.js';

export default function Ik({ title = 'Ik' }) {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPassword2, setNewPassword2] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const changePassword = async (e) => {
    e.preventDefault();
    setError('');
    setMsg('');
    if (newPassword.length < 8) {
      setError('Nieuw wachtwoord moet minstens 8 tekens zijn.');
      return;
    }
    if (newPassword !== newPassword2) {
      setError('De nieuwe wachtwoorden komen niet overeen.');
      return;
    }
    setBusy(true);
    try {
      await api.changePassword({ currentPassword, newPassword });
      setMsg('Wachtwoord gewijzigd.');
      setCurrentPassword('');
      setNewPassword('');
      setNewPassword2('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="font-heading text-xl font-black uppercase">{title}</h1>
      <p className="text-sm text-gray-700">{user?.name}</p>
      {msg ? <p className="text-sm text-emerald-800">{msg}</p> : null}
      {error ? <p className="text-sm text-red-800">{error}</p> : null}

      <Link to="/kinderen" className="vvl-btn-outline inline-flex w-full sm:w-auto" data-testid="link-mijn-kinderen">
        Mijn kinderen
      </Link>

      <form onSubmit={changePassword} className="vvl-card space-y-3">
        <h2 className="font-heading text-base font-black uppercase">Wachtwoord wijzigen</h2>
        <label className="block">
          <span className="vvl-label">Huidig wachtwoord</span>
          <input
            type="password"
            className="vvl-input"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        <label className="block">
          <span className="vvl-label">Nieuw wachtwoord</span>
          <input
            type="password"
            className="vvl-input"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </label>
        <label className="block">
          <span className="vvl-label">Nieuw wachtwoord nogmaals</span>
          <input
            type="password"
            className="vvl-input"
            value={newPassword2}
            onChange={(e) => setNewPassword2(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </label>
        <button type="submit" className="vvl-btn-primary" disabled={busy}>
          {busy ? 'Opslaan…' : 'Wachtwoord wijzigen'}
        </button>
      </form>
    </div>
  );
}
