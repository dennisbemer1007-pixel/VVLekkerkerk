export const WEEKDAY_OPTIONS = [
  { id: 1, label: 'Maandag' },
  { id: 2, label: 'Dinsdag' },
  { id: 3, label: 'Woensdag' },
  { id: 4, label: 'Donderdag' },
  { id: 5, label: 'Vrijdag' },
  { id: 6, label: 'Zaterdag' },
  { id: 0, label: 'Zondag' },
];

export const CONDITION_OPTIONS = [
  { id: 'ALWAYS', label: 'Altijd' },
  { id: 'HOME_MATCH', label: 'Bij thuiswedstrijd' },
  { id: 'HOME_MATCH_TEAM', label: 'Bij thuiswedstrijd van een team' },
  { id: 'NO_HOME_MATCH_TEAM', label: 'Geen thuiswedstrijd van een team' },
  { id: 'ACTIVITY', label: 'Bij een activiteit' },
  { id: 'MANUAL', label: 'Alleen handmatig' },
];

export const ACTIVITY_TYPE_OPTIONS = [
  { id: 'klaverjas', label: 'Klaverjasavond' },
  { id: 'toernooi', label: 'Toernooi' },
  { id: 'feest', label: 'Feestavond' },
  { id: 'ledenavond', label: 'Ledenavond' },
  { id: 'opening', label: 'Bijzondere opening' },
  { id: 'overig', label: 'Overig' },
];

export const TEAM_DUTY_SHIFT_OPTIONS = [
  { id: 'MORNING', label: 'Ochtend' },
  { id: 'SECOND', label: 'Middag (tweede shift)' },
  { id: 'LAST', label: 'Avond (laatste shift)' },
];

/** Dienst uit de jaarplanning: gekoppeld aan een activiteit en geen concept. */
export function isJaarplanningService(service) {
  return Boolean(service && !service.draft && (service.activityId || service.activity?.id));
}

/**
 * Splits de diensten van de actieve periode voor de planning-wizard:
 * concepten (draft) en jaarplanning-bardiensten (niet-concept, wel activiteit).
 * Wijzigt geen draft-status en laat overige handmatige diensten buiten beide lijsten.
 */
export function splitPlanningWizardServices(services) {
  const list = Array.isArray(services) ? services : [];
  return {
    drafts: list.filter((row) => row.draft),
    jaarplanning: list.filter(isJaarplanningService),
  };
}
