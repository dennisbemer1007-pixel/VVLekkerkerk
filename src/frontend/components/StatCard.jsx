import { Link } from 'react-router-dom';

export default function StatCard({ title, value, subtitle, to }) {
  const inner = (
    <>
      <p className="text-xs font-bold uppercase tracking-wide text-vvl-accent">{title}</p>
      <p className="font-heading text-3xl font-black text-vvl-primary">{value}</p>
      {subtitle ? <p className="text-sm text-gray-600">{subtitle}</p> : null}
    </>
  );

  const className =
    'vvl-card flex flex-col gap-1 border-l-4 border-l-vvl-primary transition hover:shadow-md hover:border-l-vvl-accent';

  if (to) {
    return (
      <Link to={to} className={`${className} block no-underline text-inherit`}>
        {inner}
      </Link>
    );
  }

  return <div className={className}>{inner}</div>;
}
