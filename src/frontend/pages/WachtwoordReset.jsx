import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageTitle } from '../components/PageHelp.jsx';
import { api } from '../hooks/useApi.js';
import { PAGE_HELP } from '../utils/pageHelp.js';

export default function WachtwoordReset() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [info, setInfo] = useState(null);
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    api
      .getPasswordReset(token)
      .then(setInfo)
      .catch((e) => setError(e.message));
  }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    if (password !== password2) {
      setError('Wachtwoorden komen niet overeen');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await api.completePasswordReset(token, password);
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (error && !info) {
    return (
      <div className="min-h-screen bg-vvl-muted px-4 py-10">
        <div className="mx-auto max-w-md space-y-4 text-center">
          <PageTitle className="justify-center" {...PAGE_HELP.wachtwoordReset}>
            Wachtwoord resetten
          </PageTitle>
          <p className="vvl-card text-sm text-red-800">{error}</p>
          <Link to="/wachtwoord-vergeten" className="vvl-btn-outline inline-flex">
            Nieuwe link aanvragen
          </Link>
        </div>
      </div>
    );
  }

  if (!info) {
    return (
      <div className="min-h-screen bg-vvl-muted px-4 py-10 text-center text-sm text-gray-600">
        Laden…
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen bg-vvl-muted px-4 py-10">
        <div className="mx-auto max-w-md space-y-4 text-center">
          <h1 className="page-title">Gelukt</h1>
          <p className="vvl-card text-sm">Je wachtwoord is gewijzigd.</p>
          <button type="button" className="vvl-btn-primary" onClick={() => navigate('/login')}>
            Naar inloggen
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-vvl-muted px-4 py-10">
      <div className="mx-auto max-w-md space-y-6">
        <header className="text-center">
          <PageTitle className="justify-center" {...PAGE_HELP.wachtwoordReset}>
            Nieuw wachtwoord
          </PageTitle>
          <p className="mt-2 text-sm text-gray-700">
            Voor <strong>{info.name}</strong> ({info.email})
          </p>
        </header>
        <form onSubmit={submit} className="vvl-card space-y-4">
          <div>
            <label className="vvl-label" htmlFor="pw1">
              Nieuw wachtwoord
            </label>
            <input
              id="pw1"
              type="password"
              className="vvl-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </div>
          <div>
            <label className="vvl-label" htmlFor="pw2">
              Herhaal wachtwoord
            </label>
            <input
              id="pw2"
              type="password"
              className="vvl-input"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              minLength={8}
              required
            />
          </div>
          {error ? (
            <p className="rounded-sm border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>
          ) : null}
          <button type="submit" className="vvl-btn-primary w-full" disabled={loading}>
            {loading ? 'Bezig…' : 'Opslaan'}
          </button>
        </form>
      </div>
    </div>
  );
}
