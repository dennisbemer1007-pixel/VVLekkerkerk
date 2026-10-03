import { useId } from 'react';
import { partsForField } from './engine.js';

const FIELD = { x: 16, y: 14, w: 68, h: 116 };
const STRIPE = '#3d8a4c';
const STRIPE_ALT = '#348046';

const SPLIT_LABEL = { full: 'Heel', half: '2', quarter: '4' };

export function partChip(part) {
  if (!part) return '';
  const number = String(part.fieldName || '').match(/(\d+)/)?.[1] || '';
  const auto = !part.key || part.key === 'full' ? number || part.fieldName || part.name : `${number}${part.key}`;
  if (part.name && part.autoName && part.name !== part.autoName) {
    return part.name.length > 10 ? `${part.name.slice(0, 9)}…` : part.name;
  }
  return auto;
}

function framesFor(split) {
  const { x, y, w, h } = FIELD;
  const midX = x + w / 2;
  const midY = y + h / 2;
  if (split === 'half') {
    return {
      a: { x, y, w, h: h / 2 },
      b: { x, y: midY, w, h: h / 2 },
    };
  }
  if (split === 'quarter') {
    return {
      a: { x, y, w: w / 2, h: h / 2 },
      b: { x: midX, y, w: w / 2, h: h / 2 },
      c: { x, y: midY, w: w / 2, h: h / 2 },
      d: { x: midX, y: midY, w: w / 2, h: h / 2 },
    };
  }
  return { full: { x, y, w, h } };
}

function PitchMarkings() {
  const { x, y, w, h } = FIELD;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const boxW = 40;
  const boxH = 18;
  const sixW = 24;
  const sixH = 8;
  return (
    <g fill="none" stroke="#fff" strokeWidth="0.8" strokeLinejoin="round">
      <rect x={x} y={y} width={w} height={h} rx="5" />
      <line x1={x} y1={cy} x2={x + w} y2={cy} />
      <circle cx={cx} cy={cy} r="9" />
      <circle cx={cx} cy={cy} r="0.7" fill="#fff" stroke="none" />
      <rect x={cx - boxW / 2} y={y} width={boxW} height={boxH} />
      <rect x={cx - sixW / 2} y={y} width={sixW} height={sixH} />
      <circle cx={cx} cy={y + 13} r="0.55" fill="#fff" stroke="none" />
      <path d={`M${cx - 7} ${y + boxH} a 7 7 0 0 0 14 0`} />
      <rect x={cx - boxW / 2} y={y + h - boxH} width={boxW} height={boxH} />
      <rect x={cx - sixW / 2} y={y + h - sixH} width={sixW} height={sixH} />
      <circle cx={cx} cy={y + h - 13} r="0.55" fill="#fff" stroke="none" />
      <path d={`M${cx - 7} ${y + h - boxH} a 7 7 0 0 1 14 0`} />
      <g stroke="#111" strokeWidth="0.9" fill="none">
        <path d={`M${cx - 8} ${y} v-3 h16 v3`} />
        <path d={`M${cx - 8} ${y + h} v3 h16 v-3`} />
      </g>
    </g>
  );
}

export function PitchSvg({
  field,
  parts,
  activePartId = '',
  activeFieldId = '',
  onSelectPart,
  print = false,
  className = '',
}) {
  const uid = useId().replace(/:/g, '');
  const split = field.split || 'full';
  const frames = framesFor(split);
  const list = parts?.length ? parts : partsForField(field);
  const focusing = Boolean(activePartId || activeFieldId);
  const { x, y, w, h } = FIELD;
  const midX = x + w / 2;
  const midY = y + h / 2;

  return (
    <svg viewBox="0 0 100 146" className={className} role="img" aria-label={field.name}>
      <defs>
        <clipPath id={`grass-${uid}`}>
          <rect x={x} y={y} width={w} height={h} rx="5" />
        </clipPath>
      </defs>
      {print ? (
        <rect x={x + 1.2} y={y + 1.6} width={w} height={h} rx="5" fill="#d9d9d9" />
      ) : (
        <ellipse cx="50" cy="136" rx="28" ry="3.2" fill="#000" opacity="0.16" />
      )}
      <g clipPath={`url(#grass-${uid})`}>
        {Array.from({ length: 16 }, (_, index) => (
          <rect
            key={index}
            x={x}
            y={y + index * (h / 16)}
            width={w}
            height={h / 16 + 0.2}
            fill={index % 2 ? STRIPE : STRIPE_ALT}
          />
        ))}
      </g>
      <PitchMarkings />
      <g fill="none" strokeLinecap="round">
        {split !== 'full' ? (
          <>
            <line x1={x + 1} y1={midY} x2={x + w - 1} y2={midY} stroke="#111" strokeWidth="2.4" />
            <line x1={x + 1} y1={midY} x2={x + w - 1} y2={midY} stroke="#fff" strokeWidth="1.55" strokeDasharray="2.4 1.15" />
          </>
        ) : null}
        {split === 'quarter' ? (
          <>
            <line x1={midX} y1={y + 1} x2={midX} y2={y + h - 1} stroke="#111" strokeWidth="2.4" />
            <line x1={midX} y1={y + 1} x2={midX} y2={y + h - 1} stroke="#fff" strokeWidth="1.55" strokeDasharray="2.4 1.15" />
          </>
        ) : null}
      </g>
      {list.map((part) => {
        const frame = frames[part.key];
        if (!frame) return null;
        const lit = activePartId ? part.id === activePartId : activeFieldId && part.fieldId === activeFieldId;
        const dim = focusing && !lit;
        return (
          <g key={part.id}>
            <rect
              x={frame.x}
              y={frame.y}
              width={frame.w}
              height={frame.h}
              fill="#06140a"
              stroke="none"
              style={{ opacity: dim ? 0.78 : 0, transition: 'opacity 280ms ease' }}
            />
            {lit && !print ? (
              <g style={{ filter: 'drop-shadow(0 0 1.6px #fff) drop-shadow(0 0 3.4px #fff)' }}>
                <rect
                  x={frame.x + 0.35}
                  y={frame.y + 0.35}
                  width={frame.w - 0.7}
                  height={frame.h - 0.7}
                  fill="#fff"
                  stroke="#fff"
                  strokeWidth="2.2"
                  className="pitch-pulse"
                />
                <rect
                  x={frame.x + 0.55}
                  y={frame.y + 0.55}
                  width={frame.w - 1.1}
                  height={frame.h - 1.1}
                  fill="none"
                  stroke="#000"
                  strokeWidth="3.6"
                />
              </g>
            ) : null}
          </g>
        );
      })}
      {list.map((part) => {
        const frame = frames[part.key];
        if (!frame) return null;
        const label = partChip(part);
        const chipW = Math.max(8, label.length * 3.15 + 3.2);
        const chipH = 6.2;
        const cx = frame.x + 2.3;
        const cy = frame.y + 2.3;
        return (
          <g key={`chip-${part.id}`} pointerEvents="none">
            <rect x={cx} y={cy} width={chipW} height={chipH} rx="1.3" fill="#fff" stroke="#111" strokeWidth="0.35" />
            <text
              x={cx + chipW / 2}
              y={cy + chipH / 2}
              textAnchor="middle"
              dominantBaseline="central"
              fill="#111"
              fontFamily="Inter, Arial, sans-serif"
              fontSize="3.6"
              fontWeight="700"
            >
              {label}
            </text>
          </g>
        );
      })}
      {onSelectPart
        ? list.map((part) => {
            const frame = frames[part.key];
            if (!frame) return null;
            const pressed = part.id === activePartId;
            return (
              <rect
                key={`hit-${part.id}`}
                x={frame.x}
                y={frame.y}
                width={frame.w}
                height={frame.h}
                fill="transparent"
                className="cursor-pointer"
                role="button"
                tabIndex={0}
                aria-label={part.name}
                aria-pressed={pressed}
                data-testid={`pitch-part-${part.id}`}
                onClick={() => onSelectPart(part.id)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  onSelectPart(part.id);
                }}
              />
            );
          })
        : null}
    </svg>
  );
}

export function PitchMap({ fields, activePartId = '', activeFieldId = '', onSelectPart, compact = false }) {
  return (
    <div
      className={compact ? 'flex gap-2' : 'grid grid-cols-2 gap-2'}
      data-testid="pitch-map"
    >
      {fields.map((field) => (
        <div key={field.id} className={compact ? 'w-[4.6rem] shrink-0' : 'min-w-0'}>
          <PitchSvg
            field={field}
            parts={partsForField(field)}
            activePartId={activePartId}
            activeFieldId={activeFieldId}
            onSelectPart={onSelectPart}
          />
        </div>
      ))}
    </div>
  );
}

export function PitchFocus({ view, activePartId, activeFieldId, onSelectPart, children }) {
  return (
    <div>
      <div className="sticky top-14 z-20 -mx-4 mb-4 border-b border-vvl-border bg-vvl-muted/95 px-4 py-2 backdrop-blur md:hidden">
        <PitchMap
          fields={view.state.fields}
          activePartId={activePartId}
          activeFieldId={activeFieldId}
          onSelectPart={onSelectPart}
          compact
        />
      </div>
      <div className="md:grid md:grid-cols-[17rem_minmax(0,1fr)] md:items-start md:gap-8">
        <aside className="sticky top-16 hidden self-start md:block">
          <PitchMap
            fields={view.state.fields}
            activePartId={activePartId}
            activeFieldId={activeFieldId}
            onSelectPart={onSelectPart}
          />
        </aside>
        <div className="min-w-0 space-y-6">{children}</div>
      </div>
    </div>
  );
}

export function PitchFigure({ field }) {
  return (
    <figure className="mx-auto max-w-[16rem]">
      <PitchSvg field={field} parts={partsForField(field)} print />
    </figure>
  );
}

export default function FieldEditor({ field, onChange }) {
  const parts = field.parts || partsForField(field);

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
        className="vvl-input border-0 px-0 text-base font-black uppercase tracking-tight focus:ring-0"
        aria-label="Veldnaam"
        value={field.name}
        onChange={(event) => onChange({ ...field, name: event.target.value })}
      />
      <div className="flex rounded-sm border border-vvl-border p-0.5" role="group" aria-label={`Indeling ${field.name}`}>
        {['full', 'half', 'quarter'].map((split) => (
          <button
            key={split}
            type="button"
            className={`min-h-10 flex-1 text-xs font-bold uppercase tracking-wide transition ${
              field.split === split ? 'bg-black text-white' : 'text-gray-500 hover:text-black'
            }`}
            onClick={() => onChange({ ...field, split })}
          >
            {SPLIT_LABEL[split]}
          </button>
        ))}
      </div>
      <PitchSvg field={field} parts={parts} className="mx-auto max-w-[15rem]" />
      {field.split === 'full' ? null : (
        <div className={`grid gap-2 ${parts.length > 2 ? 'grid-cols-2' : 'grid-cols-2'}`}>
          {parts.map((part) => (
            <input
              key={part.id}
              className="vvl-input h-9 text-center text-xs font-bold"
              aria-label={`Naam ${part.autoName}`}
              value={part.name}
              onChange={(event) => renamePart(part.key, event.target.value)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
