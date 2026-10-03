import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DienstCard from '../components/DienstCard.jsx';
import ListFilters from '../components/ListFilters.jsx';
import MasterDetail from '../components/MasterDetail.jsx';
import ServiceLine from '../components/ServiceLine.jsx';
import VoorWieDialog from '../components/VoorWieDialog.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../hooks/useApi.js';
import { ScheidsMijn, ScheidsOpen } from '../scheids/ScheidsVrijwilliger.jsx';
import { needsVoorWiePopup, voorWieChoices } from '../utils/voorWie.js';

function formatEnrollConfirm(service) {
  const when = new Date(service.date).toLocaleDateString('nl-NL', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const type = service.type === 'KITCHEN' ? 'keuken' : 'bar';
  return `Je staat ingeschreven voor ${when} ${service.time || ''} ${type}`.replace(/\s+/g, ' ').trim();
}

export default function Inschrijven({ mode = 'open' }) {
  const { personId, user } = useAuth();
  const [filters, setFilters] = useState({ person: '', from: '', to: '' });
  const [typeFilter, setTypeFilter] = useState('');
  const [services, setServices] = useState([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [children, setChildren] = useState([]);
  const [pendingId, setPendingId] = useState(null);
  const [onlyOpen, setOnlyOpen] = useState(mode === 'open');
  const [confirmText, setConfirmText] = useState('');
  const listScrollRef = useRef(0);
  const listTopRef = useRef(null);

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
    if (typeFilter) params.type = typeFilter;
    return api
      .getServices(params)
      .then(setServices)
      .catch((e) => setError(e.message));
  }, [mode, personId, filters, onlyOpen, typeFilter]);

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
      const service = services.find((s) => s.id === serviceId);
      const child = children.find((c) => c.id === targetId);
      if (service && (!child || Number(targetId) === Number(personId))) {
        setConfirmText(formatEnrollConfirm(service));
      } else if (child) {
        setConfirmText(`${child.name} staat ingeschreven.`);
      } else {
        setMsg('Je bent ingeschreven.');
      }
      setSelectedId(null);
      await load();
      requestAnimationFrame(() => {
        window.scrollTo({ top: listScrollRef.current, behavior: 'auto' });
      });
    } catch (e) {
      setError(e.message);
    }
  };

  const selectService = (serviceId) => {
    listScrollRef.current = window.scrollY || document.documentElement.scrollTop || 0;
    setSelectedId(serviceId);
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  };

  const handleBack = () => {
    setSelectedId(null);
    requestAnimationFrame(() => {
      window.scrollTo({ top: listScrollRef.current, behavior: 'auto' });
    });
  };

  const handleInschrijven = async (serviceId, clickMode) => {
    if (clickMode === 'expand') {
      if (selectedId === serviceId) {
        handleBack();
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

  return (
    <div className="space-y-4" ref={listTopRef} data-testid="inschrijven-page">
      {mode === 'mine' ? <ScheidsMijn /> : <ScheidsOpen />}
      {mode === 'open' ? (
        <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            className="h-5 w-5"
            checked={onlyOpen}
            onChange={(e) => setOnlyOpen(e.target.checked)}
          />
          Alleen open plekken
        </label>
      ) : null}
      <ListFilters {...filters} onChange={setFilters} hidePerson>
        <label className="block min-w-0 md:w-40 md:shrink-0">
          <span className="vvl-label md:sr-only">Soort</span>
          <select
            className="vvl-input"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            aria-label="Soort dienst"
            data-testid="filter-dienst-type"
          >
            <option value="">Bar en keuken</option>
            <option value="BAR">Alleen bar</option>
            <option value="KITCHEN">Alleen keuken</option>
          </select>
        </label>
      </ListFilters>
      {msg ? <p className="text-sm text-emerald-800">{msg}</p> : null}
      {error ? <p className="text-sm text-red-800">{error}</p> : null}

      <MasterDetail
        selected={selectedId}
        onBack={handleBack}
        emptyDetail="Kies een dienst in de lijst."
        list={
          services.length === 0 ? (
            <p className="vvl-card text-sm text-gray-600" data-testid="diensten-leeg">
              Geen diensten.
            </p>
          ) : (
            <ul className="space-y-2" data-testid="diensten-lijst">
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
              <div key={s.id} className="space-y-3" data-testid="dienst-detail">
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

      {confirmText ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Inschrijving bevestigd"
          data-testid="inschrijf-bevestiging"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmText('');
          }}
        >
          <div className="w-full max-w-sm space-y-4 rounded-sm bg-white p-4 shadow-lg">
            <p className="text-sm font-semibold text-gray-900">{confirmText}</p>
            <button
              type="button"
              className="vvl-btn-primary w-full"
              data-testid="inschrijf-bevestiging-ok"
              onClick={() => setConfirmText('')}
            >
              OK
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
