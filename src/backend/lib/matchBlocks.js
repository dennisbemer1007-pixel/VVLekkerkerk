import { addMinutesToDate, combineDateAndTime, rangesOverlap, serviceDateRange } from './time.js';
import { kickoffTimeFromMatch } from './matchPlanning.js';
import { personTeamIds } from './teamFunctions.js';

export const HOME_BLOCK_MINUTES = 60;
export const AWAY_BLOCK_MINUTES = 120;

export function matchBlockRange(match) {
  const kickoffHm = kickoffTimeFromMatch(match);
  const kickoff = combineDateAndTime(match.date, kickoffHm);
  const duration = match.team?.matchDurationMinutes ?? 90;
  const matchEnd = addMinutesToDate(kickoff, duration);
  const pad = match.home === false ? AWAY_BLOCK_MINUTES : HOME_BLOCK_MINUTES;
  return {
    from: addMinutesToDate(kickoff, -pad),
    to: addMinutesToDate(matchEnd, pad),
    home: match.home !== false,
    match,
  };
}

export function blocksForPerson(person, matches) {
  const teamIds = new Set(personTeamIds(person));
  if (!teamIds.size) return [];
  return (matches || [])
    .filter((m) => m.teamId && teamIds.has(m.teamId))
    .filter((m) => m.team?.availabilityUse !== false)
    .map(matchBlockRange);
}

/** Volledige dienst moet buiten iedere blokkade vallen. */
export function serviceOutsideMatchBlocks(service, blocks) {
  const range = serviceDateRange(service);
  return !(blocks || []).some((block) => rangesOverlap(range, block));
}

export function overlappingMatchBlocks(service, blocks) {
  const range = serviceDateRange(service);
  return (blocks || []).filter((block) => rangesOverlap(range, block));
}
