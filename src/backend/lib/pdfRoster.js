import { startOfWeek, toIsoDate } from './dates.js';
import { SLOT_TIMES } from './youthTeams.js';

export const DAY_LABELS = [
  'Maandag',
  'Dinsdag',
  'Woensdag',
  'Donderdag',
  'Vrijdag',
  'Zaterdag',
  'Zondag',
];

/** Zelfde dagdelen voor bar én keuken (kantine-print). */
export const SLOT_ROWS = [
  { slot: 'MORNING', type: 'BAR', label: 'Bar ochtend', time: SLOT_TIMES.MORNING.BAR },
  { slot: 'AFTERNOON', type: 'BAR', label: 'Bar middag', time: SLOT_TIMES.AFTERNOON.BAR },
  { slot: 'EVENING', type: 'BAR', label: 'Bar avond', time: SLOT_TIMES.EVENING.BAR },
  { slot: 'MORNING', type: 'KITCHEN', label: 'Keuken ochtend', time: '10:00 - 13:00' },
  { slot: 'AFTERNOON', type: 'KITCHEN', label: 'Keuken middag', time: '13:00 - 16:00' },
  { slot: 'EVENING', type: 'KITCHEN', label: 'Keuken laat', time: '16:00 - 19:00' },
];

export function dayIndex(d) {
  const day = new Date(d).getDay();
  return day === 0 ? 6 : day - 1;
}

export function inferSlot(service) {
  if (service?.slot && service.slot !== 'EXTRA') return service.slot;
  const t = String(service?.time || '');
  const start = t.match(/(\d{1,2})[:.](\d{2})/);
  if (!start) return 'EXTRA';
  const minutes = Number(start[1]) * 60 + Number(start[2]);
  if (minutes < 12 * 60) return 'MORNING';
  if (minutes < 16 * 60) return 'AFTERNOON';
  return 'EVENING';
}

export function servicesForSlotRow(services, row) {
  return (services || []).filter(
    (s) => s.type === row.type && inferSlot(s) === row.slot,
  );
}

export function namesOnly(service) {
  const names = (service?.enrollments || []).map((e) => e.person?.name).filter(Boolean);
  return names;
}

export function slotCellText(services) {
  if (!services?.length) return 'gesloten';
  const names = [...new Set(services.flatMap((s) => namesOnly(s)))];
  return names.length ? names.join(', ') : 'nog open';
}

/** Elke weekdag gebruikt dezelfde tijdsblok-rijen. */
export function rosterDaySections() {
  return DAY_LABELS.map((label, day) => ({ day, label, rows: SLOT_ROWS }));
}

export function weekStartsInRange(from, to, max = 6) {
  const weekStarts = [];
  let cursor = startOfWeek(from);
  const last = startOfWeek(to);
  while (cursor <= last && weekStarts.length < max) {
    weekStarts.push(new Date(cursor));
    cursor = new Date(cursor);
    cursor.setDate(cursor.getDate() + 7);
  }
  return weekStarts;
}

export function groupServicesByWeekDay(services) {
  const byWeekDay = new Map();
  for (const s of services || []) {
    const key = `${toIsoDate(startOfWeek(s.date))}|${dayIndex(s.date)}`;
    if (!byWeekDay.has(key)) byWeekDay.set(key, []);
    byWeekDay.get(key).push(s);
  }
  return byWeekDay;
}

export function formatWeekRange(weekStart) {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  const fmt = (x) =>
    new Date(x).toLocaleDateString('nl-NL', { day: 'numeric', month: 'numeric' });
  return `${fmt(weekStart)} - ${fmt(end)}`;
}

export function isoWeekNumber(ws) {
  const t = new Date(ws);
  t.setHours(0, 0, 0, 0);
  t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7));
  const week1 = new Date(t.getFullYear(), 0, 4);
  return 1 + Math.round(((t - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
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

/** Tekent het liggende A4-rooster op een pdfkit-document. */
export function renderPlanningRoster(doc, {
  services,
  from,
  to,
  generatedAt = new Date(),
  official = false,
  clubhouse = false,
  maxWeeks = 6,
}) {
  const weekStarts = weekStartsInRange(from, to, clubhouse ? 1 : maxWeeks);
  const byWeekDay = groupServicesByWeekDay(services || []);
  const daySections = rosterDaySections();

  const pageW = doc.page.width - 48;
  const left = 24;
  let y = 22;

  const labelW = 88;
  const colW = (pageW - labelW) / Math.max(weekStarts.length, 1);
  const headerH = 26;
  const sectionH = 14;
  const rowH = 18;

  const drawTitle = () => {
    doc
      .fontSize(13)
      .font('Helvetica-Bold')
      .fillColor('#000000')
      .text(
        official
          ? 'V.V. Lekkerkerk — Officieel rooster kantinediensten'
          : 'V.V. Lekkerkerk — Rooster kantinediensten',
        left,
        y,
        {
          width: pageW,
          align: 'center',
        },
      );
    y = doc.y + 2;
    doc
      .fontSize(7)
      .font('Helvetica')
      .fillColor('#555555')
      .text(
        clubhouse
          ? 'Clubhuisprint · bar én keuken · namen per tijdsblok'
          : 'Bar- en keukendienst per tijdsblok (ma–zo)',
        left,
        y,
        {
          width: pageW,
          align: 'center',
        },
      );
    doc.fillColor('#000000');
    y = doc.y + 8;
  };

  const drawWeekHeader = () => {
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
  };

  const ensureSpace = (need) => {
    if (y + need > doc.page.height - 28) {
      doc.addPage({ size: 'A4', layout: 'landscape', margin: 24 });
      y = 24;
      drawWeekHeader();
    }
  };

  drawTitle();
  drawWeekHeader();

  for (const section of daySections) {
    ensureSpace(sectionH + SLOT_ROWS.length * rowH);

    drawCell(doc, left, y, labelW, sectionH, section.label, {
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

    for (const row of section.rows) {
      drawCell(doc, left, y, labelW, rowH, `${row.label}\n${row.time}`, {
        bold: true,
        size: 5.5,
        fill: '#f7f7f7',
        stroke: '#aaaaaa',
      });
      weekStarts.forEach((ws, i) => {
        const x = left + labelW + i * colW;
        const list = byWeekDay.get(`${toIsoDate(ws)}|${section.day}`) || [];
        const text = slotCellText(servicesForSlotRow(list, row));
        drawCell(doc, x, y, colW, rowH, text, {
          size: 6,
          align: text === 'gesloten' || text === 'nog open' ? 'center' : 'left',
          stroke: '#cccccc',
        });
      });
      y += rowH;
    }
  }

  doc
    .fontSize(6.5)
    .fillColor('#666666')
    .text(
      `Gegenereerd ${generatedAt.toLocaleString('nl-NL')} — VVL Planning App`,
      left,
      doc.page.height - 18,
      { align: 'center', width: pageW },
    );
}

