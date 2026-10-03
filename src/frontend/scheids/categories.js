export const REFEREE_LEVELS = [
  { id: 'pupillen', label: 'Pupillen' },
  { id: 'junioren', label: 'Junioren' },
  { id: 'senioren', label: 'Senioren' },
];

export const ALL_LEVEL_IDS = REFEREE_LEVELS.map((level) => level.id);

export function levelLabel(id) {
  return REFEREE_LEVELS.find((level) => level.id === id)?.label || '';
}
