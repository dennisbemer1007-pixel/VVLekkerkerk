import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { resolveDataDir } from './dataDir.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = resolveDataDir();
export const UPLOADS_DIR = dataDir
  ? path.join(dataDir, 'uploads')
  : path.join(__dirname, '../../../uploads');
export const PHOTOS_DIR = path.join(UPLOADS_DIR, 'photos');

export function ensureUploadDirs() {
  fs.mkdirSync(PHOTOS_DIR, { recursive: true });
}

const ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.webp'];

const storage = multer.diskStorage({
  destination: (_req, file, cb) => {
    ensureUploadDirs();
    cb(null, PHOTOS_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const safe = ALLOWED_EXT.includes(ext) ? ext : '.jpg';
    const rand = crypto.randomBytes(16).toString('hex');
    cb(null, `p-${rand}${safe}`);
  },
});

function fileFilter(_req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!file.mimetype.startsWith('image/') || !ALLOWED_EXT.includes(ext)) {
    return cb(new Error('Alleen JPG, PNG of WebP zijn toegestaan'));
  }
  cb(null, true);
}

export const photoUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 3 * 1024 * 1024 },
});

export function publicPhotoPath(filename) {
  return `/uploads/photos/${filename}`;
}

/** Controleer echte bestandsbytes (niet alleen de extensie). */
export function assertImageMagic(filePath) {
  const fd = fs.openSync(filePath, 'r');
  const buf = Buffer.alloc(16);
  try {
    fs.readSync(fd, buf, 0, 16, 0);
  } finally {
    fs.closeSync(fd);
  }
  const jpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const png =
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  const webp =
    buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP';
  if (!jpeg && !png && !webp) {
    const err = new Error('Bestand is geen geldige JPG, PNG of WebP');
    err.status = 400;
    throw err;
  }
}
