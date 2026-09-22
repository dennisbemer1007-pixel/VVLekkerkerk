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
    can: ['inschrijven', 'ruilen'],
    description: 'Zelf inschrijven op open bardiensten en ruilen.',
  },
  Teamcoördinator: {
    label: 'Bardienstcoördinator',
    can: ['inschrijven', 'ruilen', 'teams'],
    description:
      'Zelfde als vrijwilliger, plus ouders van je team(s) op de teamdienst zetten. Ouders hebben geen account nodig.',
  },
  Barcommissie: {
    label: 'Barcommissie',
    can: ['dashboard', 'planning', 'wedstrijden', 'beheer'],
    description:
      'Clubplanning en beheer. Ruilverzoeken zie je via het notificatiebelletje; vrijwilligers regelen akkoord onderling.',
  },
  Admin: {
    label: 'Admin',
    can: ['dashboard', 'planning', 'wedstrijden', 'beheer'],
    description:
      'Volledig beheer, inclusief uitnodigingen en PDF-planning. Ruilverzoeken zie je via het notificatiebelletje.',
  },
};

/** Rollen met beheer-rechten, inclusief legacy-aliassen tot migratie klaar is. */
export const ADMIN_ROLES = ['Barcommissie', 'Admin', 'Bestuur', 'Coördinator'];

export function canonicalAccessRole(role) {
  if (role === 'Coördinator') return 'Barcommissie';
  if (role === 'Bestuur') return 'Admin';
  if (ROLE_ACCESS[role]) return role;
  return 'Vrijwilliger';
}

export function isAdminRole(role) {
  const r = canonicalAccessRole(role);
  return r === 'Barcommissie' || r === 'Admin';
}

export function accessForRole(role) {
  return ROLE_ACCESS[canonicalAccessRole(role)] ?? ROLE_ACCESS.Vrijwilliger;
}

export function canAccess(role, feature) {
  return accessForRole(role).can.includes(feature);
}

/**
 * Publieke weergave van een persoon.
 * E-mail en telefoon alleen voor beheerders (Barcommissie / Admin).
 * Secrets (wachtwoord-hash, tokens) worden altijd weggelaten.
 */
export function publicPerson(person, options = {}) {
  if (!person) return null;
  const includeContact =
    options.includeContact === true ||
    (options.viewerRole && isAdminRole(options.viewerRole));

  const obligation = normalizeObligation(person.obligation);
  const team = person.team
    ? { id: person.team.id, name: person.team.name }
    : person.teamId
      ? { id: person.teamId, name: null }
      : null;

  const result = {
    id: person.id,
    personNumber: person.personNumber ?? null,
    name: person.name,
    role: canonicalAccessRole(person.role),
    active: person.active !== false,
    obligation,
    exempted: Boolean(person.exempted),
    makeupDue: person.makeupDue ?? 0,
    teamId: person.teamId ?? null,
    team,
    mandatoryBar: isMandatoryObligation(obligation),
    obligationLabel: OBLIGATION_LABELS[obligation] ?? OBLIGATION_LABELS.NONE,
    unavailableWeekdays: parseUnavailableWeekdays(person.unavailableWeekdays),
    preferredSlots: parsePreferredSlots(person.preferredSlots),
    hasAccount: Boolean(person.passwordHash),
    invitePending: Boolean(person.inviteToken && !person.passwordHash),
    access: accessForRole(person.role),
    createdAt: person.createdAt ?? null,
  };

  if (person.photoUrl) result.photoUrl = person.photoUrl;

  if (includeContact) {
    result.email = person.email ?? null;
    result.phone = person.phone ?? null;
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
    role: canonicalAccessRole(person.role),
    teamId: person.teamId ?? null,
    obligation,
    mandatoryBar: isMandatoryObligation(obligation),
    exempted: person.exempted === true,
    personNumber: person.personNumber ?? null,
    active: person.active !== false,
    photoUrl: person.photoUrl ?? null,
  };
}
