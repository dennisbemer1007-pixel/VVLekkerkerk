import { useAuth } from '../context/AuthContext.jsx';
import SettingsNavList from '../components/SettingsNavList.jsx';
import { isAdminRoleName } from '../navConfig.js';

const LINKS = [
  { to: '/aandacht', label: 'Aandacht', admin: true },
  { to: '/beheer?tab=planning', label: 'Planning maken', admin: true },
  { to: '/wedstrijden', label: 'Wedstrijden', admin: true },
  { to: '/beheer?tab=teams', label: 'Teams', admin: true },
  { to: '/beheer?tab=ruilen', label: 'Ruilen', admin: true },
  { to: '/mijn-gegevens', label: 'Mijn gegevens', admin: true },
  { to: '/beheer?tab=activiteiten', label: 'Jaarplanning', admin: false },
  { to: '/beheer?tab=regels', label: 'Dienstregels', admin: false },
  { to: '/beheer?tab=mail', label: 'E-mail', admin: false },
  { to: '/beheer?tab=club', label: 'Club & privacy', admin: false },
];

export default function Meer() {
  const { user } = useAuth();
  const admin = isAdminRoleName(user?.role);
  const items = LINKS.filter((item) => (admin ? item.admin : true));
  const mobileSettings = admin ? [{ to: '/instellingen', label: 'Instellingen' }] : [];

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="font-heading text-xl font-black uppercase">Meer</h1>
        <p className="mt-1 text-sm text-vvl-accent">Extra pagina’s en beheeropties.</p>
      </div>

      {mobileSettings.length ? (
        <div className="md:hidden">
          <SettingsNavList items={mobileSettings} />
        </div>
      ) : null}

      <SettingsNavList items={items} />
    </div>
  );
}
