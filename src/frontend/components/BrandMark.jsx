import { Link } from 'react-router-dom';

export default function BrandMark({ to = '/', compact = false }) {
  return (
    <Link
      to={to}
      className={`flex min-w-0 items-center gap-2.5 text-white ${compact ? '' : 'gap-3'}`}
      aria-label="V.V. Lekkerkerk"
    >
      <img
        src="/logo.png"
        alt=""
        width={compact ? 36 : 40}
        height={compact ? 38 : 42}
        className={`shrink-0 object-contain ${compact ? 'h-9 w-9' : 'h-10 w-10'}`}
      />
      <span className="min-w-0 truncate font-black uppercase tracking-wide leading-tight">
        V.V. Lekkerkerk
      </span>
    </Link>
  );
}
