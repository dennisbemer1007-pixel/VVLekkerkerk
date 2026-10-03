import { Link, useLocation } from 'react-router-dom';
import { useRefereeFeature } from './feature.jsx';

export default function ScheidsNavLink() {
  const { enabled } = useRefereeFeature();
  const { pathname } = useLocation();
  if (!enabled) return null;
  const active = pathname === '/scheidsrechters';
  return (
    <Link
      to="/scheidsrechters"
      data-testid="scheids-nav"
      className={active ? 'vvl-btn-primary min-h-11' : 'vvl-btn-outline min-h-11'}
    >
      Scheidsrechters
    </Link>
  );
}
