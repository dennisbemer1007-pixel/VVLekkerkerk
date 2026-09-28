import { useEffect, useState } from 'react';
import { IMPORT_DESKTOP_MESSAGE, importAllowed } from '../utils/importGate.js';

function readDesktop() {
  return typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches;
}

/** Importschermen: op de telefoon alleen de melding, op de computer de echte import. */
export default function DesktopOnly({ children }) {
  const [desktop, setDesktop] = useState(readDesktop);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const onChange = () => setDesktop(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  if (!importAllowed(desktop)) {
    return (
      <p className="vvl-card text-sm font-semibold" data-testid="import-desktop-only">
        {IMPORT_DESKTOP_MESSAGE}
      </p>
    );
  }
  return children;
}
