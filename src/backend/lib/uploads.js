import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import multer from 'multer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const UPLOADS_DIR = path.join(__dirname, '../../../uploads');
export const PHOTOS_DIR = path.join(UPLOADS_DIR, 'photos');

export function ensureUploadDirs() {
  fs.mkdirSync(PHOTOS_DIR, { recursive: true });
}

const ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.webp'];

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
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
  limits: { fileSize: 3 * 1024 * 1024 }, // 3 MB
});

export function publicPhotoPath(filename) {
  return `/uploads/photos/${filename}`;
}
