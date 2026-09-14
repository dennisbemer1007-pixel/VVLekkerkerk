import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { requireRole, getPersonFromRequest } from '../lib/auth.js';
import { ADMIN_ROLES } from '../lib/roles.js';
import { objectsToMatchRows, parseCsv, validateMatchRows } from '../lib/csvMatches.js';
import { parseMatchDateInput } from '../lib/authz.js';
import { combineDateAndTime } from '../lib/time.js';
import { xlsxToObjects } from '../lib/xlsxWorkbook.js';
import { trySyncPlanningFromMatches } from '../lib/proposePlanning.js';
import {
  buildTeamIndex,
  findTeamInIndex,
} from '../lib/knvbTeams.js';

const router = Router();
const admin = (...args) => requireRole(...ADMIN_ROLES)(...args);

function storedDate(dateStr, timeStr) {
  const parsed = parseMatchDateInput(dateStr);
  if (!parsed) return null;
  if (timeStr) return combineDateAndTime(parsed, timeStr);
  return parsed;
}

router.get(
  '/',
  async (req, res, next) => {
    try {
      const person = await getPersonFromRequest(req);
      if (!person) {
        return res.status(401).json({ error: 'Je bent niet ingelogd' });
      }
      const matches = await prisma.match.findMany({
        include: { team: true },
        orderBy: [{ date: 'asc' }, { id: 'asc' }],
      });
      res.json(matches);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/',
  admin(async (req, res, next) => {
    try {
      const { date, time, home, opponent, note, teamId, matchNumber, matchType, playLevel } =
        req.body;
      if (!date) return res.status(400).json({ error: 'Datum is verplicht' });
      const parsed = storedDate(date, time);
      if (!parsed) return res.status(400).json({ error: 'Ongeldige datum' });
      const match = await prisma.match.create({
        data: {
          date: parsed,
          time: time?.trim() || null,
          home: home !== false,
          opponent: opponent?.trim() || null,
          note: note?.trim() || null,
          matchNumber: matchNumber?.toString().trim() || null,
          matchType: matchType?.trim() || null,
          playLevel: playLevel?.trim() || null,
          teamId: teamId ? Number(teamId) : null,
        },
        include: { team: true },
      });
      const planning = home !== false ? await trySyncPlanningFromMatches() : { created: 0 };
      res.status(201).json({ ...match, planningCreated: planning.created });
    } catch (err) {
      next(err);
    }
  }),
);

function resolveRows(body) {
  if (body?.xlsxBase64) {
    try {
      const buf = Buffer.from(String(body.xlsxBase64).replace(/^data:.*base64,/, ''), 'base64');
      if (buf.length < 4 || buf.slice(0, 2).toString() !== 'PK') {
        return validateMatchRows([], { headerError: 'Ongeldig Excel-bestand' });
      }
      const objects = xlsxToObjects(buf);
      const parsed = objectsToMatchRows(objects, 'knvb');
      return validateMatchRows(parsed.rows, {
        headerError: parsed.headerError,
        format: parsed.format,
      });
    } catch (e) {
      return validateMatchRows([], {
        headerError: e.message || 'Kon het Excel-bestand niet lezen',
      });
    }
  }

  if (Array.isArray(body?.matches) && body.matches.length) {
    const parsed = objectsToMatchRows(body.matches);
    return validateMatchRows(parsed.rows, {
      headerError: parsed.headerError,
      format: parsed.format,
    });
  }

  if (body?.csv != null && String(body.csv).trim() !== '') {
    const parsed = parseCsv(body.csv);
    return validateMatchRows(parsed.rows, {
      headerError: parsed.headerError,
      format: parsed.format,
    });
  }

  return validateMatchRows([]);
}

async function persistValidRows(validRows) {
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
        const found = findTeamInIndex(index, teamName);
        if (found) {
          teamId = found.id;
          recognizedTeamNames.add(found.name);
        } else {
          unknownTeamNames.add(teamName);
        }
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
  };
}

function validationPayload(result) {
  return {
    ok: result.ok,
    format: result.format || 'legacy',
    validCount: result.rows.length,
    invalidCount: result.invalidRows.length,
    rowCount: result.rows.length,
    errors: result.errors,
    invalidRows: result.invalidRows,
    preview: result.rows.slice(0, 10),
    headerError: result.headerError || null,
  };
}

/** Alleen valideren — geen database */
router.post(
  '/import/validate',
  admin(async (req, res, next) => {
    try {
      const result = resolveRows(req.body);
      res.json(validationPayload(result));
    } catch (err) {
      next(err);
    }
  }),
);

/**
 * Importeer uitsluitend geldige rijen.
 * Ongeldige rijen worden nooit opgeslagen (geen force).
 */
router.post(
  '/import',
  admin(async (req, res, next) => {
    try {
      const result = resolveRows(req.body);

      if (result.headerError && result.rows.length === 0) {
        return res.status(400).json({
          error: result.headerError,
          errors: result.errors,
          invalidRows: [],
          created: 0,
          format: result.format,
        });
      }

      if (result.rows.length === 0) {
        return res.status(400).json({
          error: 'Geen geldige wedstrijden om te importeren. Corrigeer de foute rijen in het grid.',
          errors: result.errors,
          invalidRows: result.invalidRows,
          created: 0,
          format: result.format,
        });
      }

      const { created, persistErrors, skippedDuplicates, teamsRecognized, unknownTeams } =
        await persistValidRows(result.rows);
      const planning = await trySyncPlanningFromMatches();

      if (created.length === 0 && skippedDuplicates === 0) {
        return res.status(400).json({
          error: 'Opslaan mislukt voor alle rijen.',
          errors: persistErrors,
          invalidRows: result.invalidRows,
          created: 0,
          format: result.format,
        });
      }

      const summary = {
        created: created.length,
        skippedDuplicates,
        matches: created,
        skipped: result.invalidRows.length,
        invalidRows: result.invalidRows,
        errors: [...result.errors, ...persistErrors],
        format: result.format,
        teamsRecognized: teamsRecognized.length,
        teamsRecognizedNames: teamsRecognized,
        unknownTeams,
        unknownTeamCount: unknownTeams.length,
        planningCreated: planning.created ?? 0,
        planningRemoved: planning.removed ?? 0,
        teamDutiesCreated: planning.teamDuties ?? 0,
      };

      if (created.length === 0 && skippedDuplicates > 0) {
        return res.status(200).json(summary);
      }

      res.status(201).json(summary);
    } catch (err) {
      next(err);
    }
  }),
);

router.delete(
  '/:id',
  admin(async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      await prisma.service.updateMany({ where: { matchId: id }, data: { matchId: null } });
      await prisma.match.delete({ where: { id } });
      await trySyncPlanningFromMatches();
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  }),
);

export default router;
