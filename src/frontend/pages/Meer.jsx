import { Link, useSearchParams } from 'react-router-dom';
import Beheer from './Beheer.jsx';

export const BEHEER_BUTTONS = [
  { to: '/aandacht', label: 'Aandacht' },
  { to: '/wedstrijden', label: 'Wedstrijden' },
  { to: '/meer?tab=diensten', label: 'Diensten', tab: 'diensten' },
  { to: '/meer?tab=planning', label: 'Planning', tab: 'planning' },
  { to: '/meer?tab=ruilen', label: 'Ruilen', tab: 'ruilen' },
  { to: '/meer?tab=regels', label: 'Dienstregels', tab: 'regels' },
  { to: '/meer?tab=activiteiten', label: 'Jaarplanning', tab: 'activiteiten' },
  { to: '/meer?tab=teams', label: 'Teams', tab: 'teams' },
  { to: '/meer?tab=mail', label: 'E-mail', tab: 'mail' },
  { to: '/meer?tab=club', label: 'Club', tab: 'club' },
];
const BUTTONS = BEHEER_BUTTONS;

export default function Meer() {
  const [params] = useSearchParams();
  const tab = params.get('tab') || '';
  const showPanel = BUTTONS.some((item) => item.tab && item.tab === tab);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {BUTTONS.map((item) => {
          const active = item.tab && item.tab === tab;
          return (
            <Link
              key={item.label}
              to={item.to}
              className={active ? 'vvl-btn-primary min-h-11' : 'vvl-btn-outline min-h-11'}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
      {showPanel ? <Beheer mode="meer" hideChrome /> : null}
    </div>
  );
}
