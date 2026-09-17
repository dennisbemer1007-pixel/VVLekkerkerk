import PDFDocument from 'pdfkit';
import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { endOfDay, endOfWeek, startOfDay, startOfWeek } from '../lib/dates.js';
import { getPersonFromRequest } from '../lib/auth.js';
import { renderPlanningRoster } from '../lib/pdfRoster.js';
import { planningIsOfficial } from '../lib/official.js';
import { periodFromRound } from '../lib/planningPeriod.js';

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
    const roundPeriod = await periodFromRound(prisma);
    const from = req.query.from
      ? startOfDay(new Date(req.query.from))
      : clubhouse
        ? startOfWeek(now)
        : roundPeriod.from;
    const to = req.query.to
      ? endOfDay(new Date(req.query.to))
      : clubhouse
        ? endOfWeek(from)
        : roundPeriod.to;

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
      services,
      from,
      to,
      official,
      clubhouse,
      maxWeeks: clubhouse ? 1 : 60,
    });
    doc.end();
  } catch (err) {
    next(err);
  }
});

export default router;
