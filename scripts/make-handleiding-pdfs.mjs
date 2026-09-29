/**
 * Maakt rol-handleidingen (PDF) uit docs/handleiding/*.md
 * Screenshots: ![bijschrift](shot:bestand.png) — bestanden in docs/handleiding/shots/
 * Run: npm run docs:handleiding
 */
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const srcDir = path.join(root, 'docs', 'handleiding');
const shotDir = path.join(srcDir, 'shots');
const artifactDir = '/opt/cursor/artifacts/handleiding';
const logo = path.join(root, 'src', 'frontend', 'public', 'logo.png');

const BLACK = '#000000';
const GRAY = '#333333';
const MUTED = '#666666';
const RULE = '#CCCCCC';

const roles = [
  { id: 'vrijwilliger', title: 'Vrijwilliger', md: 'vrijwilliger.md' },
  { id: 'teamcoordinator', title: 'Teamcoördinator', md: 'teamcoordinator.md' },
  { id: 'barcommissie', title: 'Barcommissie', md: 'barcommissie.md' },
  { id: 'admin', title: 'Admin', md: 'admin.md' },
];

function parseBlocks(text) {
  const lines = text.split(/\n/);
  const blocks = [];
  for (const raw of lines) {
    const line = raw.trimEnd();
    const img = line.match(/^!\[([^\]]*)\]\(shot:([^)]+)\)\s*$/);
    if (img) {
      blocks.push({ type: 'shot', caption: img[1], file: img[2].trim() });
      continue;
    }
    if (!line.trim()) {
      blocks.push({ type: 'blank' });
      continue;
    }
    if (line.startsWith('# ')) {
      blocks.push({ type: 'h1', text: line.slice(2).trim() });
      continue;
    }
    if (line.startsWith('## ')) {
      blocks.push({ type: 'h2', text: line.slice(3).trim() });
      continue;
    }
    const numbered = line.match(/^(\d+)\.\s+(.*)$/);
    if (numbered) {
      blocks.push({ type: 'step', n: numbered[1], text: numbered[2].replace(/\*\*/g, '') });
      continue;
    }
    if (line.startsWith('- ')) {
      blocks.push({ type: 'bullet', text: line.slice(2).replace(/\*\*/g, '') });
      continue;
    }
    if (line.startsWith('**') && line.includes('**')) {
      const q = line.replace(/\*\*/g, '').trim();
      blocks.push({ type: 'question', text: q });
      continue;
    }
    blocks.push({ type: 'p', text: line.replace(/\*\*/g, '') });
  }
  return blocks;
}

function drawHeader(doc, subtitle) {
  const w = doc.page.width;
  doc.save();
  doc.rect(0, 0, w, 64).fill(BLACK);
  if (fs.existsSync(logo)) {
    try {
      doc.image(logo, 40, 14, { height: 36 });
    } catch {
      /* ignore */
    }
  }
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(12).text('V.V. Lekkerkerk', 88, 18, { width: w - 130 });
  doc.font('Helvetica').fontSize(9).fillColor('#DDDDDD').text(subtitle, 88, 36, { width: w - 130 });
  doc.restore();
  doc.y = 84;
  doc.fillColor(BLACK);
}

function ensure(doc, need) {
  if (doc.y + need > doc.page.height - 48) {
    doc.addPage();
    drawHeader(doc, 'Planning-app · handleiding');
  }
}

function stripMd(s) {
  return String(s || '').replace(/\*\*/g, '');
}

async function writeRolePdf(role) {
  const mdPath = path.join(srcDir, role.md);
  const blocks = parseBlocks(fs.readFileSync(mdPath, 'utf8'));
  const outPath = path.join(srcDir, `handleiding-${role.id}.pdf`);
  const artPath = path.join(artifactDir, `handleiding-${role.id}.pdf`);
  fs.mkdirSync(artifactDir, { recursive: true });

  const doc = new PDFDocument({
    margin: 40,
    size: 'A4',
    info: { Title: `Handleiding ${role.title} — VVL Planning`, Author: 'V.V. Lekkerkerk' },
  });
  const stream = fs.createWriteStream(outPath);
  doc.pipe(stream);
  const pageW = doc.page.width - 80;

  drawHeader(doc, 'Planning bar- en keukendiensten');
  doc.font('Helvetica-Bold').fontSize(20).fillColor(BLACK).text(`Handleiding — ${role.title}`, 40, doc.y, { width: pageW });
  doc.moveDown(0.35);
  doc.moveTo(40, doc.y).lineTo(40 + pageW, doc.y).strokeColor(BLACK).lineWidth(1.5).stroke();
  doc.moveDown(0.7);

  for (const b of blocks) {
    if (b.type === 'h1') continue;
    if (b.type === 'blank') {
      doc.moveDown(0.25);
      continue;
    }
    if (b.type === 'h2') {
      ensure(doc, 36);
      doc.moveDown(0.45);
      doc.font('Helvetica-Bold').fontSize(12).fillColor(BLACK).text(b.text.toUpperCase(), { width: pageW, characterSpacing: 0.4 });
      doc.moveDown(0.2);
      doc.moveTo(40, doc.y).lineTo(40 + 48, doc.y).strokeColor(BLACK).lineWidth(1).stroke();
      doc.moveDown(0.45);
      continue;
    }
    if (b.type === 'step') {
      ensure(doc, 28);
      doc.font('Helvetica-Bold').fontSize(10).fillColor(BLACK).text(`${b.n}.`, 40, doc.y, { width: 18, continued: false });
      const y = doc.y - 12;
      doc.font('Helvetica').fontSize(10).fillColor(GRAY).text(stripMd(b.text), 58, y, { width: pageW - 18 });
      doc.moveDown(0.25);
      continue;
    }
    if (b.type === 'bullet') {
      ensure(doc, 20);
      doc.font('Helvetica').fontSize(10).fillColor(GRAY).text(`•  ${b.text}`, { width: pageW, indent: 2 });
      doc.moveDown(0.12);
      continue;
    }
    if (b.type === 'question') {
      ensure(doc, 28);
      doc.moveDown(0.2);
      doc.font('Helvetica-Bold').fontSize(10).fillColor(BLACK).text(b.text, { width: pageW });
      doc.moveDown(0.1);
      continue;
    }
    if (b.type === 'shot') {
      const full = path.join(shotDir, b.file);
      const alt = path.join(artifactDir, b.file);
      const imgPath = fs.existsSync(full) ? full : fs.existsSync(alt) ? alt : null;
      if (!imgPath) continue;
      ensure(doc, 260);
      doc.moveDown(0.2);
      if (b.caption) {
        doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(b.caption, { width: pageW });
        doc.moveDown(0.15);
      }
      const maxW = Math.min(pageW, 250);
      const maxH = 360;
      doc.image(imgPath, { fit: [maxW, maxH], align: 'left' });
      doc.moveDown(0.45);
      continue;
    }
    if (b.type === 'p') {
      ensure(doc, 22);
      doc.font('Helvetica').fontSize(10).fillColor(GRAY).text(b.text, { width: pageW });
      doc.moveDown(0.15);
    }
  }

  doc.font('Helvetica').fontSize(8).fillColor(MUTED);
  ensure(doc, 30);
  doc.moveDown(0.8);
  doc.text('Screenshots uit de oefendatabase · geen live clubgegevens', { width: pageW });

  doc.end();
  await new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
  fs.copyFileSync(outPath, artPath);
  console.log('wrote', outPath);
  return outPath;
}

async function writeCombined() {
  const outPath = path.join(srcDir, 'handleiding-alle-rollen.pdf');
  const artPath = path.join(artifactDir, 'handleiding-alle-rollen.pdf');
  const doc = new PDFDocument({
    margin: 40,
    size: 'A4',
    info: { Title: 'Handleidingen VVL Planning — alle rollen', Author: 'V.V. Lekkerkerk' },
  });
  const stream = fs.createWriteStream(outPath);
  doc.pipe(stream);
  const pageW = doc.page.width - 80;

  drawHeader(doc, 'Planning-app');
  doc.font('Helvetica-Bold').fontSize(22).fillColor(BLACK).text('Handleidingen per rol', { width: pageW });
  doc.moveDown(0.5);
  doc.font('Helvetica').fontSize(11).fillColor(GRAY).text('Vrijwilliger · Teamcoördinator · Barcommissie · Admin', { width: pageW });
  doc.moveDown(0.4);
  doc.font('Helvetica').fontSize(10).fillColor(MUTED).text('Korte stappen, vooral voor op de telefoon. Screenshots uit de oefendatabase.', { width: pageW });

  for (const role of roles) {
    doc.addPage();
    drawHeader(doc, `Handleiding · ${role.title}`);
    doc.font('Helvetica-Bold').fontSize(18).fillColor(BLACK).text(role.title, { width: pageW });
    doc.moveDown(0.5);
    const blocks = parseBlocks(fs.readFileSync(path.join(srcDir, role.md), 'utf8'));
    for (const b of blocks) {
      if (b.type === 'h1' || b.type === 'blank') continue;
      if (b.type === 'h2') {
        ensure(doc, 30);
        doc.moveDown(0.35);
        doc.font('Helvetica-Bold').fontSize(11).fillColor(BLACK).text(b.text.toUpperCase(), { width: pageW });
        doc.moveDown(0.25);
        continue;
      }
      if (b.type === 'step') {
        ensure(doc, 24);
        doc.font('Helvetica').fontSize(10).fillColor(GRAY).text(`${b.n}.  ${stripMd(b.text)}`, { width: pageW });
        doc.moveDown(0.15);
        continue;
      }
      if (b.type === 'bullet') {
        ensure(doc, 18);
        doc.font('Helvetica').fontSize(10).fillColor(GRAY).text(`•  ${b.text}`, { width: pageW });
        doc.moveDown(0.1);
        continue;
      }
      if (b.type === 'question') {
        ensure(doc, 22);
        doc.moveDown(0.15);
        doc.font('Helvetica-Bold').fontSize(10).fillColor(BLACK).text(b.text, { width: pageW });
        doc.moveDown(0.08);
        continue;
      }
      if (b.type === 'shot') {
        const full = path.join(shotDir, b.file);
        if (!fs.existsSync(full)) continue;
        ensure(doc, 240);
        doc.moveDown(0.15);
        doc.image(full, { fit: [230, 340] });
        doc.moveDown(0.35);
        continue;
      }
      if (b.type === 'p') {
        ensure(doc, 20);
        doc.font('Helvetica').fontSize(10).fillColor(GRAY).text(b.text, { width: pageW });
        doc.moveDown(0.12);
      }
    }
  }

  doc.end();
  await new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
  fs.copyFileSync(outPath, artPath);
  console.log('wrote', outPath);
}

for (const role of roles) {
  await writeRolePdf(role);
}
await writeCombined();
console.log('Klaar.');
