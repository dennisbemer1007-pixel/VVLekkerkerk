import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PageTitle } from '../components/PageHelp.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { PAGE_HELP } from '../utils/pageHelp.js';

const DEMO_ACCOUNTS = [
  { role: 'Bestuur', email: 'admin@vvl.local', password: 'admin123' },
  { role: 'Coördinator', email: 'mark@vvl.demo', password: 'demo123' },
  { role: 'Teamcoördinator', email: 'sandra@vvl.demo', password: 'demo123' },
  { role: 'Vrijwilliger', email: 'lisa@vvl.demo', password: 'demo123' },
];

export default function Login() {
  const { login, isLoggedIn, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && isLoggedIn) navigate('/', { replace: true });
  }, [authLoading, isLoggedIn, navigate]);

  const doLogin = async (nextEmail, nextPassword) => {
    setError('');
    setLoading(true);
    try {
      await login(nextEmail, nextPassword);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    await doLogin(email, password);
  };

  const loginAsDemo = async (account) => {
    setEmail(account.email);
    setPassword(account.password);
    await doLogin(account.email, account.password);
  };

  return (
    <div className="min-h-screen bg-vvl-muted px-4 py-10">
      <div className="mx-auto max-w-md space-y-6">
        <header className="text-center">
          <img src="/logo.png" alt="V.V. Lekkerkerk" className="vvl-logo mx-auto mb-4 h-24 w-24 object-contain" />
          <PageTitle className="justify-center" {...PAGE_HELP.login}>
            Inloggen
          </PageTitle>
          <p className="mt-2 text-sm text-gray-700">
            VVL Planning App — gebruik je e-mail en wachtwoord.
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
          <div>
            <label className="vvl-label" htmlFor="password">
              Wachtwoord
            </label>
            <input
              id="password"
              type="password"
              className="vvl-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          {error ? (
            <p className="rounded-sm border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>
          ) : null}
          <button type="submit" className="vvl-btn-primary w-full" disabled={loading}>
            {loading ? 'Bezig…' : 'Inloggen'}
          </button>
          <p className="text-center text-sm">
            <Link to="/wachtwoord-vergeten" className="font-semibold text-vvl-primary hover:underline">
              Wachtwoord vergeten?
            </Link>
          </p>
        </form>

        {import.meta.env.DEV ? (
          <section className="vvl-card space-y-3">
            <div>
              <p className="vvl-label mb-0">Demo-accounts</p>
              <p className="mt-1 text-xs text-gray-600">Klik om direct in te loggen (alleen in development).</p>
            </div>
            <ul className="space-y-2">
              {DEMO_ACCOUNTS.map((account) => (
                <li key={account.email}>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => loginAsDemo(account)}
                    className="flex w-full items-center justify-between gap-3 rounded-sm border border-vvl-border bg-white px-3 py-2.5 text-left transition hover:border-vvl-primary hover:bg-vvl-muted disabled:opacity-60"
                  >
                    <span>
                      <span className="block text-sm font-bold text-vvl-primary">{account.role}</span>
                      <span className="block text-xs text-gray-600">{account.email}</span>
                    </span>
                    <span className="shrink-0 text-xs font-bold uppercase tracking-wide text-vvl-accent">
                      Inloggen
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <p className="text-center text-sm text-gray-600">
          Uitnodiging ontvangen? Open de link in je e-mail om een account te maken.
        </p>
      </div>
    </div>
  );
}
