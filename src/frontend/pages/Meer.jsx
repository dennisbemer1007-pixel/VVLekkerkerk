import { Link } from 'react-router-dom';
import Beheer from './Beheer.jsx';

const EXTRA = [
  { to: '/aandacht', label: 'Aandacht' },
  { to: '/wedstrijden', label: 'Wedstrijden' },
  { to: '/mijn-gegevens', label: 'Mijn gegevens' },
];

export default function Meer() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {EXTRA.map((item) => (
          <Link key={item.to} to={item.to} className="vvl-btn-outline min-h-11">
            {item.label}
          </Link>
        ))}
      </div>
      <Beheer mode="full" />
    </div>
  );
}
