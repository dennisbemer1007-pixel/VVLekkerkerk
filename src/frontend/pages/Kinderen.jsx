import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../hooks/useApi.js';

export default function Kinderen() {
  const [children, setChildren] = useState([]);
  const [childName, setChildName] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const loadChildren = useCallback(() => {
    api.getMyChildren().then(setChildren).catch(() => setChildren([]));
  }, []);

  useEffect(() => {
    loadChildren();
  }, [loadChildren]);

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-3">
        <h1 className="font-heading text-xl font-black uppercase">Mijn kinderen</h1>
        <Link to="/mijn-gegevens" className="vvl-btn-outline text-xs">
          Terug
        </Link>
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
        <p className="text-sm text-gray-700">Alleen een naam. Een e-mailadres is niet nodig.</p>
        <label className="vvl-label">Naam</label>
        <input
          className="vvl-input"
          value={childName}
          onChange={(e) => setChildName(e.target.value)}
          placeholder="Voor- en achternaam"
          required
        />
        <button type="submit" className="vvl-btn-primary w-full sm:w-auto">
          Kind toevoegen
        </button>
      </form>
      {children.length === 0 ? (
        <p className="vvl-card text-sm text-gray-600">Nog geen kinderen gekoppeld.</p>
      ) : (
        <ul className="space-y-2">
          {children.map((child) => (
            <li key={child.id} className="vvl-card flex items-center justify-between gap-2">
              <span className="font-semibold">{child.name}</span>
              <button
                type="button"
                className="vvl-btn-outline text-xs"
                onClick={async () => {
                  if (!window.confirm(`${child.name} loskoppelen?`)) return;
                  try {
                    await api.deleteMyChild(child.id);
                    setMsg(`${child.name} is losgekoppeld.`);
                    await loadChildren();
                  } catch (err) {
                    setError(err.message);
                  }
                }}
              >
                Verwijderen
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
