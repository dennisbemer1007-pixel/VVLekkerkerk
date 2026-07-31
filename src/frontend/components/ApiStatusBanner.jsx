import { useCallback, useEffect, useState } from 'react';
import { checkApiHealth } from '../hooks/useApi.js';

export default function ApiStatusBanner() {
  const [down, setDown] = useState(false);
  const [detail, setDetail] = useState('');

  const probe = useCallback(async () => {
    try {
      const h = await checkApiHealth();
      if (!h.ok) {
        setDown(true);
        setDetail(h.body?.error || `HTTP ${h.status}`);
      } else {
        setDown(false);
        setDetail('');
      }
    } catch {
      setDown(true);
      setDetail('Geen verbinding');
    }
  }, []);

  useEffect(() => {
    probe();
    const id = setInterval(probe, 15000);
    return () => clearInterval(id);
  }, [probe]);

  if (!down) return null;

  return (
    <div
      className="bg-red-700 px-4 py-2 text-center text-sm font-semibold text-white"
      role="alert"
    >
      Server niet bereikbaar{detail ? `: ${detail}` : ''}. Controleer of{' '}
      <code className="rounded bg-red-900/50 px-1">npm run dev</code> draait en ververs de pagina.
      <button
        type="button"
        className="ml-3 underline"
        onClick={() => probe()}
      >
        Opnieuw proberen
      </button>
    </div>
  );
}
