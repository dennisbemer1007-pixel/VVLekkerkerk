import { Link, useLocation } from 'react-router-dom';
import { useScheidsEnabled } from './store.js';

export default function ScheidsNavLink() {
  const enabled = useScheidsEnabled();
  const { pathname } = useLocation();
  if (!enabled) return null;
  return (
    <Link
      to="/scheidsrechters"
      data-testid="scheids-nav"
      className={pathname === '/scheidsrechters' ? 'vvl-btn-primary min-h-11' : 'vvl-btn-outline min-h-11'}
    >
      Scheidsrechters
    </Link>
  );
}
