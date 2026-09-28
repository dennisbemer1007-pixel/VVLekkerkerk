import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { isAdminRoleName } from '../navConfig.js';

const LINKS = [
  { to: '/beheer?tab=diensten', label: 'Diensten', adminToo: true },
  { to: '/beheer?tab=planning', label: 'Planning', adminToo: true },
  { to: '/beheer?tab=ruilen', label: 'Ruilverzoeken', adminToo: true },
  { to: '/beheer?tab=activiteiten', label: 'Jaarplanning', adminToo: true },
  { to: '/beheer?tab=teams', label: 'Teams', adminToo: true },
  { to: '/wedstrijden', label: 'Wedstrijden', adminToo: true },
  { to: '/beheer?tab=regels', label: 'Dienstregels', adminToo: false },
  { to: '/beheer?tab=mail', label: 'E-mail', adminToo: false },
  { to: '/beheer?tab=club', label: 'Club', adminToo: false },
  { to: '/uitnodigen', label: 'Uitnodigen', adminToo: true },
  { to: '/privacy', label: 'Privacy', adminToo: true },
];

export default function Meer() {
  const { user } = useAuth();
  const admin = isAdminRoleName(user?.role);
  const items = LINKS.filter((item) => (admin ? item.adminToo : true));

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
