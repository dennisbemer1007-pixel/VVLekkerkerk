import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function Layout({ children }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { user, logout, can, isLoggedIn, homePath } = useAuth();

  const navItems = [
    { to: '/', label: 'Dashboard', end: true, show: can('dashboard') },
    { to: '/inschrijven', label: 'Inschrijven', show: can('inschrijven') },
    { to: '/ruilen', label: 'Ruilen', show: can('ruilen') },
    { to: '/planning', label: 'Planning', show: can('planning') },
    { to: '/wedstrijden', label: 'Wedstrijden', show: can('wedstrijden') },
    { to: '/voorkeuren', label: 'Voorkeuren', show: can('voorkeuren') },
    { to: '/teams', label: 'Mijn team', show: can('teams') && !can('beheer') },
    { to: '/uitnodigen', label: 'Uitnodigen', show: can('teams') && !can('beheer') },
    { to: '/beheer', label: 'Beheer', show: can('beheer') },
  ].filter((i) => i.show);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="relative z-20 shadow-md">
        <div className="bg-vvl-accent text-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wider md:text-sm">
            <span>V.V. Lekkerkerk</span>
            {isLoggedIn ? (
              <div className="flex items-center gap-3 normal-case tracking-normal">
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
          <ul className="mx-auto flex max-w-6xl flex-col md:flex-row">
            {navItems.map(({ to, label, end }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={end}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) =>
                    `block px-4 py-3 text-sm font-bold uppercase tracking-wide transition md:px-5 ${
                      isActive ? 'bg-white text-vvl-primary' : 'text-white hover:bg-white/10'
                    }`
                  }
                >
                  {label}
                </NavLink>
              </li>
            ))}
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
