/**
 * Minimale XLSX-lezer (eerste werkblad) zonder extra dependencies.
 * Ondersteunt shared strings, getallen en inline strings.
 */
import { inflateRawSync } from 'node:zlib';

function unzipUtf8(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  let eocd = -1;
  const start = Math.max(0, buf.length - 22 - 65535);
  for (let i = buf.length - 22; i >= start; i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) {
    throw new Error('Ongeldig Excel-bestand');
  }

  const cdCount = buf.readUInt16LE(eocd + 10);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  const files = {};
  let p = cdOffset;

  for (let n = 0; n < cdCount; n += 1) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nameLen).toString('utf8');

    if (localOff + 30 <= buf.length && buf.readUInt32LE(localOff) === 0x04034b50) {
      const lNameLen = buf.readUInt16LE(localOff + 26);
      const lExtraLen = buf.readUInt16LE(localOff + 28);
      const dataStart = localOff + 30 + lNameLen + lExtraLen;
      const data = buf.slice(dataStart, dataStart + compSize);
      let content;
      if (method === 0) content = data;
      else if (method === 8) content = inflateRawSync(data);
      else throw new Error('Dit Excel-bestand gebruikt een niet-ondersteunde compressie');
      files[name] = content.toString('utf8');
    }

    p += 46 + nameLen + extraLen + commentLen;
  }

  return files;
}

function xmlText(s) {
  return String(s || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function parseSharedStrings(xml) {
  if (!xml) return [];
  const out = [];
  const sis = xml.matchAll(/<si>([\s\S]*?)<\/si>/g);
  for (const si of sis) {
    const texts = [...si[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => xmlText(t[1]));
    out.push(texts.join(''));
  }
  return out;
}

function attr(tag, name) {
  const m = tag.match(new RegExp(`\\b${name}="([^"]*)"`));
  return m ? m[1] : '';
}

function colIndex(colLetters) {
  let n = 0;
  for (const ch of colLetters) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n - 1;
}

function parseSheetRows(sheetXml, strings) {
  const rows = [];
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch;
  while ((rowMatch = rowRe.exec(sheetXml))) {
    const inner = rowMatch[1];
    const cells = [];
    const cellRe = /<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^>]*)\/>/g;
    let cellMatch;
    while ((cellMatch = cellRe.exec(inner))) {
      const attrs = cellMatch[1] || cellMatch[3] || '';
      const body = cellMatch[2] || '';
      const ref = attr(attrs, 'r');
      const letters = (ref.match(/^[A-Z]+/) || [''])[0];
      if (!letters) continue;
      const type = attr(attrs, 't');
      let value = '';
      if (type === 's') {
        const v = (body.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        value = strings[Number(v)] ?? '';
      } else if (type === 'inlineStr') {
        const t = (body.match(/<t[^>]*>([\s\S]*?)<\/t>/) || [])[1];
        value = xmlText(t || '');
      } else if (type === 'b') {
        const v = (body.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        value = v === '1' ? 'true' : 'false';
      } else {
        const v = (body.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        value = v == null ? '' : String(v);
      }
      cells[colIndex(letters)] = value;
    }
    rows.push(cells);
  }
  return rows;
}

function firstSheetPath(files) {
  const workbook = files['xl/workbook.xml'];
  const rels = files['xl/_rels/workbook.xml.rels'];
  if (!workbook) throw new Error('Excel-bestand bevat geen werkboek');
  const sheet = workbook.match(/<sheet\b[^>]*>/);
  if (!sheet) throw new Error('Excel-bestand bevat geen werkblad');
  const rid = attr(sheet[0], 'r:id') || attr(sheet[0], 'id');
  let target = 'worksheets/sheet1.xml';
  if (rels && rid) {
    const relRe = /<Relationship\b[^>]*>/g;
    let m;
    while ((m = relRe.exec(rels))) {
      if (attr(m[0], 'Id') === rid) {
        target = attr(m[0], 'Target') || target;
        break;
      }
    }
  }
  const cleaned = target.replace(/^\/+/, '');
  if (cleaned.startsWith('xl/')) return cleaned;
  return `xl/${cleaned}`;
}

/**
 * @returns {{ headers: string[], matrix: string[][] }}
 */
export function parseXlsxBuffer(buffer) {
  const files = unzipUtf8(buffer);
  const strings = parseSharedStrings(files['xl/sharedStrings.xml']);
  const sheetPath = firstSheetPath(files);
  const sheetXml = files[sheetPath] || files[sheetPath.replace(/\\/g, '/')];
  if (!sheetXml) throw new Error('Kon het werkblad in het Excel-bestand niet lezen');
  const matrix = parseSheetRows(sheetXml, strings).filter((row) =>
    row.some((c) => String(c || '').trim() !== ''),
  );
  if (!matrix.length) {
    return { headers: [], matrix: [] };
  }
  const headers = (matrix[0] || []).map((h) => String(h || '').trim());
  return { headers, matrix: matrix.slice(1) };
}

export function xlsxToObjects(buffer) {
  const { headers, matrix } = parseXlsxBuffer(buffer);
  return matrix.map((cols, index) => {
    const obj = { __row: index + 2 };
    headers.forEach((h, i) => {
      if (!h) return;
      obj[h] = cols[i] == null ? '' : String(cols[i]).trim();
    });
    return obj;
  });
}
