import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import DienstCard from '../components/DienstCard.jsx';
import FilterChips from '../components/FilterChips.jsx';
import { PageTitle } from '../components/PageHelp.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../hooks/useApi.js';
import { PAGE_HELP } from '../utils/pageHelp.js';

export default function Inschrijven() {
  const { personId, user } = useAuth();
  const [searchParams] = useSearchParams();
  const initialFilter = searchParams.get('filter') || 'open';
  const [filter, setFilter] = useState(initialFilter);
  const [services, setServices] = useState([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(() => {
    const params = { filter: filter || undefined };
    if (filter === 'mine' && personId) params.personId = personId;
    return api
      .getServices(params)
      .then(setServices)
      .catch((e) => setError(e.message));
  }, [filter, personId]);

  useEffect(() => {
    const q = searchParams.get('filter');
    if (q !== null && q !== filter) setFilter(q || 'open');
  }, [searchParams]);

  useEffect(() => {
    load();
  }, [load]);

  const handleInschrijven = async (serviceId) => {
    setMsg('');
    setError('');
    try {
      await api.createEnrollment({ serviceId, personId });
      setMsg('Je bent ingeschreven. Bedankt!');
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleUitschrijven = async (enrollmentId) => {
    setMsg('');
    try {
      await api.deleteEnrollment(enrollmentId);
      setMsg('Je bent uitgeschreven.');
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <PageTitle {...PAGE_HELP.inschrijven}>Inschrijven</PageTitle>
        <p className="mt-1 text-sm text-gray-700">
          Ingelogd als <strong>{user?.name}</strong>. Schrijf je in op een open dienst.
        </p>
      </header>

      <FilterChips value={filter} onChange={setFilter} showMine />

      {msg ? (
        <p className="rounded-sm border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">{msg}</p>
      ) : null}
      {error ? (
        <p className="rounded-sm border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>
      ) : null}

      {services.length === 0 ? (
        <p className="vvl-card text-sm text-gray-600">Geen diensten gevonden voor dit filter.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {services.map((s) => (
            <DienstCard
              key={s.id}
              dienst={s}
              myPersonId={personId}
              showActions
              onInschrijven={handleInschrijven}
              onUitschrijven={handleUitschrijven}
            />
          ))}
        </div>
      )}
    </div>
  );
}
