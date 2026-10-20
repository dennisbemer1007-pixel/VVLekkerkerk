import PDFDocument from 'pdfkit';
import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { endOfWeek, startOfDay, startOfWeek } from '../lib/dates.js';
import { getPersonFromRequest } from '../lib/auth.js';
import {
  planRosterDocument,
  renderPlanningRoster,
  servicesForRoster,
  sixWeekRosterWindow,
} from '../lib/pdfRoster.js';
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
    // Gewone download: altijd 6 weken vanaf vandaag, ook als de aanvraag de hele planning meestuurt.
    const rosterWindow = sixWeekRosterWindow(now);
    const from = clubhouse ? startOfWeek(now) : rosterWindow.from;
    const to = clubhouse ? endOfWeek(from) : rosterWindow.to;
    const maxWeeks = clubhouse ? 1 : rosterWindow.maxWeeks;

    const services = await prisma.service.findMany({
      where: {
        active: true,
        draft: false,
        date: { gte: from, lte: to },
      },
      include: {
        enrollments: {
          include: { person: true, forTeam: true },
          orderBy: { createdAt: 'asc' },
        },
        teamDuties: {
          include: { team: true },
        },
        activity: { select: { id: true, name: true, type: true } },
      },
      orderBy: [{ date: 'asc' }, { time: 'asc' }],
    });

    const official = await planningIsOfficial();
    const rules = await prisma.serviceRule.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    const filename = clubhouse ? 'vvl-rooster-clubhuis.pdf' : 'vvl-rooster.pdf';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // margin 0: wij bepalen de layout zelf; PDFKit mag niet zelf een 2e pagina openen
    // wanneer celtekst tegen de ondermarge aankomt.
    // Dichte cellen (veel namen) → wrap + eventueel A3, nooit afkappen.
    const rosterServices = servicesForRoster(services);
    const plan = planRosterDocument({
      services: rosterServices,
      from,
      to,
      maxWeeks,
      clubhouse,
      rules,
    });
    const doc = new PDFDocument({
      margin: 0,
      size: plan.pageSize || 'A4',
      layout: 'landscape',
    });
    doc.pipe(res);
    renderPlanningRoster(doc, {
      services: rosterServices,
      from,
      to,
      official,
      clubhouse,
      maxWeeks,
      rules,
      pageSize: plan.pageSize || 'A4',
    });
    doc.end();
  } catch (err) {
    next(err);
  }
});

export default router;
