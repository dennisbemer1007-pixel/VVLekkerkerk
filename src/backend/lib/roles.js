import {
  isMandatoryObligation,
  normalizeObligation,
  OBLIGATION_LABELS,
  parsePreferredSlots,
  parseUnavailableWeekdays,
} from './obligation.js';

/** Wat mag elke rol zien/doen in de app */
export const ROLE_ACCESS = {
  Vrijwilliger: {
    label: 'Vrijwilliger',
    can: ['dashboard', 'inschrijven', 'planning', 'voorkeuren'],
    description: 'Zelf inschrijven op open diensten, voorkeuren instellen en de planning bekijken.',
  },
  Teamcoördinator: {
    label: 'Teamcoördinator',
    can: ['dashboard', 'inschrijven', 'planning', 'voorkeuren', 'teams'],
    description: 'Zoals vrijwilliger, plus ouders uitnodigen en voor je team inschrijven.',
  },
  Coördinator: {
    label: 'Coördinator (bardienst)',
    can: ['dashboard', 'inschrijven', 'planning', 'voorkeuren', 'beheer'],
    description: 'Volledig beheer: personen uitnodigen, diensten, teams en wedstrijden.',
  },
  Bestuur: {
    label: 'Bestuur',
    can: ['dashboard', 'inschrijven', 'planning', 'voorkeuren', 'beheer'],
    description: 'Volledig beheer, inclusief uitnodigingen en PDF-planning.',
  },
};

export const ADMIN_ROLES = ['Coördinator', 'Bestuur'];

export function isAdminRole(role) {
  return ADMIN_ROLES.includes(role);
}

export function accessForRole(role) {
  return ROLE_ACCESS[role] ?? ROLE_ACCESS.Vrijwilliger;
}

export function canAccess(role, feature) {
  return accessForRole(role).can.includes(feature);
}

/**
 * Publieke weergave van een persoon.
 * E-mail en telefoon alleen voor beheerders (Coördinator / Bestuur).
 * Secrets (wachtwoord-hash, tokens) worden altijd weggelaten.
 */
export function publicPerson(person, options = {}) {
  if (!person) return null;
  const includeContact =
    options.includeContact === true ||
    (options.viewerRole && isAdminRole(options.viewerRole));

  const {
    passwordHash: _p,
    inviteToken: _t,
    passwordResetToken: _prt,
    passwordResetExpiresAt: _pre,
    email,
    phone,
    photoUrl: _photo,
    unavailableWeekdays,
    preferredSlots,
    ...safe
  } = person;

  const obligation = normalizeObligation(person.obligation);

  const result = {
    ...safe,
    obligation,
    mandatoryBar: isMandatoryObligation(obligation),
    obligationLabel: OBLIGATION_LABELS[obligation] ?? OBLIGATION_LABELS.NONE,
    unavailableWeekdays: parseUnavailableWeekdays(unavailableWeekdays),
    preferredSlots: parsePreferredSlots(preferredSlots),
    hasAccount: Boolean(person.passwordHash),
    invitePending: Boolean(person.inviteToken && !person.passwordHash),
    access: accessForRole(person.role),
  };

  // photoUrl is veilig om te tonen (bestandsnaam is random)
  if (person.photoUrl) result.photoUrl = person.photoUrl;

  if (includeContact) {
    result.email = email ?? null;
    result.phone = phone ?? null;
  }

  return result;
}

/** Person in nested enrollment/planning responses: nooit contactgegevens */
export function publicPersonBrief(person) {
  if (!person) return null;
  const obligation = normalizeObligation(person.obligation);
  return {
    id: person.id,
    name: person.name,
    role: person.role,
    teamId: person.teamId ?? null,
    obligation,
    mandatoryBar: isMandatoryObligation(obligation),
    active: person.active !== false,
    photoUrl: person.photoUrl ?? null,
  };
}
