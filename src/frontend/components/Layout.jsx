import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { navForRole } from '../navConfig.js';
import NotificationBell from './NotificationBell.jsx';

function navActive(pathname, search, to) {
  const [path, query] = to.split('?');
  if (pathname !== path) return false;
  if (!query) return true;
  return search.includes(query);
}

export default function Layout({ children }) {
  const { user, logout, isLoggedIn, homePath } = useAuth();
  const location = useLocation();
  const items = isLoggedIn ? navForRole(user?.role) : [];

  const linkClass = (active) =>
    `flex min-h-11 items-center rounded-full px-4 text-sm font-bold uppercase tracking-wide ${
      active ? 'bg-black text-white' : 'text-black hover:bg-black/5'
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
              <button type="button" onClick={() => logout()} className="vvl-btn-outline-light min-h-11 px-4 text-xs">
                Uit
              </button>
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
          <nav className="hidden w-56 shrink-0 border-r border-vvl-border bg-white p-3 md:block" aria-label="Menu">
            <ul className="space-y-2">
              {items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    className={() => linkClass(navActive(location.pathname, location.search, item.to))}
                  >
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
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
            {items.map((item) => {
              const active = navActive(location.pathname, location.search, item.to);
              return (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    className={`flex min-h-11 items-center justify-center px-1 py-1 text-center text-[11px] font-bold uppercase leading-tight ${
                      active ? 'bg-white text-black' : 'text-white'
                    }`}
                  >
                    {item.label}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}
    </div>
  );
}
