/** Importeren (personen, wedstrijden/KNVB en overige imports) alleen op een computer. */
export const IMPORT_DESKTOP_MESSAGE = 'Importeren kan alleen op de computer';

export function importAllowed(isDesktop) {
  return Boolean(isDesktop);
}
