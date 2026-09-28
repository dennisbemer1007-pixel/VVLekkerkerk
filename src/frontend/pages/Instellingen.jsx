import { Link } from 'react-router-dom';

const LINKS = [
  { to: '/beheer?tab=regels', label: 'Dienstregels' },
  { to: '/beheer?tab=mail', label: 'E-mail' },
  { to: '/beheer?tab=club', label: 'Club' },
];

export default function Instellingen() {
  return (
    <div className="space-y-4">
      <h1 className="font-heading text-xl font-black uppercase">Instellingen</h1>
      <ul className="space-y-2">
        {LINKS.map((item) => (
          <li key={item.to}>
            <Link to={item.to} className="vvl-btn-primary w-full">
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
