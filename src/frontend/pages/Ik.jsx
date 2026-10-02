import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../hooks/useApi.js';

export default function Ik({ title = 'Ik' }) {
  const { user } = useAuth();
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

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
    <div className="space-y-4">
      <h1 className="font-heading text-xl font-black uppercase">{title}</h1>
      <p className="text-sm text-gray-700">{user?.name}</p>
      {msg ? <p className="text-sm text-emerald-800">{msg}</p> : null}
      {error ? <p className="text-sm text-red-800">{error}</p> : null}

      <Link to="/mijn-diensten" className="vvl-btn-outline inline-flex w-full sm:w-auto" data-testid="link-mijn-diensten">
        Mijn diensten
      </Link>

      <Link to="/kinderen" className="vvl-btn-outline inline-flex w-full sm:w-auto" data-testid="link-mijn-kinderen">
        Mijn kinderen
      </Link>

      <button type="button" className="vvl-btn-outline w-full sm:w-auto" onClick={resetPassword}>
        Wachtwoord via e-mail
      </button>
    </div>
  );
}
