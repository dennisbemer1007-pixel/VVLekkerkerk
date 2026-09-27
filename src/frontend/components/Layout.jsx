import { useState } from 'react';
import { Link, NavLink, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import NotificationBell from './NotificationBell.jsx';

/** Beheer-pagina’s als topnavigatie voor Admin (zie schermafbeelding). */
const ADMIN_BEHEER_TABS = [
  { id: 'personen', label: 'Personen' },
  { id: 'diensten', label: 'Diensten' },
  { id: 'planning', label: 'Planning' },
  { id: 'ruilen', label: 'Ruilen' },
  { id: 'regels', label: 'Dienstregels' },
  { id: 'activiteiten', label: 'Jaarplanning' },
  { id: 'teams', label: 'Teams' },
  { id: 'mail', label: 'E-mail' },
  { id: 'club', label: 'Club' },
];

function isAdminRoleName(role) {
  return role === 'Admin' || role === 'Bestuur';
}

export default function Layout({ children }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { user, logout, can, isLoggedIn, homePath } = useAuth();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const adminNav = isLoggedIn && isAdminRoleName(user?.role);

  const navItems = adminNav
    ? [
        ...ADMIN_BEHEER_TABS.map((t) => ({
          to: `/beheer?tab=${t.id}`,
          label: t.label,
          beheerTab: t.id,
        })),
        { to: '/wedstrijden', label: 'Wedstrijden' },
      ]
    : [
        { to: '/', label: 'Dashboard', end: true, show: can('dashboard') },
        { to: '/inschrijven', label: 'Inschrijven', show: can('inschrijven') },
        { to: '/voorkeuren', label: 'Mijn voorkeuren', show: can('inschrijven') || can('ruilen') },
        { to: '/ruilen', label: 'Ruilen', show: can('ruilen') },
        { to: '/planning', label: 'Planning', show: can('planning') },
        { to: '/wedstrijden', label: 'Wedstrijden', show: can('wedstrijden') },
        { to: '/teams', label: 'Mijn team', show: can('teams') && !can('beheer') },
        { to: '/beheer', label: 'Beheer', show: can('beheer') },
      ].filter((i) => i.show);

  const activeBeheerTab = searchParams.get('tab') || 'personen';

  const linkClass = (active) =>
    `block px-4 py-3 text-sm font-bold uppercase tracking-wide transition md:px-5 ${
      active ? 'bg-white text-vvl-primary' : 'text-white hover:bg-white/10'
    }`;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="relative z-20 shadow-md">
        <div className="bg-vvl-accent text-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wider md:text-sm">
            <span>V.V. Lekkerkerk</span>
            {isLoggedIn ? (
              <div className="flex items-center gap-3 normal-case tracking-normal">
                <NotificationBell />
                <span className="hidden sm:inline truncate max-w-[160px]">
                  {user.name} · {user.role}
                </span>
                <button
                  type="button"
                  onClick={() => logout()}
                  className="rounded-full border border-white/50 px-3 py-1 text-[10px] font-bold uppercase hover:bg-white hover:text-vvl-primary"
                >
                  Uitloggen
                </button>
              </div>
            ) : (
              <Link to="/login" className="hover:underline">
                Inloggen
              </Link>
            )}
          </div>
        </div>

        <div className="bg-vvl-secondary">
          <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 md:gap-6 md:py-4">
            <Link to={homePath} className="shrink-0">
              <img
                src="/logo.png"
                alt="V.V. Lekkerkerk"
                className="vvl-logo h-16 w-16 object-contain md:h-20 md:w-20"
              />
            </Link>

            <div className="flex min-w-0 flex-1 flex-col justify-center">
              <p className="font-heading text-lg font-black uppercase leading-tight text-vvl-primary md:text-xl">
                VVL Planning App
              </p>
              <p className="text-xs font-semibold uppercase tracking-wide text-vvl-accent md:text-sm">
                Simpel inschrijven · duidelijk overzicht
              </p>
            </div>

            <button
              type="button"
              className="my-3 inline-flex flex-col justify-center gap-1.5 md:hidden"
              aria-label="Menu"
              onClick={() => setMenuOpen((o) => !o)}
            >
              <span className={`block h-0.5 w-6 bg-vvl-primary transition ${menuOpen ? 'translate-y-2 rotate-45' : ''}`} />
              <span className={`block h-0.5 w-6 bg-vvl-primary transition ${menuOpen ? 'opacity-0' : ''}`} />
              <span className={`block h-0.5 w-6 bg-vvl-primary transition ${menuOpen ? '-translate-y-2 -rotate-45' : ''}`} />
            </button>
          </div>
        </div>

        <nav
          className={`border-t border-vvl-border bg-vvl-primary md:block ${menuOpen ? 'block' : 'hidden'}`}
        >
          <ul className="mx-auto flex max-w-6xl flex-col md:flex-row md:flex-wrap">
            {navItems.map((item) => {
              const { to, label, end, beheerTab } = item;
              if (beheerTab) {
                const active =
                  location.pathname === '/beheer' && activeBeheerTab === beheerTab;
                return (
                  <li key={to}>
                    <Link
                      to={to}
                      onClick={() => setMenuOpen(false)}
                      className={linkClass(active)}
                      aria-current={active ? 'page' : undefined}
                    >
                      {label}
                    </Link>
                  </li>
                );
              }
              return (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={end}
                    onClick={() => setMenuOpen(false)}
                    className={({ isActive }) => linkClass(isActive)}
                  >
                    {label}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:py-8">{children}</main>

      <footer className="border-t border-vvl-border bg-vvl-primary py-4 text-center text-xs font-bold uppercase tracking-wide text-white">
        V.V. Lekkerkerk — vrijwilligersplanning ·{' '}
        <Link to="/privacy" className="underline hover:text-vvl-secondary">
          Privacy
        </Link>
      </footer>
    </div>
  );
}
