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
    include: { team: true },
  });
  const existingByNumber = new Map(
    existingNums
      .filter((m) => m.matchNumber)
      .map((m) => [String(m.matchNumber), m]),
  );
  const seenNumbers = new Set(existingByNumber.keys());

  const created = [];
  const updatedExisting = [];
  const persistErrors = [];
  let skippedDuplicates = 0;

  function sameIsoDay(a, b) {
    if (!a || !b) return !a && !b;
    const da = new Date(a);
    const db = new Date(b);
    return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
  }
  const recognizedTeamNames = new Set();
  const unknownTeamNames = new Set();
  const createdTeamNames = [];

  for (const row of validRows) {
    try {
      const matchNumber = (row.matchNumber || '').trim() || null;
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

      const nextDate = storedDate(row.date, row.time);
      if (matchNumber && seenNumbers.has(matchNumber)) {
        const existing = existingByNumber.get(matchNumber);
        if (existing) {
          const same =
            sameIsoDay(existing.date, nextDate) &&
            (existing.time || null) === (row.time || null) &&
            Boolean(existing.home) === (row.home !== false) &&
            (existing.opponent || null) === (row.opponent || null) &&
            Number(existing.teamId || 0) === Number(teamId || 0);
          if (!same) {
            const updated = await prisma.match.update({
              where: { id: existing.id },
              data: {
                date: nextDate,
                time: row.time || null,
                home: row.home !== false,
                opponent: row.opponent || null,
                note: row.note || existing.note,
                matchType: row.matchType || existing.matchType,
                playLevel: row.playLevel || existing.playLevel,
                teamId,
              },
              include: { team: true },
            });
            existingByNumber.set(matchNumber, updated);
            updatedExisting.push(updated);
          } else {
            skippedDuplicates += 1;
          }
          continue;
        }
        skippedDuplicates += 1;
        continue;
      }
      if (matchNumber) seenNumbers.add(matchNumber);

      const match = await prisma.match.create({
        data: {
          date: nextDate,
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
    updatedExisting,
    persistErrors,
    skippedDuplicates,
    teamsRecognized: [...recognizedTeamNames],
    unknownTeams: [...unknownTeamNames],
    createdTeams: createdTeamNames,
  };
}
