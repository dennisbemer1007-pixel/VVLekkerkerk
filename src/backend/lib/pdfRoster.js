import { startOfDay, startOfWeek, toIsoDate } from './dates.js';
import { chooseCanonicalService, serviceDedupeKey } from './serviceDedup.js';
import { parseTimeStartMinutes } from './time.js';
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

/** Weekend: bar + keuken. Doordeweeks: alleen bar avond. */
export const SLOT_ROWS = [
  { slot: 'MORNING', type: 'BAR', label: 'Bar ochtend', time: SLOT_TIMES.MORNING.BAR },
  { slot: 'AFTERNOON', type: 'BAR', label: 'Bar middag', time: SLOT_TIMES.AFTERNOON.BAR },
  { slot: 'EVENING', type: 'BAR', label: 'Bar avond', time: SLOT_TIMES.EVENING.BAR },
  { slot: 'MORNING', type: 'KITCHEN', label: 'Keuken ochtend', time: '10:00 - 13:00' },
  { slot: 'AFTERNOON', type: 'KITCHEN', label: 'Keuken middag', time: '13:00 - 16:00' },
  { slot: 'EVENING', type: 'KITCHEN', label: 'Keuken laat', time: '16:00 - 19:00' },
];

export const WEEKDAY_SLOT_ROWS = [{ slot: 'EVENING', type: 'BAR', label: 'Bar avond', time: SLOT_TIMES.EVENING.BAR }];

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
  if (minutes < 16 * 60 + 30) return 'AFTERNOON';
  return 'EVENING';
}

/** Jaarplanning / handmatige extra dienst: niet in de vaste ochtend/middag/avond-rij. */
export function isExtraRosterService(service) {
  if (!service) return false;
  if (service.slot === 'EXTRA') return true;
  if (service.activityId || service.activity?.id) return true;
  return false;
}

export function serviceEventLabel(service) {
  return String(service?.activity?.name || '').trim() || null;
}

function minutesClosest(service, rowTime) {
  const a = parseTimeStartMinutes(service?.time);
  const b = parseTimeStartMinutes(rowTime);
  if (a == null || b == null) return 9999;
  return Math.abs(a - b);
}

/**
 * Eén dienst per vaste roosterrij. Dubbele records (zelfde tijd) worden samengevoegd;
 * extra jaarplanning-diensten horen hier niet.
 */
export function servicesForSlotRow(services, row) {
  const matching = (services || []).filter(
    (s) => s.type === row.type && !isExtraRosterService(s) && inferSlot(s) === row.slot,
  );
  if (!matching.length) return [];
  const byKey = new Map();
  for (const service of matching) {
    const key = serviceDedupeKey(service);
    const prev = byKey.get(key);
    byKey.set(key, prev ? chooseCanonicalService([prev, service]) : service);
  }
  const unique = [...byKey.values()];
  if (unique.length === 1) return unique;
  unique.sort((a, b) => minutesClosest(a, row.time) - minutesClosest(b, row.time));
  return [unique[0]];
}

/** Extra diensten (jaarplanning e.d.) voor een dag, op begintijd. */
export function extraServicesForDay(services) {
  const extras = (services || []).filter((s) => s && s.active !== false && !s.draft && isExtraRosterService(s));
  const byKey = new Map();
  for (const service of extras) {
    const key = serviceDedupeKey(service);
    const prev = byKey.get(key);
    byKey.set(key, prev ? chooseCanonicalService([prev, service]) : service);
  }
  return [...byKey.values()].sort((a, b) => {
    const da = parseTimeStartMinutes(a.time) ?? 0;
    const db = parseTimeStartMinutes(b.time) ?? 0;
    return da - db;
  });
}

export function extraCellText(service) {
  if (!service) return 'gesloten';
  const names = slotCellText([service]);
  const event = serviceEventLabel(service);
  if (event && names && names !== 'gesloten') return `${event}: ${names}`;
  if (event) return event;
  return names;
}

/** Jaarplanning-extra's plus diensten die niet in een vaste ochtend/middag/avond-rij pasten. */
export function additionalRosterServices(dayServices, dayRows) {
  const extras = extraServicesForDay(dayServices);
  const used = new Set();
  for (const row of dayRows || []) {
    for (const service of servicesForSlotRow(dayServices, row)) used.add(service.id);
  }
  for (const service of extras) used.add(service.id);
  const leftovers = [];
  const byKey = new Map();
  for (const service of dayServices || []) {
    if (!service || service.active === false || service.draft || used.has(service.id)) continue;
    const key = serviceDedupeKey(service);
    const prev = byKey.get(key);
    byKey.set(key, prev ? chooseCanonicalService([prev, service]) : service);
  }
  leftovers.push(...byKey.values());
  return [...extras, ...leftovers].sort((a, b) => {
    const da = parseTimeStartMinutes(a.time) ?? 0;
    const db = parseTimeStartMinutes(b.time) ?? 0;
    return da - db;
  });
}

/** Actieve niet-concept diensten (ook zonder namen — voor open plekken / teamnamen). */
export function servicesForRoster(services) {
  return (services || []).filter((service) => {
    if (!service || service.active === false || service.draft === true) return false;
    return true;
  });
}

export function namesOnly(service) {
  const names = (service?.enrollments || []).map((e) => e.person?.name).filter(Boolean);
  return names;
}

function teamSpotTokens(service) {
  const duties = service?.teamDuties || [];
  const named = (service?.enrollments || []).filter((row) => row.kind === 'TEAM' && !row.noShow);
  const tokens = [];
  for (const duty of duties) {
    const teamId = Number(duty.teamId ?? duty.team?.id);
    const teamName = duty.team?.name || 'Team';
    const reserved = Math.max(1, Number(duty.reserved) || 1);
    const forTeam = named.filter((row) => Number(row.forTeamId || row.forTeam?.id) === teamId);
    for (let index = 0; index < reserved; index += 1) {
      const enrollment = forTeam[index];
      if (enrollment?.person?.name) tokens.push({ kind: 'name', text: enrollment.person.name });
      else tokens.push({ kind: 'team', text: teamName });
    }
  }
  return tokens;
}

function openSpotTokens(service) {
  const required = Math.max(0, Number(service?.required) || 0);
  const tokens = [];
  const personal = (service?.enrollments || []).filter(
    (row) => row.kind !== 'TEAM' && !row.noShow && row.person?.name,
  );
  for (const row of personal) tokens.push({ kind: 'name', text: row.person.name });
  tokens.push(...teamSpotTokens(service));
  if (!tokens.length) {
    for (const name of namesOnly(service)) tokens.push({ kind: 'name', text: name });
  }
  const stillOpen = Math.max(0, required - tokens.length);
  for (let i = 0; i < stillOpen; i += 1) tokens.push({ kind: 'open', text: 'open plek' });
  return tokens;
}

export function slotCellText(services) {
  if (!services?.length) return 'gesloten';
  const tokens = services.flatMap((s) => openSpotTokens(s));
  if (!tokens.length) return 'nog open';
  // Unieke persoonsnamen; teamplekken en open plekken blijven elk zichtbaar.
  const seen = new Set();
  const parts = [];
  for (const token of tokens) {
    if (token.kind === 'name') {
      if (seen.has(token.text)) continue;
      seen.add(token.text);
    }
    parts.push(token.text);
  }
  return parts.join(', ') || 'nog open';
}

export function slotCellHasOpen(services) {
  if (!services?.length) return false;
  return services.some((s) => openSpotTokens(s).some((t) => t.kind === 'open')) ||
    slotCellText(services) === 'nog open';
}

export function rowLabelTime(row, services) {
  const real = (services || []).map((s) => String(s.time || '').trim()).find(Boolean);
  return real || row.time;
}

/** Doordeweeks alleen bar avond; weekend alle rijen. */
export function rosterDaySections() {
  return DAY_LABELS.map((label, day) => ({
    day,
    label,
    rows: day <= 4 ? WEEKDAY_SLOT_ROWS : SLOT_ROWS,
  }));
}

/** Rooster-PDF: altijd 6 weken vanaf de download-dag, niet de hele planning. */
export function sixWeekRosterWindow(now = new Date()) {
  const from = startOfDay(now);
  const to = new Date(from);
  to.setDate(to.getDate() + 6 * 7 - 1);
  to.setHours(23, 59, 59, 999);
  return { from, to, maxWeeks: 6 };
}

export function weekStartsInRange(from, to, max = 60) {
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
  maxWeeks = 60,
}) {
  const allWeeks = weekStartsInRange(from, to, clubhouse ? 1 : maxWeeks);
  const byWeekDay = groupServicesByWeekDay(services || []);
  const daySections = rosterDaySections();
  const chunkSize = clubhouse ? 1 : 6;
  const chunks = [];
  for (let i = 0; i < Math.max(allWeeks.length, 1); i += chunkSize) {
    chunks.push(allWeeks.slice(i, i + chunkSize));
  }

  const pageW = doc.page.width - 48;
  const left = 24;
  const labelW = 88;
  const headerH = 26;
  const sectionH = 14;
  const rowH = 18;

  chunks.forEach((weekStarts, chunkIndex) => {
    if (chunkIndex > 0) {
      doc.addPage({ size: 'A4', layout: 'landscape', margin: 24 });
    }
    let y = 22;
    const colW = (pageW - labelW) / Math.max(weekStarts.length, 1);

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
            : 'Alleen de komende 6 weken vanaf vandaag · bar en keuken',
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
      ensureSpace(sectionH + section.rows.length * rowH);

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
        // Eerste weekkolom voor voorbeeldtijd in label; cellen gebruiken echte tijden via tekst
        const sampleList = weekStarts.length
          ? servicesForSlotRow(byWeekDay.get(`${toIsoDate(weekStarts[0])}|${section.day}`) || [], row)
          : [];
        const labelTime = rowLabelTime(row, sampleList);
        drawCell(doc, left, y, labelW, rowH, `${row.label}\n${labelTime}`, {
          bold: true,
          size: 5.5,
          fill: '#f7f7f7',
          stroke: '#aaaaaa',
        });
        weekStarts.forEach((ws, i) => {
          const x = left + labelW + i * colW;
          const list = byWeekDay.get(`${toIsoDate(ws)}|${section.day}`) || [];
          const cellServices = servicesForSlotRow(list, row);
          const text = slotCellText(cellServices);
          const hasOpen = slotCellHasOpen(cellServices);
          drawCell(doc, x, y, colW, rowH, text, {
            size: 6,
            align: text === 'gesloten' || text === 'nog open' ? 'center' : 'left',
            stroke: '#cccccc',
            fill: hasOpen ? '#fff3cd' : null,
            color: hasOpen && /open plek/i.test(text) ? '#7a4e00' : '#000000',
          });
        });
        y += rowH;
      }

      const extrasPerWeek = weekStarts.map((ws) =>
        additionalRosterServices(byWeekDay.get(`${toIsoDate(ws)}|${section.day}`) || [], section.rows),
      );
      const extraCount = extrasPerWeek.reduce((max, list) => Math.max(max, list.length), 0);
      for (let extraIndex = 0; extraIndex < extraCount; extraIndex += 1) {
        ensureSpace(rowH);
        const sample = extrasPerWeek.map((list) => list[extraIndex]).find(Boolean);
        const extraLabel = serviceEventLabel(sample) || 'Extra';
        const extraTime = String(sample?.time || '').trim();
        drawCell(doc, left, y, labelW, rowH, `${extraLabel}\n${extraTime}`, {
          bold: true,
          size: 5.5,
          fill: '#f7f7f7',
          stroke: '#aaaaaa',
        });
        weekStarts.forEach((_ws, i) => {
          const x = left + labelW + i * colW;
          const extra = extrasPerWeek[i][extraIndex];
          const text = extraCellText(extra);
          const hasOpen = extra ? slotCellHasOpen([extra]) : false;
          drawCell(doc, x, y, colW, rowH, text, {
            size: 6,
            align: text === 'gesloten' ? 'center' : 'left',
            stroke: '#cccccc',
            fill: hasOpen ? '#fff3cd' : null,
            color: hasOpen && /open plek/i.test(text) ? '#7a4e00' : '#000000',
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
  });
}
