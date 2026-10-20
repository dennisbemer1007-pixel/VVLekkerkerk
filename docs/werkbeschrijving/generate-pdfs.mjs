/**
 * Drie rol-werkbeschrijvingen (PDF) uit docs/werkbeschrijving/*.md
 * met titelpagina, klikbare inhoudsopgave, echte demo-screenshots.
 *
 *   node docs/werkbeschrijving/generate-pdfs.mjs
 */
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const srcDir = __dirname;
const shotDir = path.join(srcDir, 'shots');
const logo = path.join(root, 'src', 'frontend', 'public', 'logo.png');
const artifactDir = '/opt/cursor/artifacts/werkbeschrijving';

const BLACK = '#000000';
const GRAY = '#333333';
const MUTED = '#666666';
const RULE = '#CCCCCC';
const WASH = '#F3F3F3';
const WHITE = '#FFFFFF';

const MARGIN = 48;
const HEADER_H = 52;
const FOOTER_H = 36;

const roles = [
  {
    id: 'vrijwilliger',
    title: 'Vrijwilliger',
    subtitle: 'Ouders en vrijwilligers',
    md: 'vrijwilliger.md',
    audience: 'Voor iedereen die bardienst of keukendienst draait, inclusief inschrijven voor een kind.',
  },
  {
    id: 'teamcoordinator',
    title: 'Teamcoördinator',
    subtitle: 'Bardienstcoördinator van een jeugdteam',
    md: 'teamcoordinator.md',
    audience: 'Voor de bardienstcoördinator: teamplekken vullen, ouders en komende wedstrijden.',
  },
  {
    id: 'barcommissie',
    title: 'Barcommissie',
    subtitle: 'Clubbrede planning',
    md: 'barcommissie.md',
    audience: 'Voor de barcommissie: dashboard, personen, diensten, planning, regels en import.',
  },
];

function parseBlocks(text) {
  const lines = text.split(/\n/);
  const blocks = [];
  let para = [];
  const flushPara = () => {
    const t = para.join(' ').trim();
    if (t) blocks.push({ type: 'p', text: t });
    para = [];
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const img = line.match(/^!\[([^\]]*)\]\(shot:([^)]+)\)\s*$/);
    if (img) {
      flushPara();
      blocks.push({ type: 'shot', caption: img[1], file: img[2].trim() });
      continue;
    }
    if (!line.trim()) {
      flushPara();
      continue;
    }
    if (line.startsWith('# ')) {
      flushPara();
      blocks.push({ type: 'h1', text: line.slice(2).trim() });
      continue;
    }
    if (line.startsWith('## ')) {
      flushPara();
      const title = line.slice(3).trim();
      const dest = slug(title);
      blocks.push({ type: 'h2', text: title, dest });
      continue;
    }
    if (line.startsWith('### ')) {
      flushPara();
      blocks.push({ type: 'h3', text: line.slice(4).trim() });
      continue;
    }
    const numbered = line.match(/^(\d+)\.\s+(.*)$/);
    if (numbered) {
      flushPara();
      blocks.push({ type: 'step', n: numbered[1], text: numbered[2] });
      continue;
    }
    if (line.startsWith('- ')) {
      flushPara();
      blocks.push({ type: 'bullet', text: line.slice(2) });
      continue;
    }
    if (line.startsWith('> ')) {
      flushPara();
      blocks.push({ type: 'tip', text: line.slice(2).replace(/^Tip:\s*/i, '') });
      continue;
    }
    if (line.startsWith('**') && line.endsWith('**') && line.length > 4) {
      flushPara();
      blocks.push({ type: 'question', text: line.slice(2, -2).trim() });
      continue;
    }
    para.push(line.trim());
  }
  flushPara();
  return blocks;
}

function slug(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

function stripMd(s) {
  return String(s || '').replace(/\*\*/g, '');
}

function pngSize(file) {
  const buf = fs.readFileSync(file);
  if (buf.length < 24 || buf.toString('ascii', 1, 4) !== 'PNG') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function contentWidth(doc) {
  return doc.page.width - MARGIN * 2;
}

function bottomLimit(doc) {
  return doc.page.height - FOOTER_H;
}

function ensure(doc, ctx, need) {
  if (doc.y + need > bottomLimit(doc) - 8) {
    newContentPage(doc, ctx);
  }
}

function drawHeader(doc, subtitle) {
  const w = doc.page.width;
  doc.save();
  doc.rect(0, 0, w, HEADER_H).fill(BLACK);
  if (fs.existsSync(logo)) {
    try {
      doc.image(logo, 18, 8, { height: 36 });
    } catch {
      /* ignore */
    }
  }
  doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(11).text('V.V. Lekkerkerk', 62, 10, { width: w - 80 });
  doc.font('Helvetica').fontSize(8).fillColor('#DDDDDD').text(subtitle, 62, 28, { width: w - 80 });
  doc.restore();
  doc.y = HEADER_H + 18;
  doc.x = MARGIN;
  doc.fillColor(BLACK);
}

function newContentPage(doc, ctx) {
  doc.addPage();
  drawHeader(doc, ctx.header);
}

function drawTitlePage(doc, role) {
  const w = doc.page.width;
  const h = doc.page.height;
  doc.save();
  doc.rect(0, 0, w, h).fill(WHITE);
  doc.rect(0, 0, w, 168).fill(BLACK);
  if (fs.existsSync(logo)) {
    try {
      doc.image(logo, (w - 72) / 2, 36, { height: 72 });
    } catch {
      /* ignore */
    }
  }
  doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(12).text('V.V. LEKKERKERK', 0, 118, { width: w, align: 'center' });
  doc.font('Helvetica').fontSize(9).fillColor('#CCCCCC').text('Planning bar- en keukendiensten', 0, 136, {
    width: w,
    align: 'center',
  });
  doc.restore();

  doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(26).text('Werkbeschrijving', MARGIN, 210, {
    width: contentWidth(doc),
    align: 'center',
  });
  doc.moveDown(0.4);
  doc.font('Helvetica-Bold').fontSize(20).fillColor(BLACK).text(role.title, { width: contentWidth(doc), align: 'center' });
  doc.moveDown(0.25);
  doc.font('Helvetica').fontSize(12).fillColor(GRAY).text(role.subtitle, { width: contentWidth(doc), align: 'center' });
  doc.moveDown(1.2);
  doc.moveTo(MARGIN + 80, doc.y).lineTo(w - MARGIN - 80, doc.y).strokeColor(BLACK).lineWidth(1.5).stroke();
  doc.moveDown(1.2);
  doc.font('Helvetica').fontSize(11).fillColor(GRAY).text(role.audience, MARGIN + 40, doc.y, {
    width: contentWidth(doc) - 80,
    align: 'center',
  });
  doc.moveDown(1.5);
  doc.font('Helvetica').fontSize(10).fillColor(MUTED).text('Handleiding bij de huidige club-app. Screenshots uit de lokale oefenomgeving, geen live clubgegevens.', {
    width: contentWidth(doc) - 80,
    align: 'center',
  });

  doc.font('Helvetica').fontSize(9).fillColor(MUTED).text('Oktober 2026', 0, h - 88, {
    width: w,
    align: 'center',
    lineBreak: false,
  });
  doc.save();
  doc.rect(0, h - 28, w, 28).fill(BLACK);
  doc.fillColor(WHITE).font('Helvetica').fontSize(8).text('V.V. Lekkerkerk  ·  zwart / wit / grijs', MARGIN, h - 18, {
    width: w - MARGIN * 2,
    align: 'center',
    lineBreak: false,
  });
  doc.restore();
}

function measureText(doc, text, font, size, width) {
  doc.font(font).fontSize(size);
  return doc.heightOfString(stripMd(text), { width });
}

async function writeRolePdf(role) {
  const mdPath = path.join(srcDir, role.md);
  const blocks = parseBlocks(fs.readFileSync(mdPath, 'utf8'));
  const outPath = path.join(srcDir, `werkbeschrijving-${role.id}.pdf`);
  fs.mkdirSync(artifactDir, { recursive: true });

  const doc = new PDFDocument({
    size: 'A4',
    margin: 0,
    bufferPages: true,
    info: {
      Title: `Werkbeschrijving ${role.title} — VVL Planning`,
      Author: 'V.V. Lekkerkerk',
      Subject: 'Handleiding planning-app',
    },
  });
  const stream = fs.createWriteStream(outPath);
  doc.pipe(stream);

  const ctx = { header: `Werkbeschrijving · ${role.title}` };
  const tocEntries = [];
  const pageW = () => contentWidth(doc);

  drawTitlePage(doc, role);

  const chapters = blocks.filter((b) => b.type === 'h2');
  const tocLines = Math.max(chapters.length, 8);
  const tocPagesNeeded = tocLines > 20 ? 2 : 1;
  const tocPageIndexes = [];
  for (let i = 0; i < tocPagesNeeded; i += 1) {
    newContentPage(doc, ctx);
    tocPageIndexes.push(doc.bufferedPageRange().count - 1);
  }
  newContentPage(doc, ctx);

  for (const b of blocks) {
    if (b.type === 'h1') continue;
    if (b.type === 'h2') {
      newContentPage(doc, ctx);
      const dest = b.dest || slug(b.text);
      doc.addNamedDestination(dest, 'XYZ', MARGIN, doc.y, null);
      try {
        doc.outline.addItem(b.text);
      } catch {
        /* outline optional */
      }
      tocEntries.push({ title: b.text, dest, page: doc.bufferedPageRange().count });
      doc.font('Helvetica-Bold').fontSize(16).fillColor(BLACK).text(b.text, MARGIN, doc.y, { width: pageW() });
      doc.moveDown(0.25);
      doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + 64, doc.y).strokeColor(BLACK).lineWidth(1.5).stroke();
      doc.moveDown(0.55);
      continue;
    }
    if (b.type === 'h3') {
      ensure(doc, ctx, 28);
      doc.moveDown(0.25);
      doc.font('Helvetica-Bold').fontSize(12).fillColor(BLACK).text(b.text, { width: pageW() });
      doc.moveDown(0.2);
      continue;
    }
    if (b.type === 'step') {
      const body = stripMd(b.text);
      const h = Math.max(18, measureText(doc, body, 'Helvetica', 10, pageW() - 28));
      ensure(doc, ctx, h + 8);
      const y = doc.y;
      doc.circle(MARGIN + 9, y + 7, 8).fill(BLACK);
      doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(8).text(String(b.n), MARGIN + 1, y + 3, {
        width: 16,
        align: 'center',
      });
      doc.fillColor(GRAY).font('Helvetica').fontSize(10).text(body, MARGIN + 26, y, { width: pageW() - 26 });
      doc.moveDown(0.28);
      continue;
    }
    if (b.type === 'bullet') {
      const body = stripMd(b.text);
      const h = measureText(doc, body, 'Helvetica', 10, pageW() - 16);
      ensure(doc, ctx, h + 6);
      doc.font('Helvetica').fontSize(10).fillColor(GRAY).text(`•   ${body}`, { width: pageW() });
      doc.moveDown(0.12);
      continue;
    }
    if (b.type === 'question') {
      ensure(doc, ctx, 36);
      doc.moveDown(0.25);
      doc.font('Helvetica-Bold').fontSize(10).fillColor(BLACK).text(stripMd(b.text), { width: pageW() });
      doc.moveDown(0.08);
      continue;
    }
    if (b.type === 'tip') {
      const body = `Tip  ${stripMd(b.text)}`;
      const h = measureText(doc, body, 'Helvetica', 10, pageW() - 20) + 16;
      ensure(doc, ctx, h + 8);
      const y = doc.y;
      doc.save();
      doc.roundedRect(MARGIN, y, pageW(), h, 3).fill(WASH);
      doc.restore();
      doc.fillColor(BLACK).font('Helvetica-Oblique').fontSize(10).text(body, MARGIN + 10, y + 8, { width: pageW() - 20 });
      doc.y = y + h + 8;
      continue;
    }
    if (b.type === 'shot') {
      const imgPath = path.join(shotDir, b.file);
      if (!fs.existsSync(imgPath)) continue;
      const isPhone = /_390\.png$/i.test(b.file);
      const boxW = isPhone ? 230 : pageW();
      const boxH = isPhone ? 360 : 300;
      const dim = pngSize(imgPath);
      let drawW = boxW;
      let drawH = boxH;
      if (dim?.width && dim?.height) {
        const scale = Math.min(boxW / dim.width, boxH / dim.height);
        drawW = Math.round(dim.width * scale);
        drawH = Math.round(dim.height * scale);
      }
      const captionH = b.caption ? 16 : 0;
      const pad = isPhone ? 8 : 2;
      ensure(doc, ctx, drawH + captionH + pad * 2 + 20);
      if (b.caption) {
        doc.font('Helvetica-Oblique').fontSize(8).fillColor(MUTED).text(b.caption, { width: pageW() });
        doc.moveDown(0.12);
      }
      const y = doc.y;
      if (isPhone) {
        doc.save();
        doc.roundedRect(MARGIN, y, drawW + pad * 2, drawH + pad * 2, 7).fill(BLACK);
        doc.restore();
        doc.image(imgPath, MARGIN + pad, y + pad, { fit: [drawW, drawH] });
        doc.y = y + drawH + pad * 2 + 10;
      } else {
        doc.save();
        doc.rect(MARGIN - 1, y - 1, drawW + 2, drawH + 2).strokeColor(RULE).lineWidth(0.6).stroke();
        doc.restore();
        doc.image(imgPath, MARGIN, y, { fit: [drawW, drawH] });
        doc.y = y + drawH + 12;
      }
      continue;
    }
    if (b.type === 'p') {
      const body = stripMd(b.text);
      const h = measureText(doc, body, 'Helvetica', 10.5, pageW());
      ensure(doc, ctx, h + 8);
      doc.font('Helvetica').fontSize(10.5).fillColor(GRAY).text(body, { width: pageW(), lineGap: 2 });
      doc.moveDown(0.28);
    }
  }

  const range = doc.bufferedPageRange();
  for (let i = 0; i < tocPageIndexes.length; i += 1) {
    doc.switchToPage(tocPageIndexes[i]);
    drawHeader(doc, ctx.header);
    if (i === 0) {
      doc.font('Helvetica-Bold').fontSize(16).fillColor(BLACK).text('Inhoudsopgave', MARGIN, doc.y, { width: pageW() });
      doc.moveDown(0.3);
      doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + 64, doc.y).strokeColor(BLACK).lineWidth(1.5).stroke();
      doc.moveDown(0.6);
    }
    const start = i === 0 ? 0 : 22 + (i - 1) * 26;
    const count = i === 0 ? 22 : 26;
    const items = tocEntries.slice(start, start + count);
    for (const item of items) {
      const y = doc.y;
      const title = item.title;
      doc.font('Helvetica').fontSize(11).fillColor(BLACK).text(title, MARGIN, y, {
        width: pageW() - 36,
        goTo: item.dest,
      });
      doc.font('Helvetica').fontSize(10).fillColor(MUTED).text(String(item.page), MARGIN, y, {
        width: pageW(),
        align: 'right',
      });
      const rowH = Math.max(18, doc.heightOfString(title, { width: pageW() - 36 }));
      doc.goTo(MARGIN, y, pageW(), rowH, item.dest);
      doc.y = y + rowH + 6;
    }
  }

  const total = doc.bufferedPageRange().count;
  for (let i = 0; i < total; i += 1) {
    doc.switchToPage(i);
    const w = doc.page.width;
    const h = doc.page.height;
    if (i === 0) continue;
    doc.save();
    doc.moveTo(MARGIN, h - 26).lineTo(w - MARGIN, h - 26).strokeColor(RULE).lineWidth(0.6).stroke();
    doc.font('Helvetica').fontSize(8).fillColor(MUTED);
    doc.text(`V.V. Lekkerkerk · ${role.title}`, MARGIN, h - 20, {
      width: pageW() / 2,
      lineBreak: false,
    });
    doc.text(`${i + 1} / ${total}`, w - MARGIN - 80, h - 20, { width: 80, align: 'right', lineBreak: false });
    doc.restore();
  }

  doc.end();
  await new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
  const artPath = path.join(artifactDir, `werkbeschrijving-${role.id}.pdf`);
  fs.copyFileSync(outPath, artPath);
  const bytes = fs.statSync(outPath).size;
  console.log('wrote', outPath, `${Math.round(bytes / 1024)} kB`, `${tocEntries.length} hoofdstukken`);
  return outPath;
}

for (const role of roles) {
  await writeRolePdf(role);
}

const also = '/opt/cursor/artifacts';
fs.mkdirSync(also, { recursive: true });
for (const role of roles) {
  const src = path.join(srcDir, `werkbeschrijving-${role.id}.pdf`);
  fs.copyFileSync(src, path.join(also, `werkbeschrijving_${role.id}.pdf`));
}
console.log('Klaar.');
