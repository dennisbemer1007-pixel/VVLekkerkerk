import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageTitle } from '../components/PageHelp.jsx';
import { api } from '../hooks/useApi.js';
import { PAGE_HELP } from '../utils/pageHelp.js';

export default function WachtwoordVergeten() {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setMsg('');
    setLoading(true);
    try {
      const res = await api.forgotPassword(email);
      setMsg(res.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-vvl-muted px-4 py-10">
      <div className="mx-auto max-w-md space-y-6">
        <header className="text-center">
          <img src="/logo.png" alt="" className="vvl-logo mx-auto mb-4 h-20 w-20 object-contain" />
          <PageTitle className="justify-center" {...PAGE_HELP.wachtwoordVergeten}>
            Wachtwoord vergeten
          </PageTitle>
          <p className="mt-2 text-sm text-gray-700">
            Vul je e-mail in. Als we een account vinden, sturen we een resetlink (24 uur geldig).
          </p>
        </header>

        <form onSubmit={submit} className="vvl-card space-y-4">
          <div>
            <label className="vvl-label" htmlFor="email">
              E-mail
            </label>
            <input
              id="email"
              type="text"
              inputMode="email"
              autoComplete="username"
              className="vvl-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          {error ? (
            <p className="rounded-sm border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>
          ) : null}
          {msg ? (
            <p className="rounded-sm border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
              {msg}
            </p>
          ) : null}
          <button type="submit" className="vvl-btn-primary w-full" disabled={loading}>
            {loading ? 'Bezig…' : 'Verstuur link'}
          </button>
        </form>

        <p className="text-center text-sm">
          <Link to="/login" className="font-semibold text-vvl-primary hover:underline">
            Terug naar inloggen
          </Link>
        </p>
      </div>
    </div>
  );
}
