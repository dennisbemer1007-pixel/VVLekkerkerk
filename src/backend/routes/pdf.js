import PDFDocument from 'pdfkit';
import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { addWeeks, endOfDay, startOfDay, startOfWeek, toIsoDate } from '../lib/dates.js';
import { getPersonFromRequest } from '../lib/auth.js';
import { SLOT_TIMES } from '../lib/youthTeams.js';

const router = Router();

const DAY_LABELS = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag'];

/** Weekend-rijen zoals op het kantine-Excelrooster */
const WEEKEND_ROWS = [
  { slot: 'MORNING', type: 'BAR', label: 'Bar', time: SLOT_TIMES.MORNING.BAR },
  { slot: 'MORNING', type: 'KITCHEN', label: 'Keuken', time: SLOT_TIMES.MORNING.KITCHEN },
  { slot: 'AFTERNOON', type: 'BAR', label: 'Bar', time: SLOT_TIMES.AFTERNOON.BAR },
  { slot: 'AFTERNOON', type: 'KITCHEN', label: 'Keuken', time: SLOT_TIMES.AFTERNOON.KITCHEN },
  { slot: 'EVENING', type: 'BAR', label: 'Bar', time: SLOT_TIMES.EVENING.BAR },
  { slot: 'EVENING', type: 'KITCHEN', label: 'Keuken', time: SLOT_TIMES.EVENING.KITCHEN },
];

function dayIndex(d) {
  const day = new Date(d).getDay();
  return day === 0 ? 6 : day - 1;
}

function formatWeekRange(weekStart) {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  const fmt = (x) =>
    new Date(x).toLocaleDateString('nl-NL', { day: 'numeric', month: 'numeric' });
  return `${fmt(weekStart)} - ${fmt(end)}`;
}

function isoWeekNumber(ws) {
  const t = new Date(ws);
  t.setHours(0, 0, 0, 0);
  t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7));
  const week1 = new Date(t.getFullYear(), 0, 4);
  return (
    1 + Math.round(((t - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7)
  );
}

function namesOnly(service) {
  const names = (service.enrollments || []).map((e) => e.person.name).filter(Boolean);
  if (names.length) return names.join(', ');
  return '';
}

function cellTextWeekday(services) {
  if (!services.length) return 'gesloten';
  const parts = services
    .map((s) => namesOnly(s))
    .filter((n) => n.length > 0);
  if (!parts.length) return 'nog open';
  return parts.join('\n');
}

function inferSlot(service) {
  if (service.slot && service.slot !== 'EXTRA') return service.slot;
  const t = String(service.time || '');
  const start = t.match(/(\d{1,2})[:.](\d{2})/);
  if (!start) return 'EXTRA';
  const minutes = Number(start[1]) * 60 + Number(start[2]);
  if (minutes < 12 * 60) return 'MORNING';
  if (minutes < 16 * 60) return 'AFTERNOON';
  return 'EVENING';
}

function findWeekendService(services, row) {
  const matches = services.filter(
    (s) => s.type === row.type && inferSlot(s) === row.slot,
  );
  return matches[0] || null;
}

function weekendCellText(service) {
  if (!service) return 'gesloten';
  const names = namesOnly(service);
  return names || 'nog open';
}

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

function drawCell(doc, x, y, w, h, text, opts = {}) {
  const {
    bold = false,
    size = 6,
    align = 'left',
    fill = null,
    stroke = '#bbbbbb',
    color = '#000000',
    pad = 2,
  } = opts;

  if (fill) {
    doc.save().rect(x, y, w, h).fill(fill).restore();
  }
  doc.rect(x, y, w, h).strokeColor(stroke).lineWidth(0.5).stroke();

  const isClosed = String(text).trim().toLowerCase() === 'gesloten';
  doc
    .fillColor(isClosed ? '#888888' : color)
    .font(bold ? 'Helvetica-Bold' : 'Helvetica')
    .fontSize(size)
    .text(String(text), x + pad, y + pad, {
      width: w - pad * 2,
      height: h - pad * 2,
      align,
      ellipsis: true,
    });
  doc.fillColor('#000000');
}

/**
 * A4-rooster zoals club-Excel:
 * - weken = kolommen
 * - ma–vr = 1 rij per dag (tijd + namen of "gesloten")
 * - za/zo = aparte Bar/Keuken-rijen per dagdeel
 */
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

    const weekStarts = [];
    let cursor = startOfWeek(from);
    const last = startOfWeek(to);
    while (cursor <= last && weekStarts.length < 6) {
      weekStarts.push(new Date(cursor));
      cursor = new Date(cursor);
      cursor.setDate(cursor.getDate() + 7);
    }

    /** key: `${isoWeekStart}|${dayIndex}` → services[] */
    const byWeekDay = new Map();
    for (const s of services) {
      const key = `${toIsoDate(startOfWeek(s.date))}|${dayIndex(s.date)}`;
      if (!byWeekDay.has(key)) byWeekDay.set(key, []);
      byWeekDay.get(key).push(s);
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="vvl-rooster-6-weken.pdf"');

    // Liggend A4: past beter bij 4–6 weekkolommen (zoals clubprint)
    const doc = new PDFDocument({ margin: 24, size: 'A4', layout: 'landscape' });
    doc.pipe(res);

    const pageW = doc.page.width - 48;
    const left = 24;
    let y = 22;

    doc
      .fontSize(13)
      .font('Helvetica-Bold')
      .fillColor('#000000')
      .text('V.V. Lekkerkerk — Rooster kantinediensten', left, y, {
        width: pageW,
        align: 'center',
      });
    y = doc.y + 2;
    doc
      .fontSize(7)
      .font('Helvetica')
      .fillColor('#555555')
      .text('Alleen namen · bar & keuken', left, y, { width: pageW, align: 'center' });
    doc.fillColor('#000000');
    y = doc.y + 8;

    const labelW = 88;
    const colW = (pageW - labelW) / Math.max(weekStarts.length, 1);
    const headerH = 26;
    const weekdayH = 36;
    const weekendH = 18;
    const sectionH = 14;

    // —— Header: Week + datumbereik ——
    drawCell(doc, left, y, labelW, headerH, 'Dag / Tijd', {
      bold: true,
      size: 7,
      fill: '#f0f0f0',
      stroke: '#888888',
    });
    weekStarts.forEach((ws, i) => {
      const x = left + labelW + i * colW;
      drawCell(doc, x, y, colW, headerH, `Week ${isoWeekNumber(ws)}\n${formatWeekRange(ws)}`, {
        bold: true,
        size: 6.5,
        align: 'center',
        fill: '#f0f0f0',
        stroke: '#888888',
      });
    });
    y += headerH;

    const ensureSpace = (need) => {
      if (y + need > doc.page.height - 28) {
        doc.addPage({ size: 'A4', layout: 'landscape', margin: 24 });
        y = 24;
      }
    };

    // —— Maandag t/m vrijdag ——
    for (let di = 0; di < 5; di += 1) {
      ensureSpace(weekdayH);
      drawCell(doc, left, y, labelW, weekdayH, DAY_LABELS[di], {
        bold: true,
        size: 7,
        fill: '#fafafa',
        stroke: '#888888',
      });
      weekStarts.forEach((ws, i) => {
        const x = left + labelW + i * colW;
        const list = byWeekDay.get(`${toIsoDate(ws)}|${di}`) || [];
        const text = cellTextWeekday(list);
        drawCell(doc, x, y, colW, weekdayH, text, {
          size: text === 'gesloten' ? 7 : 5.5,
          align: text === 'gesloten' ? 'center' : 'left',
          stroke: '#cccccc',
        });
      });
      y += weekdayH;
    }

    // —— Zaterdag & zondag met Bar/Keuken-dagdelen ——
    for (const di of [5, 6]) {
      ensureSpace(sectionH + WEEKEND_ROWS.length * weekendH);

      drawCell(doc, left, y, labelW, sectionH, DAY_LABELS[di], {
        bold: true,
        size: 8,
        fill: '#e8e8e8',
        stroke: '#888888',
      });
      weekStarts.forEach((_ws, i) => {
        const x = left + labelW + i * colW;
        drawCell(doc, x, y, colW, sectionH, '', {
          fill: '#e8e8e8',
          stroke: '#888888',
        });
      });
      y += sectionH;

      for (const row of WEEKEND_ROWS) {
        drawCell(doc, left, y, labelW, weekendH, `${row.label}\n${row.time}`, {
          bold: true,
          size: 5.5,
          fill: row.type === 'BAR' ? '#f7f7f7' : '#ffffff',
          stroke: '#aaaaaa',
        });
        weekStarts.forEach((ws, i) => {
          const x = left + labelW + i * colW;
          const list = byWeekDay.get(`${toIsoDate(ws)}|${di}`) || [];
          const svc = findWeekendService(list, row);
          const text = weekendCellText(svc);
          drawCell(doc, x, y, colW, weekendH, text, {
            size: 6,
            align: text === 'gesloten' || text === 'nog open' ? 'center' : 'left',
            stroke: '#cccccc',
          });
        });
        y += weekendH;
      }
    }

    doc
      .fontSize(6.5)
      .fillColor('#666666')
      .text(
        `Gegenereerd ${new Date().toLocaleString('nl-NL')} — VVL Planning App`,
        left,
        doc.page.height - 18,
        { align: 'center', width: pageW },
      );

    doc.end();
  } catch (err) {
    next(err);
  }
});

export default router;
