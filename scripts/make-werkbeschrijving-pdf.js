import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'docs', 'WERKBESCHRIJVING.pdf');
const logo = path.join(root, 'src', 'frontend', 'public', 'logo.png');

const doc = new PDFDocument({
  margin: 50,
  size: 'A4',
  info: {
    Title: 'Werkbeschrijving VVL Planning App',
    Author: 'V.V. Lekkerkerk',
  },
});
const stream = fs.createWriteStream(out);
doc.pipe(stream);

const pageW = doc.page.width - 100;

function ensureSpace(need = 80) {
  if (doc.y + need > doc.page.height - 50) doc.addPage();
}

function h1(t) {
  ensureSpace(40);
  doc.moveDown(0.5);
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#000').text(t, { width: pageW });
  doc.moveDown(0.25);
  doc.font('Helvetica').fontSize(10).fillColor('#111');
}

function h2(t) {
  ensureSpace(30);
  doc.moveDown(0.3);
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#000').text(t, { width: pageW });
  doc.moveDown(0.15);
  doc.font('Helvetica').fontSize(10).fillColor('#111');
}

function p(t) {
  ensureSpace(24);
  doc.font('Helvetica').fontSize(10).fillColor('#111').text(t, { width: pageW });
  doc.moveDown(0.2);
}

function bullet(items) {
  for (const item of items) {
    ensureSpace(20);
    doc.font('Helvetica').fontSize(10).text(`•  ${item}`, { width: pageW, indent: 8 });
  }
  doc.moveDown(0.25);
}

function numbered(items) {
  items.forEach((item, i) => {
    ensureSpace(20);
    doc.font('Helvetica').fontSize(10).text(`${i + 1}.  ${item}`, { width: pageW, indent: 8 });
  });
  doc.moveDown(0.25);
}

function table(headers, rows) {
  ensureSpace(60);
  const colW = pageW / headers.length;
  const startX = 50;
  let y = doc.y;

  doc.font('Helvetica-Bold').fontSize(9).fillColor('#000');
  headers.forEach((h, i) => {
    doc.text(h, startX + i * colW, y, { width: colW - 8 });
  });
  y = Math.max(doc.y, y) + 3;
  doc
    .moveTo(startX, y)
    .lineTo(startX + pageW, y)
    .strokeColor('#aaaaaa')
    .lineWidth(0.5)
    .stroke();
  y += 6;

  doc.font('Helvetica').fontSize(9).fillColor('#111');
  for (const row of rows) {
    let rowH = 0;
    row.forEach((cell) => {
      rowH = Math.max(rowH, doc.heightOfString(String(cell), { width: colW - 8 }));
    });
    if (y + rowH > doc.page.height - 55) {
      doc.addPage();
      y = 50;
    }
    row.forEach((cell, i) => {
      doc.text(String(cell), startX + i * colW, y, { width: colW - 8 });
    });
    y += rowH + 8;
  }
  doc.x = startX;
  doc.y = y + 2;
}

// Header
if (fs.existsSync(logo)) {
  try {
    doc.image(logo, 50, 40, { width: 58 });
  } catch {
    /* ignore */
  }
}
doc.font('Helvetica-Bold').fontSize(18).fillColor('#000').text('Werkbeschrijving', 120, 48, {
  width: pageW - 80,
});
doc
  .font('Helvetica')
  .fontSize(11)
  .text('VVL Planning App — V.V. Lekkerkerk', 120, 72, { width: pageW - 80 });
doc.y = 118;

p('Applicatie: VVL Planning App');
p('Organisatie: V.V. Lekkerkerk');
p(
  'Doel: Digitaal plannen van bardiensten en keukendiensten voor vrijwilligers, teamcoördinatoren en bestuur.',
);

h1('1. Wat doet de app?');
p('De app vervangt een papieren of ad-hoc planning door een overzichtelijke tool waarin:');
bullet([
  'bestuur / coordinatoren diensten plannen en mensen uitnodigen;',
  'vrijwilligers zichzelf inschrijven op open diensten;',
  'teamcoordinatoren ouders/leden uitnodigen en namens hun team inschrijven;',
  'iedereen een planning van 6 weken kan bekijken en als PDF kan printen voor in de kantine.',
]);
p(
  'De huisstijl (zwart/wit/grijs) en het clublogo van V.V. Lekkerkerk zijn doorgevoerd in de hele interface.',
);

h1('2. Voor wie? (rollen)');
table(
  ['Rol', 'Wat mag je?'],
  [
    ['Vrijwilliger', 'Dashboard, inschrijven, planning & PDF'],
    ['Teamcoordinator', 'Zelfde + teamleden inschrijven + ouders uitnodigen'],
    ['Coordinator / Bestuur', 'Alles, inclusief Beheer'],
  ],
);
p(
  'Na inloggen of na het aanmaken van een account zie je onder "Jouw rechten" precies wat bij jouw rol hoort.',
);

h1('3. Starten van de app');
numbered([
  'Open een terminal in de projectmap dienst-planner.',
  'Eerste keer: npm.cmd install, daarna npm.cmd run setup',
  'Elke keer: npm.cmd run dev (of dubbelklik start-dev.cmd)',
  'Browser: http://localhost:5173',
]);
p('Standaard beheerder (eerste keer): admin@vvl.local / admin123');

h1('4. Belangrijkste schermen');
h2('4.1 Inloggen');
bullet(['E-mail + wachtwoord.', 'Uitnodiging ontvangen? Open de deeplink om een account te maken.']);
h2('4.2 Dashboard');
bullet([
  'Tellingen: personen, diensten, inschrijvingen, bezettingsgraad %.',
  'Kleurstatus: groen = vol, geel = nog 1 nodig, rood = open.',
  'Overzicht "deze week" + snelle knoppen.',
]);
h2('4.3 Inschrijven');
bullet([
  'Filters: Komende diensten, Vandaag, Deze week, Open diensten, Mijn diensten.',
  'Per dienst: type, datum, tijd, locatie, bezetting, personen met pasfoto of initialen.',
  'Knop Inschrijven / Uitschrijven.',
]);
h2('4.4 Planning');
bullet([
  'Overzicht van ca. 6 weken.',
  'Zelfde filters als bij Inschrijven.',
  'Knop PDF (6 weken) voor printbare kantineversie.',
]);
h2('4.5 Beheer (coordinator / bestuur)');
table(
  ['Tab', 'Functie'],
  [
    ['Personen', 'Uitnodigen per e-mail, pasfoto, rol, team, deactiveren, deeplink'],
    ['Diensten', 'Bar/keuken toevoegen of bewerken'],
    ['Teams', 'Teams + coordinator; lid inschrijven'],
    ['Wedstrijden', 'Thuiswedstrijden; automatisch bardiensten maken'],
    ['E-mail', 'SMTP mailserver + testmail'],
  ],
);
h2('4.6 Teamcoordinator');
bullet([
  'Menu Mijn team en Uitnodigen.',
  'Ouders toevoegen via e-mailuitnodiging.',
  'Leden inschrijven op open bardiensten.',
]);

h1('5. Uitnodigingsproces');
numbered([
  'Beheerder gaat naar Beheer > Personen.',
  'Vult naam, e-mail, optioneel telefoon, rol, team, pasfoto in.',
  'Klikt Uitnodiging maken.',
  'Als mailserver aanstaat: e-mail. Zo niet: kopieer de deeplink.',
  'Persoon opent de link, ziet rol + rechten, kiest wachtwoord.',
  'Account is actief; daarna gewoon inloggen.',
]);
p('Uitnodigingslink is 14 dagen geldig.');

h1('6. Mailserver (optioneel)');
p('Pad: Beheer > E-mail');
numbered([
  'Kies voorinstelling (Gmail / Outlook / eigen server).',
  'Vul host, poort, gebruikersnaam, wachtwoord, afzender in.',
  'Zet E-mail versturen aan > Opslaan.',
  'Stuur een testmail.',
]);
p('Zonder SMTP blijft de app werken met handmatig kopieren van de uitnodigingslink.');

h1('7. Pasfotos');
bullet([
  'Toe te voegen bij uitnodigen of bewerken (JPG/PNG, max. 3 MB).',
  'Zichtbaar in: personenlijst, teamverdeling, bardiensten/keukendiensten.',
  'Geen foto? Dan initialen in een rond vlak.',
]);

h1('8. Technische opbouw');
table(
  ['Onderdeel', 'Techniek'],
  [
    ['Frontend', 'React + Vite + Tailwind'],
    ['Backend', 'Express (API)'],
    ['Database', 'Prisma + SQLite'],
    ['PDF', 'PDFKit'],
    ['Mail', 'Nodemailer (SMTP via Beheer)'],
    ['Fotos', 'Upload naar /uploads/photos'],
  ],
);

h1('9. Typische werkdag');
numbered([
  'Bestuur plant diensten (handmatig of via thuiswedstrijden).',
  'Nodigt nieuwe vrijwilligers uit (mail of WhatsApp-link).',
  'Vrijwilligers loggen in en schrijven zich in.',
  'Teamcoordinator vult open plekken namens ouders.',
  'Dashboard toont of alles vol/open is.',
  'Planning > PDF printen voor in de kantine.',
]);

h1('10. Demo / filmpje');
p('Map docs/:');
bullet([
  'docs/WERKBESCHRIJVING.md — tekstversie',
  'docs/WERKBESCHRIJVING.pdf — deze PDF',
  'docs/demo/VVL-Planning-App-Demo.mp4 — demofilmpje (~33 sec)',
  'docs/demo/index.html — interactieve slideshow',
]);

doc.moveDown(1);
doc
  .font('Helvetica-Oblique')
  .fontSize(9)
  .fillColor('#666666')
  .text('Documentversie: juli 2026 — VVL Planning App', { width: pageW });

doc.end();

await new Promise((resolve, reject) => {
  stream.on('finish', resolve);
  stream.on('error', reject);
});

console.log(`PDF gemaakt: ${out} (${fs.statSync(out).size} bytes)`);
