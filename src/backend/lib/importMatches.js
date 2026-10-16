import { parseMatchDateInput } from './authz.js';
import { combineDateAndTime } from './time.js';
import { addTeamToIndex, buildTeamIndex, findTeamInIndex } from './knvbTeams.js';
import { defaultTeamFunctions } from './teamFunctions.js';

function storedDate(dateStr, timeStr) {
  const parsed = parseMatchDateInput(dateStr);
  if (!parsed) return null;
  if (timeStr) return combineDateAndTime(parsed, timeStr);
  return parsed;
}

/** Zelfde importpad als Wedstrijden → importeer: teams aanmaken en wedstrijden opslaan. */
export async function persistValidMatchRows(prisma, validRows) {
  const teams = await prisma.team.findMany();
  const index = buildTeamIndex(teams);
  const existingNums = await prisma.match.findMany({
    where: { matchNumber: { not: null } },
    select: { matchNumber: true },
  });
  const seenNumbers = new Set(existingNums.map((m) => String(m.matchNumber)));

  const created = [];
  const persistErrors = [];
  let skippedDuplicates = 0;
  const recognizedTeamNames = new Set();
  const unknownTeamNames = new Set();
  const createdTeamNames = [];

  for (const row of validRows) {
    try {
      const matchNumber = (row.matchNumber || '').trim() || null;
      if (matchNumber) {
        if (seenNumbers.has(matchNumber)) {
          skippedDuplicates += 1;
          continue;
        }
        seenNumbers.add(matchNumber);
      }

      let teamId = null;
      const teamName = (row.team || '').trim();
      if (teamName) {
        let found = findTeamInIndex(index, teamName);
        if (!found) {
          const fn = defaultTeamFunctions(teamName);
          found = await prisma.team.create({
            data: {
              name: teamName,
              availabilityUse: fn.availabilityUse,
              teamDutyUse: fn.teamDutyUse,
              teamDutySlots: JSON.stringify(fn.teamDutySlots),
              functionsConfigured: true,
            },
          });
          addTeamToIndex(index, found);
          createdTeamNames.push(found.name);
        }
        teamId = found.id;
        recognizedTeamNames.add(found.name);
      }

      const match = await prisma.match.create({
        data: {
          date: storedDate(row.date, row.time),
          time: row.time || null,
          home: row.home !== false,
          opponent: row.opponent || null,
          note: row.note || null,
          matchNumber,
          matchType: row.matchType || null,
          playLevel: row.playLevel || null,
          teamId,
        },
        include: { team: true },
      });
      created.push(match);
    } catch (e) {
      persistErrors.push({
        row: row.__row ?? '?',
        field: 'db',
        message: e.message || 'Opslaan mislukt',
      });
    }
  }

  return {
    created,
    persistErrors,
    skippedDuplicates,
    teamsRecognized: [...recognizedTeamNames],
    unknownTeams: [...unknownTeamNames],
    createdTeams: createdTeamNames,
  };
}
