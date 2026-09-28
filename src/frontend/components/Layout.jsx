import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { navForRole, navItemActive } from '../navConfig.js';
import NotificationBell from './NotificationBell.jsx';

export default function Layout({ children }) {
  const { user, logout, isLoggedIn, homePath } = useAuth();
  const location = useLocation();
  const items = isLoggedIn ? navForRole(user?.role) : [];
  const active = (item) => navItemActive(item, location.pathname, location.search, user?.role);

  const linkClass = (active) =>
    `flex min-h-11 items-center border-l-4 px-4 text-sm font-bold uppercase tracking-wide ${
      active ? 'border-vvl-gold bg-black text-white' : 'border-transparent text-black hover:bg-black/5'
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
              <span className="hidden max-w-[10rem] truncate text-xs sm:inline">{user?.name}</span>
            </div>
          ) : (
            <Link to="/login" className="text-sm font-bold uppercase">
              Inloggen
            </Link>
          )}
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-1">
        {isLoggedIn && items.length ? (
          <nav className="hidden w-56 shrink-0 flex-col border-r border-vvl-border bg-white md:flex" aria-label="Menu">
            <ul className="flex-1 space-y-1 p-3">
              {items.map((item) => (
                <li key={item.to}>
                  <NavLink to={item.to} className={() => linkClass(active(item))}>
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
            <div className="border-t border-vvl-border p-3">
              <button type="button" onClick={() => logout()} className="vvl-btn-primary w-full">
                Uitloggen
              </button>
            </div>
          </nav>
        ) : null}

        <main className="min-w-0 flex-1 px-4 py-4 pb-24 md:pb-8">{children}</main>
      </div>

      {isLoggedIn && items.length ? (
        <nav
          className="fixed inset-x-0 bottom-0 z-30 border-t-4 border-vvl-gold bg-black text-white md:hidden"
          aria-label="Tabbladen"
        >
          <ul className="grid" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
            {items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  className={`flex min-h-11 items-center justify-center border-b-4 px-1 py-1 text-center text-[11px] font-bold uppercase leading-tight ${
                    active(item) ? 'border-vvl-gold bg-white text-black' : 'border-transparent text-white'
                  }`}
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </div>
  );
}
