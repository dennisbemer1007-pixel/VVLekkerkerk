import PDFDocument from 'pdfkit';
import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { addWeeks, endOfDay, startOfDay } from '../lib/dates.js';
import { getPersonFromRequest } from '../lib/auth.js';
import { renderPlanningRoster } from '../lib/pdfRoster.js';

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
    const defaultTo = endOfDay(addWeeks(now, 6));
    const from = req.query.from ? startOfDay(new Date(req.query.from)) : now;
    const to = req.query.to ? endOfDay(new Date(req.query.to)) : defaultTo;

    const services = await prisma.service.findMany({
      where: {
        active: true,
        draft: false,
        type: 'BAR',
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

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="vvl-rooster-6-weken.pdf"');

    const doc = new PDFDocument({ margin: 24, size: 'A4', layout: 'landscape' });
    doc.pipe(res);
    renderPlanningRoster(doc, { services, from, to });
    doc.end();
  } catch (err) {
    next(err);
  }
});

export default router;
