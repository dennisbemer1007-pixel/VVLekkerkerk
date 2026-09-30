import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DienstCard from '../components/DienstCard.jsx';
import ListFilters from '../components/ListFilters.jsx';
import MasterDetail from '../components/MasterDetail.jsx';
import ServiceLine from '../components/ServiceLine.jsx';
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
  const [onlyOpen, setOnlyOpen] = useState(mode === 'open');
  const cleared = useRef(false);
  const detailTopRef = useRef(null);

  const choices = useMemo(() => voorWieChoices(user, children), [user, children]);

  const load = useCallback(() => {
    const params = {};
    if (mode === 'mine') {
      params.filter = 'mine';
      if (personId) params.personId = personId;
    } else if (onlyOpen) {
      params.filter = 'open';
    }
    if (filters.from) params.from = filters.from;
    if (filters.to) params.to = filters.to;
    return api
      .getServices(params)
      .then(setServices)
      .catch((e) => setError(e.message));
  }, [mode, personId, filters, onlyOpen]);

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

  const selectService = (serviceId) => {
    cleared.current = false;
    setSelectedId(serviceId);
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      detailTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const handleInschrijven = async (serviceId, clickMode) => {
    if (clickMode === 'expand') {
      if (selectedId === serviceId) {
        setSelectedId(null);
      } else {
        selectService(serviceId);
      }
      return;
    }
    if (needsVoorWiePopup(choices)) {
      setPendingId(serviceId);
      selectService(serviceId);
      return;
    }
    await enroll(serviceId, personId);
  };

  const handleUitschrijven = async (enrollmentId) => {
    setMsg('');
    const enrollment = services
      .flatMap((service) => service.enrollments || [])
      .find((row) => row.id === enrollmentId);
    const name = enrollment?.person?.name;
    const own = !name || Number(enrollment?.personId) === Number(personId);
    try {
      await api.deleteEnrollment(enrollmentId);
      setMsg(own ? 'Je bent uitgeschreven.' : `${name} is uitgeschreven.`);
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    if (!services.length) return;
    if (selectedId && services.some((s) => s.id === selectedId)) return;
    if (cleared.current) return;
    setSelectedId(services[0].id);
  }, [services, selectedId]);

  return (
    <div className="space-y-4" ref={detailTopRef}>
      {mode === 'open' ? (
        <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
          <input type="checkbox" className="h-5 w-5" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} />
          Alleen open plekken
        </label>
      ) : null}
      <ListFilters {...filters} onChange={setFilters} hidePerson />
      {msg ? <p className="text-sm text-emerald-800">{msg}</p> : null}
      {error ? <p className="text-sm text-red-800">{error}</p> : null}

      <MasterDetail
        selected={selectedId}
        onBack={() => {
          cleared.current = true;
          setSelectedId(null);
        }}
        emptyDetail="Kies een dienst."
        list={
          services.length === 0 ? (
            <p className="vvl-card text-sm text-gray-600">Geen diensten.</p>
          ) : (
            <ul className="space-y-2">
              {services.map((s) => (
                <li key={s.id}>
                  <ServiceLine
                    service={s}
                    selected={selectedId === s.id}
                    onSelect={() => selectService(s.id)}
                  />
                </li>
              ))}
            </ul>
          )
        }
        detail={
          services
            .filter((s) => s.id === selectedId)
            .map((s) => (
              <div key={s.id} className="space-y-3">
                <DienstCard
                  dienst={s}
                  myPersonId={personId}
                  householdIds={choices.map((choice) => choice.id)}
                  showActions
                  onInschrijven={handleInschrijven}
                  onUitschrijven={handleUitschrijven}
                />
              </div>
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
