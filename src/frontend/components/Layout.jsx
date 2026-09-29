import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { mobileNavForRole, navForRole, navItemActive } from '../navConfig.js';
import NotificationBell from './NotificationBell.jsx';

function TabIcon({ name }) {
  const common = { viewBox: '0 0 24 24', className: 'h-5 w-5', fill: 'none', stroke: 'currentColor', strokeWidth: 2, 'aria-hidden': true };
  if (name === 'calendar') {
    return (
      <svg {...common}>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M3 10h18M8 3v4M16 3v4" />
      </svg>
    );
  }
  if (name === 'list') {
    return (
      <svg {...common}>
        <path d="M8 7h12M8 12h12M8 17h12" />
        <path d="M4 7h.01M4 12h.01M4 17h.01" />
      </svg>
    );
  }
  if (name === 'swap') {
    return (
      <svg {...common}>
        <path d="M7 7h11l-3-3M17 17H6l3 3" />
      </svg>
    );
  }
  if (name === 'person') {
    return (
      <svg {...common}>
        <circle cx="12" cy="8" r="3" />
        <path d="M5 19c1.5-3 4-4.5 7-4.5S17.5 16 19 19" />
      </svg>
    );
  }
  if (name === 'people') {
    return (
      <svg {...common}>
        <circle cx="9" cy="8" r="2.5" />
        <circle cx="16" cy="9" r="2" />
        <path d="M4 18c1-2.5 3-3.5 5-3.5s4 1 5 3.5M14 18c.5-1.5 1.5-2.5 3-2.5 1.2 0 2.2.6 3 1.8" />
      </svg>
    );
  }
  if (name === 'dot') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (name === 'gear') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="6" cy="12" r="1" fill="currentColor" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
      <circle cx="18" cy="12" r="1" fill="currentColor" />
    </svg>
  );
}

export default function Layout({ children }) {
  const { user, logout, isLoggedIn, homePath } = useAuth();
  const location = useLocation();
  const items = isLoggedIn ? navForRole(user?.role) : [];
  const mobileItems = isLoggedIn ? mobileNavForRole(user?.role) : [];
  const active = (item) => navItemActive(item, location.pathname, location.search, user?.role);

  const linkClass = (isActive) =>
    `flex min-h-11 items-center border-l-4 px-4 text-sm font-bold uppercase tracking-wide ${
      isActive ? 'border-vvl-gold bg-white/10 text-vvl-gold' : 'border-transparent text-white hover:bg-white/10'
    }`;

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-vvl-muted">
      <header className="sticky top-0 z-30 border-b-4 border-vvl-gold bg-black text-white">
        <div className="flex h-14 items-center justify-between gap-3 px-4">
          <Link to={isLoggedIn ? homePath : '/login'} className="truncate font-black uppercase tracking-wide">
            V.V. Lekkerkerk
          </Link>
          {isLoggedIn ? (
            <div className="flex items-center gap-2">
              <NotificationBell />
              <button type="button" onClick={() => logout()} className="min-h-11 px-2 text-xs font-bold uppercase md:hidden">
                Uitloggen
              </button>
              <span className="hidden max-w-[14rem] truncate text-xs sm:inline">{user?.name}</span>
            </div>
          ) : (
            <Link to="/login" className="text-sm font-bold uppercase">
              Inloggen
            </Link>
          )}
        </div>
      </header>

      <div className="flex w-full flex-1">
        {isLoggedIn && items.length ? (
          <nav className="hidden w-52 shrink-0 flex-col bg-black text-white md:flex" aria-label="Menu">
            <ul className="space-y-1 p-3">
              {items.map((item) => (
                <li key={item.to}>
                  <NavLink to={item.to} className={() => linkClass(active(item))}>
                    {item.label}
                  </NavLink>
                </li>
              ))}
              <li>
                <button type="button" onClick={() => logout()} className={`${linkClass(false)} w-full text-left`}>
                  Uitloggen
                </button>
              </li>
            </ul>
          </nav>
        ) : null}

        <main className="min-w-0 flex-1 px-4 py-4 pb-24 md:px-6 md:pb-8">{children}</main>
      </div>

      {isLoggedIn && mobileItems.length ? (
        <nav
          className="fixed inset-x-0 bottom-0 z-30 border-t-4 border-vvl-gold bg-black text-white md:hidden"
          aria-label="Tabbladen"
        >
          <ul className="grid" style={{ gridTemplateColumns: `repeat(${mobileItems.length}, minmax(0, 1fr))` }}>
            {mobileItems.map((item) => (
              <li key={item.to} className="min-w-0">
                <NavLink
                  to={item.to}
                  className={`flex min-h-14 flex-col items-center justify-center gap-0.5 border-b-4 px-1 py-1 text-[10px] font-bold uppercase leading-none ${
                    active(item) ? 'border-vvl-gold text-vvl-gold' : 'border-transparent text-white'
                  }`}
                >
                  <TabIcon name={item.icon} />
                  <span className="max-w-full truncate">{item.short || item.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </div>
  );
}
