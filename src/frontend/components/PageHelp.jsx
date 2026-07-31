import { useEffect, useId, useRef, useState } from 'react';

/**
 * Klein “i”-icoon naast de paginatitel.
 * Toont doel van de pagina en wat je er kunt doen.
 */
export default function PageHelp({ purpose, actions = [], title = 'Over deze pagina' }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!purpose && (!actions || actions.length === 0)) return null;

  return (
    <div className="relative inline-flex shrink-0" ref={rootRef}>
      <button
        type="button"
        className={`inline-flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-black transition ${
          open
            ? 'border-vvl-primary bg-vvl-primary text-white'
            : 'border-vvl-accent bg-white text-vvl-accent hover:border-vvl-primary hover:text-vvl-primary'
        }`}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={title}
        title={title}
        onClick={() => setOpen((v) => !v)}
      >
        i
      </button>

      {open ? (
        <div
          id={panelId}
          role="region"
          aria-label={title}
          className="absolute left-0 top-full z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-sm border border-vvl-border bg-white p-4 shadow-md sm:left-auto sm:right-0"
        >
          <p className="text-xs font-bold uppercase tracking-wide text-vvl-accent">{title}</p>
          {purpose ? <p className="mt-2 text-sm text-gray-800">{purpose}</p> : null}
          {actions?.length ? (
            <div className="mt-3">
              <p className="text-xs font-bold uppercase text-vvl-primary">Wat kun je hier?</p>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-gray-700">
                {actions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <button
            type="button"
            className="mt-3 text-xs font-bold uppercase text-vvl-accent hover:underline"
            onClick={() => setOpen(false)}
          >
            Sluiten
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Titel + info-icoon op één regel */
export function PageTitle({ children, purpose, actions, helpTitle, className = '' }) {
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`.trim()}>
      <h1 className="page-title">{children}</h1>
      <PageHelp purpose={purpose} actions={actions} title={helpTitle} />
    </div>
  );
}
