import { PrismaClient } from '@prisma/client';
import { ensureDataDir, sqliteUrlForDataDir } from './dataDir.js';

ensureDataDir();
const dataUrl = sqliteUrlForDataDir();
if (dataUrl) {
  process.env.DATABASE_URL = dataUrl;
}

const prisma = new PrismaClient();

export default prisma;
