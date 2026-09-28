import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { isAdminRoleName } from '../navConfig.js';

const LINKS = [
  { to: '/aandacht', label: 'Aandacht', admin: true },
  { to: '/beheer?tab=planning', label: 'Planning maken', admin: true },
  { to: '/wedstrijden', label: 'Wedstrijden', admin: true },
  { to: '/beheer?tab=teams', label: 'Teams', admin: true },
  { to: '/beheer?tab=ruilen', label: 'Ruilen', admin: true },
  { to: '/mijn-gegevens', label: 'Mijn gegevens', admin: true },
  { to: '/beheer?tab=activiteiten', label: 'Jaarplanning', admin: false },
  { to: '/beheer?tab=regels', label: 'Dienstregels', admin: false },
  { to: '/beheer?tab=mail', label: 'E-mail', admin: false },
  { to: '/beheer?tab=club', label: 'Club & privacy', admin: false },
];

export default function Meer() {
  const { user } = useAuth();
  const admin = isAdminRoleName(user?.role);
  const items = LINKS.filter((item) => (admin ? item.admin : true));

  return (
    <div className="space-y-4">
      <h1 className="font-heading text-xl font-black uppercase">Meer</h1>
      <ul className="space-y-2">
        {items.map((item) => (
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
