import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { requireRole, getPersonFromRequest } from '../lib/auth.js';
import { ADMIN_ROLES } from '../lib/roles.js';
import { parseCsv, validateMatchRows } from '../lib/csvMatches.js';
import { parseMatchDateInput } from '../lib/authz.js';

const router = Router();
const admin = (...args) => requireRole(...ADMIN_ROLES)(...args);

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
        orderBy: { date: 'asc' },
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
      const { date, home, opponent, note, teamId } = req.body;
      if (!date) return res.status(400).json({ error: 'Datum is verplicht' });
      const parsed = parseMatchDateInput(date);
      if (!parsed) return res.status(400).json({ error: 'Ongeldige datum' });
      const match = await prisma.match.create({
        data: {
          date: parsed,
          home: home !== false,
          opponent: opponent?.trim() || null,
          note: note?.trim() || null,
          teamId: teamId ? Number(teamId) : null,
        },
        include: { team: true },
      });
      res.status(201).json(match);
    } catch (err) {
      next(err);
    }
  }),
);

function resolveRows(body) {
  if (Array.isArray(body?.matches) && body.matches.length) {
    const withRows = body.matches.map((r, i) => ({
      __row: r.__row ?? i + 1,
      date: r.date || r.Datum || r.datum || '',
      home: r.home ?? r.thuis ?? r.Home ?? '',
      opponent: (r.opponent || r.tegenstander || r.Opponent || '').toString(),
      team: (r.team || r.Team || r.ploeg || '').toString(),
      note: (r.note || r.opmerking || '').toString(),
    }));
    return validateMatchRows(withRows);
  }
  if (body?.csv != null && String(body.csv).trim() !== '') {
    const parsed = parseCsv(body.csv);
    return validateMatchRows(parsed.rows, { headerError: parsed.headerError });
  }
  return validateMatchRows([]);
}

async function persistValidRows(validRows) {
  const teams = await prisma.team.findMany();
  const byName = new Map(teams.map((t) => [t.name.toLowerCase(), t]));
  const created = [];
  const persistErrors = [];

  for (const row of validRows) {
    try {
      let teamId = null;
      const teamName = (row.team || '').trim();
      if (teamName) {
        const found = byName.get(teamName.toLowerCase());
        if (found) teamId = found.id;
        else {
          const createdTeam = await prisma.team.create({ data: { name: teamName } });
          byName.set(teamName.toLowerCase(), createdTeam);
          teamId = createdTeam.id;
        }
      }

          const match = await prisma.match.create({
            data: {
              date: parseMatchDateInput(row.date),
              home: row.home !== false,
              opponent: row.opponent || null,
              note: row.note || null,
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

  return { created, persistErrors };
}

/** Alleen valideren — geen database */
router.post(
  '/import/validate',
  admin(async (req, res, next) => {
    try {
      const result = resolveRows(req.body);
      res.json({
        ok: result.ok,
        validCount: result.rows.length,
        invalidCount: result.invalidRows.length,
        rowCount: result.rows.length,
        errors: result.errors,
        invalidRows: result.invalidRows,
        preview: result.rows.slice(0, 10),
        headerError: result.headerError || null,
      });
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
        });
      }

      if (result.rows.length === 0) {
        return res.status(400).json({
          error: 'Geen geldige wedstrijden om te importeren. Corrigeer de foute rijen in het grid.',
          errors: result.errors,
          invalidRows: result.invalidRows,
          created: 0,
        });
      }

      const { created, persistErrors } = await persistValidRows(result.rows);

      if (created.length === 0) {
        return res.status(400).json({
          error: 'Opslaan mislukt voor alle rijen.',
          errors: persistErrors,
          invalidRows: result.invalidRows,
          created: 0,
        });
      }

      res.status(201).json({
        created: created.length,
        matches: created,
        skipped: result.invalidRows.length,
        invalidRows: result.invalidRows,
        errors: [...result.errors, ...persistErrors],
      });
    } catch (err) {
      next(err);
    }
  }),
);

router.delete(
  '/:id',
  admin(async (req, res, next) => {
    try {
      await prisma.match.delete({ where: { id: Number(req.params.id) } });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  }),
);

export default router;
