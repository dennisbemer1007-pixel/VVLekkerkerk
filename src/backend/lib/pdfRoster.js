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

export const WEEKDAY_SLOT_ROWS = [{ slot: 'EVENING', type: 'BAR', label: 'Bar avond', time: '18:30 - 22:00' }];

/** Zondag: echte standaardtijden uit de dienstregels (niet de zaterdag-jeugdslots). */
export const SUNDAY_SLOT_ROWS = [
  { slot: 'MORNING', type: 'BAR', label: 'Bar ochtend', time: '09:00 - 13:00' },
  { slot: 'AFTERNOON', type: 'BAR', label: 'Bar middag', time: '13:00 - 16:00' },
  { slot: 'EVENING', type: 'BAR', label: 'Bar avond', time: '16:30 - 19:30' },
  { slot: 'MORNING', type: 'KITCHEN', label: 'Keuken ochtend', time: '10:00 - 13:00' },
  { slot: 'AFTERNOON', type: 'KITCHEN', label: 'Keuken middag', time: '12:00 - 15:00' },
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
  if (minutes < 16 * 60 + 30) return 'AFTERNOON';
  return 'EVENING';
}

/**
 * Jaarplanning-activiteit blijft in de extra-rij.
 * Handmatige bar/keuken (ook met slot EXTRA) horen in de vaste kolom op type + tijd.
 */
export function isExtraRosterService(service) {
  if (!service) return false;
  if (service.activityId || service.activity?.id) return true;
  if (service.type === 'BAR' || service.type === 'KITCHEN') return false;
  return service.slot === 'EXTRA';
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

function clockWindow(time) {
  const match = String(time || '').match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const start = Number(match[1]) * 60 + Number(match[2]);
  let end = Number(match[3]) * 60 + Number(match[4]);
  if (end <= start) end += 24 * 60;
  return [start, end];
}

/** 19:30–00:00 overlapt de avondbar 16:30–19:30 niet; 08:00–13:00 overlapt 09:00–13:00 wel. */
export function timeOverlapsRow(serviceTime, rowTime) {
  const service = clockWindow(serviceTime);
  const row = clockWindow(rowTime);
  if (!service || !row) return true;
  return service[0] < row[1] && row[0] < service[1];
}

/**
 * Eén dienst per vaste roosterrij. Dubbele records (zelfde tijd) worden samengevoegd;
 * extra jaarplanning-diensten horen hier niet.
 */
export function servicesForSlotRow(services, row) {
  const matching = (services || []).filter(
    (s) =>
      s.type === row.type &&
      !isExtraRosterService(s) &&
      inferSlot(s) === row.slot &&
      timeOverlapsRow(s.time, row.time),
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
      if (enrollment?.person?.name) {
        const team =
          duty.team?.name || enrollment.forTeam?.name || teamName;
        tokens.push({
          kind: 'name',
          text: team ? `${enrollment.person.name} (${team})` : enrollment.person.name,
        });
      } else tokens.push({ kind: 'team', text: teamName });
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
  for (const row of personal) {
    const coordinator =
      row.source === 'TEAM' ||
      /Ingevuld door de bardienstcoördinator/i.test(String(row.reason || ''));
    const team = coordinator ? row.forTeam?.name || row.person?.team?.name || '' : '';
    tokens.push({
      kind: 'name',
      text: team ? `${row.person.name} (${team})` : row.person.name,
    });
  }
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

function hhmm(value) {
  const match = String(value || '').match(/(\d{1,2}):(\d{2})/);
  return match ? `${String(Number(match[1])).padStart(2, '0')}:${match[2]}` : '';
}

/** Tijd van de dienstregel voor deze roosterrij (weekdag + type + slot). */
export function ruleTimeForRow(row, weekday, rules) {
  const matches = (rules || []).filter((rule) => {
    if (!rule || rule.active === false) return false;
    if (Number(rule.weekday) !== Number(weekday)) return false;
    if (rule.type !== row.type) return false;
    const slot = rule.slot && rule.slot !== 'EXTRA'
      ? rule.slot
      : inferSlot({ time: `${rule.startTime} - ${rule.endTime}`, slot: rule.slot });
    return slot === row.slot;
  });
  if (!matches.length) return String(row.time || '').trim();
  const best = [...matches].sort(
    (a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0) || (Number(a.id) || 0) - (Number(b.id) || 0),
  )[0];
  const start = hhmm(best.startTime);
  const end = hhmm(best.endTime);
  if (!start || !end) return String(row.time || '').trim();
  return `${start} - ${end}`;
}

/**
 * Labeltijd is de dienstregel van de rij.
 * Eén afwijkende dienst (ook als die overlapt) bepaalt de rij niet.
 */
export function rowLabelTime(row, _services) {
  const regel = String(row?.time || '').trim();
  if (regel) return regel;
  const fitting = (_services || []).map((s) => String(s.time || '').trim()).filter(Boolean);
  return fitting[0] || '';
}

/** Doordeweeks alleen bar avond; zaterdag jeugdslots; zondag clubtijden. */
export function rosterDaySections(rules) {
  return DAY_LABELS.map((label, day) => {
    const base = day <= 4 ? WEEKDAY_SLOT_ROWS : day === 6 ? SUNDAY_SLOT_ROWS : SLOT_ROWS;
    if (!rules?.length) return { day, label, rows: base };
    const weekday = day === 6 ? 0 : day + 1;
    return {
      day,
      label,
      rows: base.map((row) => ({ ...row, time: ruleTimeForRow(row, weekday, rules) })),
    };
  });
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

/** Voettekst: altijd Nederlandse tijd (niet UTC van de server). */
export function formatGeneratedAt(date = new Date(), timeZone = 'Europe/Amsterdam') {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (type) => parts.find((p) => p.type === type)?.value || '';
  return `${get('day')}-${get('month')}-${get('year')}, ${get('hour')}:${get('minute')}:${get('second')}`;
}

/** Liggende paginamaten (PDFKit). */
export const ROSTER_PAGE_SIZES = {
  A4: { size: 'A4', width: 841.89, height: 595.28 },
  A3: { size: 'A3', width: 1190.55, height: 841.89 },
};

/**
 * Namen volledig: komma-lijst → één naam per regel (geen ellipsis/afkappen).
 */
export function wrapRosterCellText(text) {
  const raw = String(text ?? '');
  if (!raw || raw === 'gesloten' || raw === 'nog open') return raw;
  if (raw.includes('\n')) return raw;
  // "A, B, open plek" → regels; behoud "open plek" als eigen regel.
  const parts = raw.split(/\s*,\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 1) return raw;
  return parts.join('\n');
}

/** Schatting regels tekst in een cel (Helvetica ≈ 0.5× fontSize per teken). */
export function estimateCellLines(text, width, fontSize, pad = 1.5) {
  const wrapped = wrapRosterCellText(text);
  if (!wrapped) return 1;
  const usable = Math.max(8, width - pad * 2);
  const charW = Math.max(2.2, fontSize * 0.52);
  const charsPerLine = Math.max(4, Math.floor(usable / charW));
  let lines = 0;
  for (const paragraph of wrapped.split('\n')) {
    const len = paragraph.length || 1;
    lines += Math.max(1, Math.ceil(len / charsPerLine));
  }
  return Math.max(1, lines);
}

/**
 * Compacte maten zodat het rooster op 1 liggende pagina past.
 * maxLinesPerRow: dichtste cel (namen); rijen worden hoger i.p.v. afkappen.
 * Kiest A3 als A4 te krap is bij leesbare lettergrootte.
 */
export function computeRosterPageLayout({
  pageHeight = ROSTER_PAGE_SIZES.A4.height,
  pageWidth = ROSTER_PAGE_SIZES.A4.width,
  sectionCount = 7,
  rowCount = 0,
  extraCount = 0,
  maxLinesPerRow = 1,
  weekCount = 6,
} = {}) {
  const top = 14;
  const footerReserve = 28;
  const titleH = 28;
  const labelW = 88;
  const leftRight = 48;
  const colW = (pageWidth - leftRight - labelW) / Math.max(weekCount, 1);
  const budget = pageHeight - top - footerReserve - titleH;
  const totalRows = rowCount + extraCount;

  let cellSize = 5.5;
  let labelSize = 5.1;
  let sectionLabelSize = 7.2;
  let titleSize = 11.5;
  let headerH = 20;
  let sectionH = 11;
  let lineH = cellSize + 0.8;
  let rowH = Math.max(15.5, maxLinesPerRow * lineH + 3);

  const needed = () => headerH + sectionCount * sectionH + totalRows * rowH;

  // Eerst lettertype/rij omlaag tot het past; nooit namen afkappen.
  while (needed() > budget && cellSize > 3.6) {
    cellSize -= 0.2;
    labelSize = Math.max(3.4, labelSize - 0.15);
    sectionLabelSize = Math.max(5.5, sectionLabelSize - 0.15);
    titleSize = Math.max(9, titleSize - 0.15);
    headerH = Math.max(14, headerH - 0.25);
    sectionH = Math.max(8, sectionH - 0.2);
    lineH = cellSize + 0.7;
    rowH = Math.max(cellSize + 2, maxLinesPerRow * lineH + 2);
  }

  // Herbepaal regels bij dit lettertype (dunnere kolom = meer wraps).
  const linesAtSize = Math.max(
    1,
    estimateCellLines('X'.repeat(28), colW, cellSize),
    maxLinesPerRow,
  );
  const linesNeeded = Math.max(maxLinesPerRow, linesAtSize);
  // Eén regel: leesbare minimumhoogte; meerdere naamregels: hoogte volgt het aantal regels.
  rowH = Math.max(
    linesNeeded <= 1 ? 15.5 : cellSize + 2,
    linesNeeded * (cellSize + 0.7) + 2,
  );

  while (needed() > budget && cellSize > 3.4) {
    cellSize -= 0.15;
    labelSize = Math.max(3.2, labelSize - 0.1);
    lineH = cellSize + 0.65;
    rowH = Math.max(
      linesNeeded <= 1 ? Math.min(15.5, cellSize + 10) : cellSize + 2,
      linesNeeded * lineH + 2,
    );
    headerH = Math.max(13, headerH - 0.15);
    sectionH = Math.max(7.5, sectionH - 0.1);
  }

  // Laatste redmiddel: rijhoogte forceren zodat alles op 1 pagina past.
  // Tekst blijft zonder ellipsis (clip in cel); liever krappe cel dan 2e pagina.
  let forcedFit = false;
  const naturalRowH = rowH;
  if (needed() > budget && totalRows > 0) {
    forcedFit = true;
    const rowsBudget = budget - headerH - sectionCount * sectionH;
    if (rowsBudget > totalRows * (cellSize + 1.2)) {
      rowH = rowsBudget / totalRows;
    } else {
      headerH = Math.max(12, headerH - 2);
      sectionH = Math.max(7, sectionH - 1);
      const retryBudget = budget - headerH - sectionCount * sectionH;
      rowH = Math.max(cellSize + 1.2, retryBudget / totalRows);
    }
  }

  // Comfortabel: natuurlijke rijhoogte voor alle naamregels, leesbaar lettertype.
  const comfortable =
    !forcedFit &&
    cellSize >= 4.2 &&
    rowH + 0.01 >= Math.min(naturalRowH, maxLinesPerRow * (cellSize + 0.7) + 2) - 0.5;

  return {
    top,
    footerReserve,
    titleH,
    headerH,
    sectionH,
    rowH,
    cellSize,
    labelSize,
    sectionLabelSize,
    titleSize,
    labelW,
    fitsOnePage: needed() <= budget + 0.5,
    forcedFit,
    comfortable,
    neededHeight: titleH + needed() + footerReserve + top,
    pageHeight,
    pageWidth,
  };
}

/** Kies A4 of A3 zodat namen volledig op 1 pagina passen. */
export function chooseRosterPageSize(opts = {}) {
  const a4 = computeRosterPageLayout({
    ...opts,
    pageHeight: ROSTER_PAGE_SIZES.A4.height,
    pageWidth: ROSTER_PAGE_SIZES.A4.width,
  });
  if (a4.fitsOnePage && a4.comfortable) {
    return { pageSize: 'A4', layout: { ...a4, pageSize: 'A4' } };
  }
  const a3 = computeRosterPageLayout({
    ...opts,
    pageHeight: ROSTER_PAGE_SIZES.A3.height,
    pageWidth: ROSTER_PAGE_SIZES.A3.width,
  });
  // A3 als die comfortabeler is; anders het formaat dat wél past zonder force.
  if (a3.comfortable || (a3.fitsOnePage && !a4.comfortable)) {
    return { pageSize: 'A3', layout: { ...a3, pageSize: 'A3' } };
  }
  if (a4.fitsOnePage) {
    return { pageSize: 'A4', layout: { ...a4, pageSize: 'A4' } };
  }
  return { pageSize: 'A3', layout: { ...a3, pageSize: 'A3' } };
}

function drawCell(doc, x, y, w, h, text, opts = {}) {
  const {
    bold = false,
    size = 6,
    align = 'left',
    fill = null,
    stroke = '#bbbbbb',
    color = '#000000',
    pad = 1.5,
  } = opts;

  if (fill) {
    doc.save().rect(x, y, w, h).fill(fill).restore();
  }
  doc.rect(x, y, w, h).strokeColor(stroke).lineWidth(0.5).stroke();

  const isClosed = String(text).trim().toLowerCase() === 'gesloten';
  const display = wrapRosterCellText(text);
  const prevX = doc.x;
  const prevY = doc.y;
  // Clip + y terugzetten: voorkomt dat PDFKit bij wrap zelf een pagina opent.
  // Geen ellipsis: namen blijven volledig (cel is hoog genoeg geschaald).
  doc.save();
  doc.rect(x, y, w, h).clip();
  doc
    .fillColor(isClosed ? '#888888' : color)
    .font(bold ? 'Helvetica-Bold' : 'Helvetica')
    .fontSize(size)
    .text(display, x + pad, y + pad, {
      width: w - pad * 2,
      height: Math.max(4, h - pad * 2),
      align,
      ellipsis: false,
      lineGap: 0.2,
      lineBreak: true,
    });
  doc.restore();
  doc.x = prevX;
  doc.y = prevY;
  doc.fillColor('#000000');
}

/** Extra rijen over alle dagen voor één weekset (max per dagkolom). */
export function countRosterExtraRows(daySections, weekStarts, byWeekDay) {
  let total = 0;
  for (const section of daySections) {
    const extrasPerWeek = weekStarts.map((ws) =>
      additionalRosterServices(byWeekDay.get(`${toIsoDate(ws)}|${section.day}`) || [], section.rows),
    );
    total += extrasPerWeek.reduce((max, list) => Math.max(max, list.length), 0);
  }
  return total;
}

/**
 * Meet dichtheid van één week-chunk: rijen + max regels per cel (namen volledig).
 * Gebruikt A4-kolombreedte als conservatieve schatting (meer wraps → hogere rijen).
 */
export function measureRosterChunk(daySections, weekStarts, byWeekDay, pageWidth = ROSTER_PAGE_SIZES.A4.width) {
  const weeks = weekStarts?.length ? weekStarts : [new Date()];
  const weekCount = Math.max(weeks.length, 1);
  const fixedRowCount = (daySections || []).reduce((sum, s) => sum + (s.rows?.length || 0), 0);
  const extraCount = countRosterExtraRows(daySections, weeks, byWeekDay);
  const labelW = 88;
  const colW = (pageWidth - 48 - labelW) / weekCount;
  const probeSize = 5.2;
  let maxLinesPerRow = 1;

  for (const section of daySections || []) {
    for (const row of section.rows || []) {
      for (const ws of weeks) {
        const list = byWeekDay.get(`${toIsoDate(ws)}|${section.day}`) || [];
        const text = slotCellText(servicesForSlotRow(list, row));
        maxLinesPerRow = Math.max(maxLinesPerRow, estimateCellLines(text, colW, probeSize));
      }
    }
    const extrasPerWeek = weeks.map((ws) =>
      additionalRosterServices(byWeekDay.get(`${toIsoDate(ws)}|${section.day}`) || [], section.rows),
    );
    const sectionExtras = extrasPerWeek.reduce((max, list) => Math.max(max, list.length), 0);
    for (let extraIndex = 0; extraIndex < sectionExtras; extraIndex += 1) {
      for (const list of extrasPerWeek) {
        const extra = list[extraIndex];
        if (!extra) continue;
        maxLinesPerRow = Math.max(
          maxLinesPerRow,
          estimateCellLines(extraCellText(extra), colW, probeSize),
        );
      }
    }
  }

  return {
    sectionCount: (daySections || []).length || 7,
    rowCount: fixedRowCount,
    extraCount,
    maxLinesPerRow,
    weekCount,
  };
}

/**
 * Bepaal A4/A3 vóór PDFDocument-constructie (eerste pagina-formaat is vast).
 */
export function planRosterDocument({
  services,
  from,
  to,
  maxWeeks = 60,
  clubhouse = false,
  rules = null,
} = {}) {
  const allWeeks = weekStartsInRange(from, to, clubhouse ? 1 : maxWeeks);
  const byWeekDay = groupServicesByWeekDay(services || []);
  const daySections = rosterDaySections(rules);
  const chunkSize = clubhouse ? 1 : 6;
  let best = chooseRosterPageSize({
    sectionCount: daySections.length,
    rowCount: daySections.reduce((sum, s) => sum + s.rows.length, 0),
    extraCount: 0,
    maxLinesPerRow: 1,
    weekCount: clubhouse ? 1 : 6,
  });

  for (let i = 0; i < Math.max(allWeeks.length, 1); i += chunkSize) {
    const weekStarts = allWeeks.slice(i, i + chunkSize);
    if (!weekStarts.length) continue;
    const measure = measureRosterChunk(daySections, weekStarts, byWeekDay);
    const chosen = chooseRosterPageSize(measure);
    const preferA3 = chosen.pageSize === 'A3' && best.pageSize === 'A4';
    const taller = (chosen.layout?.neededHeight || 0) > (best.layout?.neededHeight || 0);
    if (preferA3 || (!best.layout && chosen.layout) || (chosen.pageSize === best.pageSize && taller)) {
      best = chosen;
    }
  }
  return best;
}

/** Tekent het liggende rooster (A4 of A3) op een pdfkit-document. */
export function renderPlanningRoster(doc, {
  services,
  from,
  to,
  generatedAt = new Date(),
  official = false,
  clubhouse = false,
  maxWeeks = 60,
  rules = null,
  pageSize: forcedPageSize = null,
}) {
  const allWeeks = weekStartsInRange(from, to, clubhouse ? 1 : maxWeeks);
  const byWeekDay = groupServicesByWeekDay(services || []);
  const daySections = rosterDaySections(rules);
  const chunkSize = clubhouse ? 1 : 6;
  const chunks = [];
  for (let i = 0; i < Math.max(allWeeks.length, 1); i += chunkSize) {
    chunks.push(allWeeks.slice(i, i + chunkSize));
  }

  const left = 24;
  const labelW = 88;
  const generatedLabel = formatGeneratedAt(generatedAt);

  chunks.forEach((weekStarts, chunkIndex) => {
    const measure = measureRosterChunk(daySections, weekStarts, byWeekDay);
    const chosen = chooseRosterPageSize(measure);
    const pageSize = forcedPageSize || chosen.pageSize;
    const pageDims = ROSTER_PAGE_SIZES[pageSize] || ROSTER_PAGE_SIZES.A4;
    const layout = computeRosterPageLayout({
      ...measure,
      pageHeight: pageDims.height,
      pageWidth: pageDims.width,
    });

    if (chunkIndex > 0) {
      doc.addPage({ size: pageSize, layout: 'landscape', margin: 0 });
    }

    const pageW = doc.page.width - 48;
    const { headerH, sectionH, rowH, cellSize, labelSize, sectionLabelSize, titleSize, top, footerReserve } =
      layout;

    let y = top;
    const colW = (pageW - labelW) / Math.max(weekStarts.length, 1);

    const drawTitle = () => {
      doc
        .fontSize(titleSize)
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
      y = doc.y + 1;
      doc
        .fontSize(Math.max(6, titleSize - 5))
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
      y = doc.y + 4;
    };

    const drawWeekHeader = () => {
      drawCell(doc, left, y, labelW, headerH, 'Dag / Tijd', {
        bold: true,
        size: Math.min(7, cellSize + 1),
        fill: '#f0f0f0',
        stroke: '#888888',
      });
      weekStarts.forEach((ws, i) => {
        const x = left + labelW + i * colW;
        drawCell(doc, x, y, colW, headerH, `Week ${isoWeekNumber(ws)}\n${formatWeekRange(ws)}`, {
          bold: true,
          size: Math.min(6.5, cellSize + 0.5),
          align: 'center',
          fill: '#f0f0f0',
          stroke: '#888888',
        });
      });
      y += headerH;
    };

    // Alleen als schalen niet genoeg was: laatste redmiddel tweede pagina (zelfde formaat).
    const ensureSpace = (need) => {
      if (y + need > doc.page.height - footerReserve) {
        doc.addPage({ size: pageSize, layout: 'landscape', margin: 0 });
        y = top;
        drawWeekHeader();
      }
    };

    drawTitle();
    drawWeekHeader();

    for (const section of daySections) {
      const extrasPerWeek = weekStarts.map((ws) =>
        additionalRosterServices(byWeekDay.get(`${toIsoDate(ws)}|${section.day}`) || [], section.rows),
      );
      const sectionExtras = extrasPerWeek.reduce((max, list) => Math.max(max, list.length), 0);
      ensureSpace(sectionH + (section.rows.length + sectionExtras) * rowH);

      drawCell(doc, left, y, labelW, sectionH, section.label, {
        bold: true,
        size: sectionLabelSize,
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
        // Labeltijd: echte diensttijden over alle weken (zondag ≠ zaterdag-slots).
        const sampleList = weekStarts.flatMap((ws) =>
          servicesForSlotRow(byWeekDay.get(`${toIsoDate(ws)}|${section.day}`) || [], row),
        );
        const labelTime = rowLabelTime(row, sampleList);
        drawCell(doc, left, y, labelW, rowH, `${row.label}\n${labelTime}`, {
          bold: true,
          size: labelSize,
          fill: '#f7f7f7',
          stroke: '#aaaaaa',
          pad: rowH < 14 ? 1 : 2,
        });
        weekStarts.forEach((ws, i) => {
          const x = left + labelW + i * colW;
          const list = byWeekDay.get(`${toIsoDate(ws)}|${section.day}`) || [];
          const cellServices = servicesForSlotRow(list, row);
          const text = slotCellText(cellServices);
          const hasOpen = slotCellHasOpen(cellServices);
          drawCell(doc, x, y, colW, rowH, text, {
            size: cellSize,
            align: text === 'gesloten' || text === 'nog open' ? 'center' : 'left',
            stroke: '#cccccc',
            fill: hasOpen ? '#fff3cd' : null,
            color: hasOpen && /open plek/i.test(text) ? '#7a4e00' : '#000000',
            pad: rowH < 14 ? 1 : 2,
          });
        });
        y += rowH;
      }

      for (let extraIndex = 0; extraIndex < sectionExtras; extraIndex += 1) {
        const sample = extrasPerWeek.map((list) => list[extraIndex]).find(Boolean);
        const extraLabel = serviceEventLabel(sample) || 'Extra';
        const extraTime = String(sample?.time || '').trim();
        drawCell(doc, left, y, labelW, rowH, `${extraLabel}\n${extraTime}`, {
          bold: true,
          size: labelSize,
          fill: '#f7f7f7',
          stroke: '#aaaaaa',
          pad: rowH < 14 ? 1 : 2,
        });
        weekStarts.forEach((_ws, i) => {
          const x = left + labelW + i * colW;
          const extra = extrasPerWeek[i][extraIndex];
          const text = extraCellText(extra);
          const hasOpen = extra ? slotCellHasOpen([extra]) : false;
          drawCell(doc, x, y, colW, rowH, text, {
            size: cellSize,
            align: text === 'gesloten' ? 'center' : 'left',
            stroke: '#cccccc',
            fill: hasOpen ? '#fff3cd' : null,
            color: hasOpen && /open plek/i.test(text) ? '#7a4e00' : '#000000',
            pad: rowH < 14 ? 1 : 2,
          });
        });
        y += rowH;
      }
    }

    doc
      .fontSize(6.5)
      .fillColor('#666666')
      .text(`Gegenereerd ${generatedLabel} — VVL Planning App`, left, doc.page.height - footerReserve, {
        align: 'center',
        width: pageW,
      });
  });
}
