import { useCallback, useEffect, useMemo, useState } from 'react';
import DienstCard from '../components/DienstCard.jsx';
import ListFilters from '../components/ListFilters.jsx';
import MasterDetail from '../components/MasterDetail.jsx';
import VoorWieDialog from '../components/VoorWieDialog.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../hooks/useApi.js';
import { needsVoorWiePopup, voorWieChoices } from '../utils/voorWie.js';

export default function Inschrijven({ mode = 'open' }) {
  const { personId, user } = useAuth();
  const [filters, setFilters] = useState({ person: '', from: '', to: '' });
  const [services, setServices] = useState([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [children, setChildren] = useState([]);
  const [pendingId, setPendingId] = useState(null);

  const choices = useMemo(() => voorWieChoices(user, children), [user, children]);

  const load = useCallback(() => {
    const params = {};
    if (mode === 'mine') {
      params.filter = 'mine';
      if (personId) params.personId = personId;
    }
    if (filters.from) params.from = filters.from;
    if (filters.to) params.to = filters.to;
    if (filters.person.trim()) params.q = filters.person.trim();
    return api
      .getServices(params)
      .then(setServices)
      .catch((e) => setError(e.message));
  }, [mode, personId, filters]);

  useEffect(() => {
    api.getMyChildren().then(setChildren).catch(() => setChildren([]));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const enroll = async (serviceId, targetId) => {
    setMsg('');
    setError('');
    try {
      await api.createEnrollment({ serviceId, personId: targetId });
      const child = children.find((c) => c.id === targetId);
      setMsg(child ? `${child.name} is ingeschreven.` : 'Je bent ingeschreven.');
      setSelectedId(serviceId);
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleInschrijven = async (serviceId, clickMode) => {
    if (clickMode === 'expand') {
      setSelectedId((id) => (id === serviceId ? null : serviceId));
      return;
    }
    if (needsVoorWiePopup(choices)) {
      setPendingId(serviceId);
      setSelectedId(serviceId);
      return;
    }
    await enroll(serviceId, personId);
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

  const title = mode === 'mine' ? 'Mijn diensten' : 'Diensten';

  return (
    <div className="space-y-4">
      <h1 className="font-heading text-xl font-black uppercase">{title}</h1>
      <ListFilters {...filters} onChange={setFilters} />
      {msg ? <p className="text-sm text-emerald-800">{msg}</p> : null}
      {error ? <p className="text-sm text-red-800">{error}</p> : null}

      <MasterDetail
        selected={selectedId}
        onBack={() => setSelectedId(null)}
        emptyDetail="Kies een dienst."
        list={
          services.length === 0 ? (
            <p className="vvl-card text-sm text-gray-600">Geen diensten.</p>
          ) : (
            <ul className="space-y-2">
              {services.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(s.id)}
                    className={`w-full rounded-sm border px-3 py-3 text-left ${
                      selectedId === s.id ? 'border-black bg-white' : 'border-vvl-border bg-white'
                    }`}
                  >
                    <span className="block text-sm font-bold">
                      {new Date(s.date).toLocaleDateString('nl-NL', {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                      })}{' '}
                      · {s.time}
                    </span>
                    <span className="block text-xs text-gray-600">
                      {s.type === 'KITCHEN' ? 'Keuken' : 'Bar'} · {s.enrolled ?? s.enrollments?.length ?? 0}/
                      {s.required ?? 0}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )
        }
        detail={
          services
            .filter((s) => s.id === selectedId)
            .map((s) => (
              <DienstCard
                key={s.id}
                dienst={s}
                myPersonId={personId}
                showActions
                onInschrijven={handleInschrijven}
                onUitschrijven={handleUitschrijven}
              />
            ))
        }
      />

      <VoorWieDialog
        open={Boolean(pendingId)}
        choices={choices}
        onClose={() => setPendingId(null)}
        onChoose={async (choice) => {
          const id = pendingId;
          setPendingId(null);
          await enroll(id, choice.id);
        }}
      />
    </div>
  );
}
