import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { BEHEER_BUTTONS } from '../pages/Meer.jsx';

/** Zelfde knoppenrij als onder Beheer, ook op Aandacht en Wedstrijden. */
export default function BeheerNavButtons() {
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const tab = params.get('tab') || '';

  return (
    <div className="flex flex-wrap gap-2" data-testid="beheer-nav-buttons">
      {BEHEER_BUTTONS.map((item) => {
        const active =
          (item.tab && item.tab === tab) ||
          (!item.tab && pathname === item.to) ||
          (item.to === '/aandacht' && pathname === '/aandacht') ||
          (item.to === '/wedstrijden' && pathname === '/wedstrijden');
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
  );
}
