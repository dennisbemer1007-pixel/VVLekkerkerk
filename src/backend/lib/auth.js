import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import prisma from './prisma.js';
import { canonicalAccessRole, publicPerson } from './roles.js';

const SESSION_DAYS = 30;
const INVITE_DAYS = 14;

export function createInviteToken() {
  return crypto.randomBytes(24).toString('hex');
}

export function createSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function inviteExpiry() {
  const d = new Date();
  d.setDate(d.getDate() + INVITE_DAYS);
  return d;
}

export function sessionExpiry() {
  const d = new Date();
  d.setDate(d.getDate() + SESSION_DAYS);
  return d;
}

export async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

let dummyPasswordHash;
async function dummyHash() {
  if (!dummyPasswordHash) {
    dummyPasswordHash = await hashPassword('timing-dummy');
  }
  return dummyPasswordHash;
}

/** Altijd bcrypt-vergelijking (geen timing-leak of e-mail bestaat wel/niet). */
export async function passwordMatches(password, person) {
  const hash =
    person?.active && person.passwordHash ? person.passwordHash : await dummyHash();
  const ok = await verifyPassword(password, hash);
  return Boolean(ok && person?.active && person.passwordHash);
}

export function inviteLink(token, baseUrl) {
  const base = (baseUrl || process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '');
  return `${base}/uitnodiging/${token}`;
}

export async function createSession(personId) {
  const token = createSessionToken();
  await prisma.session.create({
    data: {
      token,
      personId,
      expiresAt: sessionExpiry(),
    },
  });
  return token;
}

export async function getPersonFromRequest(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { token },
    include: { person: { include: { team: true } } },
  });
  if (!session || session.expiresAt < new Date()) {
    if (session) await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  if (!session.person.active) return null;
  return session.person;
}

export function requireAuth(handler) {
  return async (req, res, next) => {
    try {
      const person = await getPersonFromRequest(req);
      if (!person) {
        return res.status(401).json({ error: 'Je bent niet ingelogd' });
      }
      req.person = person;
      return handler(req, res, next);
    } catch (err) {
      next(err);
    }
  };
}

export function requireRole(...roles) {
  return (handler) =>
    requireAuth(async (req, res, next) => {
      const personRole = canonicalAccessRole(req.person.role);
      const allowed = new Set(roles.map(canonicalAccessRole));
      if (!allowed.has(personRole)) {
        return res.status(403).json({ error: 'Je hebt hier geen toegang toe' });
      }
      return handler(req, res, next);
    });
}

export { publicPerson };
