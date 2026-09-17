import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageTitle } from '../components/PageHelp.jsx';
import { api } from '../hooks/useApi.js';
import { homePathForUser, useAuth } from '../context/AuthContext.jsx';
import { PAGE_HELP } from '../utils/pageHelp.js';

export default function Uitnodiging() {
  const { token } = useParams();
  const { acceptInvite, isLoggedIn } = useAuth();
  const navigate = useNavigate();
  const [invite, setInvite] = useState(null);
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    api
      .getInvite(token)
      .then((data) => {
        setInvite(data);
        setName(data.name || '');
      })
      .catch((e) => setError(e.message));
  }, [token]);

  if (isLoggedIn && done) {
    /* stay on success briefly */
  }

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (password !== password2) {
      setError('Wachtwoorden komen niet overeen');
      return;
    }
    setLoading(true);
    try {
      const person = await acceptInvite(token, { password, name });
      setDone(true);
      setTimeout(() => navigate(homePathForUser(person), { replace: true }), 1500);
      return person;
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (error && !invite) {
    return (
      <div className="mx-auto max-w-md space-y-4 text-center">
        <PageTitle className="justify-center" {...PAGE_HELP.uitnodiging}>
          Uitnodiging
        </PageTitle>
        <p className="vvl-card text-sm text-red-800">{error}</p>
        <Link to="/login" className="vvl-btn-primary inline-flex">
          Naar inloggen
        </Link>
      </div>
    );
  }

  if (!invite) {
    return <p className="text-center text-sm text-gray-600">Uitnodiging laden…</p>;
  }

  if (done) {
    return (
      <div className="mx-auto max-w-md space-y-4 text-center">
        <h1 className="page-title">Welkom!</h1>
        <p className="vvl-card text-sm">
          Je account is aangemaakt. Je wordt doorgestuurd…
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-vvl-muted px-4 py-10">
      <div className="mx-auto max-w-lg space-y-6">
      <header className="text-center">
        <img src="/logo.png" alt="V.V. Lekkerkerk" className="mx-auto mb-4 h-24 w-24 object-contain" />
        <PageTitle className="justify-center" {...PAGE_HELP.uitnodiging}>
          Account aanmaken
        </PageTitle>
        <p className="mt-2 text-sm text-gray-700">
          Hoi <strong>{invite.name}</strong> — maak je wachtwoord aan voor de VVL Planning App.
        </p>
      </header>

      <div className="vvl-card space-y-2 border-l-4 border-l-vvl-primary">
        <p className="text-xs font-bold uppercase text-vvl-accent">Jouw rol</p>
        <p className="font-heading text-xl font-black uppercase">{invite.role}</p>
        <p className="text-sm text-gray-700">{invite.access?.description}</p>
        <ul className="mt-2 list-inside list-disc text-sm">
          {(invite.access?.can || []).map((c) => (
            <li key={c} className="capitalize">
              {labelFeature(c)}
            </li>
          ))}
        </ul>
      </div>

      <form onSubmit={submit} className="vvl-card space-y-4">
        <div>
          <label className="vvl-label">E-mail</label>
          <input className="vvl-input bg-gray-100" value={invite.email} disabled />
        </div>
        <div>
          <label className="vvl-label">Naam</label>
          <input
            className="vvl-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="vvl-label">Wachtwoord (min. 8 tekens)</label>
          <input
            type="password"
            className="vvl-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
        </div>
        <div>
          <label className="vvl-label">Wachtwoord herhalen</label>
          <input
            type="password"
            className="vvl-input"
            value={password2}
            onChange={(e) => setPassword2(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
        </div>
        {error ? (
          <p className="rounded-sm border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>
        ) : null}
        <button type="submit" className="vvl-btn-primary w-full" disabled={loading}>
          {loading ? 'Bezig…' : 'Account aanmaken'}
        </button>
      </form>
      </div>
    </div>
  );
}

function labelFeature(c) {
  const map = {
    dashboard: 'Dashboard',
    inschrijven: 'Inschrijven op diensten',
    planning: 'Planning & PDF bekijken',
    teams: 'Teamleden inschrijven',
    beheer: 'Beheer (uitnodigen, diensten, wedstrijden)',
  };
  return map[c] || c;
}
