import PDFDocument from 'pdfkit';
import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { addWeeks, endOfDay, endOfWeek, startOfDay, startOfWeek } from '../lib/dates.js';
import { getPersonFromRequest } from '../lib/auth.js';
import { renderPlanningRoster, servicesForRoster } from '../lib/pdfRoster.js';
import { planningIsOfficial } from '../lib/official.js';

const router = Router();

async function requirePdfAuth(req, res, next) {
  try {
    const person = await getPersonFromRequest(req);
    if (!person) {
      return res.status(401).json({ error: 'Je bent niet ingelogd' });
    }
    req.person = person;
    next();
  } catch (err) {
    next(err);
  }
}

router.get('/planning', requirePdfAuth, async (req, res, next) => {
  try {
    const now = startOfDay(new Date());
    const clubhouse = req.query.clubhouse === 'true' || req.query.week === 'current';
    const hasExplicitRange = Boolean(req.query.from || req.query.to);
    // Standaard (geen clubhuisprint, geen expliciete van/tot): komende 6 weken.
    // `weeks=6` (of geen weeks-parameter) geeft hetzelfde resultaat.
    const useSixWeeksDefault = !clubhouse && !hasExplicitRange;
    const from = req.query.from
      ? startOfDay(new Date(req.query.from))
      : clubhouse
        ? startOfWeek(now)
        : now;
    const to = req.query.to
      ? endOfDay(new Date(req.query.to))
      : clubhouse
        ? endOfWeek(from)
        : endOfDay(new Date(addWeeks(from, 6).getTime() - 24 * 60 * 60 * 1000));
    // Niet-clubhuis: standaard/6-wekenpad blijft altijd binnen 6 weken.
    const maxWeeks = clubhouse ? 1 : useSixWeeksDefault ? 6 : 60;

    const services = await prisma.service.findMany({
      where: {
        active: true,
        draft: false,
        date: { gte: from, lte: to },
      },
      include: {
        enrollments: {
          include: { person: true },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: [{ date: 'asc' }, { time: 'asc' }],
    });

    const official = await planningIsOfficial();
    const filename = clubhouse ? 'vvl-rooster-clubhuis.pdf' : 'vvl-rooster.pdf';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const doc = new PDFDocument({ margin: 24, size: 'A4', layout: 'landscape' });
    doc.pipe(res);
    renderPlanningRoster(doc, {
      services: servicesForRoster(services),
      from,
      to,
      official,
      clubhouse,
      maxWeeks,
    });
    doc.end();
  } catch (err) {
    next(err);
  }
});

export default router;
