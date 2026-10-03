export function canonicalRole(role) {
  if (role === 'Bestuur') return 'Admin';
  if (role === 'Coördinator') return 'Barcommissie';
  return role || 'Vrijwilliger';
}

const VOLUNTEER = [
  { to: '/diensten', label: 'Diensten', short: 'Diensten', icon: 'calendar', match: ['/diensten'] },
  { to: '/mijn-diensten', label: 'Mijn diensten', short: 'Mijn', icon: 'list', match: ['/mijn-diensten'] },
  { to: '/ruilen', label: 'Ruilen', short: 'Ruilen', icon: 'swap', match: ['/ruilen'] },
  {
    to: '/mijn-gegevens',
    label: 'Mijn gegevens',
    short: 'Gegevens',
    icon: 'person',
    match: ['/mijn-gegevens', '/ik', '/kinderen'],
  },
];

const DASHBOARD = { to: '/open', label: 'Dashboard', short: 'Dash', icon: 'dot', match: ['/open', '/aandacht'] };
const DIENSTEN = {
  to: '/rooster',
  label: 'Diensten',
  short: 'Diensten',
  icon: 'calendar',
  match: ['/rooster', '/planning'],
};
const MIJN_DIENSTEN = {
  to: '/mijn-diensten',
  label: 'Mijn diensten',
  short: 'Mijn',
  icon: 'list',
  match: ['/mijn-diensten'],
};
const PERSONEN = {
  to: '/mensen',
  label: 'Personen',
  short: 'Personen',
  icon: 'people',
  match: ['/mensen', '/uitnodigen'],
};
const MIJN_RUILEN = { to: '/mijn-ruilen', label: 'Mijn ruilen', short: 'Ruilen', icon: 'swap', match: ['/mijn-ruilen'] };
const MEER = {
  to: '/meer',
  label: 'Beheer',
  short: 'Beheer',
  icon: 'more',
  match: ['/meer', '/wedstrijden', '/aandacht', '/beheer', '/scheidsrechters'],
};
const INSTELLINGEN = { to: '/instellingen', label: 'Instellingen', short: 'Instel.', icon: 'gear', match: ['/instellingen'], desktopOnly: true };

const SETTINGS_TABS = new Set(['regels', 'mail', 'club', 'activiteiten']);

export function navForRole(role) {
  const r = canonicalRole(role);
  if (r === 'Teamcoördinator') {
    return [
      VOLUNTEER[0],
      VOLUNTEER[1],
      { to: '/team', label: 'Team', short: 'Team', icon: 'people', match: ['/team', '/teams'] },
      VOLUNTEER[2],
      VOLUNTEER[3],
    ];
  }
  // Geen aparte “Diensten” in het hoofdmenu: die zit onder Beheer → Rooster.
  if (r === 'Barcommissie') return [DASHBOARD, MIJN_DIENSTEN, PERSONEN, MIJN_RUILEN, MEER];
  if (r === 'Admin') return [DASHBOARD, MIJN_DIENSTEN, PERSONEN, MIJN_RUILEN, INSTELLINGEN, MEER];
  return VOLUNTEER;
}

export function mobileNavForRole(role) {
  return navForRole(role).filter((item) => !item.desktopOnly);
}

export function isAdminRoleName(role) {
  return canonicalRole(role) === 'Admin';
}

export function navItemActive(item, pathname, search, role) {
  const tab = new URLSearchParams(search || '').get('tab');
  const admin = isAdminRoleName(role);
  if (item.to === '/instellingen') {
    if (pathname === '/instellingen') return true;
    return pathname === '/beheer' && SETTINGS_TABS.has(tab);
  }
  if (item.to === '/meer') {
    if (['/meer', '/wedstrijden', '/aandacht', '/mijn-gegevens', '/scheidsrechters'].includes(pathname)) return true;
    if (pathname !== '/beheer') return false;
    if (admin && SETTINGS_TABS.has(tab)) return false;
    return true;
  }
  return (item.match || [item.to]).some((path) => pathname === path || pathname.startsWith(`${path}/`));
}
