import { ALL_LEVEL_IDS, REFEREE_LEVELS } from './categories.js';

function chipClass(active) {
  return `min-h-11 rounded-full border-2 px-4 py-2 text-xs font-bold uppercase tracking-wide ${
    active
      ? 'border-vvl-primary bg-vvl-primary text-white'
      : 'border-vvl-primary bg-white text-vvl-primary'
  }`;
}

export default function RefereeLevelField({ value = [], onChange }) {
  const selected = new Set(value);
  const allOn = ALL_LEVEL_IDS.every((id) => selected.has(id));

  const toggle = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(ALL_LEVEL_IDS.filter((levelId) => next.has(levelId)));
  };

  return (
    <div className="sm:col-span-2" id="scheids-niveaus" data-testid="scheids-niveaus">
      <span className="vvl-label">Scheidsrechter</span>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Scheidsrechtersniveau">
        {REFEREE_LEVELS.map((level) => (
          <button
            key={level.id}
            type="button"
            aria-pressed={selected.has(level.id)}
            data-testid={`scheids-niveau-${level.id}`}
            className={chipClass(selected.has(level.id))}
            onClick={() => toggle(level.id)}
          >
            {level.label}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={allOn}
          data-testid="scheids-niveau-alles"
          className={chipClass(allOn)}
          onClick={() => onChange(allOn ? [] : [...ALL_LEVEL_IDS])}
        >
          Alles
        </button>
      </div>
    </div>
  );
}

export function RefereeBadges({ levels }) {
  const shown = REFEREE_LEVELS.filter((level) => (levels || []).includes(level.id));
  if (!shown.length) return null;
  return (
    <span className="mt-1 flex flex-wrap gap-1" data-testid="scheids-badge">
      {shown.map((level) => (
        <span
          key={level.id}
          className="rounded-full bg-vvl-secondary px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
        >
          {level.label}
        </span>
      ))}
    </span>
  );
}
