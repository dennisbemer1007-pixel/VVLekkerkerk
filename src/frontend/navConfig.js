export function canonicalRole(role) {
  if (role === 'Bestuur') return 'Admin';
  if (role === 'Coördinator') return 'Barcommissie';
  return role || 'Vrijwilliger';
}

const VOLUNTEER = [
  { to: '/diensten', label: 'Diensten' },
  { to: '/mijn-diensten', label: 'Mijn diensten' },
  { to: '/ruilen', label: 'Ruilen' },
  { to: '/ik', label: 'Ik' },
];

const COMMITTEE = [
  { to: '/open', label: 'Open' },
  { to: '/rooster', label: 'Rooster' },
  { to: '/mensen', label: 'Mensen' },
  { to: '/mijn-ruilen', label: 'Mijn ruilen' },
];

export function navForRole(role) {
  const r = canonicalRole(role);
  if (r === 'Teamcoördinator') return [...VOLUNTEER, { to: '/team', label: 'Team' }];
  if (r === 'Barcommissie') return [...COMMITTEE, { to: '/meer', label: 'Meer' }];
  if (r === 'Admin') {
    return [...COMMITTEE, { to: '/instellingen', label: 'Instellingen' }, { to: '/meer', label: 'Meer' }];
  }
  return VOLUNTEER;
}

export function isAdminRoleName(role) {
  return canonicalRole(role) === 'Admin';
}
