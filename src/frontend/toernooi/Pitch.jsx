import { cycleSplit } from './engine.js';

function PitchDrawing() {
  return (
    <svg viewBox="0 0 68 108" className="mx-auto aspect-[68/108] h-auto w-full max-w-[10rem]" aria-hidden="true">
      <rect x="2" y="4" width="64" height="100" fill="#e7f0e6" stroke="#111" strokeWidth="1.6" />
      <line x1="2" y1="54" x2="66" y2="54" stroke="#111" strokeWidth="1.1" />
      <circle cx="34" cy="54" r="9" fill="none" stroke="#111" strokeWidth="1.1" />
      <circle cx="34" cy="54" r="0.9" fill="#111" />
      <rect x="15" y="4" width="38" height="16" fill="none" stroke="#111" strokeWidth="1.1" />
      <rect x="23" y="4" width="22" height="7" fill="none" stroke="#111" strokeWidth="1.1" />
      <circle cx="34" cy="15" r="0.7" fill="#111" />
      <rect x="15" y="88" width="38" height="16" fill="none" stroke="#111" strokeWidth="1.1" />
      <rect x="23" y="97" width="22" height="7" fill="none" stroke="#111" strokeWidth="1.1" />
      <circle cx="34" cy="93" r="0.7" fill="#111" />
      <path d="M30 4h8v2h-8zM30 102h8v2h-8z" fill="#111" />
    </svg>
  );
}

const SPLIT_LABEL = { full: 'Heel', half: '2', quarter: '4' };

export default function FieldEditor({ field, onChange }) {
  const parts = field.parts;
  const cols = field.split === 'full' ? 'grid-cols-1' : 'grid-cols-2';

  const renamePart = (key, value) => {
    const part = parts.find((item) => item.key === key);
    const partNames = { ...(field.partNames || {}) };
    if (!value.trim() || value.trim() === part?.autoName) delete partNames[key];
    else partNames[key] = value;
    onChange({ ...field, partNames });
  };

  return (
    <section className="vvl-card space-y-3" data-testid={`veld-${field.id}`}>
      <input
        className="vvl-input font-bold"
        aria-label="Veldnaam"
        value={field.name}
        onChange={(event) => onChange({ ...field, name: event.target.value })}
      />
      <div className="grid grid-cols-3 gap-1" role="group" aria-label={`Indeling ${field.name}`}>
        {['full', 'half', 'quarter'].map((split) => (
          <button
            key={split}
            type="button"
            className={`min-h-11 text-sm font-bold uppercase ${field.split === split ? 'vvl-btn-primary' : 'vvl-btn-outline'}`}
            onClick={() => onChange({ ...field, split })}
          >
            {SPLIT_LABEL[split]}
          </button>
        ))}
      </div>
      <div className={`grid gap-2 ${cols}`}>
        {parts.map((part) => (
          <div key={part.id} className="space-y-1">
            <button
              type="button"
              className="block w-full"
              onClick={() => onChange({ ...field, split: cycleSplit(field.split) })}
              aria-label={`${part.name}, klik om te verdelen`}
            >
              <PitchDrawing />
            </button>
            {field.split === 'full' ? (
              <p className="text-center text-sm font-bold">{part.name}</p>
            ) : (
              <input
                className="vvl-input text-center text-sm font-bold"
                aria-label={`Naam ${part.autoName}`}
                value={part.name}
                onChange={(event) => renamePart(part.key, event.target.value)}
              />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export function PitchFigure({ name, size = 'full' }) {
  return (
    <figure className="space-y-1">
      <div className={size === 'full' ? 'mx-auto max-w-[9rem]' : ''}>
        <PitchDrawing />
      </div>
      <figcaption className="text-center text-sm font-bold">{name}</figcaption>
    </figure>
  );
}
