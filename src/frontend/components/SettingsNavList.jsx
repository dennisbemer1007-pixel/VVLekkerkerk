import { Link } from 'react-router-dom';

function Chevron() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-vvl-accent" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}

/** Rustige, strakke navigatielijst i.p.v. zware full-width knoppen. */
export default function SettingsNavList({ items, className = '' }) {
  return (
    <ul className={`overflow-hidden rounded-sm border border-vvl-border bg-white ${className}`}>
      {items.map((item) => (
        <li key={item.to} className="border-b border-vvl-border last:border-b-0">
          <Link
            to={item.to}
            className="flex min-h-12 items-center justify-between gap-3 px-4 py-3 text-sm font-semibold uppercase tracking-wide text-vvl-primary transition hover:bg-vvl-muted"
          >
            <span className="min-w-0">{item.label}</span>
            <Chevron />
          </Link>
        </li>
      ))}
    </ul>
  );
}
