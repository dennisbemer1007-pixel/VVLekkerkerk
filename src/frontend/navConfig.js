export function canonicalRole(role) {
  if (role === 'Bestuur') return 'Admin';
  if (role === 'Coördinator') return 'Barcommissie';
  return role || 'Vrijwilliger';
}

const VOLUNTEER = [
  { to: '/diensten', label: 'Diensten', match: ['/diensten'] },
  { to: '/mijn-diensten', label: 'Mijn diensten', match: ['/mijn-diensten'] },
  { to: '/ruilen', label: 'Ruilen', match: ['/ruilen'] },
  { to: '/ik', label: 'Ik', match: ['/ik', '/kinderen'] },
];

const OPEN = { to: '/open', label: 'Open', match: ['/open'] };
const ROOSTER = { to: '/rooster', label: 'Rooster', match: ['/rooster', '/planning'] };
const MENSEN = { to: '/mensen', label: 'Mensen', match: ['/mensen', '/uitnodigen'] };
const MIJN_RUILEN = { to: '/mijn-ruilen', label: 'Mijn ruilen', match: ['/mijn-ruilen'] };
const MEER = { to: '/meer', label: 'Meer', match: ['/meer', '/wedstrijden', '/aandacht', '/mijn-gegevens', '/beheer'] };
const INSTELLINGEN = { to: '/instellingen', label: 'Instellingen', match: ['/instellingen'] };

const SETTINGS_TABS = new Set(['regels', 'mail', 'club', 'activiteiten']);

export function navForRole(role) {
  const r = canonicalRole(role);
  if (r === 'Teamcoördinator') {
    return [
      VOLUNTEER[0],
      VOLUNTEER[1],
      { to: '/team', label: 'Team', match: ['/team', '/teams'] },
      VOLUNTEER[2],
      VOLUNTEER[3],
    ];
  }
  if (r === 'Barcommissie') return [OPEN, ROOSTER, MENSEN, MIJN_RUILEN, MEER];
  if (r === 'Admin') return [OPEN, ROOSTER, MENSEN, MIJN_RUILEN, INSTELLINGEN, MEER];
  return VOLUNTEER;
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
    if (['/meer', '/wedstrijden', '/aandacht', '/mijn-gegevens'].includes(pathname)) return true;
    if (pathname !== '/beheer') return false;
    if (admin && SETTINGS_TABS.has(tab)) return false;
    return true;
  }
  return (item.match || [item.to]).some((path) => pathname === path || pathname.startsWith(`${path}/`));
}
