/**
 * Maakt rol-handleidingen (PDF) uit docs/handleiding/*.md
 * Run: node scripts/make-handleiding-pdfs.mjs
 */
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const srcDir = path.join(root, 'docs', 'handleiding');
const outDir = path.join(root, 'docs', 'handleiding');
const artifactDir = '/opt/cursor/artifacts/handleiding';
const logo = path.join(root, 'src', 'frontend', 'public', 'logo.png');
const shotDir = artifactDir;

const roles = [
  { id: 'vrijwilliger', title: 'Vrijwilliger', md: 'vrijwilliger.md', shots: ['vrijwilliger-diensten-375.png', 'vrijwilliger-mijn-375.png'] },
  { id: 'teamcoordinator', title: 'Teamcoördinator', md: 'teamcoordinator.md', shots: ['teamco-team-375.png'] },
  { id: 'barcommissie', title: 'Barcommissie', md: 'barcommissie.md', shots: ['barcomissie-open-375.png', 'barcomissie-mensen-375.png', 'barcomissie-beheer-375.png'] },
  { id: 'admin', title: 'Admin', md: 'admin.md', shots: ['admin-instellingen-1280.png'] },
];

function parseMd(text) {
  return text
    .split(/\n/)
    .map((line) => line.trimEnd())
    .filter((line, i, arr) => !(line === '' && arr[i - 1] === ''));
}

function writePdf(filePath, title, lines, shots = []) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const doc = new PDFDocument({
    margin: 48,
    size: 'A4',
    info: { Title: `Handleiding ${title} — VVL Planning`, Author: 'V.V. Lekkerkerk' },
  });
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);
  const pageW = doc.page.width - 96;

  if (fs.existsSync(logo)) {
    doc.image(logo, 48, 40, { width: 36 });
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#000').text('V.V. Lekkerkerk', 92, 48);
    doc.font('Helvetica').fontSize(9).fillColor('#444').text('Planning bar- en keukendiensten', 92, 64);
    doc.moveDown(2);
    doc.y = 100;
  }

  doc.font('Helvetica-Bold').fontSize(18).fillColor('#000').text(`Handleiding — ${title}`, { width: pageW });
  doc.moveDown(0.6);
  doc
    .moveTo(48, doc.y)
    .lineTo(48 + pageW, doc.y)
    .strokeColor('#000')
    .lineWidth(1)
    .stroke();
  doc.moveDown(0.8);

  for (const line of lines) {
    if (!line.trim()) {
      doc.moveDown(0.35);
      continue;
    }
    if (line.startsWith('# ')) continue;
    if (line.startsWith('## ')) {
      if (doc.y > doc.page.height - 100) doc.addPage();
      doc.moveDown(0.4);
      doc.font('Helvetica-Bold').fontSize(12).fillColor('#000').text(line.replace(/^##\s+/, ''), { width: pageW });
      doc.moveDown(0.25);
      continue;
    }
    if (line.startsWith('**') && line.endsWith('**')) {
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#111').text(line.replace(/\*\*/g, ''), { width: pageW });
      doc.moveDown(0.15);
      continue;
    }
    const numbered = line.match(/^(\d+)\.\s+(.*)$/);
    if (numbered) {
      doc.font('Helvetica').fontSize(10).fillColor('#111').text(`${numbered[1]}.  ${numbered[2]}`, { width: pageW });
      doc.moveDown(0.12);
      continue;
    }
    if (line.startsWith('- ')) {
      doc.font('Helvetica').fontSize(10).fillColor('#111').text(`•  ${line.slice(2)}`, { width: pageW, indent: 4 });
      doc.moveDown(0.1);
      continue;
    }
    doc.font('Helvetica').fontSize(10).fillColor('#111').text(line.replace(/\*\*/g, ''), { width: pageW });
    doc.moveDown(0.12);
  }

  for (const shot of shots) {
    const full = path.join(shotDir, shot);
    if (!fs.existsSync(full)) continue;
    if (doc.y > doc.page.height - 280) doc.addPage();
    doc.moveDown(0.6);
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#000').text('Schermvoorbeeld', { width: pageW });
    doc.moveDown(0.2);
    const maxW = Math.min(pageW, 280);
    doc.image(full, { fit: [maxW, 420], align: 'left' });
    doc.moveDown(0.4);
  }

  doc.end();
  return new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

const written = [];
for (const role of roles) {
  const mdPath = path.join(srcDir, role.md);
  const lines = parseMd(fs.readFileSync(mdPath, 'utf8'));
  const pdfName = `handleiding-${role.id}.pdf`;
  const outPath = path.join(outDir, pdfName);
  const artPath = path.join(artifactDir, pdfName);
  await writePdf(outPath, role.title, lines, role.shots);
  fs.copyFileSync(outPath, artPath);
  written.push(outPath, artPath);
  console.log('wrote', outPath);
}

// Combined
{
  const doc = new PDFDocument({
    margin: 48,
    size: 'A4',
    info: { Title: 'Handleidingen VVL Planning — alle rollen', Author: 'V.V. Lekkerkerk' },
  });
  const combined = path.join(outDir, 'handleiding-alle-rollen.pdf');
  const stream = fs.createWriteStream(combined);
  doc.pipe(stream);
  if (fs.existsSync(logo)) {
    doc.image(logo, 48, 40, { width: 40 });
    doc.font('Helvetica-Bold').fontSize(14).text('V.V. Lekkerkerk', 96, 50);
    doc.font('Helvetica').fontSize(10).fillColor('#444').text('Handleidingen Planning-app', 96, 70);
    doc.y = 120;
  }
  doc.font('Helvetica-Bold').fontSize(20).fillColor('#000').text('Handleidingen per rol');
  doc.moveDown();
  doc.font('Helvetica').fontSize(11).text('Vrijwilliger · Teamcoördinator · Barcommissie · Admin');
  doc.moveDown(2);
  doc.font('Helvetica').fontSize(10).text('Korte, praktische stappen. Screenshots komen uit de demodatabase, niet uit de live club.');
  for (const role of roles) {
    doc.addPage();
    const lines = parseMd(fs.readFileSync(path.join(srcDir, role.md), 'utf8'));
    doc.font('Helvetica-Bold').fontSize(16).text(role.title);
    doc.moveDown(0.5);
    for (const line of lines) {
      if (!line.trim() || line.startsWith('# ')) continue;
      if (line.startsWith('## ')) {
        doc.moveDown(0.3);
        doc.font('Helvetica-Bold').fontSize(12).text(line.replace(/^##\s+/, ''));
        doc.moveDown(0.2);
        continue;
      }
      doc.font('Helvetica').fontSize(10).fillColor('#111').text(line.replace(/\*\*/g, '').replace(/^- /, '•  '));
      doc.moveDown(0.1);
    }
    for (const shot of role.shots) {
      const full = path.join(shotDir, shot);
      if (!fs.existsSync(full)) continue;
      if (doc.y > 500) doc.addPage();
      doc.moveDown(0.5);
      doc.image(full, { fit: [260, 400] });
    }
  }
  doc.end();
  await new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
  fs.copyFileSync(combined, path.join(artifactDir, 'handleiding-alle-rollen.pdf'));
  console.log('wrote', combined);
}

console.log('Klaar:', written.length, 'bestanden');
